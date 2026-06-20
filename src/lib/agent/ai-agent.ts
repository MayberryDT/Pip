import { Agent, OpenAIProvider, Runner, tool, type AgentInputItem } from "@openai/agents";
import { z } from "zod";
import type {
  AgentCard,
  AgentClientAction,
  AgentPendingAction,
  AgentResponse,
  PromptChip,
  SavingsGoalPendingField,
} from "@/lib/agent/card-types";
import {
  type GuidanceCardDraft,
  validateGuidanceCardDraft,
} from "@/lib/agent/guidance-card";
import {
  agentFinalOutputSchema,
  agentMessageMaxChars,
  agentResponseSchema,
} from "@/lib/agent/response-schema";
import {
  getOnboardingPromptChips,
  getReadyPromptChipExamples,
  getSuggestedPrompts,
  isRetiredDefaultPromptChip,
} from "@/lib/agent/suggested-prompts";
import {
  composeAgentVisibleAnswer,
} from "@/lib/agent/answer-composer";
import type { DeterministicAgentToolName } from "@/lib/agent/intent-catalog";
import {
  getIntentRouterMode,
  isCatalogSupportedPrompt as isCatalogSupportedCardPrompt,
  resolveIntentRoute,
} from "@/lib/agent/intent-router";
import {
  planPromptChips,
  type PromptChipPlan,
} from "@/lib/agent/prompt-chip-planner";
import { buildFinancialGuidanceToolResult, runAgentTool } from "@/lib/agent/tool-runner";
import type { SyncStatus } from "@/lib/data/sync-status";
import { fakeSnapshot } from "@/lib/fake-data";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { summarizePipCash } from "@/lib/pip-cash/explanation";
import type { FinancialGuidanceContext } from "@/lib/pip-cash/guidance-context";
import {
  getDisplayedSpendableCashTodayCents,
  getSpendableCashTodayState,
} from "@/lib/pip-cash/spendable-cash-today";
import { buildSpendableTrustReceipt } from "@/lib/pip-cash/trust-receipt";
import type { SavingsGoalInput, SavingsGoalUpdate } from "@/lib/savings-goals/types";
import { formatMoney, formatMoneyWithCents } from "@/lib/money";
import type { PipPlatform } from "@/lib/platform/android-shell";
import type { PlaidLinkMode } from "@/lib/providers/FinancialDataProvider";
import {
  getPipAgentQualityVariantInstructions,
  type PipAgentQualityVariantId,
} from "@/lib/agent/quality-variants";
import { composeTrustPolicyAnswer, pipTrustPolicy } from "@/lib/trust/pip-trust-policy";
import type { FinancialSnapshot } from "@/lib/types";
import {
  createOpenAIClient,
  getOpenAIClientConfig,
  getPipAiModel,
  shouldUseModel,
  type AiTransport,
} from "@/lib/agent/openai-config";

export {
  createOpenAIClient,
  getOpenAIApiKeyForSdk,
  getOpenAIClientConfig,
  getPipAiModel,
  getPipAiTransport,
  NETLIFY_AI_GATEWAY_MODEL,
  PIP_AI_MODEL,
  shouldUseModel,
} from "@/lib/agent/openai-config";

type RawAgentFinalOutput = z.infer<typeof agentFinalOutputSchema>;
type AgentFinalOutput = Omit<
  RawAgentFinalOutput,
  "support" | "guidanceCardDraft" | "promptChips"
> & {
  support?: string;
  guidanceCardDraft?: NonNullable<RawAgentFinalOutput["guidanceCardDraft"]>;
  promptChips: PromptChip[];
};

export type AgentHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type AgentConversationState = {
  shownCards?: Array<{
    type: AgentCard["type"] | string;
    title?: string;
  }>;
  lastToolNames?: string[];
  promptChips?: PromptChip[];
  pendingAction?: AgentPendingAction;
};

type NormalizedAgentConversationState = Required<
  Omit<AgentConversationState, "pendingAction">
> & {
  pendingAction?: AgentPendingAction;
};

export type PipAgentOnboardingState = {
  status: "guest" | "needs-consent" | "ready";
  email?: string;
  hasFinancialData: boolean;
  syncStatusSummary?: string | null;
};

export type PipAgentActionResult = {
  ok: boolean;
  status: string;
  message?: string;
  protectedSavingsMonthlyCents?: number;
  pipCashTodayCents?: number;
  exactConfirmation?: string;
  cards?: AgentCard[];
  clientActionType?: AgentClientAction["type"];
  clientAction?: AgentClientAction;
};

export type PipAgentActions = {
  saveProtectedSavings?: (input: {
    amountCents: number;
  }) => Promise<PipAgentActionResult>;
  getConnectedAccounts?: () => Promise<PipAgentActionResult>;
  startPlaidLink?: (input?: {
    mode?: PlaidLinkMode;
    institutionId?: string;
    institutionName?: string;
  }) => Promise<PipAgentActionResult>;
  setAccountInclusion?: (input: {
    accountId?: string;
    accountName?: string;
    includeInPipCash: boolean;
  }) => Promise<PipAgentActionResult>;
  setAccountProtectedSavings?: (input: {
    accountId?: string;
    accountName?: string;
    isProtectedSavings: boolean;
  }) => Promise<PipAgentActionResult>;
  createSavingsGoal?: (input: SavingsGoalInput) => Promise<PipAgentActionResult>;
  listSavingsGoals?: () => Promise<PipAgentActionResult>;
  updateSavingsGoal?: (input: {
    goalId?: string;
    name?: string;
  } & SavingsGoalUpdate) => Promise<PipAgentActionResult>;
  setSavingsGoalProtection?: (input: {
    goalId?: string;
    name?: string;
    includeInSpendableCash: boolean;
    monthlyContributionCents?: number;
  }) => Promise<PipAgentActionResult>;
  requestRemoveInstitutionConfirmation?: (input: {
    institutionId?: string;
    institutionName?: string;
  }) => Promise<PipAgentActionResult>;
  removeInstitution?: (input: {
    institutionId?: string;
    institutionName?: string;
    confirmationText: string;
  }) => Promise<PipAgentActionResult>;
  refreshFinancialData?: () => Promise<PipAgentActionResult>;
  deleteUserData?: () => Promise<PipAgentActionResult>;
};

export type RunAiAgentInput = {
  message: string;
  requestKind?: "chat" | "prompt_chips";
  snapshot?: FinancialSnapshot;
  history?: AgentHistoryItem[];
  conversationState?: AgentConversationState;
  syncStatus?: SyncStatus | null;
  platform?: PipPlatform;
  onboardingState?: PipAgentOnboardingState;
  selectedPromptChipId?: string;
  qualityVariant?: PipAgentQualityVariantId;
  actions?: PipAgentActions;
};

export type AgentRuntime = {
  run: (input: RunAiAgentInput) => Promise<AgentResponse>;
};

// Kept as a compatibility alias for older tests/imports while the app migrates
// from the hand-rolled Responses router to the Agents SDK runtime.
export type OpenAIResponsesClient = AgentRuntime;

type PipAgentContext = {
  inputMessage: string;
  requestKind: "chat" | "prompt_chips";
  snapshot?: FinancialSnapshot;
  syncStatus?: SyncStatus | null;
  platform: PipPlatform;
  qualityVariant: PipAgentQualityVariantId;
  onboardingState: PipAgentOnboardingState;
  actions?: PipAgentActions;
  conversationState: NormalizedAgentConversationState;
  forcedTool?: ForcedAgentTool;
  repair?: AgentResponseRepair;
  usedTools: string[];
  availableCards: AgentCard[];
  availablePromptChips: PromptChip[];
  guidanceContext?: FinancialGuidanceContext;
  guidanceCardRejectionReason?: string;
  fallbackFinalOutput?: boolean;
  clientAction?: AgentClientAction;
};

type ForcedAgentTool = {
  toolName: DeterministicAgentToolName;
  args: unknown;
  requireCard: boolean;
};

type AgentResponseRepair = {
  reason: "invalid_final_output" | "invalid_guidance_card" | "disallowed_language" | "unsupported_promise";
  detail?: string;
};

const emptyToolParameters = z.object({});
const saveProtectedSavingsParameters = z.object({
  amount_cents: z.number().int().min(0).max(10_000_000),
});
const institutionTargetParameters = z.object({
  institution_id: z.string().min(1).max(120).optional(),
  institution_name: z.string().min(1).max(160).optional(),
});
const accountInclusionParameters = z.object({
  account_id: z.string().min(1).max(120).optional(),
  account_name: z.string().min(1).max(160).optional(),
  include_in_pip_cash: z.boolean(),
});
const protectedSavingsAccountParameters = z.object({
  account_id: z.string().min(1).max(120).optional(),
  account_name: z.string().min(1).max(160).optional(),
  is_protected_savings: z.boolean(),
});
const savingsGoalTargetParameters = z.object({
  goal_id: z.string().min(1).max(120).optional(),
  name: z.string().min(1).max(80).optional(),
});
const createSavingsGoalParameters = z.object({
  name: z.string().trim().min(1).max(80),
  target_amount_cents: z.number().int().positive().max(100_000_000),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  starting_amount_cents: z.number().int().min(0).max(100_000_000).optional(),
  current_amount_cents: z.number().int().min(0).max(100_000_000).optional(),
  monthly_contribution_cents: z.number().int().min(0).max(100_000_000).optional(),
  include_in_spendable_cash: z.boolean().optional(),
});
const updateSavingsGoalParameters = savingsGoalTargetParameters.extend({
  target_amount_cents: z.number().int().positive().max(100_000_000).optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  current_amount_cents: z.number().int().min(0).max(100_000_000).optional(),
  monthly_contribution_cents: z.number().int().min(0).max(100_000_000).optional(),
  include_in_spendable_cash: z.boolean().optional(),
  status: z.enum(["active", "paused", "completed", "archived"]).optional(),
});
const savingsGoalProtectionParameters = savingsGoalTargetParameters.extend({
  include_in_spendable_cash: z.boolean(),
  monthly_contribution_cents: z.number().int().min(0).max(100_000_000).optional(),
});
const removeInstitutionParameters = institutionTargetParameters.extend({
  confirmation_text: z.string().min(1).max(160),
});
const simulatePurchaseParameters = z.object({
  amount_cents: z.number().int().positive().max(1000000),
});
const recentTransactionsParameters = z.object({
  limit: z.number().int().min(1).max(12).default(6),
});
const forecastParameters = z.object({
  horizon_days: z.number().int().min(1).max(14).default(14),
});
const insightCardParameters = z.object({
  topic: z.enum(["payday_impact", "spendable_factors"]),
});

export class AgentUnavailableError extends Error {
  code: string;
  status: number;
  detail?: string;

  constructor(input: {
    code: string;
    message: string;
    status?: number;
    detail?: string;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "AgentUnavailableError";
    this.code = input.code;
    this.status = input.status ?? 503;
    this.detail = input.detail;
    this.cause = input.cause;
  }
}

export type AgentErrorPayload = {
  code: string;
  error: string;
  detail?: string;
  status: number;
};

export async function runAIAgent(
  input: RunAiAgentInput,
  runtime?: AgentRuntime,
): Promise<AgentResponse> {
  const deterministicNoToolResponse = createDeterministicNoToolResponse(input);

  if (deterministicNoToolResponse) {
    return deterministicNoToolResponse;
  }

  if (runtime) {
    return runtime.run(input);
  }

  const deterministicTrustResponse = createDeterministicTrustResponse(input);

  if (deterministicTrustResponse) {
    return deterministicTrustResponse;
  }

  const deterministicSavingsGoalResponse = await createDeterministicSavingsGoalResponse(input);

  if (deterministicSavingsGoalResponse) {
    return deterministicSavingsGoalResponse;
  }

  const deterministicConnectedAccountsResponse = await createDeterministicConnectedAccountsResponse(input);

  if (deterministicConnectedAccountsResponse) {
    return deterministicConnectedAccountsResponse;
  }

  const deterministicUnavailableActionResponse = createDeterministicUnavailableActionResponse(input);

  if (deterministicUnavailableActionResponse) {
    return deterministicUnavailableActionResponse;
  }

  if (!shouldUseModel()) {
    throw new AgentUnavailableError({
      code: "missing-openai-config",
      message: "AI is not configured.",
      detail: "Set OPENAI_API_KEY, OPENAI_BASE_URL, or enable Netlify AI Gateway before using the agent.",
    });
  }

  let repair: AgentResponseRepair | undefined;
  let lastError: AgentUnavailableError | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const context = createPipContext(input, repair);

    try {
      const agent = createPipAgent(context);
      const runner = createPipRunner();
      const result = await runner.run(agent, createAgentInput(input, context), {
        context,
        maxTurns: 5,
      });

      return buildAgentResponse(result.finalOutput, context, input, {
        usedModel: true,
        model: getPipAiModel(),
        transport: getOpenAIClientConfig().transport,
      });
    } catch (error) {
      const agentError = toAgentUnavailableError(error);
      const fallbackFinalOutput = createFallbackFinalOutput(context);

      if (
        fallbackFinalOutput &&
        (shouldRetryFinalOutput(agentError) || shouldUseDeterministicFallbackAfterModelFailure(agentError, context))
      ) {
        return buildAgentResponse(fallbackFinalOutput, context, input, {
          usedModel: true,
          model: getPipAiModel(),
          transport: getOpenAIClientConfig().transport,
        });
      }

      if (shouldRecoverBroadChatFinalOutput(agentError, context)) {
        return buildAgentResponse(createBroadChatFallbackFinalOutput(input), context, input, {
          usedModel: true,
          model: getPipAiModel(),
          transport: getOpenAIClientConfig().transport,
        });
      }

      if (!repair && shouldRetryFinalOutput(agentError)) {
        repair = createAgentResponseRepair(agentError);
        lastError = agentError;
        continue;
      }

      throw agentError;
    }
  }

  throw lastError ?? new AgentUnavailableError({
    code: "openai-request-failed",
    message: "AI request failed.",
  });
}

function createDeterministicTrustResponse(input: RunAiAgentInput): AgentResponse | null {
  const forcedTool = getForcedAgentTool(input);

  if (forcedTool?.toolName === "get_trust_policy") {
    const answer = composeTrustPolicyAnswer(input.message, {
      platform: input.platform,
    });

    return agentResponseSchema.parse({
      message: answer.message,
      cards: [],
      promptChips: createDeterministicTrustPromptChips(input),
      usedTools: ["get_trust_policy"],
      responseMode: "chat_only",
      audit: {
        toolNames: ["get_trust_policy"],
        usedModel: false,
      },
    });
  }

  if (forcedTool?.toolName === "get_trust_receipt") {
    const snapshot = input.snapshot ?? (input.onboardingState ? undefined : fakeSnapshot);

    if (!snapshot) {
      return null;
    }

    const result = calculatePipCash(snapshot);
    const receipt = buildSpendableTrustReceipt({
      result,
      syncStatus: input.syncStatus,
    });
    const cards: AgentCard[] = [
      {
        type: "trust_receipt",
        ...receipt,
      },
    ];

    return agentResponseSchema.parse({
      message: "I pulled the receipt behind today's number.",
      cards,
      promptChips: getSuggestedPrompts(result),
      usedTools: ["get_trust_receipt"],
      responseMode: "show_card",
      audit: {
        toolNames: ["get_trust_receipt"],
        usedModel: false,
      },
    });
  }

  return null;
}

async function createDeterministicConnectedAccountsResponse(input: RunAiAgentInput): Promise<AgentResponse | null> {
  const forcedTool = getForcedAgentTool(input);

  if (forcedTool?.toolName !== "get_connected_accounts") {
    return null;
  }

  const context = createPipContext(input);
  recordTool(context, "get_connected_accounts");

  const unavailable = getAccountManagementUnavailableResult(context);
  const actionResult = unavailable
    ? unavailable
    : input.actions?.getConnectedAccounts
      ? await input.actions.getConnectedAccounts()
      : {
          ok: false,
          status: "account_management_unavailable",
          message: "Account management is not available in this environment.",
        };
  const result = applyActionResult(context, actionResult);
  const hasCards = context.availableCards.length > 0;

  return buildAgentResponse(
    {
      message: result.ok
        ? "I found your connected accounts."
        : result.message ?? "Account management is not available in this environment.",
      support: null,
      responseMode: hasCards ? "show_card" : "chat_only",
    },
    context,
    input,
    {
      usedModel: false,
    },
  );
}

function createDeterministicUnavailableActionResponse(input: RunAiAgentInput): AgentResponse | null {
  const forcedTool = getForcedAgentTool(input);

  if (!forcedTool || !isSavingsGoalToolName(forcedTool.toolName)) {
    return null;
  }

  if (hasSavingsGoalAction(input, forcedTool.toolName)) {
    return null;
  }

  const onboardingState = input.onboardingState ?? {
    status: "ready" as const,
    hasFinancialData: false,
  };
  const message = onboardingState.status === "guest"
    ? "I can help set that up after you sign in."
    : onboardingState.status === "needs-consent"
      ? "Finish setup first, then I can help with savings goals."
      : "Savings goals are not available yet.";

  return agentResponseSchema.parse({
    message,
    cards: [],
    promptChips: getOnboardingPromptChips(onboardingState),
    usedTools: [forcedTool.toolName],
    responseMode: "chat_only",
    audit: {
      toolNames: [forcedTool.toolName],
      usedModel: false,
    },
  });
}

async function createDeterministicSavingsGoalResponse(input: RunAiAgentInput): Promise<AgentResponse | null> {
  const normalized = normalizePrompt(input.message);
  const pendingAction = input.conversationState?.pendingAction;
  const forcedTool = getForcedAgentTool(input);

  if (pendingAction?.type === "create_savings_goal") {
    return createSavingsGoalDraftResponse(input, pendingAction);
  }

  if (forcedTool?.toolName === "update_savings_goal") {
    return updateSavingsGoalDeterministically(input, forcedTool.args);
  }

  if (forcedTool?.toolName === "set_savings_goal_protection") {
    return setSavingsGoalProtectionDeterministically(input, forcedTool.args);
  }

  if (isSavingsGoalContextProgressPrompt(normalized)) {
    return listSavingsGoalsDeterministically(input);
  }

  if (!isSavingsGoalPrompt(normalized)) {
    return null;
  }

  if (isSavingsGoalListPrompt(normalized)) {
    return listSavingsGoalsDeterministically(input);
  }

  if (!isSavingsGoalCreatePrompt(normalized)) {
    return null;
  }

  return createSavingsGoalDraftResponse(input, undefined);
}

async function updateSavingsGoalDeterministically(
  input: RunAiAgentInput,
  args: ForcedAgentTool["args"],
): Promise<AgentResponse | null> {
  if (!input.actions?.updateSavingsGoal) {
    return null;
  }

  const toolInput = updateSavingsGoalParameters.parse(args);
  const result = await input.actions.updateSavingsGoal({
    goalId: toolInput.goal_id,
    name: toolInput.name,
    targetAmountCents: toolInput.target_amount_cents,
    targetDate: toolInput.target_date,
    currentAmountCents: toolInput.current_amount_cents,
    monthlyContributionCents: toolInput.monthly_contribution_cents,
    includeInSpendableCash: toolInput.include_in_spendable_cash,
    status: toolInput.status,
  });
  const cards = result.cards ?? [];

  return agentResponseSchema.parse({
    message: result.ok
      ? getSavingsGoalUpdatedMessage(cards)
      : result.message ?? "I could not update that savings goal yet.",
    cards,
    promptChips: createDeterministicTrustPromptChips(input),
    usedTools: ["update_savings_goal"],
    responseMode: cards.length > 0 ? "show_card" : "chat_only",
    ...(result.clientAction ? { clientAction: result.clientAction } : {}),
    audit: {
      toolNames: ["update_savings_goal"],
      usedModel: false,
    },
  });
}

async function setSavingsGoalProtectionDeterministically(
  input: RunAiAgentInput,
  args: ForcedAgentTool["args"],
): Promise<AgentResponse | null> {
  if (!input.actions?.setSavingsGoalProtection) {
    return null;
  }

  const toolInput = savingsGoalProtectionParameters.parse(args);
  const result = await input.actions.setSavingsGoalProtection({
    goalId: toolInput.goal_id,
    name: toolInput.name,
    includeInSpendableCash: toolInput.include_in_spendable_cash,
    monthlyContributionCents: toolInput.monthly_contribution_cents,
  });
  const cards = result.cards ?? [];

  return agentResponseSchema.parse({
    message: result.ok
      ? getSavingsGoalUpdatedMessage(cards)
      : result.message ?? "I could not update that savings goal yet.",
    cards,
    promptChips: createDeterministicTrustPromptChips(input),
    usedTools: ["set_savings_goal_protection"],
    responseMode: cards.length > 0 ? "show_card" : "chat_only",
    ...(result.clientAction ? { clientAction: result.clientAction } : {}),
    audit: {
      toolNames: ["set_savings_goal_protection"],
      usedModel: false,
    },
  });
}

async function createSavingsGoalDraftResponse(
  input: RunAiAgentInput,
  pendingAction: Extract<AgentPendingAction, { type: "create_savings_goal" }> | undefined,
): Promise<AgentResponse> {
  const draft = mergeSavingsGoalDraft(input.message, pendingAction);
  const missing = getMissingSavingsGoalFields(draft);
  const onboardingState = input.onboardingState ?? {
    status: "ready" as const,
    hasFinancialData: false,
  };

  if (missing.includes("target_amount")) {
    return agentResponseSchema.parse({
      message: `How much do you want to save for ${formatSavingsGoalNameForPrompt(draft.name)}?`,
      cards: [],
      promptChips: createDeterministicTrustPromptChips(input),
      usedTools: [],
      responseMode: "clarify",
      pendingAction: {
        ...draft,
        missing,
      },
      audit: {
        toolNames: [],
        usedModel: false,
      },
    });
  }

  if (onboardingState.status === "guest" && !input.actions?.createSavingsGoal) {
    return agentResponseSchema.parse({
      message: "I can help set that up after you sign in.",
      cards: [],
      promptChips: getOnboardingPromptChips(onboardingState),
      usedTools: ["create_savings_goal"],
      responseMode: "chat_only",
      pendingAction: {
        ...draft,
        missing: [],
      },
      audit: {
        toolNames: ["create_savings_goal"],
        usedModel: false,
      },
    });
  }

  if (!input.actions?.createSavingsGoal) {
    return agentResponseSchema.parse({
      message: "Savings goals are not available yet. I kept the goal details here so we can try again.",
      cards: [],
      promptChips: getOnboardingPromptChips(onboardingState),
      usedTools: ["create_savings_goal"],
      responseMode: "chat_only",
      pendingAction: {
        ...draft,
        missing: [],
      },
      audit: {
        toolNames: ["create_savings_goal"],
        usedModel: false,
      },
    });
  }

  const targetAmountCents = draft.targetAmountCents;

  if (!targetAmountCents) {
    return agentResponseSchema.parse({
      message: `How much do you want to save for ${formatSavingsGoalNameForPrompt(draft.name)}?`,
      cards: [],
      promptChips: createDeterministicTrustPromptChips(input),
      usedTools: [],
      responseMode: "clarify",
      pendingAction: {
        ...draft,
        missing: ["target_amount"],
      },
      audit: {
        toolNames: [],
        usedModel: false,
      },
    });
  }

  const result = await input.actions.createSavingsGoal({
    name: draft.name,
    targetAmountCents,
    targetDate: draft.targetDate,
    startingAmountCents: draft.startingAmountCents,
    currentAmountCents: draft.currentAmountCents,
    monthlyContributionCents: draft.monthlyContributionCents,
    includeInSpendableCash: draft.includeInSpendableCash,
  });

  if (!result.ok) {
    return agentResponseSchema.parse({
      message: result.message ?? "I could not save that goal yet. I kept the details so we can try again.",
      cards: result.cards ?? [],
      promptChips: getOnboardingPromptChips(onboardingState),
      usedTools: ["create_savings_goal"],
      responseMode: result.cards?.length ? "show_card" : "chat_only",
      pendingAction: {
        ...draft,
        missing: [],
      },
      audit: {
        toolNames: ["create_savings_goal"],
        usedModel: false,
      },
    });
  }

  const cards = result.cards ?? [];

  return agentResponseSchema.parse({
    message: getSavingsGoalCreatedMessage(cards, draft),
    cards,
    promptChips: getOnboardingPromptChips(onboardingState),
    usedTools: ["create_savings_goal"],
    responseMode: cards.length > 0 ? "show_card" : "chat_only",
    ...(result.clientAction ? { clientAction: result.clientAction } : {}),
    audit: {
      toolNames: ["create_savings_goal"],
      usedModel: false,
    },
  });
}

