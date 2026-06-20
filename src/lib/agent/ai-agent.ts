import { Agent, OpenAIProvider, Runner, tool, type AgentInputItem } from "@openai/agents";
import { z } from "zod";
import type {
  AgentCard,
  AgentClientAction,
  AgentPendingAction,
  AgentResponse,
  PromptChip,
} from "@/lib/agent/card-types";
import {
  type GuidanceCardDraft,
  validateGuidanceCardDraft,
} from "@/lib/agent/guidance-card";
import {
  AgentUnavailableError,
  getErrorDetail,
  isModelOutputValidationDetail,
  sanitizeErrorDetail,
} from "@/lib/agent/agent-errors";
import {
  agentFinalOutputSchema,
  agentResponseSchema,
} from "@/lib/agent/response-schema";
import {
  getOnboardingPromptChips,
  getSuggestedPrompts,
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
  getAvailablePromptChips,
  selectPromptChips,
} from "@/lib/agent/prompt-chip-selection";
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
import {
  createDeterministicSavingsGoalResponse,
  createDeterministicTrustPromptChips,
  createDeterministicUnavailableActionResponse,
  createSavingsGoalParameters,
  getSavingsGoalForcedTool,
  isSavingsGoalPrompt,
  updateSavingsGoalParameters,
} from "@/lib/agent/savings-goal-flow";
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
import {
  containsDisallowedFinalLanguage,
  getVisibleResponseSurfaceLimits,
  getUnsupportedCardPromise,
  guardVisibleFinalMessage,
  repairUnsupportedCardPromises,
} from "@/lib/agent/visible-response-guard";

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
export { AgentUnavailableError, toAgentErrorPayload } from "@/lib/agent/agent-errors";
export type { AgentErrorPayload } from "@/lib/agent/agent-errors";

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
  correctRecurringObligation?: (input: {
    merchantName: string;
    treatment: "bill" | "not_bill";
    expectedAmountCents?: number;
    expectedDay?: number;
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
const recurringObligationCorrectionParameters = z.object({
  merchant_name: z.string().min(1).max(120),
  treatment: z.enum(["bill", "not_bill"]),
  expected_amount_cents: z.number().int().positive().max(1_000_000).optional(),
  expected_day: z.number().int().min(1).max(31).optional(),
});
const bridgeVisibleLimits = getVisibleResponseSurfaceLimits("bridge");

export async function runAIAgent(
  input: RunAiAgentInput,
  runtime?: AgentRuntime,
): Promise<AgentResponse> {
  const deterministicNoToolResponse = createDeterministicNoToolResponse(input);

  if (deterministicNoToolResponse) {
    return deterministicNoToolResponse;
  }

  const deterministicPromptChipRefreshResponse = createDeterministicPromptChipRefreshResponse(input);

  if (deterministicPromptChipRefreshResponse) {
    return deterministicPromptChipRefreshResponse;
  }

  if (runtime) {
    return runtime.run(input);
  }

  const deterministicTrustResponse = createDeterministicTrustResponse(input);

  if (deterministicTrustResponse) {
    return deterministicTrustResponse;
  }

  const deterministicSavingsGoalResponse = isRetiredSavingsGoalProtectionPrompt(input)
    ? null
    : await createDeterministicSavingsGoalResponse(input);

  if (deterministicSavingsGoalResponse) {
    return deterministicSavingsGoalResponse;
  }

  const deterministicBillCorrectionResponse = await createDeterministicBillCorrectionResponse(input);

  if (deterministicBillCorrectionResponse) {
    return deterministicBillCorrectionResponse;
  }

  const deterministicConnectedAccountsResponse = await createDeterministicConnectedAccountsResponse(input);

  if (deterministicConnectedAccountsResponse) {
    return deterministicConnectedAccountsResponse;
  }

  const deterministicUnavailableActionResponse = isRetiredSavingsGoalProtectionPrompt(input)
    ? null
    : createDeterministicUnavailableActionResponse(input);

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

function createDeterministicPromptChipRefreshResponse(input: RunAiAgentInput): AgentResponse | null {
  if (input.requestKind !== "prompt_chips") {
    return null;
  }

  const context = createPipContext(input);
  const result = context.snapshot ? calculatePipCash(context.snapshot) : null;
  const promptChipPlan = selectPromptChips(
    {
      message: "Ready.",
      promptChips: [],
    },
    context,
    result,
    {
      input,
      cards: [],
      usedTools: [],
      isSupportedCardPrompt,
    },
  );

  if (promptChipPlan.chips.length < 3) {
    throw new AgentUnavailableError({
      code: "prompt-chip-refresh-unavailable",
      message: "Prompt chip refresh did not produce enough chips.",
      status: 502,
      detail: "Prompt chip refresh must include three prompt chips.",
    });
  }

  return agentResponseSchema.parse({
    message: "Ready.",
    cards: [],
    promptChips: promptChipPlan.chips,
    usedTools: [],
    responseMode: "chat_only",
    audit: {
      toolNames: [],
      usedModel: false,
      quality: {
        conversationJob: promptChipPlan.conversationJob,
        answerPatternId: "prompt-chip-refresh",
        chipFamilyIds: promptChipPlan.familyIds,
        repeatedJob: promptChipPlan.repeatedJob,
        repeatedTool: promptChipPlan.repeatedTool,
        repeatedCard: promptChipPlan.repeatedCard,
        repeatedMessage: false,
        repetitionAdjusted: false,
        chipFallbackReason: promptChipPlan.fallbackReason,
      },
    },
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

async function createDeterministicBillCorrectionResponse(
  input: RunAiAgentInput,
): Promise<AgentResponse | null> {
  const forcedTool = getForcedAgentTool(input);

  if (forcedTool?.toolName !== "correct_recurring_obligation") {
    return null;
  }

  const context = createPipContext(input);
  const toolInput = recurringObligationCorrectionParameters.parse(forcedTool.args);
  recordTool(context, "correct_recurring_obligation");
  const actionResult = input.actions?.correctRecurringObligation
    ? await input.actions.correctRecurringObligation({
        merchantName: toolInput.merchant_name,
        treatment: toolInput.treatment,
        expectedAmountCents: toolInput.expected_amount_cents,
        expectedDay: toolInput.expected_day,
      })
    : {
        ok: false,
        status: "bill_correction_unavailable",
        message: "Bill corrections are not available yet.",
      };
  const result = applyActionResult(context, actionResult);
  const billCopy = toolInput.treatment === "bill"
    ? `I’ll treat ${toolInput.merchant_name} as a monthly bill now.`
    : `I’ll stop treating ${toolInput.merchant_name} as a monthly bill.`;

  return buildAgentResponse(
    {
      message: result.ok
        ? `${billCopy} I’ll refresh today’s number with that correction.`
        : result.message ?? "I could not save that bill correction yet.",
      support: null,
      responseMode: "chat_only",
    },
    context,
    input,
    {
      usedModel: false,
    },
  );
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
      if (isRetiredToolName(decision.toolName)) {
        return undefined;
      }

      return {
        toolName: decision.toolName,
        args: decision.args,
        requireCard: decision.requireCard,
      };
    }
  }

  return getLegacyForcedAgentTool(input);
}

function isRetiredSavingsGoalProtectionPrompt(input: RunAiAgentInput): boolean {
  const forcedTool = getSavingsGoalForcedTool(input.message.trim(), normalizePrompt(input.message.trim()));

  return forcedTool?.toolName === "set_savings_goal_protection";
}

function isRetiredToolName(toolName: DeterministicAgentToolName): boolean {
  return toolName === "set_savings_goal_protection";
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

  if (savingsGoalTool && !isRetiredToolName(savingsGoalTool.toolName)) {
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

  const recurringCorrectionTool = getRecurringObligationCorrectionTool(message, normalized);

  if (recurringCorrectionTool) {
    return recurringCorrectionTool;
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
    tool<typeof recurringObligationCorrectionParameters, PipAgentContext>({
      name: "correct_recurring_obligation",
      description:
        "Persist a user's correction about whether a merchant should be treated as a monthly bill. Use when they say a merchant is a bill, is not a bill, or give the usual monthly amount for a bill.",
      parameters: recurringObligationCorrectionParameters,
      strict: true,
      async execute(input, runContext) {
        const context = getToolContext(runContext);
        const toolInput = getToolInput(
          context,
          "correct_recurring_obligation",
          input,
          recurringObligationCorrectionParameters,
        );
        recordTool(context, "correct_recurring_obligation");

        if (!context.actions?.correctRecurringObligation) {
          return {
            ok: false,
            status: "bill_correction_unavailable",
            message: "Bill corrections are not available yet.",
          };
        }

        return applyActionResult(context, await context.actions.correctRecurringObligation({
          merchantName: toolInput.merchant_name,
          treatment: toolInput.treatment,
          expectedAmountCents: toolInput.expected_amount_cents,
          expectedDay: toolInput.expected_day,
        }));
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
    "You are Pip, a warm daily money companion for the Pip app.",
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
    "Use soft, evidence-based pushback when the numbers conflict with the user's assumption. Use phrases like my read, I'd treat this as, the conservative move, this adds pressure, this looks stable, this looks tight, I would be careful with that, or I would not treat that as open room.",
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
    "You can help users manage connected accounts through tools. Use account tools when the user asks what accounts are connected, wants to add a bank/card, repair a connection, change selected accounts, or remove an institution.",
    "All active connected accounts count toward Spendable Cash Today. Do not offer account-level include, ignore, or savings-label controls.",
    "Account management stays chat-owned. Do not mention settings pages, dashboards, menus, tabs, or separate account screens.",
    "Use get_connected_accounts when the user asks what is connected, when an account/institution target is unclear, or when more than one target could match.",
    "Use start_new_account_connection for adding a new bank or card. Use repair_account_connection for reconnecting one stale or broken institution. Use start_account_selection_update for changing which accounts Pip can see at an existing institution.",
    "Use savings goal tools when the user wants to save for a trip, big purchase, emergency fund, or named goal.",
    "Use create_savings_goal when the user gives a target amount for a new goal. Use list_savings_goals when they ask what goals are tracked or want an update.",
    "Use update_savings_goal when the user changes progress, target amount, target date, monthly contribution, or status.",
    "Every active savings goal affects Spendable Cash Today. Do not offer a separate protection toggle for savings goals.",
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
    "If the user corrects whether a merchant is a monthly bill, subscription, recurring item, or not a bill, call correct_recurring_obligation. If the merchant name is missing, ask one short clarifying question.",
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
    `For this bridge response, the visible message must be ${bridgeVisibleLimits.maxWords} words or fewer and ${bridgeVisibleLimits.maxChars} characters or fewer.`,
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
              `Answer at a fifth-grade reading level. Use bridge limits: ${bridgeVisibleLimits.maxWords} words or fewer and ${bridgeVisibleLimits.maxChars} characters or fewer.`,
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
    isSupportedCardPrompt,
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
    maxChars: bridgeVisibleLimits.maxChars,
    maxWords: bridgeVisibleLimits.maxWords,
  });
  const guardedMessage = guardVisibleFinalMessage(visibleAnswer.message, cards, {
    surface: "bridge",
  });

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

function getRecurringObligationCorrectionTool(
  message: string,
  normalized: string,
): ForcedAgentTool | undefined {
  const treatment = getRecurringObligationCorrectionTreatment(normalized);

  if (!treatment) {
    return undefined;
  }

  const merchantName = extractRecurringObligationMerchantName(message, normalized, treatment);

  if (!merchantName) {
    return undefined;
  }

  const expectedAmountCents = extractExplicitPurchaseAmountCents(message) ?? undefined;

  return {
    toolName: "correct_recurring_obligation",
    args: {
      merchant_name: merchantName,
      treatment,
      ...(expectedAmountCents ? { expected_amount_cents: expectedAmountCents } : {}),
    },
    requireCard: false,
  };
}

function getRecurringObligationCorrectionTreatment(
  normalized: string,
): "bill" | "not_bill" | null {
  if (
    /\b(not|isn'?t|is not|wasn'?t|was not|don'?t|do not|stop)\b.{0,24}\b(bill|recurring|monthly charge|subscription)\b/.test(normalized) ||
    /\b(mark|treat|count)\b.{0,20}\b(not|as not)\b.{0,16}\b(bill|recurring|monthly charge|subscription)\b/.test(normalized)
  ) {
    return "not_bill";
  }

  if (
    /\b(treat|mark|count|set)\b.{0,28}\b(as )?(a )?(monthly )?(bill|recurring|subscription|monthly charge)\b/.test(normalized) ||
    /\b(is|was|should be)\b.{0,12}\b(a )?(monthly )?(bill|recurring|subscription|monthly charge)\b/.test(normalized) ||
    /\bbill is usually\b/.test(normalized)
  ) {
    return "bill";
  }

  return null;
}

function extractRecurringObligationMerchantName(
  message: string,
  normalized: string,
  treatment: "bill" | "not_bill",
): string | null {
  const patterns = treatment === "bill"
    ? [
        /\btreat\s+(.+?)\s+as\s+(?:a\s+)?(?:monthly\s+)?(?:bill|recurring|subscription|monthly charge)\b/i,
        /\bmark\s+(.+?)\s+as\s+(?:a\s+)?(?:monthly\s+)?(?:bill|recurring|subscription|monthly charge)\b/i,
        /\bcount\s+(.+?)\s+as\s+(?:a\s+)?(?:monthly\s+)?(?:bill|recurring|subscription|monthly charge)\b/i,
        /\bset\s+(.+?)\s+as\s+(?:a\s+)?(?:monthly\s+)?(?:bill|recurring|subscription|monthly charge)\b/i,
        /\b(.+?)\s+(?:is|was|should be)\s+(?:a\s+)?(?:monthly\s+)?(?:bill|recurring|subscription|monthly charge)\b/i,
        /\bmy\s+(.+?)\s+bill\s+is\s+usually\b/i,
      ]
    : [
        /\b(.+?)\s+(?:isn'?t|is not|wasn'?t|was not)\s+(?:a\s+)?(?:monthly\s+)?(?:bill|recurring|subscription|monthly charge)\b/i,
        /\bdon'?t\s+(?:treat|mark|count)\s+(.+?)\s+as\s+(?:a\s+)?(?:monthly\s+)?(?:bill|recurring|subscription|monthly charge)\b/i,
        /\bdo not\s+(?:treat|mark|count)\s+(.+?)\s+as\s+(?:a\s+)?(?:monthly\s+)?(?:bill|recurring|subscription|monthly charge)\b/i,
        /\bstop\s+(?:treating|marking|counting)\s+(.+?)\s+as\s+(?:a\s+)?(?:monthly\s+)?(?:bill|recurring|subscription|monthly charge)\b/i,
      ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    const merchantName = cleanRecurringObligationMerchantName(match?.[1]);

    if (merchantName) {
      return merchantName;
    }
  }

  return null;
}

function cleanRecurringObligationMerchantName(value: string | undefined): string | null {
  const cleaned = value
    ?.replace(/\b(my|the|a|an|that|this)\b/gi, " ")
    .replace(/\b(for|to)\s+\$?\d[\d,.]*\b/gi, " ")
    .replace(/\$\s*\d[\d,.]*/g, " ")
    .replace(/\b\d+(?:\.\d{1,2})?\s*(?:dollars?|bucks?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 2) {
    return null;
  }

  return cleaned.slice(0, 120);
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
  selectPromptChips: (
    parsed: Parameters<typeof selectPromptChips>[0],
    context: Parameters<typeof selectPromptChips>[1],
    result: Parameters<typeof selectPromptChips>[2],
    options: Omit<Parameters<typeof selectPromptChips>[3], "isSupportedCardPrompt">,
  ) => selectPromptChips(parsed, context, result, {
    ...options,
    isSupportedCardPrompt,
  }),
};