async function listSavingsGoalsDeterministically(input: RunAiAgentInput): Promise<AgentResponse | null> {
  if (!input.actions?.listSavingsGoals) {
    return null;
  }

  const result = await input.actions.listSavingsGoals();
  const cards = result.cards ?? [];

  return agentResponseSchema.parse({
    message: result.ok
      ? getSavingsGoalListMessage(cards)
      : result.message ?? "I do not see a saved savings goal yet. Tell me what you want to save for and the target amount.",
    cards,
    promptChips: createDeterministicTrustPromptChips(input),
    usedTools: ["list_savings_goals"],
    responseMode: cards.length > 0 ? "show_card" : "chat_only",
    ...(result.clientAction ? { clientAction: result.clientAction } : {}),
    audit: {
      toolNames: ["list_savings_goals"],
      usedModel: false,
    },
  });
}

function mergeSavingsGoalDraft(
  message: string,
  pendingAction: Extract<AgentPendingAction, { type: "create_savings_goal" }> | undefined,
): Extract<AgentPendingAction, { type: "create_savings_goal" }> {
  const normalized = normalizePrompt(message);
  const targetAmountCents = extractSavingsGoalAmountCents(message) ?? pendingAction?.targetAmountCents;
  const monthlyContributionCents = extractMonthlyContributionCents(message) ?? pendingAction?.monthlyContributionCents;
  const targetDate = parseSavingsGoalTargetDate(message, getAgentAsOfDate()) ?? pendingAction?.targetDate;
  const inferredName = inferSavingsGoalName(message, normalized);
  const name = pendingAction?.name && pendingAction.name !== "Savings goal"
    ? pendingAction.name
    : inferredName;

  return {
    type: "create_savings_goal",
    name,
    ...(targetAmountCents === undefined || targetAmountCents === null ? {} : { targetAmountCents }),
    ...(targetDate ? { targetDate } : {}),
    ...(pendingAction?.startingAmountCents === undefined ? {} : { startingAmountCents: pendingAction.startingAmountCents }),
    ...(pendingAction?.currentAmountCents === undefined ? {} : { currentAmountCents: pendingAction.currentAmountCents }),
    ...(monthlyContributionCents === undefined || monthlyContributionCents === null ? {} : { monthlyContributionCents }),
    ...(pendingAction?.includeInSpendableCash === undefined ? {} : { includeInSpendableCash: pendingAction.includeInSpendableCash }),
  };
}

function getMissingSavingsGoalFields(
  draft: Extract<AgentPendingAction, { type: "create_savings_goal" }>,
): SavingsGoalPendingField[] {
  return draft.targetAmountCents ? [] : ["target_amount"];
}

function getSavingsGoalCreatedMessage(
  cards: AgentCard[],
  draft: Extract<AgentPendingAction, { type: "create_savings_goal" }>,
): string {
  const planCard = cards.find((card): card is Extract<AgentCard, { type: "savings_goal_plan" }> =>
    card.type === "savings_goal_plan"
  );

  if (!planCard) {
    return `I saved ${formatMoney(draft.targetAmountCents ?? 0)} for ${formatSavingsGoalNameForPrompt(draft.name)}.`;
  }

  return `I saved the ${planCard.name} savings goal. ${formatMoney(planCard.remainingCents)} left to track in Pip.`;
}

function getSavingsGoalListMessage(cards: AgentCard[]): string {
  const summaryCard = cards.find((card): card is Extract<AgentCard, { type: "savings_goals_summary" }> =>
    card.type === "savings_goals_summary"
  );

  if (!summaryCard) {
    return "I pulled your savings goals.";
  }

  if (summaryCard.activeGoalCount === 0) {
    return "I do not see a saved savings goal yet. Tell me what you want to save for and the target amount.";
  }

  const goal = summaryCard.goals[0];

  if (!goal) {
    return "I pulled your savings goals.";
  }

  return `${goal.name}: ${formatMoney(goal.remainingCents)} left to track in Pip.`;
}

function getSavingsGoalUpdatedMessage(cards: AgentCard[]): string {
  const planCard = cards.find((card): card is Extract<AgentCard, { type: "savings_goal_plan" }> =>
    card.type === "savings_goal_plan"
  );

  if (!planCard) {
    return "I updated the savings goal.";
  }

  return `${planCard.name}: ${formatMoney(planCard.remainingCents)} left to track in Pip.`;
}

function formatSavingsGoalNameForPrompt(name: string): string {
  return name.trim() || "that goal";
}

function parseSavingsGoalTargetDate(message: string, asOfDate: string): string | null {
  const monthPattern =
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
  const monthMatch = monthPattern.exec(message);

  if (monthMatch) {
    return buildFutureDate(Number(monthNameToMonthNumber(monthMatch[1])), Number(monthMatch[2]), asOfDate);
  }

  const numericMatch = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(message);

  if (numericMatch) {
    const month = Number(numericMatch[1]);
    const day = Number(numericMatch[2]);
    const year = numericMatch[3] ? normalizeYear(Number(numericMatch[3])) : undefined;

    return buildFutureDate(month, day, asOfDate, year);
  }

  return null;
}

function monthNameToMonthNumber(value: string): number {
  const normalized = value.toLowerCase();
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.findIndex((month) => normalized.startsWith(month));

  return index + 1;
}

function normalizeYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function buildFutureDate(month: number, day: number, asOfDate: string, explicitYear?: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const asOf = parseDateParts(asOfDate);
  let year = explicitYear ?? asOf.year;
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  if (!explicitYear && candidate.getTime() < Date.UTC(asOf.year, asOf.month - 1, asOf.day)) {
    year += 1;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return { year, month, day };
}

function getAgentAsOfDate(): string {
  return process.env.PIP_APP_DATE || "2026-06-19";
}

function isSavingsGoalContextProgressPrompt(normalized: string): boolean {
  if (/\b(save|saving|set up|start|create|add|track)\b/.test(normalized)) {
    return false;
  }

  return /\b(how much|what|show|update|progress|on track|left|remaining|need)\b/.test(normalized) &&
    /\b(that goal|the goal|my goal|goal|savings goal|japan|trip|vacation|big purchase)\b/.test(normalized);
}

function isSavingsGoalToolName(toolName: DeterministicAgentToolName): boolean {
  return [
    "create_savings_goal",
    "list_savings_goals",
    "update_savings_goal",
    "set_savings_goal_protection",
  ].includes(toolName);
}

function hasSavingsGoalAction(input: RunAiAgentInput, toolName: DeterministicAgentToolName): boolean {
  switch (toolName) {
    case "create_savings_goal":
      return Boolean(input.actions?.createSavingsGoal);
    case "list_savings_goals":
      return Boolean(input.actions?.listSavingsGoals);
    case "update_savings_goal":
      return Boolean(input.actions?.updateSavingsGoal);
    case "set_savings_goal_protection":
      return Boolean(input.actions?.setSavingsGoalProtection);
    default:
      return false;
  }
}

function createDeterministicTrustPromptChips(input: RunAiAgentInput): PromptChip[] {
  const snapshot = input.snapshot ?? (input.onboardingState ? undefined : fakeSnapshot);

  if (snapshot) {
    return getSuggestedPrompts(calculatePipCash(snapshot));
  }

  return getOnboardingPromptChips(input.onboardingState ?? {
    status: "ready",
    hasFinancialData: false,
  });
}

function getForcedAgentTool(input: RunAiAgentInput): ForcedAgentTool | undefined {
  const promptChipTool = getForcedPromptChipTool(
    input.selectedPromptChipId,
    input.onboardingState,
    input.syncStatus,
  );

  if (promptChipTool) {
    return promptChipTool;
  }

  if (isSimpleGreetingPrompt(input.message)) {
    return undefined;
  }

  if (getIntentRouterMode() !== "legacy") {
    const decision = resolveIntentRoute({
      message: input.message,
      history: input.history,
      shownCards: input.conversationState?.shownCards,
      lastToolNames: input.conversationState?.lastToolNames,
      selectedPromptChipId: input.selectedPromptChipId,
      hasSnapshot: Boolean(input.snapshot) || !input.onboardingState,
    });

    if (decision.kind === "route") {
      return {
        toolName: decision.toolName,
        args: decision.args,
        requireCard: decision.requireCard,
      };
    }
  }

  return getLegacyForcedAgentTool(input);
}

function getLegacyForcedAgentTool(input: RunAiAgentInput): ForcedAgentTool | undefined {
  const message = input.message.trim();
  const normalized = normalizePrompt(message);
  const amountCents = extractExplicitPurchaseAmountCents(message);
  const promptChipTool = getForcedPromptChipTool(
    input.selectedPromptChipId,
    input.onboardingState,
    input.syncStatus,
  );

  if (promptChipTool) {
    return promptChipTool;
  }

  if (!normalized) {
    return undefined;
  }

  if (isTrustReceiptPrompt(normalized)) {
    return {
      toolName: "get_trust_receipt",
      args: {},
      requireCard: true,
    };
  }

  if (isTrustPolicyPrompt(normalized)) {
    return {
      toolName: "get_trust_policy",
      args: {},
      requireCard: false,
    };
  }

  const savingsGoalTool = getSavingsGoalForcedTool(message, normalized);

  if (savingsGoalTool) {
    return savingsGoalTool;
  }

  if (isSpendingOpportunityPrompt(normalized)) {
    return {
      toolName: "get_spending_opportunity",
      args: {},
      requireCard: true,
    };
  }

  if (amountCents === null && isFinancialGuidancePrompt(normalized)) {
    return {
      toolName: "get_financial_guidance_context",
      args: {},
      requireCard: false,
    };
  }

  if (isGeneralSpendingQuestion(normalized) && isSpendingPrompt(normalized)) {
    return {
      toolName: "get_pip_cash_snapshot",
      args: {},
      requireCard: false,
    };
  }

  if (isSpendableCashDefinitionPrompt(normalized)) {
    return {
      toolName: "get_spendable_cash_definition",
      args: {},
      requireCard: false,
    };
  }

  if (isPatternAssumptionsPrompt(normalized)) {
    return {
      toolName: "get_pattern_assumptions",
      args: {},
      requireCard: true,
    };
  }

  if (isRecentSpendingPressurePrompt(normalized)) {
    return {
      toolName: "get_recent_spending_pressure",
      args: {},
      requireCard: true,
    };
  }

  if (isExplicitMathPrompt(normalized)) {
    return {
      toolName: "get_pip_cash_math",
      args: {},
      requireCard: true,
    };
  }

  if (isExplicitForecastPrompt(normalized)) {
    return {
      toolName: "forecast_spendable_cash",
      args: {
        horizon_days: extractForecastHorizonDays(normalized),
      },
      requireCard: true,
    };
  }

  const affirmativeFollowUpTool = getAffirmativeFollowUpTool(normalized, input.history);

  if (affirmativeFollowUpTool) {
    return affirmativeFollowUpTool;
  }

  if (isExplicitRecurringPrompt(normalized)) {
    return {
      toolName: "get_recurring_activity",
      args: {},
      requireCard: true,
    };
  }

  if (isExplicitSpendingBreakdownPrompt(normalized)) {
    return {
      toolName: "get_spending_breakdown",
      args: {},
      requireCard: true,
    };
  }

  const accountManagementTool = getAccountManagementForcedTool(message, normalized);

  if (accountManagementTool) {
    return accountManagementTool;
  }

  if (isPaydayImpactPrompt(normalized)) {
    return {
      toolName: "compose_insight_card",
      args: {
        topic: "payday_impact",
      },
      requireCard: true,
    };
  }

  if (isSpendableFactorsInsightPrompt(normalized)) {
    return {
      toolName: "compose_insight_card",
      args: {
        topic: "spendable_factors",
      },
      requireCard: true,
    };
  }

  if (isExplicitPipCashDriversPrompt(normalized) || isFlexiblePipCashDriversPrompt(normalized)) {
    return {
      toolName: "get_pip_cash_drivers",
      args: {},
      requireCard: true,
    };
  }

  if (isSyncStatusPrompt(normalized)) {
    return {
      toolName: "get_sync_status",
      args: {},
      requireCard: false,
    };
  }

  if (isDataQualityPrompt(normalized)) {
    return {
      toolName: "get_data_quality",
      args: {},
      requireCard: true,
    };
  }

  if (isExplicitTransactionsPrompt(normalized)) {
    return {
      toolName: "get_recent_transactions",
      args: {
        limit: 6,
      },
      requireCard: true,
    };
  }

  if (isExplicitBalancesPrompt(normalized)) {
    return {
      toolName: "get_true_balances",
      args: {},
      requireCard: true,
    };
  }

  if (isSpecificSpendSimulationPrompt(normalized) && amountCents !== null) {
    return {
      toolName: "simulate_purchase",
      args: {
        amount_cents: amountCents,
      },
      requireCard: true,
    };
  }

  if (isShortPurchaseFollowUp(normalized, input.history) && amountCents !== null) {
    return {
      toolName: "simulate_purchase",
      args: {
        amount_cents: amountCents,
      },
      requireCard: true,
    };
  }

  return undefined;
}

function getForcedPromptChipTool(
  selectedPromptChipId: string | undefined,
  onboardingState: PipAgentOnboardingState | undefined,
  syncStatus: SyncStatus | null | undefined,
): ForcedAgentTool | undefined {
  if (!selectedPromptChipId) {
    return undefined;
  }

  if (selectedPromptChipId === "get-signed-up") {
    return {
      toolName: "start_google_oauth",
      args: {},
      requireCard: false,
    };
  }

  if (selectedPromptChipId === "connect-data") {
    if (onboardingState?.status === "guest") {
      return {
        toolName: "start_google_oauth",
        args: {},
        requireCard: false,
      };
    }

    if (
      onboardingState?.hasFinancialData === false &&
      hasConnectedRefreshProvider(syncStatus) &&
      !hasRepairablePlaidInstitution(syncStatus)
    ) {
      return {
        toolName: "refresh_financial_data",
        args: {},
        requireCard: false,
      };
    }

    return {
      toolName: "start_plaid_link",
      args: {},
      requireCard: false,
    };
  }

  if (selectedPromptChipId === "manage-accounts") {
    return {
      toolName: "get_connected_accounts",
      args: {},
      requireCard: true,
    };
  }

  if (selectedPromptChipId === "use-default-savings") {
    return {
      toolName: "save_protected_savings",
      args: {
        amount_cents: 20000,
      },
      requireCard: false,
    };
  }

  if (selectedPromptChipId === "set-250-savings") {
    return {
      toolName: "save_protected_savings",
      args: {
        amount_cents: 25000,
      },
      requireCard: false,
    };
  }

  if (selectedPromptChipId === "ai-pattern-assumptions") {
    return {
      toolName: "get_pattern_assumptions",
      args: {},
      requireCard: true,
    };
  }

  if (selectedPromptChipId === "ai-spending-pressure") {
    return {
      toolName: "get_recent_spending_pressure",
      args: {},
      requireCard: true,
    };
  }

  if (selectedPromptChipId === "ai-trust-receipt") {
    return {
      toolName: "get_trust_receipt",
      args: {},
      requireCard: true,
    };
  }

  return undefined;
}

function createPipAgent(context: PipAgentContext) {
  return new Agent<PipAgentContext, typeof agentFinalOutputSchema>({
    name: "PipAgent",
    instructions: createPipInstructions,
    model: getPipAiModel(),
    modelSettings: {
      toolChoice: context.forcedTool?.toolName ?? "auto",
      parallelToolCalls: false,
      store: false,
      maxTokens: 900,
      reasoning: {
        effort: "minimal",
      },
      text: {
        verbosity: "low",
      },
    },
    tools: createPipTools(),
    outputType: agentFinalOutputSchema,
    toolUseBehavior: "run_llm_again",
  });
}

function createPipRunner() {
  const config = getOpenAIClientConfig();
  const provider = new OpenAIProvider({
    openAIClient: createOpenAIClient(config),
    useResponses: true,
    cacheResponsesWebSocketModels: false,
  });

  return new Runner({
    modelProvider: provider,
    tracingDisabled: false,
    traceIncludeSensitiveData: false,
    workflowName: "Pip agent",
    reasoningItemIdPolicy: "omit",
    modelSettings: {
      toolChoice: "auto",
      parallelToolCalls: false,
      store: false,
    },
    toolExecution: {
      maxFunctionToolConcurrency: 1,
    },
  });
}

function createPipTools() {
  return [
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_onboarding_state",
      description:
        "Read the user's current Pip setup state, including whether they are signed in, need monthly savings, need connected data, or already have financial data.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_onboarding_state");

        return {
          ...context.onboardingState,
          syncStatus: formatSyncStatus(context.syncStatus),
          availablePromptChips: context.availablePromptChips,
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "start_google_oauth",
      description:
        "Start Google sign-in when a guest wants to sign up, continue setup, or connect data before signing in.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "start_google_oauth");

        if (context.onboardingState.status !== "guest") {
          return {
            ok: false,
            status: "already_signed_in",
            message: "The user is already signed in.",
          };
        }

        return setClientAction(context, {
          type: "oauth_redirect",
          url: "/api/auth/oauth/google",
        });
      },
    }),
    tool<typeof saveProtectedSavingsParameters, PipAgentContext>({
      name: "save_protected_savings",
      description:
        "Save the user's monthly savings amount. Use when the user gives a dollar amount for monthly savings or chooses the default monthly savings step.",
      parameters: saveProtectedSavingsParameters,
      strict: true,
      async execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "save_protected_savings", input, saveProtectedSavingsParameters);
        recordTool(context, "save_protected_savings");

        if (!context.actions?.saveProtectedSavings) {
          return {
            ok: false,
            status: "sign_in_required",
            message: "The user must sign in before monthly savings can be saved.",
          };
        }

        return applyActionResult(context, await context.actions.saveProtectedSavings({
          amountCents: toolInput.amount_cents,
        }));
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "start_plaid_link",
      description:
        "Create a Plaid Link session for connecting or repairing account data. Use when a signed-in user wants to connect bank/card data.",
      parameters: emptyToolParameters,
      strict: true,
      async execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "start_plaid_link");

        if (context.onboardingState.status === "guest") {
          return {
            ok: false,
            status: "sign_in_required",
            message: "The user must sign in with Google before Plaid can open.",
          };
        }

        if (context.onboardingState.status === "needs-consent") {
          return {
            ok: false,
            status: "protected_savings_required",
            message: "The user must choose monthly savings before Plaid can open.",
          };
        }

        if (!context.actions?.startPlaidLink) {
          return {
            ok: false,
            status: "plaid_unavailable",
            message: "Plaid is not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.startPlaidLink());
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_connected_accounts",
      description:
        "Show connected institutions and accounts, including whether accounts are active, included in Spendable Cash Today, protected savings, excluded, or need repair.",
      parameters: emptyToolParameters,
      strict: true,
      async execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_connected_accounts");

        const unavailable = getAccountManagementUnavailableResult(context);

        if (unavailable) {
          return unavailable;
        }

        if (!context.actions?.getConnectedAccounts) {
          return {
            ok: false,
            status: "account_management_unavailable",
            message: "Account management is not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.getConnectedAccounts());
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "start_new_account_connection",
      description:
        "Start Plaid connect mode to add another bank or card institution. Use when the user wants to add or connect a new account, bank, or card.",
      parameters: emptyToolParameters,
      strict: true,
      async execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "start_new_account_connection");

        const unavailable = getAccountManagementUnavailableResult(context);

        if (unavailable) {
          return unavailable;
        }

        if (!context.actions?.startPlaidLink) {
          return {
            ok: false,
            status: "plaid_unavailable",
            message: "Plaid is not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.startPlaidLink({
          mode: "connect",
        }));
      },
    }),
    tool<typeof institutionTargetParameters, PipAgentContext>({
      name: "repair_account_connection",
      description:
        "Open Plaid update mode to repair one existing institution. Use when the user asks to reconnect, fix, repair, or restore a specific bank connection.",
      parameters: institutionTargetParameters,
      strict: true,
      async execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "repair_account_connection", input, institutionTargetParameters);
        recordTool(context, "repair_account_connection");

        const unavailable = getAccountManagementUnavailableResult(context);

        if (unavailable) {
          return unavailable;
        }

        if (!context.actions?.startPlaidLink) {
          return {
            ok: false,
            status: "plaid_unavailable",
            message: "Plaid is not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.startPlaidLink({
          mode: "repair",
          institutionId: toolInput.institution_id,
          institutionName: toolInput.institution_name,
        }));
      },
    }),
    tool<typeof institutionTargetParameters, PipAgentContext>({
      name: "start_account_selection_update",
      description:
        "Open Plaid update mode with account selection enabled for an existing institution. Use when the user wants to change which accounts Pip can see at one bank.",
      parameters: institutionTargetParameters,
      strict: true,
      async execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "start_account_selection_update", input, institutionTargetParameters);
        recordTool(context, "start_account_selection_update");

        const unavailable = getAccountManagementUnavailableResult(context);

        if (unavailable) {
          return unavailable;
        }

        if (!context.actions?.startPlaidLink) {
          return {
            ok: false,
            status: "plaid_unavailable",
            message: "Plaid is not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.startPlaidLink({
          mode: "account_selection",
          institutionId: toolInput.institution_id,
          institutionName: toolInput.institution_name,
        }));
      },
    }),
    tool<typeof accountInclusionParameters, PipAgentContext>({
      name: "set_account_inclusion",
      description:
        "Include or exclude one account from Spendable Cash Today without disconnecting the provider. Use when the user says ignore, stop using, use again, include, or exclude a specific account.",
      parameters: accountInclusionParameters,
      strict: true,
      async execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "set_account_inclusion", input, accountInclusionParameters);
        recordTool(context, "set_account_inclusion");

        const unavailable = getAccountManagementUnavailableResult(context);

        if (unavailable) {
          return unavailable;
        }

        if (!context.actions?.setAccountInclusion) {
          return {
            ok: false,
            status: "account_management_unavailable",
            message: "Account preferences are not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.setAccountInclusion({
          accountId: toolInput.account_id,
          accountName: toolInput.account_name,
          includeInPipCash: toolInput.include_in_pip_cash,
        }));
      },
    }),
    tool<typeof protectedSavingsAccountParameters, PipAgentContext>({
      name: "set_account_protected_savings",
      description:
        "Set or unset protected-savings treatment for one account. Use when the user asks to make an account protected savings or to stop treating a savings account as protected.",
      parameters: protectedSavingsAccountParameters,
      strict: true,
      async execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "set_account_protected_savings", input, protectedSavingsAccountParameters);
        recordTool(context, "set_account_protected_savings");

        const unavailable = getAccountManagementUnavailableResult(context);

        if (unavailable) {
          return unavailable;
        }

        if (!context.actions?.setAccountProtectedSavings) {
          return {
            ok: false,
            status: "account_management_unavailable",
            message: "Account preferences are not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.setAccountProtectedSavings({
          accountId: toolInput.account_id,
          accountName: toolInput.account_name,
          isProtectedSavings: toolInput.is_protected_savings,
        }));
      },
    }),
    tool<typeof createSavingsGoalParameters, PipAgentContext>({
      name: "create_savings_goal",
      description:
        "Create a savings goal for a future purchase, trip, emergency fund, or other target amount. Use when the user says they want to save for something or create a goal.",
      parameters: createSavingsGoalParameters,
      strict: true,
      async execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "create_savings_goal", input, createSavingsGoalParameters);
        recordTool(context, "create_savings_goal");

        if (!context.actions?.createSavingsGoal) {
          return {
            ok: false,
            status: "savings_goals_unavailable",
            message: "Savings goals are not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.createSavingsGoal({
          name: toolInput.name,
          targetAmountCents: toolInput.target_amount_cents,
          targetDate: toolInput.target_date,
          startingAmountCents: toolInput.starting_amount_cents,
          currentAmountCents: toolInput.current_amount_cents,
          monthlyContributionCents: toolInput.monthly_contribution_cents,
          includeInSpendableCash: toolInput.include_in_spendable_cash,
        }));
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "list_savings_goals",
      description:
        "List the user's savings goals and show current progress. Use when the user asks what goals are tracked or wants an update on goals.",
      parameters: emptyToolParameters,
      strict: true,
      async execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "list_savings_goals");

        if (!context.actions?.listSavingsGoals) {
          return {
            ok: false,
            status: "savings_goals_unavailable",
            message: "Savings goals are not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.listSavingsGoals());
      },
    }),
    tool<typeof updateSavingsGoalParameters, PipAgentContext>({
      name: "update_savings_goal",
      description:
        "Update progress, target amount, target date, monthly contribution, or status for one savings goal.",
      parameters: updateSavingsGoalParameters,
      strict: true,
      async execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "update_savings_goal", input, updateSavingsGoalParameters);
        recordTool(context, "update_savings_goal");

        if (!context.actions?.updateSavingsGoal) {
          return {
            ok: false,
            status: "savings_goals_unavailable",
            message: "Savings goals are not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.updateSavingsGoal({
          goalId: toolInput.goal_id,
          name: toolInput.name,
          targetAmountCents: toolInput.target_amount_cents,
          targetDate: toolInput.target_date,
          currentAmountCents: toolInput.current_amount_cents,
          monthlyContributionCents: toolInput.monthly_contribution_cents,
          includeInSpendableCash: toolInput.include_in_spendable_cash,
          status: toolInput.status,
        }));
      },
    }),
    tool<typeof savingsGoalProtectionParameters, PipAgentContext>({
      name: "set_savings_goal_protection",
      description:
        "Choose whether a savings goal's monthly contribution is kept out of Spendable Cash Today.",
      parameters: savingsGoalProtectionParameters,
      strict: true,
      async execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "set_savings_goal_protection", input, savingsGoalProtectionParameters);
        recordTool(context, "set_savings_goal_protection");

        if (!context.actions?.setSavingsGoalProtection) {
          return {
            ok: false,
            status: "savings_goals_unavailable",
            message: "Savings goals are not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.setSavingsGoalProtection({
          goalId: toolInput.goal_id,
          name: toolInput.name,
          includeInSpendableCash: toolInput.include_in_spendable_cash,
          monthlyContributionCents: toolInput.monthly_contribution_cents,
        }));
      },
    }),
    tool<typeof institutionTargetParameters, PipAgentContext>({
      name: "request_remove_institution_confirmation",
      description:
        "Return the exact confirmation required before removing one institution. Use before removing a bank/card institution unless the user already typed the exact confirmation.",
      parameters: institutionTargetParameters,
      strict: true,
      async execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "request_remove_institution_confirmation", input, institutionTargetParameters);
        recordTool(context, "request_remove_institution_confirmation");

        const unavailable = getAccountManagementUnavailableResult(context);

        if (unavailable) {
          return unavailable;
        }

        if (!context.actions?.requestRemoveInstitutionConfirmation) {
          return {
            ok: false,
            status: "account_management_unavailable",
            message: "Institution removal is not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.requestRemoveInstitutionConfirmation({
          institutionId: toolInput.institution_id,
          institutionName: toolInput.institution_name,
        }));
      },
    }),
    tool<typeof removeInstitutionParameters, PipAgentContext>({
      name: "remove_institution",
      description:
        "Remove one institution only when the user has typed the exact confirmation returned by request_remove_institution_confirmation.",
      parameters: removeInstitutionParameters,
      strict: true,
      async execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "remove_institution", input, removeInstitutionParameters);
        recordTool(context, "remove_institution");

        const unavailable = getAccountManagementUnavailableResult(context);

        if (unavailable) {
          return unavailable;
        }

        if (!context.actions?.removeInstitution) {
          return {
            ok: false,
            status: "account_management_unavailable",
            message: "Institution removal is not available in this environment.",
          };
        }

        return applyActionResult(context, await context.actions.removeInstitution({
          institutionId: toolInput.institution_id,
          institutionName: toolInput.institution_name,
          confirmationText: toolInput.confirmation_text,
        }));
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "refresh_financial_data",
      description:
        "Refresh already connected financial data. Use when the user asks to refresh, sync, update, or reload their account data.",
      parameters: emptyToolParameters,
      strict: true,
      async execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "refresh_financial_data");

        if (!context.actions?.refreshFinancialData) {
          return {
            ok: false,
            status: "connect_data_first",
            message: "No refreshable provider is connected yet.",
          };
        }

        return applyActionResult(context, await context.actions.refreshFinancialData());
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "request_delete_data_confirmation",
      description:
        "Explain the exact confirmation needed before deleting stored financial data. Use when the user asks about deleting, erasing, or removing data but has not typed DELETE DATA exactly.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "request_delete_data_confirmation");

        return {
          ok: true,
          status: "confirmation_required",
          exactConfirmation: "DELETE DATA",
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "delete_user_data",
      description:
        "Delete stored financial data only when the user's latest message is exactly DELETE DATA.",
      parameters: emptyToolParameters,
      strict: true,
      async execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "delete_user_data");

        if (context.inputMessage.trim() !== "DELETE DATA") {
          return {
            ok: false,
            status: "confirmation_required",
            exactConfirmation: "DELETE DATA",
          };
        }

        if (!context.actions?.deleteUserData) {
          return {
            ok: false,
            status: "sign_in_required",
            message: "The user must be signed in before stored data can be deleted.",
          };
        }

        return applyActionResult(context, await context.actions.deleteUserData());
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_pip_cash_snapshot",
      description:
        "Read the current deterministic Spendable Cash Today snapshot. Use for financial facts when a card is not necessarily needed.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_pip_cash_snapshot");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const result = calculatePipCash(snapshot);
        const metric = result.spendableCashToday;
        const spendableCashTodayCents = getDisplayedSpendableCashTodayCents(result);

        return {
          metricName: "Spendable Cash Today",
          pipCashToday: formatMoney(spendableCashTodayCents),
          pipCashTodayCents: spendableCashTodayCents,
          metricVersion: metric?.metricVersion ?? "legacy",
          state: getSpendableCashTodayState(result),
          confidence: metric?.confidence,
          shortfall: metric ? formatMoney(metric.shortfallCents) : undefined,
          shortfallCents: metric?.shortfallCents,
          baselineDailyAllowance: metric ? formatMoney(metric.baselineDailyAllowanceCents) : undefined,
          baselineDailyAllowanceCents: metric?.baselineDailyAllowanceCents,
          behaviorAdjustment: metric ? formatMoney(metric.behaviorAdjustmentCents) : undefined,
          behaviorAdjustmentCents: metric?.behaviorAdjustmentCents,
          cashRealityAdjustment: metric ? formatMoney(metric.cashRealityAdjustmentCents) : undefined,
          cashRealityAdjustmentCents: metric?.cashRealityAdjustmentCents,
          rollingNet: formatMoney(result.rollingNetCents),
          rollingNetCents: result.rollingNetCents,
          window: result.window,
          warningCount: result.warnings.length,
          dataStateCount: result.dataStates.length,
          suggestedPrompts: getSuggestedPrompts(result),
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_financial_guidance_context",
      description:
        "Collect Spendable Cash facts, evidence IDs, allowed domains, and blocked domains needed for a grounded financial read. This tool does not write advice or card copy.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_financial_guidance_context");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const toolResult = buildFinancialGuidanceToolResult(snapshot);
        context.guidanceContext = toolResult.context;

        return toolResult;
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_pip_cash_drivers",
      description:
        "Get the deterministic drivers behind Spendable Cash Today and make the explanation card available. Use when the user asks why, what changed, or what is behind the number.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_pip_cash_drivers");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("explain_pip_cash", {}, snapshot);
        const result = calculatePipCash(snapshot);
        const metric = result.spendableCashToday;
        addAvailableCards(context, response.cards);

        return {
          metricName: "Spendable Cash Today",
          pipCashToday: formatMoney(getDisplayedSpendableCashTodayCents(result)),
          metricVersion: metric?.metricVersion ?? "legacy",
          state: getSpendableCashTodayState(result),
          confidence: metric?.confidence,
          summary: summarizePipCash(result),
          drivers: response.cards[0]?.type === "pip_cash_explanation" ? response.cards[0].drivers : [],
          warnings: metric?.warnings ?? result.warnings,
          dataStates: metric?.dataStates ?? result.dataStates,
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
        };
      },
    }),
    tool<typeof insightCardParameters, PipAgentContext>({
      name: "compose_insight_card",
      description:
        "Create a deterministic lightweight insight card for a medium-complex Spendable Cash explanation. Use for payday impact, paycheck impact, deposit impact, or what factors affect today's Spendable Cash.",
      parameters: insightCardParameters,
      strict: true,
      execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "compose_insight_card", input, insightCardParameters);
        recordTool(context, "compose_insight_card");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("compose_insight_card", toolInput, snapshot);
        const card = response.cards[0];
        addAvailableCards(context, response.cards);

        return {
          topic: toolInput.topic,
          availableCards: response.cards,
          rowCount: card?.type === "insight_card" ? card.rows.length : 0,
          suggestedPrompts: response.promptChips,
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_spendable_cash_definition",
      description:
        "Read the deterministic explanation of what Spendable Cash Today means and what makes it rise or fall. Use when the user asks how Pip works or what Spendable Cash Today is.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_spendable_cash_definition");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const result = calculatePipCash(snapshot);
        const metric = result.spendableCashToday;

        return {
          metricName: "Spendable Cash Today",
          currentValue: formatMoney(getDisplayedSpendableCashTodayCents(result)),
          metricVersion: metric?.metricVersion ?? "legacy",
          state: getSpendableCashTodayState(result),
          confidence: metric?.confidence,
          definition:
            "Spendable Cash Today is the amount I estimate is okay to use today from your normal money pattern, recurring obligations, monthly savings, recent spending pace, and available cash.",
          risesWhen: [
            "your normal income pattern leaves more room after bills and savings",
            "recent everyday spending runs lighter than pace",
            "available cash stops capping the pattern-based number",
          ],
          fallsWhen: [
            "recurring obligations or monthly savings take more of the monthly pattern",
            "recent everyday spending runs ahead of pace",
            "available cash caps the pattern-based number",
          ],
          notUsedAs: [
            "a category budget",
            "an exact paycheck forecast",
            "a guarantee that a purchase is safe",
          ],
          suggestedPrompts: getSuggestedPrompts(result),
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_pattern_assumptions",
      description:
        "Show the deterministic assumptions behind the pattern-based Spendable Cash Today metric, including income, bills, everyday context, and confidence.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_pattern_assumptions");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("show_pattern_assumptions", {}, snapshot);
        addAvailableCards(context, response.cards);

        return {
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_recent_spending_pressure",
      description:
        "Show how current-month everyday spending pace changes today's Spendable Cash number.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_recent_spending_pressure");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("show_recent_spending_pressure", {}, snapshot);
        addAvailableCards(context, response.cards);

        return {
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_spending_opportunity",
      description:
        "Find the strongest grounded cutback opportunity from recent transaction patterns and make a cutback insight card available.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_spending_opportunity");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("show_spending_opportunity", {}, snapshot);
        const card = response.cards[0];
        addAvailableCards(context, response.cards);

        return {
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
          opportunity:
            card?.type === "insight_card"
              ? {
                  title: card.title,
                  summary: card.summary,
                  rowCount: card.rows.length,
                }
              : null,
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_spending_breakdown",
      description:
        "Get grouped rolling-window income, spending, refunds, rent, card payments, top categories, and top merchants, and make the breakdown card available.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_spending_breakdown");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("show_spending_breakdown", {}, snapshot);
        const card = response.cards[0];
        addAvailableCards(context, response.cards);

        return {
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
          breakdown:
            card?.type === "spending_breakdown"
              ? {
                  totals: card.totals,
                  topCategoryCount: card.topCategories.length,
                  topMerchantCount: card.topMerchants.length,
                  incomeSourceCount: card.incomeSources.length,
                }
              : null,
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_recurring_activity",
      description:
        "Detect likely repeated bills, subscriptions, paychecks, or monthly activity and make the recurring activity card available.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_recurring_activity");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("show_recurring_activity", {}, snapshot);
        const card = response.cards[0];
        addAvailableCards(context, response.cards);

        return {
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
          recurring:
            card?.type === "recurring_activity"
              ? {
                  itemCount: card.items.length,
                  nextItems: card.items.slice(0, 3).map((item) => ({
                    label: item.label,
                    expectedDate: item.expectedDate,
                    amount: formatMoneyWithCents(item.amountCents),
                    confidence: item.confidence,
                  })),
                }
              : null,
        };
      },
    }),
    tool<typeof forecastParameters, PipAgentContext>({
      name: "forecast_spendable_cash",
      description:
        "Forecast Spendable Cash Today for the next 1 to 14 days using recurring activity plus recent daily spend trend, and make the forecast card available.",
      parameters: forecastParameters,
      strict: true,
      execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "forecast_spendable_cash", input, forecastParameters);
        recordTool(context, "forecast_spendable_cash");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool(
          "show_spendable_cash_forecast",
          { horizon_days: toolInput.horizon_days },
          snapshot,
        );
        const card = response.cards[0];
        addAvailableCards(context, response.cards);

        return {
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
          forecast:
            card?.type === "spendable_cash_forecast"
              ? {
                  horizonDays: card.horizonDays,
                  current: formatMoney(card.currentSpendableCashCents),
                  projected: formatMoney(card.projectedSpendableCashCents),
                  dailyTrend: formatMoney(card.dailyTrendCents),
                  recurringItemCount: card.recurringItems.length,
                  disclaimer: card.disclaimer,
                }
              : null,
        };
      },
    }),
    tool<typeof simulatePurchaseParameters, PipAgentContext>({
      name: "simulate_purchase",
      description:
        "Simulate the consequence of a specific purchase amount. Use when the user asks whether a purchase or spend amount fits.",
      parameters: simulatePurchaseParameters,
      strict: true,
      execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "simulate_purchase", input, simulatePurchaseParameters);
        recordTool(context, "simulate_purchase");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("simulate_purchase", toolInput, snapshot);
        const card = response.cards[0];
        addAvailableCards(context, response.cards);
        const guidanceContext = maybeAttachPurchaseGuidanceContext(context, snapshot);

        return {
          amountCents: toolInput.amount_cents,
          amount: formatMoney(toolInput.amount_cents),
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
          guidanceContext,
          simulation:
            card?.type === "purchase_simulation"
              ? {
                  before: formatMoney(card.beforeCents),
                  spendableCashAfterPurchase: formatMoney(card.todayRemainingCents),
                  todayOverage: formatMoney(card.todayOverageCents),
                  shortfall: card.shortfallCents === undefined ? undefined : formatMoney(card.shortfallCents),
                }
              : null,
        };
      },
    }),
    tool<typeof recentTransactionsParameters, PipAgentContext>({
      name: "get_recent_transactions",
      description:
        "Get recent transactions for the current rolling window and make the recent transactions card available. Use only when the user asks for recent transactions, charges, purchases, or activity.",
      parameters: recentTransactionsParameters,
      strict: true,
      execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(context, "get_recent_transactions", input, recentTransactionsParameters);
        recordTool(context, "get_recent_transactions");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("show_recent_transactions", toolInput, snapshot);
        const card = response.cards[0];
        addAvailableCards(context, response.cards);

        return {
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
          transactionSummary:
            card?.type === "recent_transactions"
              ? {
                  count: card.transactions.length,
                  total: formatMoneyWithCents(sumTransactionAmounts(card.transactions)),
                  pendingCount: card.transactions.filter((transaction) => transaction.pending).length,
                  dateRange: getTransactionDateRange(card.transactions),
                }
              : null,
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_true_balances",
      description:
        "Get actual account balances and make the balances card available. Use only when the user asks for true balances, actual balances, or account balances.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_true_balances");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("show_true_balances", {}, snapshot);
        addAvailableCards(context, response.cards);

        return {
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
          balanceCount:
            response.cards[0]?.type === "true_balances" ? response.cards[0].balances.length : 0,
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_data_quality",
      description:
        "Check connected-data quality, missing cards, stale institutions, or repair status and make the relevant data-quality card available.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_data_quality");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("detect_missing_card", {}, snapshot);
        const result = calculatePipCash(snapshot);
        const metric = result.spendableCashToday;
        addAvailableCards(context, response.cards);

        return {
          warningCount: (metric?.warnings ?? result.warnings).length,
          warnings: metric?.warnings ?? result.warnings,
          dataStates: metric?.dataStates ?? result.dataStates,
          accountCount: snapshot.accounts.length,
          transactionCount: snapshot.transactions.length,
          syncStatus: formatSyncStatus(context.syncStatus),
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_sync_status",
      description:
        "Read connection and sync status. Use when the user asks whether data is connected, stale, repaired, refreshed, or still syncing.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_sync_status");

        return formatSyncStatus(context.syncStatus);
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_trust_receipt",
      description:
        "Create a receipt for the current Spendable Cash Today number, including freshness, accounts counted, time horizon, pending spend, confidence, and known limits.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_trust_receipt");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const result = calculatePipCash(snapshot);
        const receipt = buildSpendableTrustReceipt({
          result,
          syncStatus: context.syncStatus,
        });
        const cards: AgentCard[] = [
          {
            type: "trust_receipt",
            ...receipt,
          },
        ];
        addAvailableCards(context, cards);

        return {
          availableCards: cards,
          receipt: {
            asOfLabel: receipt.asOfLabel,
            rowCount: receipt.rows.length,
            knownLimitCount: receipt.knownLimits.length,
            knownLimits: receipt.knownLimits.map((limit) => limit.label),
          },
          publicLinks: {
            howNumberWorks: pipTrustPolicy.publicLinks.howNumberWorks,
            security: pipTrustPolicy.publicLinks.security,
            privacy: pipTrustPolicy.publicLinks.privacy,
          },
          suggestedPrompts: getSuggestedPrompts(result),
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_trust_policy",
      description:
        "Answer public trust, security, privacy, provider, AI, pricing, deletion, money-movement, and advice-boundary questions from Pip's vetted policy.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_trust_policy");
        const answer = composeTrustPolicyAnswer(context.inputMessage, {
          platform: context.platform,
        });

        return {
          answer,
          policy: {
            effectiveDate: pipTrustPolicy.effectiveDate,
            revisionDate: pipTrustPolicy.revisionDate,
            bankDataProvider: pipTrustPolicy.bankDataProvider,
            aiProvider: pipTrustPolicy.aiProvider,
            productBoundaries: pipTrustPolicy.productBoundaries,
            securityBoundaries: pipTrustPolicy.securityBoundaries,
            privacyBoundaries: pipTrustPolicy.privacyBoundaries,
            supportEmail: pipTrustPolicy.supportEmail,
            publicLinks: pipTrustPolicy.publicLinks,
          },
        };
      },
    }),
    tool<typeof emptyToolParameters, PipAgentContext>({
      name: "get_pip_cash_math",
      description:
        "Get the deterministic math breakdown behind Spendable Cash Today. Use only when the user explicitly asks for math, formula, or calculation details.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_pip_cash_math");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("show_math", {}, snapshot);
        addAvailableCards(context, response.cards);

        return {
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
        };
      },
    }),
  ];
}

function createPipInstructions(runContext: {
  context: PipAgentContext;
}): string {
  const recentCardTypes = uniqueStrings(
    runContext.context.conversationState.shownCards.map((card) => card.type),
  );
  const lastToolNames = uniqueStrings(runContext.context.conversationState.lastToolNames);
  const recentPromptChipLabels = uniqueStrings(
    runContext.context.conversationState.promptChips.map((chip) => chip.label),
  ).slice(-9);
  const repairInstruction = runContext.context.repair
    ? [
        "Your previous final response failed Pip's final checks.",
        `Failure reason: ${runContext.context.repair.reason}.`,
        runContext.context.repair.detail ? `Failure detail: ${runContext.context.repair.detail}` : "",
        "Fix the final structured answer. Do not apologize. Do not add extra detail.",
      ].filter(Boolean).join("\n")
    : "";
  const promptChipRefreshInstruction = runContext.context.requestKind === "prompt_chips"
    ? [
        "This turn is a silent prompt-chip refresh for the current screen.",
        "Do not call tools. Do not create cards. Do not answer the user.",
        "Return message exactly: Ready.",
        "The app will plan deterministic prompt chips. You may add up to 3 specific supplemental promptChips if they fit the current state.",
        "Use concrete, varied next-step ideas. Avoid generic repeats.",
        "For chip labels, prefer clear short questions like What bills are coming up? or What is cash flow?",
        "Do not use chip labels that start with Discuss. Do not suggest snapshot or view chips.",
        "For chip prompts, write a direct user request. Do not start with Let's discuss unless there is no matching Pip card.",
      ].join("\n")
    : "";
  const qualityVariantInstruction = getPipAgentQualityVariantInstructions(
    runContext.context.qualityVariant,
  );

  return [
    "You are Pip, a calm financial assistant for the Pip app.",
    "You speak as Pip in first person. Say I, me, and my when you describe what you do.",
    "Never describe yourself in third person in visible replies. Do not say Pip does, Pip can, Pip will, Pip helps, or Pip shows.",
    "For financial answers, prefer first-person verbs like I found, I see, I counted, or I can.",
    "Do not start financial answers with 'Spendable Cash Today is'. Start from what you found or see.",
    "This is your single-screen app with a top Spendable Cash Today number, temporary cards, prompt chips, and this chat input.",
    "Your job is to explain Spendable Cash Today and help users make simple spending decisions.",
    "You may give a grounded financial read when the user asks what you think, asks what to do, asks how they are doing, asks about a purchase, or when guidance context shows tight, shortfall, missing-data, or low-confidence state.",
    "Use get_financial_guidance_context before giving a read based on the user's actual finances, unless a judgmental purchase simulation already returned guidanceContext in the same turn.",
    "For a grounded read, use evidence IDs from guidanceContext. Do not invent facts, categories, merchants, balances, bills, or dollar amounts.",
    "You may be direct about spending pace, whether things look stable or tight, whether a purchase adds pressure, whether monthly savings look reasonable for now, whether bills or everyday spending are the bigger pressure, whether cash reality is limiting the number, whether data quality limits the read, and general high-interest debt priority.",
    "You may gently disagree with the user when evidence conflicts with their assumption. Use phrases like my read, I'd treat this as, the conservative move, this adds pressure, this looks stable, this looks tight, I would be careful with that, or I would not treat that as open room.",
    "Do not call this financial advice. Do not use canned responses, moralize, shame, or over-explain.",
    "Do not give securities advice, crypto advice, tax advice, legal advice, bankruptcy advice, specific credit-card recommendations, specific loan recommendations, specific lender recommendations, insurance product recommendations, or instructions to skip required bills.",
    "Use Spendable Cash Today for the top daily metric. Do not say PIP legacy cash wording in visible replies.",
    "There is no dashboard, dashboard page, budget page, transaction page, tab view, or separate area to send the user to.",
    "Do not mention dashboards, pages, tabs, sections, navigation, budgeting apps, expense tracking, or financial planning.",
    "Never calculate money yourself. Use tools for any current financial fact, balance, transaction, driver, data-quality status, or purchase simulation.",
    "Use get_trust_policy for questions about Plaid, bank-data providers, AI providers, AI training, privacy, security, deletion, subscriptions, money movement, guarantees, or financial-advice boundaries.",
    "Use get_trust_receipt when the user asks whether the current number is fresh, current, trustworthy, based on complete data, what it includes, what it may be missing, or asks for a receipt behind the number.",
    "The Spendable Cash Today number is calculated by Pip's product logic. AI explains and answers; AI does not own the money calculation.",
    "Pip uses Plaid for read-only account connection. Pip cannot move money, withdraw funds, transfer funds, make payments, or store bank usernames and passwords.",
    "Use tools for setup and account actions. Do not pretend an action happened unless the matching tool returned ok.",
    "You can help users manage connected accounts through tools. Use account tools when the user asks what accounts are connected, wants to add a bank/card, repair a connection, change selected accounts, exclude or include an account, mark protected savings, or remove an institution.",
    "Account management stays chat-owned. Do not mention settings pages, dashboards, menus, tabs, or separate account screens.",
    "Use get_connected_accounts when the user asks what is connected, when an account/institution target is unclear, or when more than one target could match.",
    "Use start_new_account_connection for adding a new bank or card. Use repair_account_connection for reconnecting one stale or broken institution. Use start_account_selection_update for changing which accounts Pip can see at an existing institution.",
    "Use set_account_inclusion when the user wants to ignore, exclude, include, or use an account again without disconnecting its institution.",
    "Use set_account_protected_savings when the user wants to mark or unmark a specific account as protected savings.",
    "Use savings goal tools when the user wants to save for a trip, big purchase, emergency fund, or named goal.",
    "Use create_savings_goal when the user gives a target amount for a new goal. Use list_savings_goals when they ask what goals are tracked or want an update.",
    "Use update_savings_goal when the user changes progress, target amount, target date, monthly contribution, or status. Use set_savings_goal_protection when they want a goal's monthly plan kept out of Spendable Cash Today.",
    "Savings goals are tracking and planning only. Pip does not move money, open a savings account, or transfer funds for a goal.",
    "For institution removal, call request_remove_institution_confirmation first. Only call remove_institution when the latest user message matches the exact confirmation text.",
    "For greetings, do not mention forecasts, cards, views, breakdowns, transactions, or app features. Just invite one simple next question.",
    "Use get_onboarding_state when the user's setup state matters or when you are unsure what step they are on.",
    "If a guest wants to sign up, continue, start, or connect data, call start_google_oauth.",
    "If the user needs consent and gives a protected-savings amount, call save_protected_savings. If they say continue/default/yes/ok at that step, use 20000 cents.",
    "If a signed-in consented user already has a Plaid/Teller institution but no financial snapshot yet, call refresh_financial_data before opening Plaid again.",
    "If a signed-in consented user wants to connect data, call start_plaid_link.",
    "If the user asks to refresh, sync, update, or reload connected data, call refresh_financial_data.",
    "If the user asks to delete stored data, call request_delete_data_confirmation unless their latest message is exactly DELETE DATA. Only then call delete_user_data.",
    "You may answer without tools for greetings, thanks, reactions, nonsense, duplicate follow-ups, or things already answered by the recent conversation.",
    "If forced_tool_name is not none, call that exact tool first. After the tool returns, write a fresh conversational response in your own words.",
    "If there is no financial snapshot yet, do not answer with fake amounts. Guide the user to the next setup step.",
    "If the user asks why the number changed, why this number, what drives Spendable Cash Today, or asks for drivers, call get_pip_cash_drivers directly.",
    "Do not ask whether they want drivers, math, or a summary when they already asked why or asked for drivers.",
    "For why or what-changed answers, use a short first-person sentence like: I found $X for today. Your normal room is $Y, with recent spending and cash reality already reflected.",
    "For medium-complex explanations like payday impact, paycheck impact, deposit impact, or factors affecting today's number, call compose_insight_card and let the card carry the detail.",
    "The compose_insight_card tool is the only way to create insight cards. Do not invent card rows or UI in the final answer.",
    "If the user asks what Spendable Cash Today means, how Pip works, or what makes the number rise or fall, call get_spendable_cash_definition.",
    "If the user asks what pattern, assumptions, confidence, or baseline I am using, call get_pattern_assumptions.",
    "If the user asks how recent spending affects today's number, pace, over/under pattern, or spending pressure, call get_recent_spending_pressure.",
    "If the user asks what to cut back on, where they are overspending, what spending looks wasteful, or how to save money from recent spending, call get_spending_opportunity.",
    "If the user asks how they are doing, what you think, what they should do, whether spending is too high, whether to lower monthly savings, whether they are broke, or asks for your read, call get_financial_guidance_context.",
    "If the user asks for a trend, forecast, projection, or next-days view, call forecast_spendable_cash.",
    "If the user asks about recurring bills, subscriptions, monthly charges, or likely upcoming repeats, call get_recurring_activity.",
    "If the user asks for a complete, item, category, merchant, income, spending, refund, or card-payment breakdown, call get_spending_breakdown.",
    "Only ask for an amount when the user is clearly asking you to simulate or test a specific purchase but did not provide the amount.",
    "For general spend questions without an amount, call get_pip_cash_snapshot. Explain what the number signals, but do not give a max spend limit.",
    "For purchase simulations, answer directly from the tool result. Explain Spendable Cash after the purchase as current Spendable Cash minus the purchase. Never mention internal engine version names, recomputed daily room, or daily effect in visible replies. If guidanceContext is present, also give a brief read on pressure from the purchase. If there is a shortfall, say it adds to the shortfall; do not describe the number as a bank balance.",
    "If the user asks generally whether $0 or a shortfall means they cannot spend money, use get_pip_cash_snapshot and explain the signal conversationally without treating it as a purchase simulation.",
    "Spendable Cash Today floors at $0 in shortfall states. That is a warning about today's pattern and cash reality; it does not literally mean every dollar of spending is impossible.",
    "If a trust receipt card is returned, write one short bridge sentence. Do not repeat every receipt row in chat.",
    "Only call get_recent_transactions when the user plainly asks to show, list, or identify transactions, charges, purchases, or recent activity.",
    "Do not call get_recent_transactions for general why, math, negative Spendable Cash Today, or can-I-spend questions.",
    "Prefer a short answer plus a structured card. For card answers, keep your sentence short and let the card carry the detail.",
    "When a utility card is returned, write one short bridge sentence. For guidance_card, write the read itself. Do not duplicate card rows in chat.",
    "Cards are optional. Prefer conversational explanation after the first card.",
    "Do not repeat a card whose type is listed in recent_card_types unless the user clearly asks to see that card, details, or breakdown again.",
    "Tools create utility cards. For financial reads only, you may emit guidanceCardDraft in the final structured output after get_financial_guidance_context or purchase guidanceContext was used.",
    "For guidanceCardDraft, use title My read or a similarly short title, choose stance stable/watch/tight/shortfall/uncertain, include 1 to 3 rows, and put at least one valid evidence ID on every row.",
    "For guidanceCardDraft evidenceIds, copy exact strings from guidanceContext.evidence[].id. Common valid ids include spendable-today, state, confidence, data_quality, baseline-room, normal-room, bills-held-back, recurring-obligations, protected-savings, hidden-cushion, recent-spending-hot, recent-spending-light, low-confidence, missing-card, missing-data, cash-guardrail, and shortfall.",
    "Do not emit arbitrary card data or card selectors in the final answer.",
    "Do not invent card data, rows, balances, merchants, dates, or transaction details.",
    "Only say show, list, pull, view, card, trend view, forecast, or breakdown when a matching tool returned a card in this same turn.",
    "For broad personal-finance basics without a matching Pip card, teach one simple concept conversationally. Do not promise to show data.",
    "For broad money basics, keep the answer general unless a tool was called in this same turn. Do not mention the user's current number, bills, monthly savings, cards, data, or say I see.",
    "Forecasts are pattern guesses only. If mentioning a forecast caveat, use one short sentence: Forecast only; not guaranteed.",
    "Do not use guarantee language except the exact forecast caveat phrase: not guaranteed.",
    "Use at most one card unless the user explicitly asks for multiple details.",
    "Never use guaranteed-spending language, affordability claims, the phrase I recommend, or tell the user what they should buy.",
    `Never say ${["safe", "to", "spend"].join(" ")}, safe to buy, you can afford, I recommend, financial advice, or financial advisor.`,
    "Do not moralize, shame, praise, or use motivational wellness language.",
    "Do not use emojis by default.",
    "Do not use stock template phrasing like 'Here is...' as the whole reply. Respond to the user's exact wording and current conversation.",
    "Write at a fifth-grade reading level.",
    "Keep visible replies to one short sentence when possible, two short sentences max.",
    "The visible message must be 45 words or fewer and 260 characters or fewer.",
    "Use message for the direct lead sentence. Use support only when one short extra sentence adds useful context.",
    "Use common words. Avoid formal phrases like deterministic, rolling-window pattern, liquidity, optimal, analyze, or sufficient.",
    "Never use k shorthand for money. Say $210, not $0.21k.",
    "For guidance_card answers, preserve the financial read in the visible message; do not reduce it to a bridge sentence.",
    "For other card answers, let the card carry the detail. The message should only tell the user what the card is showing.",
    "Do not end card answers with a follow-up question. Prompt chips handle next steps.",
    "Prompt chips are mostly planned by the app. Return [] unless you have a specific supplemental next step that fits this exact turn.",
    "Do not use these retired prompt chip labels: Missing card, Why today?, Test purchase, Why this number?, Can I spend $50?, What changed?",
    "Prompt chip labels can be short natural questions up to 56 characters. Prompt text should sound like a normal next user message.",
    "Do not return the exact same chip set every time. Avoid generic repeats when the user just asked a specific question.",
    "Use protected setup chip ids only when the chip clearly starts that exact setup step: get-signed-up, connect-data, use-default-savings, set-250-savings.",
    "For normal suggested questions, use ids that start with ai-.",
    "Return only structured output matching the schema, including promptChips.",
    qualityVariantInstruction,
    promptChipRefreshInstruction,
    repairInstruction,
    `forced_tool_name: ${runContext.context.forcedTool?.toolName ?? "none"}`,
    `onboarding_status: ${runContext.context.onboardingState.status}`,
    `has_financial_snapshot: ${Boolean(runContext.context.snapshot)}`,
    `available_prompt_chip_ids: ${runContext.context.availablePromptChips.map((chip) => chip.id).join(", ") || "none"}`,
    `recent_prompt_chip_labels: ${recentPromptChipLabels.length ? recentPromptChipLabels.join(", ") : "none"}`,
    `recent_card_types: ${recentCardTypes.length ? recentCardTypes.join(", ") : "none"}`,
    `last_tool_names: ${lastToolNames.length ? lastToolNames.join(", ") : "none"}`,
  ].join("\n");
}

function createAgentInput(
  input: RunAiAgentInput,
  context: PipAgentContext,
): AgentInputItem[] {
  return [
    ...formatHistoryForModel(input.history),
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: JSON.stringify({
            user_message: input.message,
            request_kind: context.requestKind,
            interface_context:
              "Single Pip screen only. No dashboard, tabs, budget page, transaction page, or separate navigation.",
            recent_card_types: context.conversationState.shownCards.map((card) => card.type).slice(-8),
            recent_card_titles: context.conversationState.shownCards
              .map((card) => card.title)
              .filter(Boolean)
              .slice(-8),
            last_tool_names: context.conversationState.lastToolNames.slice(-8),
            recent_prompt_chips: context.conversationState.promptChips.slice(-18),
            forced_tool_name: context.forcedTool?.toolName ?? null,
            forced_tool_args: context.forcedTool?.args ?? null,
            onboarding_state: context.onboardingState,
            has_financial_snapshot: Boolean(context.snapshot),
            financial_context_for_prompt_chips: createPromptChipFinancialContext(context.snapshot),
            prompt_chip_examples: context.availablePromptChips,
            response_style:
              `Answer at a fifth-grade reading level. Use 45 words or fewer and ${agentMessageMaxChars} characters or fewer.`,
            repair: context.repair ?? null,
          }),
        },
      ],
    },
  ];
}

function formatHistoryForModel(history: AgentHistoryItem[] | undefined): AgentInputItem[] {
  return formatHistoryForGrounding(history).map((item) => ({
    role: item.role,
    content: [
      {
        type: item.role === "assistant" ? "output_text" : "input_text",
        text: item.content,
      },
    ],
  })) as AgentInputItem[];
}

function formatHistoryForGrounding(history: AgentHistoryItem[] | undefined): AgentHistoryItem[] {
  return (history ?? []).slice(-8).map((item) => ({
    role: item.role,
    content: item.content.slice(0, 500),
  }));
}

function createPipContext(
  input: RunAiAgentInput,
  repair?: AgentResponseRepair,
): PipAgentContext {
  const snapshot = input.snapshot ?? (input.onboardingState ? undefined : fakeSnapshot);
  const hasFinancialData = Boolean(snapshot);
  const onboardingState = input.onboardingState ?? {
    status: "ready" as const,
    hasFinancialData,
  };

  return {
    inputMessage: input.message,
    requestKind: input.requestKind ?? "chat",
    snapshot,
    syncStatus: input.syncStatus ?? null,
    platform: input.platform ?? "web",
    qualityVariant: input.qualityVariant ?? "champion",
    onboardingState: {
      ...onboardingState,
      hasFinancialData: Boolean(snapshot),
    },
    actions: input.actions,
    conversationState: {
      shownCards: (input.conversationState?.shownCards ?? []).slice(-8),
      lastToolNames: (input.conversationState?.lastToolNames ?? []).slice(-8),
      promptChips: (input.conversationState?.promptChips ?? []).slice(-24),
    },
    forcedTool: getForcedAgentTool(input),
    repair,
    usedTools: [],
    availableCards: [],
    availablePromptChips: getAvailablePromptChips({
      snapshot,
      onboardingState: {
        ...onboardingState,
        hasFinancialData: Boolean(snapshot),
      },
    }),
  };
}

function createPromptChipFinancialContext(snapshot: FinancialSnapshot | undefined) {
  if (!snapshot) {
    return null;
  }

  const result = calculatePipCash(snapshot);
  const metric = result.spendableCashToday;

  return {
    spendableCashToday: formatMoney(getDisplayedSpendableCashTodayCents(result)),
    isNegative: getSpendableCashTodayState(result) === "shortfall",
    state: getSpendableCashTodayState(result),
    confidence: metric?.confidence,
    topDrivers: (metric?.drivers ?? result.drivers).slice(0, 4).map((driver) => driver.label),
    warningLabels: (metric?.warnings ?? result.warnings).map((warning) => warning.label),
    hasMissingCardWarning: (metric?.warnings ?? result.warnings).some((warning) => warning.id === "missing-card"),
    windowEndDate: result.window.endDate,
  };
}

function getToolContext(runContext?: { context?: PipAgentContext }): PipAgentContext {
  if (!runContext?.context) {
    throw new Error("Spendable agent context is missing.");
  }

  return runContext.context;
}

function recordTool(context: PipAgentContext, toolName: string) {
  context.usedTools.push(toolName);
}

function addAvailableCards(context: PipAgentContext, cards: AgentCard[]) {
  context.availableCards.push(...cards);
}

function setClientAction(
  context: PipAgentContext,
  clientAction: AgentClientAction,
): PipAgentActionResult {
  context.clientAction = clientAction;

  return {
    ok: true,
    status: clientAction.type,
    clientActionType: clientAction.type,
  };
}

function applyActionResult(
  context: PipAgentContext,
  result: PipAgentActionResult,
): PipAgentActionResult {
  const { cards, clientAction, ...safeResult } = result;

  if (cards?.length) {
    addAvailableCards(context, cards);
  }

  if (clientAction && clientAction.type !== "none") {
    context.clientAction = clientAction;
  }

  return {
    ...safeResult,
    clientActionType: clientAction?.type ?? result.clientActionType,
  };
}

function getAccountManagementUnavailableResult(context: PipAgentContext): PipAgentActionResult | null {
  if (context.onboardingState.status === "guest") {
    return {
      ok: false,
      status: "sign_in_required",
      message: "The user must sign in with Google before account management is available.",
    };
  }

  if (context.onboardingState.status === "needs-consent") {
    return {
      ok: false,
      status: "protected_savings_required",
      message: "The user must choose monthly savings before account management is available.",
    };
  }

  return null;
}

function noFinancialDataToolResult(context: PipAgentContext) {
  return {
    ok: false,
    status: "no_financial_data",
    onboardingState: context.onboardingState,
    message: "Financial data is not connected yet.",
  };
}

function maybeAttachPurchaseGuidanceContext(
  context: PipAgentContext,
  snapshot: FinancialSnapshot,
): FinancialGuidanceContext | undefined {
  if (!isJudgmentalPurchasePrompt(normalizePrompt(context.inputMessage))) {
    return undefined;
  }

  const toolResult = buildFinancialGuidanceToolResult(snapshot);
  context.guidanceContext = toolResult.context;
  recordTool(context, "get_financial_guidance_context");

  return toolResult.context;
}

function getToolInput<T extends z.ZodTypeAny>(
  context: PipAgentContext,
  toolName: DeterministicAgentToolName,
  input: z.infer<T>,
  schema: T,
): z.infer<T> {
  if (context.forcedTool?.toolName !== toolName) {
    return input;
  }

  return schema.parse(context.forcedTool.args);
}

function buildAgentResponse(
  finalOutput: unknown,
  context: PipAgentContext,
  input: RunAiAgentInput,
  audit: {
    usedModel: boolean;
    model?: string;
    transport?: AiTransport;
  },
): AgentResponse {
  const parsed = parseAgentFinalOutput(finalOutput, context);
  const rawUsedTools = uniqueStrings(context.usedTools);
  const guidanceSelection = input.requestKind === "prompt_chips"
    ? { card: null, rejectionReason: null, guidanceSource: "none" as const }
    : selectGuidanceCard(parsed, context);
  const cards = input.requestKind === "prompt_chips"
    ? []
    : selectDeterministicCards(parsed, context, input, guidanceSelection.card);
  const usedTools = suppressVisibleRepeatedTools(rawUsedTools, cards, input);
  const result = context.snapshot ? calculatePipCash(context.snapshot) : null;
  const promptChipPlan = selectPromptChips(parsed, context, result, {
    input,
    cards,
    usedTools,
  });
  const promptChips = promptChipPlan.chips;
  const responseMode = selectFinalResponseMode({
    requestKind: input.requestKind,
    parsedResponseMode: parsed.responseMode,
    message: input.message,
    cards,
    usedTools,
    forcedToolRequiresCard: Boolean(context.forcedTool?.requireCard),
  });
  const visibleModelOutput = selectVisibleModelOutput(parsed, context, guidanceSelection);

  if (input.requestKind === "prompt_chips" && promptChips.length < 3) {
    throw new AgentUnavailableError({
      code: "model-returned-no-prompt-chips",
      message: "AI did not return enough prompt chips.",
      status: 502,
      detail: "Prompt chip refresh must include three prompt chips.",
    });
  }

  const visibleAnswer = composeAgentVisibleAnswer({
    modelOutput: visibleModelOutput,
    userMessage: input.message,
    history: input.history,
    conversationState: {
      ...context.conversationState,
      result,
      syncStatus: context.syncStatus,
      onboardingState: context.onboardingState,
    },
    platform: context.platform,
    cards,
    usedTools,
    selectedPromptChipId: input.selectedPromptChipId,
    maxChars: agentMessageMaxChars,
    maxWords: 45,
  });
  const guardedMessage = guardVisibleFinalMessage(visibleAnswer.message, cards);

  return agentResponseSchema.parse({
    message: guardedMessage,
    cards,
    promptChips,
    usedTools,
    responseMode,
    ...(context.clientAction && context.clientAction.type !== "none"
      ? { clientAction: context.clientAction }
      : {}),
    audit: {
      toolNames: usedTools,
      usedModel: audit.usedModel,
      model: audit.model,
      transport: audit.transport,
      guidance: buildGuidanceAudit(context, guidanceSelection, cards),
      quality: {
        conversationJob: promptChipPlan.conversationJob,
        answerPatternId: visibleAnswer.answerPatternId,
        chipFamilyIds: promptChipPlan.familyIds,
        repeatedJob: promptChipPlan.repeatedJob,
        repeatedTool: promptChipPlan.repeatedTool,
        repeatedCard: promptChipPlan.repeatedCard,
        repeatedMessage: visibleAnswer.repeatedMessage,
        repetitionAdjusted: visibleAnswer.repetitionAdjusted,
        chipFallbackReason: promptChipPlan.fallbackReason,
      },
    },
  });
}

function selectVisibleModelOutput(
  parsed: AgentFinalOutput,
  context: PipAgentContext,
  guidanceSelection: {
    guidanceSource: "model_draft" | "deterministic_fallback" | "none";
  },
): AgentFinalOutput {
  if (
    guidanceSelection.guidanceSource === "deterministic_fallback" &&
    context.guidanceContext &&
    shouldReturnGuidanceCard(context)
  ) {
    return {
      ...parsed,
      message: createDeterministicGuidanceMessage(context.guidanceContext),
      responseMode: "guidance",
    };
  }

  return parsed;
}

function selectFinalResponseMode(input: {
  requestKind?: RunAiAgentInput["requestKind"];
  parsedResponseMode: AgentResponse["responseMode"];
  message: string;
  cards: AgentCard[];
  usedTools: string[];
  forcedToolRequiresCard: boolean;
}): AgentResponse["responseMode"] {
  const hasGuidanceSurface =
    input.cards.some((card) => card.type === "guidance_card") ||
    input.usedTools.includes("get_financial_guidance_context");

  if (input.requestKind === "prompt_chips") {
    return "chat_only";
  }

  if (
    input.cards.length === 0 &&
    input.usedTools.length === 0 &&
    isNoToolChatOnlyPrompt(input.message)
  ) {
    return "chat_only";
  }

  if (hasGuidanceSurface) {
    return "guidance";
  }

  if (input.parsedResponseMode === "guidance") {
    return input.cards.length > 0 ? "show_card" : "chat_only";
  }

  if (input.cards.length === 0 && input.parsedResponseMode === "show_card") {
    return input.usedTools.length > 0 ? "update_context" : "chat_only";
  }

  if (input.cards.length > 0 && input.forcedToolRequiresCard) {
    return "show_card";
  }

  return input.parsedResponseMode;
}

function parseAgentFinalOutput(
  finalOutput: unknown,
  context?: PipAgentContext,
): AgentFinalOutput {
  try {
    return normalizeAgentFinalOutput(agentFinalOutputSchema.parse(finalOutput));
  } catch (error) {
    const fallback = context ? createFallbackFinalOutput(context) : null;

    if (fallback) {
      return fallback;
    }

    throw new AgentUnavailableError({
      code: "model-returned-invalid-final-output",
      message: "AI returned an invalid final response.",
      status: 502,
      detail: getErrorDetail(error),
      cause: error,
    });
  }
}

function createFallbackFinalOutput(context: PipAgentContext): AgentFinalOutput | null {
  if (context.requestKind === "prompt_chips") {
    return null;
  }

  if (context.usedTools.length === 0) {
    return null;
  }

  if (
    context.availableCards.length === 0 &&
    !shouldReturnGuidanceCard(context) &&
    !hasDeterministicNoCardFallback(context)
  ) {
    return null;
  }

  context.fallbackFinalOutput = true;

  return {
    message: createFallbackFinalMessage(context),
    responseMode: shouldReturnGuidanceCard(context)
      ? "guidance"
      : context.availableCards.length > 0
        ? "show_card"
        : "chat_only",
    promptChips: [],
  };
}

function shouldRecoverBroadChatFinalOutput(
  error: AgentUnavailableError,
  context: PipAgentContext,
): boolean {
  if (
    context.usedTools.length > 0 ||
    context.forcedTool ||
    context.availableCards.length > 0 ||
    context.guidanceContext
  ) {
    return false;
  }

  return shouldRetryFinalOutput(error) || isNoToolChatOnlyPrompt(context.inputMessage);
}

function createDeterministicNoToolResponse(input: RunAiAgentInput): AgentResponse | null {
  if (!isSimpleGreetingPrompt(input.message)) {
    return null;
  }

  return agentResponseSchema.parse({
    message: "Ask me about your number, what changed, or a purchase.",
    cards: [],
    promptChips: [
      {
        id: "ai-what-changed",
        label: "What changed?",
        prompt: "What changed?",
      },
      {
        id: "ai-test-purchase",
        label: "Test a purchase",
        prompt: "Can I spend $50?",
      },
    ],
    usedTools: [],
    responseMode: "chat_only",
    audit: {
      toolNames: [],
      usedModel: false,
    },
  });
}

function createBroadChatFallbackFinalOutput(input: RunAiAgentInput): AgentFinalOutput {
  const greeting = isSimpleGreetingPrompt(input.message);
  const generalSpendingAdvice = isGeneralSpendingAdvicePrompt(input.message);
  const creditCardDiscussion = isGeneralCreditCardDiscussionPrompt(input.message);
  const blockedAdvice = getBlockedAdviceFallbackMessage(input.message);

  return {
    message: greeting
      ? "I can help with your Spendable Cash Today. Ask what changed or test a specific purchase amount."
      : generalSpendingAdvice
        ? "Start with one small spending rule: choose one category, set a weekly cap, and keep one low-cost thing you still enjoy."
        : blockedAdvice
          ? blockedAdvice
        : creditCardDiscussion
          ? "I can help with credit cards. We can talk through payoff timing, card use, or how a specific purchase would affect today."
          : "I’m not sure what you mean yet. Ask about today’s number or test a specific purchase amount.",
    responseMode: greeting || generalSpendingAdvice || blockedAdvice || creditCardDiscussion ? "chat_only" : "clarify",
    promptChips: [],
  };
}

function isSimpleGreetingPrompt(message: string): boolean {
  return /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening)$/i.test(message.trim());
}

function isGeneralSpendingAdvicePrompt(message: string): boolean {
  const normalized = normalizePrompt(message);

  return /\b(lower|reduce|cut|spend less|control|slow down|curb)\b/.test(normalized) &&
    /\b(spending|spend|expenses?|budget|money)\b/.test(normalized);
}

function isGeneralCreditCardDiscussionPrompt(message: string): boolean {
  const normalized = normalizePrompt(message);

  return /\bcredit cards?\b|\bcards?\b/.test(normalized) &&
    !/\b(show|list|pull|view|transactions?|charges?|payments?|breakdown)\b/.test(normalized);
}

function isNoToolChatOnlyPrompt(message: string): boolean {
  return isSimpleGreetingPrompt(message) ||
    isGeneralSpendingAdvicePrompt(message) ||
    Boolean(getBlockedAdviceFallbackMessage(message)) ||
    isGeneralCreditCardDiscussionPrompt(message);
}

function getBlockedAdviceFallbackMessage(message: string): string | null {
  const normalized = normalizePrompt(message);

  if (/\b(should i|do you think i should|would you)\b.*\b(invest|nvidia|stocks?|shares?|etf|fund|securities?)\b/.test(normalized)) {
    return "I can’t pick investments, but I can help test how a purchase amount would affect today.";
  }

  if (/\b(should i|do you think i should|would you)\b.*\b(buy|sell|hold)\b.*\b(crypto|bitcoin|ethereum|token)\b/.test(normalized)) {
    return "I can’t pick crypto, but I can help test how a purchase amount would affect today.";
  }

  if (/\b(should i|do you think i should|would you)\b.*\b(balance transfer|credit product|credit card|loan|lender|insurance)\b/.test(normalized)) {
    return "I can’t pick a credit product, but I can help think through payoff pressure in plain terms.";
  }

  return null;
}

function hasDeterministicNoCardFallback(context: PipAgentContext): boolean {
  return context.usedTools.some((toolName) =>
    [
      "get_pip_cash_snapshot",
      "get_spendable_cash_definition",
      "get_sync_status",
      "get_trust_policy",
    ].includes(toolName),
  );
}

function createFallbackFinalMessage(context: PipAgentContext): string {
  if (shouldReturnGuidanceCard(context) && context.guidanceContext) {
    return createDeterministicGuidanceMessage(context.guidanceContext);
  }

  const latestCard = context.availableCards.at(-1);

  switch (latestCard?.type) {
    case "spendable_cash_forecast":
      return `I mapped the next ${latestCard.horizonDays} days. Forecast only; not guaranteed.`;
    case "pip_cash_explanation":
      return "I found the main drivers behind today's number.";
    case "math_breakdown":
      return "I pulled the math behind today's number.";
    case "trust_receipt":
      return "I pulled the receipt behind today's number.";
    case "savings_goal_plan":
      return "I set up the savings goal plan.";
    case "savings_goals_summary":
      return latestCard.activeGoalCount > 0
        ? "I pulled your savings goals."
        : "You do not have active savings goals yet.";
    case "recent_transactions":
      return "I found recent charges in the current window.";
    case "spending_breakdown":
      return "I grouped the main money flows.";
    case "recurring_activity":
      return latestCard.items.length > 0
        ? "I found likely repeat items."
        : "I do not see a clear repeat item yet.";
    case "purchase_simulation":
      return `That would leave ${formatMoney(latestCard.todayRemainingCents)} in Spendable Cash Today.`;
    case "true_balances":
      return "I pulled the actual balances.";
    default:
      return "I checked that against your current money picture.";
  }
}

function normalizeAgentFinalOutput(parsed: RawAgentFinalOutput): AgentFinalOutput {
  const support = normalizeRawSupport(parsed.support);

  return {
    message: parsed.message,
    ...(support ? { support } : {}),
    responseMode: parsed.responseMode,
    ...(parsed.guidanceCardDraft ? { guidanceCardDraft: parsed.guidanceCardDraft } : {}),
    promptChips: normalizeRawPromptChips(parsed.promptChips),
  };
}

function normalizeRawSupport(support: RawAgentFinalOutput["support"]): string | undefined {
  if (typeof support !== "string") {
    return undefined;
  }

  const normalized = support.replace(/\s+/g, " ").trim();

  return normalized ? normalized.slice(0, 1000) : undefined;
}

function normalizeRawPromptChips(
  chips: RawAgentFinalOutput["promptChips"],
): PromptChip[] {
  return (chips ?? []).filter((chip): chip is PromptChip =>
    typeof chip === "object" &&
    chip !== null &&
    "id" in chip &&
    "label" in chip &&
    "prompt" in chip,
  );
}

type GuidanceCardSelection = {
  card: Extract<AgentCard, { type: "guidance_card" }> | null;
  rejectionReason: string | null;
  guidanceSource: "model_draft" | "deterministic_fallback" | "none";
};

function selectGuidanceCard(
  parsed: AgentFinalOutput,
  context: PipAgentContext,
): GuidanceCardSelection {
  if (!parsed.guidanceCardDraft) {
    if (shouldReturnGuidanceCard(context) && context.guidanceContext) {
      return {
        card: createDeterministicGuidanceCard(context.guidanceContext),
        rejectionReason: null,
        guidanceSource: "deterministic_fallback",
      };
    }

    return {
      card: null,
      rejectionReason: null,
      guidanceSource: "none",
    };
  }

  if (!context.guidanceContext) {
    const reason = "guidance card draft was returned without guidance context";

    context.guidanceCardRejectionReason = reason;
    return {
      card: null,
      rejectionReason: reason,
      guidanceSource: "none",
    };
  }

  const result = validateGuidanceCardDraft(parsed.guidanceCardDraft, context.guidanceContext);

  if (result.ok) {
    return {
      card: result.card,
      rejectionReason: null,
      guidanceSource: "model_draft",
    };
  }

  context.guidanceCardRejectionReason = result.reason;

  if (context.repair?.reason === "invalid_guidance_card") {
    if (shouldReturnGuidanceCard(context) && context.guidanceContext) {
      return {
        card: createDeterministicGuidanceCard(context.guidanceContext),
        rejectionReason: result.reason,
        guidanceSource: "deterministic_fallback",
      };
    }

    return {
      card: null,
      rejectionReason: result.reason,
      guidanceSource: "none",
    };
  }

  throw new AgentUnavailableError({
    code: "model-returned-invalid-guidance-card",
    message: "AI returned an invalid guidance card.",
    status: 502,
    detail: result.reason,
  });
}

function shouldReturnGuidanceCard(context: PipAgentContext): boolean {
  return context.forcedTool?.toolName === "get_financial_guidance_context" &&
    Boolean(context.guidanceContext);
}

function createDeterministicGuidanceCard(
  context: FinancialGuidanceContext,
): Extract<AgentCard, { type: "guidance_card" }> {
  const result = validateGuidanceCardDraft(createDeterministicGuidanceCardDraft(context), context);

  if (result.ok) {
    return result.card;
  }

  const firstEvidence = context.evidence[0];

  return {
    type: "guidance_card",
    title: "My read",
    stance: "uncertain",
    summary: "I have a limited read right now, so keep the next move cautious.",
    rows: [
      {
        label: firstEvidence?.label ?? "Current read",
        detail: firstEvidence?.detail ?? "The current money picture is limited.",
        tone: firstEvidence?.tone ?? "warning",
        evidenceIds: [firstEvidence?.id ?? "spendable-today"],
      },
    ],
  };
}

function createDeterministicGuidanceCardDraft(
  context: FinancialGuidanceContext,
): GuidanceCardDraft {
  const rows = [
    createCurrentReadGuidanceRow(context),
    createBehaviorGuidanceRow(context),
    createDataOrCommitmentGuidanceRow(context),
  ].filter((row): row is GuidanceCardDraft["rows"][number] => Boolean(row)).slice(0, 3);

  return {
    title: "My read",
    stance: getGuidanceStance(context),
    summary: createDeterministicGuidanceMessage(context),
    rows: rows.length > 0
      ? rows
      : [
          {
            label: "Current read",
            detail: "I have a limited read right now, so keep the next move cautious.",
            tone: "warning",
            evidenceIds: pickGuidanceEvidenceIds(context, ["spendable-today", "state", "confidence"]),
          },
        ],
    footer: context.currentRead.confidence === "low"
      ? "Connect more complete data before leaning hard on this."
      : undefined,
  };
}

function createDeterministicGuidanceMessage(context: FinancialGuidanceContext): string {
  const amount = formatMoney(context.currentRead.spendableCashTodayCents);

  if (context.currentRead.state === "shortfall") {
    return `My read: ${amount} today with a shortfall already showing. Keep the next move to essentials.`;
  }

  if (context.currentRead.state === "overspending") {
    return `My read: ${amount} today, with recent spending pulling the number down. Keep bigger purchases paused.`;
  }

  if (context.currentRead.state === "missing_data" || context.currentRead.confidence === "low") {
    return `My read: ${amount} today, but the data is incomplete. Treat this as a cautious estimate.`;
  }

  if (context.currentRead.state === "tight") {
    return `My read: ${amount} today. There is room, but it is tight enough to test any larger purchase first.`;
  }

  return `My read: ${amount} today. Normal spending has room, but test larger purchases first.`;
}

function createCurrentReadGuidanceRow(
  context: FinancialGuidanceContext,
): GuidanceCardDraft["rows"][number] {
  return {
    label: "Today’s room",
    detail: `${formatMoney(context.currentRead.spendableCashTodayCents)} after bills, savings, recent spending, and cash reality.`,
    tone: context.currentRead.spendableCashTodayCents > 0 ? "positive" : "warning",
    evidenceIds: pickGuidanceEvidenceIds(context, ["spendable-today", "state", "confidence"]),
  };
}

function createBehaviorGuidanceRow(
  context: FinancialGuidanceContext,
): GuidanceCardDraft["rows"][number] | null {
  if (context.behavior.behaviorAdjustmentCents < 0) {
    return {
      label: "Recent spending",
      detail: "Recent everyday spending is pulling today’s room down.",
      tone: "negative",
      evidenceIds: pickGuidanceEvidenceIds(context, [
        "recent-spending-hot",
        "behavior-adjustment-negative",
        "current-month-over-pattern",
      ]),
    };
  }

  if (context.behavior.behaviorAdjustmentCents > 0) {
    return {
      label: "Recent spending",
      detail: "Recent everyday spending is lighter than the usual pace.",
      tone: "positive",
      evidenceIds: pickGuidanceEvidenceIds(context, [
        "recent-spending-light",
        "behavior-adjustment-positive",
        "current-month-under-pattern",
      ]),
    };
  }

  return {
    label: "Normal room",
    detail: "The normal pattern is carrying most of today’s read.",
    tone: "neutral",
    evidenceIds: pickGuidanceEvidenceIds(context, ["baseline-room", "normal-room"]),
  };
}

function createDataOrCommitmentGuidanceRow(
  context: FinancialGuidanceContext,
): GuidanceCardDraft["rows"][number] {
  if (context.dataQuality.hasMissingCardWarning) {
    return {
      label: "Data quality",
      detail: "A possible missing card could change this read.",
      tone: "warning",
      evidenceIds: pickGuidanceEvidenceIds(context, ["missing-card", "data_quality"]),
    };
  }

  if (context.shortfalls.totalShortfallCents > 0) {
    return {
      label: "Shortfall",
      detail: "A shortfall is already tracked before adding new spending.",
      tone: "warning",
      evidenceIds: pickGuidanceEvidenceIds(context, [
        "total-shortfall",
        "pattern-shortfall",
        "behavior-shortfall",
        "cash-shortfall",
      ]),
    };
  }

  return {
    label: "Bills and savings",
    detail: "Recurring commitments and monthly savings are already held back.",
    tone: "neutral",
    evidenceIds: pickGuidanceEvidenceIds(context, [
      "bills-held-back",
      "recurring-obligations",
      "protected-savings",
      "hidden-cushion",
    ]),
  };
}

function getGuidanceStance(context: FinancialGuidanceContext): GuidanceCardDraft["stance"] {
  switch (context.currentRead.state) {
    case "shortfall":
      return "shortfall";
    case "overspending":
    case "tight":
      return "tight";
    case "missing_data":
    case "low_confidence":
      return "uncertain";
    case "healthy":
      return "stable";
    case "normal":
    default:
      return "watch";
  }
}

function pickGuidanceEvidenceIds(
  context: FinancialGuidanceContext,
  candidates: string[],
): string[] {
  const validIds = new Set(context.evidence.map((item) => item.id));
  const ids = candidates.filter((id) => validIds.has(id)).slice(0, 4);

  if (ids.length > 0) {
    return ids;
  }

  return context.evidence[0] ? [context.evidence[0].id] : ["spendable-today"];
}

function selectDeterministicCards(
  parsed: AgentFinalOutput,
  context: PipAgentContext,
  input: RunAiAgentInput,
  guidanceCard: Extract<AgentCard, { type: "guidance_card" }> | null = null,
): AgentCard[] {
  const wantsMultipleCards = explicitlyRequestsMultipleCards(input.message);
  const forcedCards =
    context.forcedTool?.requireCard && context.availableCards.length > 0
      ? wantsMultipleCards
        ? context.availableCards
        : context.availableCards.slice(-1)
      : [];
  const fallbackCards =
    parsed.responseMode === "show_card" && context.availableCards.length > 0
      ? wantsMultipleCards
        ? context.availableCards
        : context.availableCards.slice(-1)
      : [];
  const guidanceCards = guidanceCard
    ? forcedCards.length === 0 || wantsMultipleCards
      ? [guidanceCard]
      : []
    : [];
  const selected = uniqueCardsByType([...forcedCards, ...fallbackCards, ...guidanceCards]);
  const suppressExplanation =
    wasCardRecentlyShown(input.conversationState, "pip_cash_explanation") &&
    !explicitlyRequestsRepeatedCard(input.message);
  const suppressTransactions = !explicitlyRequestsTransactions(input.message);

  return selected
    .filter((card) => !(suppressExplanation && card.type === "pip_cash_explanation"))
    .filter((card) => !(suppressTransactions && card.type === "recent_transactions"))
    .slice(0, wantsMultipleCards ? 3 : 1);
}

function buildGuidanceAudit(
  context: PipAgentContext,
  selection: GuidanceCardSelection,
  cards: AgentCard[],
): NonNullable<AgentResponse["audit"]["guidance"]> | undefined {
  const guidanceContext = context.guidanceContext;

  if (!guidanceContext) {
    return undefined;
  }

  const guidanceCard = cards.find(
    (card): card is Extract<AgentCard, { type: "guidance_card" }> => card.type === "guidance_card",
  );
  const evidenceIds = guidanceCard
    ? uniqueStrings(guidanceCard.rows.flatMap((row) => row.evidenceIds))
    : guidanceContext.evidence.map((evidence) => evidence.id);
  const validationOutcome = guidanceCard
    ? context.repair?.reason === "invalid_guidance_card" &&
        selection.guidanceSource === "model_draft"
      ? "repaired"
      : "shown"
    : selection.rejectionReason || context.guidanceCardRejectionReason
      ? "rejected"
      : "context_built";

  return {
    validationOutcome,
    guidanceSource: selection.guidanceSource,
    metricVersion: guidanceContext.metricVersion,
    state: guidanceContext.currentRead.state,
    confidence: guidanceContext.currentRead.confidence,
    stance: guidanceCard?.stance,
    evidenceIds,
    spendableCashTodayCents: guidanceContext.currentRead.spendableCashTodayCents,
    shortfallCents: guidanceContext.currentRead.shortfallCents,
    baselineDailyAllowanceCents: guidanceContext.pattern.baselineDailyAllowanceCents,
    behaviorAdjustmentCents: guidanceContext.behavior.behaviorAdjustmentCents,
    cashRealityAdjustmentCents: guidanceContext.cash.cashRealityAdjustmentCents,
    currentMonthVarianceCents: guidanceContext.behavior.currentMonthVarianceCents,
    rejectionReason: selection.rejectionReason ?? context.guidanceCardRejectionReason,
  };
}

function selectPromptChips(
  parsed: AgentFinalOutput,
  context: PipAgentContext,
  result: ReturnType<typeof calculatePipCash> | null,
  options: {
    input: RunAiAgentInput;
    cards: AgentCard[];
    usedTools: string[];
  },
) : PromptChipPlan {
  const generated = sanitizeGeneratedPromptChips(parsed.promptChips, context);
  const fallback = result ? [] : getOnboardingPromptChips(context.onboardingState);

  if (!result) {
    return {
      chips: mergeGeneratedPromptChips(generated, fallback),
      conversationJob: "setup",
      familyIds: [],
      repeatedJob: false,
      repeatedTool: false,
      repeatedCard: false,
      fallbackReason: generated.length > 0 ? "generated-supplement" : "none",
    };
  }

  return planPromptChips({
    result,
    message: options.input.message,
    history: options.input.history,
    shownCards: context.conversationState.shownCards,
    lastToolNames: context.conversationState.lastToolNames,
    promptChips: context.conversationState.promptChips,
    responseCards: options.cards,
    responseToolNames: options.usedTools,
    selectedPromptChipId: options.input.selectedPromptChipId,
    syncStatus: context.syncStatus,
    assistantMessage: [parsed.message, parsed.support].filter(Boolean).join(" "),
    onboardingState: context.onboardingState,
    generatedChips: generated,
  });
}

function mergeGeneratedPromptChips(
  generated: PromptChip[],
  fallback: PromptChip[],
): PromptChip[] {
  const merged: PromptChip[] = [];
  const seenPrompts = new Set<string>();

  [...generated, ...fallback].forEach((chip) => {
    const key = normalizePrompt(chip.prompt);

    if (seenPrompts.has(key)) {
      return;
    }

    seenPrompts.add(key);
    merged.push(chip);
  });

  return merged.slice(0, 3);
}

function sanitizeGeneratedPromptChips(
  chips: PromptChip[],
  context: PipAgentContext,
): PromptChip[] {
  const seenIds = new Set<string>();
  const seenPrompts = new Set<string>();
  const recentTexts = new Set(
    context.conversationState.promptChips.flatMap((chip) => [
      normalizePrompt(chip.label),
      normalizePrompt(chip.prompt),
    ]),
  );
  const sanitized: PromptChip[] = [];
  const recentFallback: PromptChip[] = [];

  chips.forEach((chip, index) => {
    const next = sanitizeGeneratedPromptChip(chip, context, index);

    if (!next) {
      return;
    }

    const promptKey = normalizePrompt(next.prompt);
    const labelKey = normalizePrompt(next.label);
    let id = next.id;

    if (seenPrompts.has(promptKey)) {
      return;
    }

    if (seenIds.has(id)) {
      id = withPromptChipIdSuffix(id, index);
    }

    seenIds.add(id);
    seenPrompts.add(promptKey);
    const sanitizedChip = {
      ...next,
      id,
    };

    if (recentTexts.has(promptKey) || recentTexts.has(labelKey)) {
      if (context.requestKind === "prompt_chips") {
        recentFallback.push(sanitizedChip);
      }

      return;
    }

    sanitized.push(sanitizedChip);
  });

  if (context.requestKind === "prompt_chips") {
    return [...sanitized, ...recentFallback].slice(0, 3);
  }

  return sanitized.slice(0, 3);
}

function sanitizeGeneratedPromptChip(
  chip: PromptChip,
  context: PipAgentContext,
  index: number,
): PromptChip | null {
  const label = cleanPromptChipText(chip.label, 56);
  const prompt = cleanPromptChipText(chip.prompt, 160);

  if (!label || !prompt) {
    return null;
  }

  if (isRetiredDefaultPromptChip({ label, prompt })) {
    return null;
  }

  if (containsDisallowedFinalLanguage(`${label} ${prompt}`)) {
    return null;
  }

  const capabilitySafeChip = sanitizePromptChipCapability({ label, prompt }, context);

  if (!capabilitySafeChip) {
    return null;
  }

  if (/^discuss\b/i.test(capabilitySafeChip.label)) {
    return null;
  }

  const requestedId = normalizePromptChipId(chip.id);
  const privilegedId = getPermittedPrivilegedPromptChipId(
    requestedId,
    context,
    `${capabilitySafeChip.label} ${capabilitySafeChip.prompt}`,
  );
  const id = privilegedId ?? createGeneratedPromptChipId(
    requestedId,
    capabilitySafeChip.label,
    capabilitySafeChip.prompt,
    index,
  );

  return {
    id,
    label: capabilitySafeChip.label,
    prompt: capabilitySafeChip.prompt,
  };
}

function sanitizePromptChipCapability(
  chip: Pick<PromptChip, "label" | "prompt">,
  context: PipAgentContext,
): Pick<PromptChip, "label" | "prompt"> | null {
  const text = normalizePrompt(`${chip.label} ${chip.prompt}`);

  if (!hasPromptChipDisplayVerb(text)) {
    return chip;
  }

  if (!context.snapshot) {
    return null;
  }

  if (isSupportedCardPrompt(text)) {
    return chip;
  }

  return downgradePromptChipToDiscussion(chip);
}

function hasPromptChipDisplayVerb(normalized: string): boolean {
  return /\b(show|see|list|pull|view|forecast|breakdown|trend view)\b/.test(normalized);
}

function isSupportedCardPrompt(normalized: string): boolean {
  if (isCatalogSupportedCardPrompt(normalized)) {
    return true;
  }

  return (
    isExplicitForecastPrompt(normalized) ||
    isExplicitRecurringPrompt(normalized) ||
    isExplicitSpendingBreakdownPrompt(normalized) ||
    isExplicitTransactionsPrompt(normalized) ||
    isExplicitBalancesPrompt(normalized) ||
    isExplicitMathPrompt(normalized) ||
    isExplicitPipCashDriversPrompt(normalized) ||
    isFlexiblePipCashDriversPrompt(normalized) ||
    isPaydayImpactPrompt(normalized) ||
    isSpendableFactorsInsightPrompt(normalized) ||
    isSavingsGoalPrompt(normalized) ||
    isTrustReceiptPrompt(normalized) ||
    isDataQualityPrompt(normalized) ||
    (isSpecificSpendSimulationPrompt(normalized) && extractExplicitPurchaseAmountCents(normalized) !== null)
  );
}

function downgradePromptChipToDiscussion(
  chip: Pick<PromptChip, "label" | "prompt">,
): Pick<PromptChip, "label" | "prompt"> {
  const subject = chip.label
    .replace(/^(show|see|list|pull|view|forecast|break down|breakdown)\s+/i, "")
    .replace(/\b(cards?|view)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const discussionSubject = /^compare$/i.test(subject) ? "credit card options" : subject;
  const label = cleanPromptChipText(`Discuss ${discussionSubject || "this"}`, 36);
  const promptBase = chip.prompt
    .replace(/^(i want to|i'd like to|can you|could you|please)\s+/i, "")
    .replace(/^(show|see|list|pull|view|forecast|break down|breakdown)\s+(me\s+)?/i, "Let's discuss ")
    .replace(/\bcard options\b/gi, "credit card options")
    .replace(/\bcard use\b/gi, "credit card use")
    .replace(/\bcard usage\b/gi, "credit card usage")
    .replace(/\bcards\b/gi, "credit cards");
  const prompt = cleanPromptChipText(promptBase, 160);

  return {
    label,
    prompt: /^let'?s discuss/i.test(prompt) ? prompt : `Let's discuss ${prompt}`,
  };
}

function getPermittedPrivilegedPromptChipId(
  id: string,
  context: PipAgentContext,
  visibleText: string,
): string | null {
  const normalized = visibleText.toLowerCase();

  if (id === "get-signed-up") {
    return context.onboardingState.status === "guest" &&
      /\b(sign|signed|google|start|continue)\b/.test(normalized)
      ? id
      : null;
  }

  if (id === "connect-data") {
    return !context.snapshot &&
      context.onboardingState.status !== "needs-consent" &&
      /\b(connect|data|account|plaid)\b/.test(normalized)
      ? id
      : null;
  }

  if (id === "use-default-savings") {
    return context.onboardingState.status === "needs-consent" &&
      /\b(200|default|continue|ok|yes)\b/.test(normalized)
      ? id
      : null;
  }

  if (id === "set-250-savings") {
    return context.onboardingState.status === "needs-consent" && /\b250\b/.test(normalized)
      ? id
      : null;
  }

  return null;
}

function cleanPromptChipText(text: string, maxLength: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
}

function normalizePromptChipId(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createGeneratedPromptChipId(
  requestedId: string,
  label: string,
  prompt: string,
  index: number,
): string {
  if (requestedId.startsWith("ai-")) {
    return requestedId;
  }

  const slug = normalizePromptChipId(`${label}-${prompt}`).replace(/^ai-/, "").slice(0, 60);

  return `ai-${slug || `suggestion-${index + 1}`}`.slice(0, 80);
}

function withPromptChipIdSuffix(id: string, index: number): string {
  const suffix = `-${index + 1}`;
  return `${id.slice(0, 80 - suffix.length)}${suffix}`;
}

function getAvailablePromptChips(input: {
  snapshot?: FinancialSnapshot;
  onboardingState: PipAgentOnboardingState;
}): PromptChip[] {
  if (input.snapshot) {
    return getReadyPromptChipExamples();
  }

  return getOnboardingPromptChips(input.onboardingState);
}

function guardVisibleFinalMessage(message: string, cards: AgentCard[] = []): string {
  if (countWords(message) > 45) {
    throw new AgentUnavailableError({
      code: "model-returned-too-long-final-message",
      message: "AI returned a response that was too long for Pip.",
      status: 502,
      detail: "Visible replies must be 45 words or fewer.",
    });
  }

  const disallowedLanguage = getDisallowedFinalLanguageDetail(message);

  if (disallowedLanguage) {
    const repairedMessage = repairDisallowedFinalLanguageText(message, disallowedLanguage);

    if (
      repairedMessage &&
      countWords(repairedMessage) <= 45 &&
      !getDisallowedFinalLanguageDetail(repairedMessage) &&
      !getUnsupportedCardPromise(repairedMessage, cards)
    ) {
      return repairedMessage;
    }

    throw new AgentUnavailableError({
      code: "model-returned-disallowed-final-message",
      message: "AI returned a response that violates Pip language rules.",
      status: 502,
      detail: disallowedLanguage,
    });
  }

  const unsupportedPromise = getUnsupportedCardPromise(message, cards);

  if (cards.length > 0 && /\?\s*$/.test(message.trim())) {
    const repairedMessage = removeTrailingQuestionSentence(message);

    if (
      repairedMessage &&
      countWords(repairedMessage) <= 45 &&
      !getDisallowedFinalLanguageDetail(repairedMessage) &&
      !getUnsupportedCardPromise(repairedMessage, cards)
    ) {
      return repairedMessage;
    }

    throw new AgentUnavailableError({
      code: "model-returned-disallowed-final-message",
      message: "AI returned a response that violates Pip language rules.",
      status: 502,
      detail: "Card replies should not end with a follow-up question.",
    });
  }

  if (unsupportedPromise) {
    const repairedMessage = repairUnsupportedCardPromises(message, cards);

    if (
      repairedMessage &&
      countWords(repairedMessage) <= 45 &&
      !getDisallowedFinalLanguageDetail(repairedMessage) &&
      !getUnsupportedCardPromise(repairedMessage, cards)
    ) {
      return repairedMessage;
    }

    throw new AgentUnavailableError({
      code: "model-promised-unsupported-card",
      message: "AI promised a card or view that Pip did not return.",
      status: 502,
      detail: unsupportedPromise,
    });
  }

  return message;
}

function repairUnsupportedCardPromises(message: string, cards: AgentCard[]): string | null {
  let candidate = message;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const issue = getUnsupportedCardPromise(candidate, cards);

    if (!issue) {
      const shortened = shortenCardlessRepairedMessage(candidate, cards);

      return shortened === message ? null : shortened;
    }

    const repaired = repairUnsupportedCardPromiseText(candidate, issue);

    if (!repaired || repaired === candidate) {
      return repairGenericCardlessDisplayText(candidate, cards);
    }

    candidate = repaired;
  }

  return getUnsupportedCardPromise(candidate, cards)
    ? repairGenericCardlessDisplayText(candidate, cards)
    : shortenCardlessRepairedMessage(candidate, cards);
}

function shortenCardlessRepairedMessage(message: string, cards: AgentCard[]): string {
  if (cards.length > 0 || countWords(message) <= 45) {
    return message;
  }

  const shortened = message
    .replace(/\bIf you want, I can .*$/i, "Ask me to test a dollar amount instead.")
    .replace(/\s+/g, " ")
    .trim();

  if (countWords(shortened) <= 45 && !getUnsupportedCardPromise(shortened, cards)) {
    return shortened;
  }

  return message;
}

function repairGenericCardlessDisplayText(message: string, cards: AgentCard[]): string | null {
  if (cards.length > 0) {
    return null;
  }

  const repaired = message
    .replace(/\bIf you want, I can .*$/i, "Ask me to test a dollar amount instead.")
    .replace(/\bi see\b/gi, "I understand")
    .replace(/\bshow impact\b/gi, "talk through impact")
    .replace(/\bpull up (the )?latest drivers\b/gi, "talk through the latest factors")
    .replace(/\b(show|showing|shown|showed|see|list|listed|pull|pulled|view)( me)?\b/gi, "talk through")
    .replace(/\bsimulate a small purchase\b/gi, "test a spending amount")
    .replace(/\bpurchases?\b/gi, "spending")
    .replace(/\bdrivers?\b/gi, "factors")
    .replace(/\s+/g, " ")
    .trim();

  if (repaired === message || getUnsupportedCardPromise(repaired, cards)) {
    return null;
  }

  return repaired;
}

function repairDisallowedFinalLanguageText(message: string, detail: string): string | null {
  if (detail === "guarantee") {
    const repaired = message
      .replace(/\bguaranteed\b/gi, "promised")
      .replace(/\bguarantees\b/gi, "promises")
      .replace(/\bguarantee\b/gi, "promise")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail !== "detached metric opening") {
    return null;
  }

  const repaired = message
    .replace(/^spendable cash today is\s+/i, "I found Spendable Cash Today ")
    .replace(/\s+/g, " ")
    .trim();

  return repaired === message ? null : repaired;
}

function removeTrailingQuestionSentence(message: string): string | null {
  const repaired = message.trim().replace(/\s*[^.!?]*\?\s*$/, "").trim();

  return repaired && repaired !== message.trim() ? repaired : null;
}

function repairUnsupportedCardPromiseText(message: string, detail: string): string | null {
  if (detail === "forecast promised without forecast card") {
    const repaired = message
      .replace(/\b(want me to|should i|can i) forecast\b/gi, "$1 talk through")
      .replace(/\bi can forecast\b/gi, "I can talk through")
      .replace(/\bshow( me)? (a )?forecast\b/gi, "talk through a possible pattern")
      .replace(/\b(show|showing|shown|showed|see|pull|pulled|view)( me)?\b/gi, "talk through")
      .replace(/\b(?:the\s+)?next\s+\d+\s*days?\b/gi, "the next stretch")
      .replace(/\b(?:the\s+)?next\s+(few|couple of)\s+days?\b/gi, "the next stretch")
      .replace(/\bforecast\b/gi, "possible pattern")
      .replace(/\bprojection\b/gi, "possible pattern")
      .replace(/\bprojected\b/gi, "estimated")
      .replace(/\bbreak down\b/gi, "talk through")
      .replace(/\bbreakdown\b/gi, "summary")
      .replace(/\btrend view\b/gi, "trend")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail === "breakdown promised without breakdown card") {
    const repaired = message
      .replace(/\bi see (?:my |the )?main drivers?:?/gi, "The same main drivers still apply:")
      .replace(/\b(show|showing|shown|showed|see|pull|pulled|view|list|listed)( me)?\b/gi, "talk through")
      .replace(/\bbreak down\b/gi, "talk through")
      .replace(/\bbreakdown\b/gi, "summary")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail === "recurring activity promised without recurring card") {
    const repaired = message
      .replace(/\bhere (is|are)\b.{0,24}\b(recurring|repeating|subscriptions?|monthly charges?|upcoming bills?|bills? coming up)\b/gi, "I can talk through likely repeats")
      .replace(/\b(show|showing|shown|showed|list|listed|pull|pulled|view)( me)?\b.{0,28}\b(recurring|repeating|subscriptions?|monthly charges?|upcoming bills?|bills? coming up)\b/gi, "talk through likely repeats")
      .replace(/\b(show|showing|shown|showed|list|listed|pull|pulled|view)( me)?\b/gi, "talk through")
      .replace(/\brecurring activity\b/gi, "likely repeats")
      .replace(/\brecurring\b/gi, "repeating")
      .replace(/\bsubscriptions?\b/gi, "repeat charges")
      .replace(/\bupcoming bills?\b/gi, "bills that may repeat")
      .replace(/\bbills? coming up\b/gi, "bills that may repeat")
      .replace(/\bmonthly charges?\b/gi, "repeat charges")
      .replace(/\blikely repeats i found:/gi, "likely repeats:")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail === "transactions promised without transaction card") {
    const repaired = message
      .replace(/\bshow how (?:a )?purchases? would affect it\b/gi, "talk through how spending would affect it")
      .replace(/\b(show|showing|shown|showed|see|list|listed|pull|pulled|view)( me)?\b.{0,28}\b(transactions?|charges?|purchases?|activity)\b/gi, "talk through recent activity")
      .replace(/\btransactions?\b/gi, "activity")
      .replace(/\bcharges?\b/gi, "activity")
      .replace(/\bpurchases?\b/gi, "spending")
      .replace(/\bactivity I found:/gi, "activity:")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail !== "card promised without card") {
    return null;
  }

  const repaired = message
    .replace(/\bpull up (?:today(?:'|\u2019)s )?cash picture\b/gi, "talk through today's cash picture")
    .replace(/\bshow how (?:a )?purchases? would affect it\b/gi, "talk through how spending would affect it")
    .replace(/\bfuller view\b/gi, "fuller picture")
    .replace(/\b(the )?view\b/gi, "$1picture")
    .replace(/\bmissing cards?\b/gi, "missing data source")
    .replace(/\bcards? (are|is|were|was) connected\b/gi, "data sources $1 connected")
    .replace(/\bconnect(?:ed)? (the )?missing cards?\b/gi, "connect $1missing data source")
    .replace(/\bshow( me)? (your )?credit card options\b/gi, "talk through credit card options")
    .replace(/\bshow( me)? (your )?card options\b/gi, "talk through card options")
    .replace(/\bshow( me)? (some )?credit cards\b/gi, "talk through credit cards")
    .replace(/\bshow( me)? (some )?cards\b/gi, "talk through cards")
    .replace(/\bshow( me)? (the )?full summary\b/gi, "talk through the full summary")
    .replace(/\bshow( me)? (more )?(details?|detail)\b/gi, "talk through more detail")
    .replace(/\bview (your )?credit card options\b/gi, "talk through credit card options")
    .replace(/\bview (your )?card options\b/gi, "talk through card options")
    .replace(/\b(show|view|pull|list)( me)? (your )?card (options|choices|types|ideas|offers|details|use|usage)\b/gi, "talk through credit card $4")
    .replace(/\b(show|view|pull|list)( me)? (your )?cards\b/gi, "talk through credit cards")
    .replace(/\bcard (options|choices|types|ideas|offers|details|use|usage)\b/gi, "credit card $1")
    .replace(/\bdata cards?\b/gi, "data source")
    .replace(/\bdetails? cards?\b/gi, "details")
    .replace(/\bquick chart\b/gi, "quick summary")
    .replace(/\b(want to|would you like to|if you want,? i can) see\b/gi, "$1 talk through")
    .replace(/\bi see\b/gi, "I understand")
    .replace(/\b(show|showing|shown|showed|see|list|listed|pull|pulled|view)( me)?\b/gi, "talk through")
    .replace(/\s+/g, " ")
    .trim();

  return repaired === message ? null : repaired;
}

function getUnsupportedCardPromise(message: string, cards: AgentCard[]): string | null {
  const normalized = message.toLowerCase().replace(/[\u2018\u2019]/g, "'");

  if (cards.length === 0 && /\bpull up (?:today(?:'|\u2019)s )?cash picture\b/.test(normalized)) {
    return "card promised without card";
  }

  if (cards.length === 0 && /\bshow how (?:a )?purchases? would affect it\b/.test(normalized)) {
    return "transactions promised without transaction card";
  }

  if (!containsDisplayPromise(normalized)) {
    return null;
  }

  if (isNoDataCardRefusal(normalized)) {
    return null;
  }

  if (isSuggestionMenuResponse(normalized) && !hasSpecificDisplayCapabilityPromise(normalized)) {
    return null;
  }

  if (/\b(forecast|project(?:ion)?|trend|trend view|next \d+\s*days?)\b/.test(normalized)) {
    return hasCard(cards, "spendable_cash_forecast") ? null : "forecast promised without forecast card";
  }

  if (/\b(recurring|repeating|subscription|subscriptions|monthly charges?|bills? (are )?coming up|upcoming bills?)\b/.test(normalized)) {
    return hasAnyCard(cards, ["recurring_activity", "spendable_cash_forecast"])
      ? null
      : "recurring activity promised without recurring card";
  }

  if (/\b(drivers?|breakdown|categories|merchants|card payments?)\b/.test(normalized)) {
    return hasAnyCard(cards, ["spending_breakdown", "pip_cash_explanation", "math_breakdown", "insight_card"])
      ? null
      : "breakdown promised without breakdown card";
  }

  if (/\b(transactions?|charges?|purchases?|activity)\b/.test(normalized)) {
    return hasAnyCard(cards, ["recent_transactions", "spending_breakdown"])
      ? null
      : "transactions promised without transaction card";
  }

  if (/\bbalances?\b/.test(normalized)) {
    return hasCard(cards, "true_balances") ? null : "balances promised without balances card";
  }

  if (/\b(math|formula|calculation)\b/.test(normalized)) {
    return hasCard(cards, "math_breakdown") ? null : "math promised without math card";
  }

  const normalizedWithoutCreditCardTopic = normalized.replace(/\b(?:credit|debit) cards?\b/g, "");
  const appCardPromisePattern =
    /\b(?:this|the) cards?\b|\b(?:data|details?) cards?\b|\bcards?\s+(?:view|options|details|data)\b|\b(?:show|view|pull|list)\b.{0,40}\b(?:cards?|full summary|details?)\b|\bcards?\b.{0,20}\b(?:shown|below)\b/;

  if (appCardPromisePattern.test(normalizedWithoutCreditCardTopic)) {
    return cards.length > 0 ? null : "card promised without card";
  }

  if (
    /\b(showing|shown|showed|this card|the card|the view|trend view|fuller view)\b/.test(normalized) ||
    (cards.length === 0 && /\b(missing cards?|cards? (?:are|is|were|was) connected)\b/.test(normalizedWithoutCreditCardTopic))
  ) {
    return cards.length > 0 ? null : "card promised without card";
  }

  if (cards.length === 0 && /\b(show|see|view|pull)( me| you| up)?\b/.test(normalized)) {
    return "card promised without card";
  }

  return null;
}

function isNoDataCardRefusal(normalized: string): boolean {
  const noDataContext =
    /\b(no data|no financial data|not connected|haven't connected|have not connected|data isn't connected|data is not connected|without connected data|until .*connect(?:ed)? data)\b/.test(normalized);
  const refusalVerb =
    /\b(can'?t|cannot|unable|not able|don't|do not|won't|will not)\b.{0,90}\b(show|list|pull|view|forecast|break ?down|simulate|check)\b/.test(normalized);
  const displaySubject =
    /\b(forecast|breakdown|transactions?|subscriptions?|recurring|activity|charges?|purchases?|math|balances?|drivers?|card payments?)\b/.test(normalized);

  return displaySubject && (noDataContext || refusalVerb);
}

function isSuggestionMenuResponse(normalized: string): boolean {
  return /\b(you can ask|you could ask|try asking|ask me about|want to ask|if you want|pick a chip|choose a chip|tap a chip|tell me a dollar amount)\b/.test(normalized);
}

function hasSpecificDisplayCapabilityPromise(normalized: string): boolean {
  return /\b(forecast|project(?:ion)?|trend|trend view|breakdown|transactions?|charges?|purchases?|activity|recurring|repeating|subscriptions?|monthly charges?|upcoming bills?|bills? coming up|balances?|math|formula|calculation|cards?)\b/.test(normalized);
}

function containsDisplayPromise(normalized: string): boolean {
  return /\b(show|showing|shown|showed|see|pull|pulled|view|here is|here are)\b/.test(normalized) ||
    /\btrend view\b/.test(normalized) ||
    /\b(?:this|the|data|details?) cards?\b|\bcards?\b.{0,20}\b(?:shown|below)\b/.test(normalized) ||
    (
      /\b(breakdown|forecast|projection|projected)\b/.test(normalized) &&
      /\b(show|showing|shown|showed|pull|pulled|view|here is|here are)\b/.test(normalized)
    );
}

function hasCard(cards: AgentCard[], cardType: AgentCard["type"]): boolean {
  return cards.some((card) => card.type === cardType);
}

function hasAnyCard(cards: AgentCard[], cardTypes: AgentCard["type"][]): boolean {
  return cardTypes.some((cardType) => hasCard(cards, cardType));
}

function containsDisallowedFinalLanguage(message: string): boolean {
  return Boolean(getDisallowedFinalLanguageDetail(message));
}

function getDisallowedFinalLanguageDetail(message: string): string | null {
  const normalized = message.toLowerCase();
  const guaranteedSpendingPhrase = ["safe", "to", "spend"].join(" ");
  const disallowedPatterns: Array<[RegExp, string]> = [
    [new RegExp(`\\b${guaranteedSpendingPhrase}\\b`), guaranteedSpendingPhrase],
    [/\bsafe to buy\b/, "safe to buy"],
    [/\byou can afford\b/, "you can afford"],
    [/\bi recommend\b/, "i recommend"],
    [/\bmy recommendation\b/, "my recommendation"],
    [/\bfinancial advice\b/, "financial advice"],
    [/\bfinancial advisor\b/, "financial advisor"],
    [/\byou should (?:buy|spend|purchase|order)\b/, "you should spend"],
    [/\byou shouldn'?t (?:buy|spend|purchase|order)\b/, "you shouldn't spend"],
    [/\b(buy|sell|hold)\b.{0,24}\b(stocks?|shares?|etf|fund|securities?)\b/, "securities advice"],
    [/\binvest in\b.{0,40}\b(stocks?|shares?|etf|fund|securities?|nvidia|tesla|apple|crypto|bitcoin|ethereum)\b/, "investment advice"],
    [/\b(buy|sell|hold)\b.{0,24}\b(crypto|bitcoin|ethereum|token)\b/, "crypto advice"],
    [/\b(open|apply for|sign up for)\b.{0,40}\b(credit card|card|loan|lender|insurance)\b/, "product advice"],
    [/\b(take|choose|get)\b.{0,28}\b(personal loan|payday loan|balance transfer card)\b/, "product advice"],
    [/\b(refinance with|file bankruptcy|skip rent|write this off)\b/, "blocked domain advice"],
    [/\bdashboard\b/, "dashboard"],
    [new RegExp(`\\b${"free" + " cash"}\\b`), "legacy cash wording"],
    [/\bbudget(?:ing)?\b/, "budget"],
    [/\bexpense tracking\b/, "expense tracking"],
    [/\bfinancial planning\b/, "financial planning"],
    [/\bi'?m proud of you\b/, "proud of you"],
    [/\byou'?ve got this\b/, "you've got this"],
    [/\bmoney journey\b/, "money journey"],
    [/\bmindful choice\b/, "mindful choice"],
    [/\bmoney companion\b/, "money companion"],
    [/\bai coach\b/, "AI coach"],
    [/\bpip\s+(?:is|does|can|will|would|helps?|shows?|uses?|turns|stores|needs|calculates?|explains?|answers?)\b/, "third-person Pip self-reference"],
    [/^spendable cash today is\b/, "detached metric opening"],
    [/\bdeterministic\b/, "deterministic"],
    [/-?\$\d+(?:\.\d+)?k\b|\$-?\d+(?:\.\d+)?k\b/i, "money k shorthand"],
    [/\brolling-window pattern\b/, "rolling-window pattern"],
    [/\bliquidity\b/, "liquidity"],
    [/\boptimal\b/, "optimal"],
    [/\bsufficient\b/, "sufficient"],
    [/\b(?:page|tab|section|area)\s+(?:for|with)\b/, "page/tab/section"],
    [/\breview (?:them|it|transactions?|balances?) there\b/, "review it there"],
  ];

  for (const [pattern, detail] of disallowedPatterns) {
    if (pattern.test(normalized)) {
      return detail;
    }
  }

  if (hasDisallowedGuaranteeLanguage(normalized)) {
    return "guarantee";
  }

  return null;
}

function hasDisallowedGuaranteeLanguage(normalized: string): boolean {
  if (!/\bguarantee(?:d|s)?\b/.test(normalized)) {
    return false;
  }

  return !/\b(?:not guaranteed|no guarantee|not a guarantee)\b/.test(normalized);
}

function countWords(message: string): number {
  return message.trim().split(/\s+/).filter(Boolean).length;
}

function toAgentUnavailableError(error: unknown): AgentUnavailableError {
  if (error instanceof AgentUnavailableError) {
    return error;
  }

  const detail = getErrorDetail(error);

  if (isModelOutputValidationDetail(detail)) {
    return new AgentUnavailableError({
      code: "invalid-agent-output",
      message: "AI returned an invalid response.",
      status: 502,
      detail,
      cause: error,
    });
  }

  return new AgentUnavailableError({
    code: "openai-request-failed",
    message: "AI request failed.",
    detail,
    cause: error,
  });
}

function shouldUseDeterministicFallbackAfterModelFailure(
  error: AgentUnavailableError,
  context: PipAgentContext,
): boolean {
  return isModelServiceFailure(error) && Boolean(createFallbackFinalOutput(context));
}

function isModelServiceFailure(error: AgentUnavailableError): boolean {
  return (
    error.code === "openai-request-failed" ||
    error.code === "model-unavailable" ||
    /rate limit|timeout|temporarily unavailable|fetch failed|connection/i.test(
      `${error.message} ${error.detail ?? ""}`,
    )
  );
}

function shouldRetryFinalOutput(error: AgentUnavailableError): boolean {
  if (
    error.code === "invalid-agent-output" ||
    error.code === "model-returned-invalid-final-output" ||
    error.code === "model-returned-invalid-guidance-card" ||
    error.code === "model-returned-disallowed-final-message" ||
    error.code === "model-promised-unsupported-card" ||
    error.code === "model-returned-no-prompt-chips" ||
    error.code === "model-returned-too-long-final-message"
  ) {
    return true;
  }

  const detail = `${error.message} ${error.detail ?? ""}`;

  return isModelOutputValidationDetail(detail);
}

function suppressVisibleRepeatedTools(
  usedTools: string[],
  cards: AgentCard[],
  input: RunAiAgentInput,
): string[] {
  if (cards.length > 0 || !isVagueFollowUp(input.message)) {
    return usedTools;
  }

  const previousTool = input.conversationState?.lastToolNames?.at(-1);

  if (!previousTool) {
    return usedTools;
  }

  return usedTools.filter((toolName) => toolName !== previousTool);
}

function isVagueFollowUp(message: string): boolean {
  return /^(why|why\?|how|how\?|what do you mean|tell me more|more|explain|explain that|go on)$/i.test(
    message.trim(),
  );
}

function createAgentResponseRepair(error: AgentUnavailableError): AgentResponseRepair {
  return {
    reason:
      error.code === "model-returned-invalid-guidance-card"
        ? "invalid_guidance_card"
        : error.code === "model-returned-disallowed-final-message"
        ? "disallowed_language"
        : error.code === "model-promised-unsupported-card"
          ? "unsupported_promise"
        : "invalid_final_output",
    detail: error.detail ? sanitizeErrorDetail(error.detail) : sanitizeErrorDetail(error.message),
  };
}

function normalizePrompt(message: string): string {
  return message
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isExplicitPipCashDriversPrompt(normalized: string): boolean {
  return (
    normalized === "why this number" ||
    normalized === "what changed" ||
    normalized === "what are the biggest drivers" ||
    normalized === "why did it move" ||
    /^(show( me)? )?(the )?(pip cash )?drivers( behind (this|the) number)?$/.test(normalized) ||
    /^(show( me)? )?(the )?(spendable cash|pip cash )?drivers?$/.test(normalized)
  );
}

function isFlexiblePipCashDriversPrompt(normalized: string): boolean {
  return (
    /\b(behind|drivers?|factors?|why|explain)\b/.test(normalized) &&
    /\b(number|spendable cash today|spendable cash)\b/.test(normalized)
  );
}

function isPaydayImpactPrompt(normalized: string): boolean {
  const paydaySubject = /\b(payday|paycheck|paychecks?|payroll|deposit|deposits?|income)\b/.test(normalized);
  const impactIntent = /\b(affect|affected|impact|impacts?|change|changed|mean|means|help|helps|lift|lifts|money|number|spendable cash)\b/.test(normalized);

  return paydaySubject && impactIntent;
}

function isSpendableFactorsInsightPrompt(normalized: string): boolean {
  return (
    /\b(factors?|affect|affects|affected|impact|impacts?|influence|influences)\b/.test(normalized) &&
    /\b(today|number|spendable cash today|spendable cash|money)\b/.test(normalized) &&
    !isRecentSpendingPressurePrompt(normalized) &&
    !isPaydayImpactPrompt(normalized)
  );
}

function isPatternAssumptionsPrompt(normalized: string): boolean {
  return (
    /\b(pattern|assumptions?|baseline|confidence|normal room|learn(?:ing)? my pattern)\b/.test(normalized) &&
    /\b(number|spendable cash today|spendable cash|today|using|behind)\b/.test(normalized)
  );
}

function isRecentSpendingPressurePrompt(normalized: string): boolean {
  return (
    /\b(recent spending|spending pressure|pace|over pattern|under pattern|ahead of pace|behind pace|lowered today|affect(?:ing)? this)\b/.test(normalized) &&
    /\b(today|number|spendable cash|room|pattern|pace|spending)\b/.test(normalized)
  );
}

function isSpendingOpportunityPrompt(normalized: string): boolean {
  if (isSavingsSetupOrSettingsPrompt(normalized)) {
    return false;
  }

  const hasOpportunityTerm =
    /\b(cut back|cutback|spend less|save money|save more(?: money)?|save a little|save cash|save this week|overspending|over spending|waste|wasteful|stop buying|trim|lower expenses?|reduce expenses?|cut expenses?|cut costs?|trim costs?)\b/.test(normalized) ||
    /\bspending opportunit(?:y|ies)\b/.test(normalized) ||
    /\b(costs?|expenses?)\b.{0,36}\b(cut|trim|lower|reduce)\b/.test(normalized) ||
    /\bwhere can i save\b/.test(normalized) ||
    /\b(money leaking|where .* leaking)\b/.test(normalized);

  if (!hasOpportunityTerm) {
    return false;
  }

  return (
    /\b(what|where|which|find|show|spot|identify|help|how)\b/.test(normalized) ||
    /\bspending opportunit(?:y|ies)\b/.test(normalized) ||
    /\b(cut back|cutback|spend less|save money|save more(?: money)?|save a little|save cash|save this week|overspending|over spending|waste|wasteful|stop buying|trim|lower expenses?|reduce expenses?|cut expenses?|cut costs?|trim costs?)\b.*\b(spending|spend|money|buying|recent|this week|category|merchant|where|what|costs?|expenses?|cash)\b/.test(normalized) ||
    /\b(costs?|expenses?)\b.{0,36}\b(cut|trim|lower|reduce)\b/.test(normalized) ||
    /\b(money leaking|where .* leaking)\b/.test(normalized)
  );
}

function isSavingsSetupOrSettingsPrompt(normalized: string): boolean {
  return /\b(monthly savings|protected savings|savings cushion)\b/.test(normalized) ||
    /\bsave\b.{0,24}\b(account settings|settings|preferences)\b/.test(normalized);
}

function getSavingsGoalForcedTool(
  message: string,
  normalized: string,
): ForcedAgentTool | undefined {
  if (!isSavingsGoalPrompt(normalized)) {
    return undefined;
  }

  const targetAmountCents = extractSavingsGoalAmountCents(message);
  const monthlyContributionCents = extractMonthlyContributionCents(message);
  const name = inferSavingsGoalName(message, normalized);

  if (isSavingsGoalListPrompt(normalized)) {
    return {
      toolName: "list_savings_goals",
      args: {},
      requireCard: true,
    };
  }

  if (isSavingsGoalProtectionPrompt(normalized)) {
    return {
      toolName: "set_savings_goal_protection",
      args: {
        name,
        include_in_spendable_cash: !/\b(track only|don'?t protect|do not protect|stop protecting|not in spendable|don'?t keep|do not keep)\b/.test(normalized),
        ...(monthlyContributionCents === null ? {} : { monthly_contribution_cents: monthlyContributionCents }),
      },
      requireCard: true,
    };
  }

  if (isSavingsGoalProgressPrompt(normalized) && targetAmountCents !== null) {
    return {
      toolName: "update_savings_goal",
      args: {
        name,
        current_amount_cents: targetAmountCents,
      },
      requireCard: true,
    };
  }

  if (targetAmountCents !== null && isSavingsGoalCreatePrompt(normalized)) {
    return {
      toolName: "create_savings_goal",
      args: {
        name,
        target_amount_cents: targetAmountCents,
        ...(monthlyContributionCents === null ? {} : { monthly_contribution_cents: monthlyContributionCents }),
        include_in_spendable_cash:
          monthlyContributionCents !== null &&
          /\b(keep|hold|reserve|protect|out of spendable|spendable cash|monthly plan)\b/.test(normalized),
      },
      requireCard: true,
    };
  }

  return undefined;
}

function isSavingsGoalPrompt(normalized: string): boolean {
  return /\bsavings? goals?\b/.test(normalized) ||
    /\bwhat goals am i tracking\b/.test(normalized) ||
    /\bgoal progress\b/.test(normalized) ||
    /\btrip fund\b.{0,32}\bdoing\b/.test(normalized) ||
    /\bsave\b.{0,32}\b(for|toward|towards)\b/.test(normalized) ||
    /\b(for|toward|towards)\b.{0,32}\b(trip|vacation|travel|car|house|home|wedding|emergency fund|big purchase)\b/.test(normalized) ||
    /\b(trip|vacation|travel|car|house|home|wedding|emergency fund|big purchase)\b.{0,40}\b(cost|costs|goal|save|saving|target)\b/.test(normalized);
}

function isSavingsGoalCreatePrompt(normalized: string): boolean {
  return /\b(create|start|set up|make|add|track|want|need|help)\b/.test(normalized) ||
    /\bsave\b.{0,32}\b(for|toward|towards)\b/.test(normalized);
}

function isSavingsGoalListPrompt(normalized: string): boolean {
  return /\b(show|list|what|which|update|progress|how are)\b.{0,32}\bsavings? goals?\b/.test(normalized) ||
    /\bwhat goals am i tracking\b/.test(normalized) ||
    /\bshow goal progress\b/.test(normalized) ||
    /\btrip fund\b.{0,32}\bdoing\b/.test(normalized) ||
    /^savings? goals?$/.test(normalized);
}

function isSavingsGoalProtectionPrompt(normalized: string): boolean {
  return /\b(keep|hold|reserve|protect|track only|don'?t protect|do not protect|stop protecting)\b.{0,48}\b(goal|spendable cash|spendable)\b/.test(normalized) ||
    /\b(goal|savings? goal)\b.{0,48}\b(out of spendable|out of today'?s number|not in spendable|kept out)\b/.test(normalized);
}

function isSavingsGoalProgressPrompt(normalized: string): boolean {
  return /\b(saved|have|already have|tracked|progress|current)\b.{0,32}\b\$?\d/.test(normalized) &&
    /\b(goal|savings? goal|toward|towards|for)\b/.test(normalized);
}

function isDataQualityPrompt(normalized: string): boolean {
  return /\b(missing card|card missing|missing data|data missing|data (?:might|may|could) be missing|what data (?:might|may|could) be missing|connect(ed)? data|repair data|stale data|data quality|pending transactions?|pending items?|number complete)\b/.test(
    normalized,
  );
}

function isTrustReceiptPrompt(normalized: string): boolean {
  if (/\b(trust receipt|receipt behind|receipt for|source receipt)\b/.test(normalized)) {
    return true;
  }

  return (
    (
      /\b(can i trust|trustworthy|how reliable|how accurate|accuracy|complete data|what is missing|what data is missing|what may be missing|what data is counted|what does this include|based on fresh data|up to date|current)\b/.test(normalized) ||
      /\b(data|number|spendable cash|spendable cash today)\b.{0,32}\b(stale|fresh|current|up to date)\b/.test(normalized) ||
      /\b(stale|fresh|current|up to date)\b.{0,32}\b(data|number|spendable cash|spendable cash today)\b/.test(normalized)
    ) &&
    /\b(number|spendable cash|spendable cash today|data|accounts?|current|fresh|stale|today|it|this)\b/.test(normalized)
  );
}

function isTrustPolicyPrompt(normalized: string): boolean {
  if (/\b(add|connect|link|repair|reconnect|fix|remove|disconnect)\b.*\b(bank|account|card|institution|plaid|connection)\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(plaid|bank[- ]?data provider|data provider|aggregation provider|aggregator|credentials?|passwords?|provider tokens?|tokens?)\b/.test(normalized) ||
    /\b(ai provider|ai model|openai|chatgpt|llm|train on|training data|model training|does ai|ai calculate|ai see|ai use)\b/.test(normalized) ||
    /\b(move (?:my |our |your )?money|transfer (?:my |our |your )?money|withdraw|make payments?|pay bills?|send money|take money|debit my account)\b/.test(normalized) ||
    /\b(security|privacy|sell my data|sell data|advertising|subprocessors?|data retention|retention|delete my data|delete data)\b/.test(normalized) ||
    /\b(how much|what|price|pricing|cost)\b.{0,24}\bpip\b|\bpip\b.{0,24}\b(price|pricing|cost)\b/.test(normalized) ||
    /\bandroid\b.{0,32}\b(cost|price|pricing|subscription|checkout)\b|\b(cost|price|pricing|subscription|checkout)\b.{0,32}\bandroid\b/.test(normalized) ||
    /\b(financial advice|advisor|guarantee|guaranteed|legal entity|who operates|refund|trial|cancel subscription|subscription (?:billing|price|pricing|refund|trial|cancel|cancellation))\b/.test(normalized)
  );
}

function isSyncStatusPrompt(normalized: string): boolean {
  if (/^(refresh|sync|update|reload)\b/.test(normalized)) {
    return false;
  }

  if (/^(did|does|do|when|why|is|are|was|were)\b.*\b(refresh|sync|update|updated|updating)\??$/.test(normalized)) {
    return true;
  }

  return (
    /\b(current|up to date|updated|fresh|stale|last refresh|last refreshed|last sync|last synced|not updating|sync status|refresh status)\b/.test(normalized) &&
    /\b(number|spendable cash|spendable cash today|data|accounts?|bank|connection|refresh|sync|updated|current)\b/.test(normalized)
  ) || (
    /\b(did|does|do|when|why|is|are|was|were)\b/.test(normalized) &&
    /\b(refresh|sync|update|updated|updating|current|fresh|stale)\b/.test(normalized) &&
    /\b(number|spendable cash|data|accounts?|bank|connection|it|this)\b/.test(normalized)
  );
}

function isSpendableCashDefinitionPrompt(normalized: string): boolean {
  return (
    /\bwhat is spendable cash\b/.test(normalized) ||
    /\bwhat is spendable cash today\b/.test(normalized) ||
    /\bwhat does (my )?spendable cash( today)? (number )?mean\b/.test(normalized) ||
    /\bhow does pip work\b/.test(normalized) ||
    /\bhow pip works\b/.test(normalized) ||
    /\bhow does spendable work\b/.test(normalized) ||
    /\bhow spendable works\b/.test(normalized) ||
    /\bhow does spendable cash work\b/.test(normalized) ||
    /\bwhat makes (it|spendable cash|the number) (go up|rise|increase|go down|fall|decrease)\b/.test(normalized)
  );
}

function isExplicitMathPrompt(normalized: string): boolean {
  return /^(show( me)? )?(the )?(math|math breakdown|formula|calculation|calculation details)$/.test(
    normalized,
  );
}

function isExplicitForecastPrompt(normalized: string): boolean {
  return (
    /\b(forecast|project|projection|trend|trends|tomorrow|next day|next week|next \d+\s*days?|coming days?)\b/.test(normalized) &&
    !/\bspend\s*\$?\d|\bspend \d+\b/.test(normalized) &&
    !/\bif i (?:only )?spend\b/.test(normalized) &&
    !isExplicitRecurringPrompt(normalized)
  );
}

function isExplicitRecurringPrompt(normalized: string): boolean {
  return (
    /\b(recurring|repeating|repeat|subscription|subscriptions|bills? (are )?coming up|monthly charges?|upcoming bills?)\b/.test(normalized) ||
    /\b(youtube|premium|netflix|spotify|hulu|stream|membership|gym|phone bill|utilities?)\b.*\b(coming|upcoming|repeat|again|next|recurring)\b/.test(normalized) ||
    /\b(coming|upcoming|repeat|again|next|recurring)\b.*\b(youtube|premium|netflix|spotify|hulu|stream|membership|gym|phone bill|utilities?)\b/.test(normalized)
  );
}

function isExplicitSpendingBreakdownPrompt(normalized: string): boolean {
  return (
    /\b(complete|full|item|category|merchant|spending|spend|income|refund|card payment|payments?)\b.*\bbreakdown\b/.test(normalized) ||
    /\bbreakdown\b.*\b(complete|full|item|category|merchant|spending|spend|income|refund|card payment|payments?)\b/.test(normalized) ||
    /\bwhat did i spend (on|money on)\b/.test(normalized) ||
    /\bshow (me )?(my )?(categories|merchants|card payments?|income sources?)\b/.test(normalized) ||
    /\btransaction history breakdown\b/.test(normalized)
  );
}

function extractForecastHorizonDays(normalized: string): number {
  const match = normalized.match(/\b(\d{1,2})\s*-?\s*days?\b/);

  if (!match) {
    return 14;
  }

  return Math.min(Math.max(Number(match[1]), 1), 14);
}

function getAffirmativeFollowUpTool(
  normalized: string,
  history: AgentHistoryItem[] | undefined,
): ForcedAgentTool | undefined {
  if (!isAffirmativeFollowUp(normalized)) {
    return undefined;
  }

  const recentHistory = [...(history ?? []).slice(-4)].reverse();

  for (const item of recentHistory) {
    const content = normalizePrompt(item.content);

    if (isExplicitForecastPrompt(content) || /\b(trend line|daily amounts|forecast|next week|7 days|14 days)\b/.test(content)) {
      return {
        toolName: "forecast_spendable_cash",
        args: {
          horizon_days: 14,
        },
        requireCard: true,
      };
    }

    if (isExplicitRecurringPrompt(content) || /\b(recurring|repeat(?:ing)? items?|subscriptions?|upcoming bills?|bills? coming up)\b/.test(content)) {
      return {
        toolName: "get_recurring_activity",
        args: {},
        requireCard: true,
      };
    }

    if (isExplicitSpendingBreakdownPrompt(content) || /\b(spending breakdown|breakdown|categories|merchants|card payments?|income sources?)\b/.test(content)) {
      return {
        toolName: "get_spending_breakdown",
        args: {},
        requireCard: true,
      };
    }

    if (isExplicitTransactionsPrompt(content) || /\b(recent charges?|recent transactions?|recent purchases?|recent activity)\b/.test(content)) {
      return {
        toolName: "get_recent_transactions",
        args: {
          limit: 6,
        },
        requireCard: true,
      };
    }

    if (isExplicitMathPrompt(content) || /\b(show math|math breakdown|calculation|formula)\b/.test(content)) {
      return {
        toolName: "get_pip_cash_math",
        args: {},
        requireCard: true,
      };
    }
  }

  return undefined;
}

function getAccountManagementForcedTool(
  rawMessage: string,
  normalized: string,
): ForcedAgentTool | undefined {
  const exactRemovalTarget = extractExactRemoveConfirmationTarget(rawMessage);

  if (exactRemovalTarget) {
    return {
      toolName: "remove_institution",
      args: {
        institution_name: exactRemovalTarget,
        confirmation_text: rawMessage.trim(),
      },
      requireCard: false,
    };
  }

  if (isConnectedAccountsPrompt(normalized)) {
    return {
      toolName: "get_connected_accounts",
      args: {},
      requireCard: true,
    };
  }

  if (isAccountSelectionPrompt(normalized)) {
    return {
      toolName: "start_account_selection_update",
      args: {
        institution_name: extractInstitutionTarget(normalized),
      },
      requireCard: false,
    };
  }

  if (isAddAccountConnectionPrompt(normalized)) {
    return {
      toolName: "start_new_account_connection",
      args: {},
      requireCard: false,
    };
  }

  if (isRepairConnectionPrompt(normalized)) {
    return {
      toolName: "repair_account_connection",
      args: {
        institution_name: extractInstitutionTarget(normalized),
      },
      requireCard: false,
    };
  }

  const inclusionIntent = getAccountInclusionIntent(normalized);

  if (inclusionIntent) {
    return {
      toolName: "set_account_inclusion",
      args: {
        account_name: inclusionIntent.accountName,
        include_in_pip_cash: inclusionIntent.include,
      },
      requireCard: false,
    };
  }

  const protectedSavingsIntent = getProtectedSavingsAccountIntent(normalized);

  if (protectedSavingsIntent) {
    return {
      toolName: "set_account_protected_savings",
      args: {
        account_name: protectedSavingsIntent.accountName,
        is_protected_savings: protectedSavingsIntent.protected,
      },
      requireCard: false,
    };
  }

  if (isRemoveInstitutionRequest(normalized)) {
    return {
      toolName: "request_remove_institution_confirmation",
      args: {
        institution_name: extractInstitutionTarget(normalized),
      },
      requireCard: false,
    };
  }

  return undefined;
}

function extractExactRemoveConfirmationTarget(message: string): string | null {
  const trimmed = message.trim();
  const match = /^REMOVE\s+(.+)$/.exec(trimmed);

  if (!match || trimmed !== trimmed.toUpperCase()) {
    return null;
  }

  return match[1].trim();
}

function isConnectedAccountsPrompt(normalized: string): boolean {
  if (isExplicitBalancesPrompt(normalized)) {
    return false;
  }

  return (
    /\b(show|list|what|which)\b.{0,40}\b(my\s+)?(bank\s+)?accounts?\b/.test(normalized) ||
    /\b(show|list|what|which)\b.{0,40}\b(connected|linked|selected)\s+(accounts?|banks?|cards?|institutions?)\b/.test(normalized) ||
    /\b(what|which)\b.{0,40}\baccounts?\b.{0,24}\b(connected|linked|selected|used)\b/.test(normalized) ||
    /\bwhat is pip using\b/.test(normalized) ||
    /\bwhat accounts affect today'?s number\b/.test(normalized) ||
    /\bwhich accounts are used\b/.test(normalized)
  );
}

function isAddAccountConnectionPrompt(normalized: string): boolean {
  if (/\b(do not|don't|dont|not)\s+(add|connect|link)\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(add|connect|link)\b.{0,40}\b(another|new|second|my|a|an)?\b.{0,20}\b(account|bank|card|credit card|amex|chase|wells fargo|capital one)\b/.test(normalized) ||
    /\b(i need|i want|want|need)\b.{0,24}\b(add|connect|link)\b.{0,40}\b(account|bank|card|credit card|amex|chase|wells fargo|capital one)\b/.test(normalized) ||
    /^(add|connect|link) (an? |my |new |another )?(account|bank|card|credit card)$/.test(normalized)
  );
}

function isRepairConnectionPrompt(normalized: string): boolean {
  if (/\b(do not|don't|dont|not)\s+(reconnect|repair|fix|restore)\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(reconnect|repair|fix|restore)\b.{0,40}\b(bank|connection|account|institution|chase|wells fargo|capital one|amex)\b/.test(normalized) ||
    /^reconnect\s+.{2,80}$/.test(normalized)
  );
}

function isAccountSelectionPrompt(normalized: string): boolean {
  return (
    /\bchange\b.{0,40}\b(which )?accounts\b/.test(normalized) ||
    /\b(add|select|remove)\b.{0,30}\b(account|card|checking|savings)\b.{0,20}\bfrom\b/.test(normalized) ||
    /\bforgot to select\b/.test(normalized)
  );
}

function getAccountInclusionIntent(normalized: string): { include: boolean; accountName?: string } | null {
  const excludeMatch = /^(ignore|exclude|hide|stop using|don'?t use|do not use)\s+(.+)$/.exec(normalized);

  if (excludeMatch) {
    return {
      include: false,
      accountName: cleanupAccountTarget(excludeMatch[2]),
    };
  }

  const includeMatch = /^(use|include|start using)\s+(.+?)(?: again)?$/.exec(normalized);

  if (includeMatch && /\b(account|checking|savings|card|that|this|business|shared)\b/.test(includeMatch[2])) {
    return {
      include: true,
      accountName: cleanupAccountTarget(includeMatch[2]),
    };
  }

  return null;
}

function getProtectedSavingsAccountIntent(normalized: string): { protected: boolean; accountName?: string } | null {
  const unsetMatch = /^(don'?t|do not|stop)\s+treat(?:ing)?\s+(.+?)\s+as protected/.exec(normalized);

  if (unsetMatch) {
    return {
      protected: false,
      accountName: cleanupAccountTarget(unsetMatch[2]),
    };
  }

  const setMatch = /^(make|mark|set)\s+(.+?)\s+(?:as |my )?protected savings/.exec(normalized);

  if (setMatch) {
    return {
      protected: true,
      accountName: cleanupAccountTarget(setMatch[2]),
    };
  }

  return null;
}

function isRemoveInstitutionRequest(normalized: string): boolean {
  if (/\b(do not|don't|dont|not)\s+(remove|disconnect|unlink)\b/.test(normalized)) {
    return false;
  }

  return (
    (
      /\b(remove|disconnect|unlink)\b.{0,30}\b(bank|institution|connection|chase|wells fargo|capital one|amex)\b/.test(normalized) ||
      /^(remove|disconnect|unlink)\s+.{2,80}$/.test(normalized)
    ) &&
    !/\b(account|checking|savings|card)\b.{0,20}\bfrom\b/.test(normalized) &&
    !/\b(transaction|charge|purchase|merchant|bill|budget|category)\b/.test(normalized)
  );
}

function extractInstitutionTarget(normalized: string): string | undefined {
  const patterns = [
    /\b(?:reconnect|repair|fix|restore|remove|disconnect|unlink)\s+(.+)$/,
    /\bchange\b.{0,20}\b(.+?)\s+accounts\b/,
    /\bfrom\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);

    if (match?.[1]) {
      return cleanupAccountTarget(match[1]);
    }
  }

  return undefined;
}

function cleanupAccountTarget(value: string): string {
  return value
    .replace(/\bpip\b/g, "")
    .replace(/\bcan see\b/g, "")
    .replace(/\bfrom today'?s number\b/g, "")
    .replace(/\bin today'?s number\b/g, "")
    .replace(/\bgoing forward\b/g, "")
    .replace(/\bagain\b/g, "")
    .replace(/\bmy\b/g, "")
    .replace(/\bthat account\b/g, "")
    .replace(/\bthis account\b/g, "")
    .trim();
}

function isAffirmativeFollowUp(normalized: string): boolean {
  return /^(yes|yeah|yep|ok|okay|sure|do that|yes do that|show me|please do|that)$/.test(normalized);
}

function isExplicitTransactionsPrompt(normalized: string): boolean {
  return /^(show( me| my)? )?(recent )?(transactions?|activity|charges?|purchases?)$/.test(
    normalized,
  );
}

function isExplicitBalancesPrompt(normalized: string): boolean {
  return (
    /^(show( me| my)? )?((true|real|actual|account) )?balances?$/.test(normalized) ||
    /^what are my (true|real|actual|account) balances?$/.test(normalized) ||
    isNaturalAccountBalancePrompt(normalized)
  );
}

function isNaturalAccountBalancePrompt(normalized: string): boolean {
  const hasBalanceIntent =
    /\bbalances?\b/.test(normalized) ||
    /\bhow much\b.{0,48}\b(checking|savings|account|bank)\b/.test(normalized);

  if (!hasBalanceIntent) {
    return false;
  }

  if (/\bbalance transfer\b/.test(normalized)) {
    return false;
  }

  if (/\b(connected|linked|selected|using|used|count|counts|affect|add|connect|link|repair|reconnect|fix|remove|disconnect|unlink|institution)\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(account|accounts|bank|banks|checking|savings|available|current|true|real|actual)\b.{0,48}\bbalances?\b/.test(normalized) ||
    /\bbalances?\b.{0,48}\b(account|accounts|bank|banks|checking|savings|available|current)\b/.test(normalized) ||
    /\bwhat(?:'s| is)?\s+my\s+balances?\b/.test(normalized) ||
    /\bshow\b.{0,24}\bmy\b.{0,24}\bbalances?\b/.test(normalized) ||
    /\bhow much\b.{0,48}\b(have|checking|savings|account|bank)\b/.test(normalized) ||
    /\b(can'?t|cant|cannot)\b.{0,48}\bshow\b.{0,48}\bbalances?\b/.test(normalized)
  );
}

function isSpendingPrompt(normalized: string): boolean {
  return /\b(spend(?:ing)?|buy(?:ing)?|purchase|purchasing|order(?:ing)?|afford|pay(?:ing)?|cost)\b/.test(normalized);
}

function isFinancialGuidancePrompt(normalized: string): boolean {
  if (isExplicitTransactionsPrompt(normalized) || isExplicitBalancesPrompt(normalized) || isExplicitMathPrompt(normalized)) {
    return false;
  }

  return (
    /\b(what do you think|how am i doing|give me advice|any advice|what should i do|am i okay|is this bad|what would you do|help me fix this|how do i improve|am i spending too much|is my spending bad|am i broke|why am i broke|i'?m broke|in trouble|should i lower my monthly savings|should i lower my cushion|should i save more|should i stop spending|what'?s your read|my read)\b/.test(normalized) ||
    /\bshould i\b.{0,24}\bslow down\b/.test(normalized) ||
    /\bwhy\b.{0,40}\b(can'?t|cannot|cant)\b.{0,40}\bspend\b/.test(normalized) ||
    /\b(can'?t|cannot|cant)\b.{0,40}\bspend\b.{0,40}\b(because|why|if|when)\b/.test(normalized)
  );
}

function isJudgmentalPurchasePrompt(normalized: string): boolean {
  return (
    isSpendingPrompt(normalized) &&
    (
      /\b(should i|would you|what would you do|do you think|is this okay|is this ok|is this bad|is this dumb|can i|could i)\b/.test(normalized) ||
      /\bwhy\b.{0,40}\b(can'?t|cannot|cant)\b.{0,40}\bspend\b/.test(normalized)
    )
  );
}

function isSpecificSpendSimulationPrompt(normalized: string): boolean {
  return (
    isSpendingPrompt(normalized) &&
    !/\b(any|anything|money|in general|overall|at all)\b/.test(normalized)
  );
}

function isGeneralSpendingQuestion(normalized: string): boolean {
  return /\b(any|anything|money|in general|overall|at all)\b/.test(normalized);
}

function isShortPurchaseFollowUp(normalized: string, history: AgentHistoryItem[] | undefined): boolean {
  if (!/\b(what about|how about|instead|rather|that one|\$\s*\d|\d+\s*(dollars?|bucks?))\b/.test(normalized)) {
    return false;
  }

  return (history ?? [])
    .slice(-4)
    .some((item) => item.role === "user" && isSpendingPrompt(item.content.toLowerCase()));
}

function extractExplicitPurchaseAmountCents(message: string): number | null {
  const candidates: Array<{ amountCents: number; index: number; score: number }> = [];
  const amountPattern =
    /(?:\$|usd\s*)\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)/gi;
  const normalized = message.toLowerCase();

  for (const match of message.matchAll(amountPattern)) {
    const rawAmount = match[1] ?? match[2];
    const amount = Number(rawAmount.replaceAll(",", ""));

    if (!Number.isFinite(amount)) {
      continue;
    }

    const amountCents = Math.round(amount * 100);

    if (amountCents <= 0 || amountCents > 1000000) {
      continue;
    }

    const index = match.index ?? 0;
    candidates.push({
      amountCents,
      index,
      score: scorePurchaseAmountCandidate(normalized, index),
    });
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score || right.index - left.index);

  return candidates[0].amountCents;
}

function extractSavingsGoalAmountCents(message: string): number | null {
  const candidates = extractMoneyAmountCandidates(message, 100_000_000);

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score || right.index - left.index);

  return candidates[0].amountCents;
}

function extractMonthlyContributionCents(message: string): number | null {
  const monthlyPattern =
    /(?:\$|usd\s*)\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:\/|per\s+|a\s+)?month|\b(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)?\s*(?:\/|per\s+|a\s+)?month\b/gi;

  for (const match of message.matchAll(monthlyPattern)) {
    const rawAmount = match[1] ?? match[2];
    const amount = Number(rawAmount.replaceAll(",", ""));

    if (!Number.isFinite(amount)) {
      continue;
    }

    const amountCents = Math.round(amount * 100);

    if (amountCents > 0 && amountCents <= 100_000_000) {
      return amountCents;
    }
  }

  return null;
}

function extractMoneyAmountCandidates(message: string, maxCents: number) {
  const amountPattern =
    /(?:\$|usd\s*)\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)/gi;
  const normalized = message.toLowerCase();
  const candidates: Array<{ amountCents: number; index: number; score: number }> = [];

  for (const match of message.matchAll(amountPattern)) {
    const rawAmount = match[1] ?? match[2];
    const amount = Number(rawAmount.replaceAll(",", ""));

    if (!Number.isFinite(amount)) {
      continue;
    }

    const amountCents = Math.round(amount * 100);

    if (amountCents <= 0 || amountCents > maxCents) {
      continue;
    }

    const index = match.index ?? 0;
    candidates.push({
      amountCents,
      index,
      score: scoreSavingsGoalAmountCandidate(normalized, index),
    });
  }

  return candidates;
}

function scoreSavingsGoalAmountCandidate(message: string, index: number): number {
  const before = message.slice(Math.max(0, index - 64), index);
  const after = message.slice(index, index + 64);
  let score = 0;

  if (/\b(goal|target|cost|costs|save|saving|trip|vacation|travel|car|home|house|wedding|emergency fund|big purchase)\b/.test(before)) {
    score += 8;
  }

  if (/\b(goal|target|cost|costs|save|saving|trip|vacation|travel|car|home|house|wedding|emergency fund|big purchase)\b/.test(after)) {
    score += 6;
  }

  if (/\bper month|\/month|a month\b/.test(after)) {
    score -= 4;
  }

  return score;
}

function inferSavingsGoalName(message: string, normalized: string): string {
  const saveForMatch = /\bsave\b.{0,16}\b(?:for|toward|towards)\s+(?:a |an |the |my )?([^,.?]+?)(?:\s+(?:that|which|and|but|for|by|with|it'?s|it's|it is|costs?|will|would)\b|$)/i.exec(message);

  if (saveForMatch?.[1]) {
    return cleanSavingsGoalName(saveForMatch[1]);
  }

  if (/\b(emergency fund)\b/.test(normalized)) {
    return "Emergency fund";
  }

  if (/\b(vacation|travel|trip)\b/.test(normalized)) {
    return "Trip";
  }

  if (/\b(car)\b/.test(normalized)) {
    return "Car";
  }

  if (/\b(wedding)\b/.test(normalized)) {
    return "Wedding";
  }

  if (/\b(house|home)\b/.test(normalized)) {
    return "Home";
  }

  if (/\bbig purchase\b/.test(normalized)) {
    return "Big purchase";
  }

  return "Savings goal";
}

function cleanSavingsGoalName(value: string): string {
  const cleaned = value
    .replace(/\b(it'?s|it is|that'?s|that is)\b.*$/i, "")
    .replace(/\b(costs?|will cost|would cost|for)\b.*$/i, "")
    .replace(/\$\s*\d[\d,]*(?:\.\d{1,2})?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const trimmed = cleaned || "Savings goal";

  return trimmed
    .slice(0, 80)
    .replace(/^./, (char) => char.toUpperCase());
}

function scorePurchaseAmountCandidate(message: string, index: number): number {
  const before = message.slice(Math.max(0, index - 56), index);
  const after = message.slice(index, index + 56);
  let score = 0;

  if (/\b(spend(?:ing)?|buy(?:ing)?|purchase|purchasing|order(?:ing)?|afford|pay(?:ing)?|cost)\b/.test(before)) {
    score += 8;
  }

  if (/\b(what about|how about|instead|rather|does|do to|leave|would)\b/.test(before)) {
    score += 5;
  }

  if (/\b(spend(?:ing)?|buy(?:ing)?|purchase|purchasing|order(?:ing)?|afford|pay(?:ing)?|cost|instead|today)\b/.test(after)) {
    score += 3;
  }

  if (/\b(balance|paycheck|income|deposit|have|left)\b/.test(before)) {
    score -= 4;
  }

  if (/\b(balance|paycheck|income|deposit)\b/.test(after)) {
    score -= 4;
  }

  return score;
}

function wasCardRecentlyShown(
  conversationState: AgentConversationState | undefined,
  cardType: AgentCard["type"],
): boolean {
  return Boolean(conversationState?.shownCards?.some((card) => card.type === cardType));
}

function explicitlyRequestsRepeatedCard(message: string): boolean {
  return /\b(again|show|resurface|breakdown|details?|card|why this number|what changed)\b/i.test(message);
}

function explicitlyRequestsMultipleCards(message: string): boolean {
  return /\b(all|everything|cards|details|breakdown)\b/i.test(message);
}

function explicitlyRequestsTransactions(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    /\b(transactions?|charges?|activity)\b/.test(normalized) ||
    /\b(recent|latest|show|list)\b.*\b(purchases?|spending|spend)\b/.test(normalized) ||
    /\bwhat did i (?:buy|spend)\b/.test(normalized) ||
    /\b(?:buy|bought|spend|spent)\b.{0,24}\b(lately|recently|this week|yesterday)\b/.test(normalized) ||
    /\bwhat did i spend (on|money on)\b/.test(normalized) ||
    /\bwhich purchases?\b/.test(normalized)
  );
}

function uniqueCardsByType(cards: AgentCard[]): AgentCard[] {
  const seen = new Set<string>();
  const unique: AgentCard[] = [];

  for (const card of cards) {
    if (seen.has(card.type)) {
      continue;
    }

    seen.add(card.type);
    unique.push(card);
  }

  return unique;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function sumTransactionAmounts(
  transactions: Extract<AgentCard, { type: "recent_transactions" }>["transactions"],
): number {
  return transactions.reduce((total, transaction) => total + transaction.amountCents, 0);
}

function getTransactionDateRange(
  transactions: Extract<AgentCard, { type: "recent_transactions" }>["transactions"],
) {
  if (!transactions.length) {
    return null;
  }

  const dates = transactions.map((transaction) => transaction.date).sort();

  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
  };
}

function formatSyncStatus(syncStatus: SyncStatus | null | undefined) {
  if (!syncStatus) {
    return {
      available: false,
      institutionCount: 0,
      hasStaleInstitution: false,
      latestSyncRun: null,
    };
  }

  return {
    available: true,
    institutionCount: syncStatus.institutions.length,
    institutions: syncStatus.institutions.map((institution) => ({
      provider: institution.provider,
      status: institution.status,
      isStale: institution.isStale,
      lastSuccessfulSyncAt: institution.lastSuccessfulSyncAt,
      errorCode: institution.errorCode,
      errorMessage: institution.errorMessage,
    })),
    hasStaleInstitution: syncStatus.hasStaleInstitution,
    latestSyncRun: syncStatus.latestSyncRun,
  };
}

function hasConnectedRefreshProvider(syncStatus: SyncStatus | null | undefined): boolean {
  return Boolean(
    syncStatus?.institutions.some((institution) =>
      institution.provider === "plaid" || institution.provider === "teller",
    ),
  );
}

function hasRepairablePlaidInstitution(syncStatus: SyncStatus | null | undefined): boolean {
  return Boolean(
    syncStatus?.institutions.some((institution) =>
      institution.provider === "plaid" &&
      (
        institution.isStale ||
        institution.status === "failed" ||
        institution.status === "stale" ||
        institution.status === "revoked" ||
        isRepairablePlaidErrorCode(institution.errorCode)
      ),
    ),
  );
}

function isRepairablePlaidErrorCode(errorCode: string | null | undefined): boolean {
  return [
    "item-login-required",
    "invalid-credentials",
    "invalid-mfa",
    "item-locked",
    "mfa-not-supported",
    "user-setup-required",
    "invalid-access-token",
    "item-not-found",
    "user-permission-revoked",
    "user-account-revoked",
    "access-not-granted",
    "no-accounts",
  ].includes((errorCode ?? "").toLowerCase());
}

export function toAgentErrorPayload(error: unknown): AgentErrorPayload {
  if (error instanceof AgentUnavailableError) {
    if (isAgentOutputError(error)) {
      return {
        code: "invalid-agent-output",
        error: "AI returned an invalid response.",
        detail: error.detail,
        status: 502,
      };
    }

    return {
      code: error.code,
      error: error.message,
      detail: error.detail,
      status: error.status,
    };
  }

  const detail = getErrorDetail(error);

  if (isModelOutputValidationDetail(detail)) {
    return {
      code: "invalid-agent-output",
      error: "AI returned an invalid response.",
      detail,
      status: 502,
    };
  }

  return {
    code: "agent-error",
    error: "Agent failed.",
    detail,
    status: 500,
  };
}

function getErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeErrorDetail(error.message);
  }

  return "Unknown AI error.";
}

function isAgentOutputError(error: AgentUnavailableError): boolean {
  return error.status === 502 && (
    [
      "invalid-agent-output",
      "model-returned-invalid-final-output",
      "model-returned-invalid-guidance-card",
      "model-returned-disallowed-final-message",
      "model-promised-unsupported-card",
      "model-returned-no-prompt-chips",
      "model-returned-too-long-final-message",
    ].includes(error.code) ||
    isModelOutputValidationDetail(`${error.message} ${error.detail ?? ""}`)
  );
}

function isModelOutputValidationDetail(detail: string): boolean {
  return /invalid output type|schema validation|expected schema|too[_ -]?(?:big|long)|invalid final response|model[- ]output validation|final output schema|response validation|zoderror/i.test(
    detail,
  );
}

function sanitizeErrorDetail(detail: string): string {
  return detail.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 180);
}

export const __agentTestHooks = {
  createBroadChatFallbackFinalOutput,
  getForcedAgentTool,
  getUnsupportedCardPromise,
  guardVisibleFinalMessage,
  isNoToolChatOnlyPrompt,
  normalizeAgentFinalOutput,
  repairUnsupportedCardPromises,
  selectGuidanceCard,
  selectFinalResponseMode,
  selectVisibleModelOutput,
  selectPromptChips,
};
