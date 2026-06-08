import { Agent, OpenAIProvider, Runner, tool, type AgentInputItem } from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";
import type {
  AgentCard,
  AgentClientAction,
  AgentResponse,
  PromptChip,
} from "@/lib/agent/card-types";
import {
  agentFinalOutputSchema,
  agentMessageMaxChars,
  agentResponseSchema,
} from "@/lib/agent/response-schema";
import {
  getOnboardingPromptChips,
  getSuggestedPrompts,
  isRetiredDefaultPromptChip,
} from "@/lib/agent/suggested-prompts";
import { runAgentTool } from "@/lib/agent/tool-runner";
import type { SyncStatus } from "@/lib/data/sync-status";
import { fakeSnapshot } from "@/lib/fake-data";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { summarizeFreeCash } from "@/lib/free-cash/explanation";
import { formatMoney, formatMoneyWithCents } from "@/lib/money";
import type { FinancialSnapshot } from "@/lib/types";

export const FREE_CASH_AI_MODEL = "gpt-5-nano";
export const NETLIFY_AI_GATEWAY_MODEL = "gpt-5-nano";

type AiTransport = NonNullable<AgentResponse["audit"]["transport"]>;
type AgentFinalOutput = z.infer<typeof agentFinalOutputSchema>;

type OpenAIClientConfig = {
  apiKey?: string;
  baseURL?: string;
  transport: AiTransport;
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
};

export type SpendableAgentOnboardingState = {
  status: "guest" | "needs-consent" | "ready";
  email?: string;
  hasFinancialData: boolean;
  syncStatusSummary?: string | null;
};

export type SpendableAgentActionResult = {
  ok: boolean;
  status: string;
  message?: string;
  protectedSavingsMonthlyCents?: number;
  freeCashTodayCents?: number;
  clientActionType?: AgentClientAction["type"];
  clientAction?: AgentClientAction;
};

export type SpendableAgentActions = {
  saveProtectedSavings?: (input: {
    amountCents: number;
  }) => Promise<SpendableAgentActionResult>;
  startPlaidLink?: () => Promise<SpendableAgentActionResult>;
  refreshFinancialData?: () => Promise<SpendableAgentActionResult>;
  deleteUserData?: () => Promise<SpendableAgentActionResult>;
};

export type RunAiAgentInput = {
  message: string;
  requestKind?: "chat" | "prompt_chips";
  snapshot?: FinancialSnapshot;
  history?: AgentHistoryItem[];
  conversationState?: AgentConversationState;
  syncStatus?: SyncStatus | null;
  onboardingState?: SpendableAgentOnboardingState;
  selectedPromptChipId?: string;
  actions?: SpendableAgentActions;
};

export type AgentRuntime = {
  run: (input: RunAiAgentInput) => Promise<AgentResponse>;
};

// Kept as a compatibility alias for older tests/imports while the app migrates
// from the hand-rolled Responses router to the Agents SDK runtime.
export type OpenAIResponsesClient = AgentRuntime;

type SpendableAgentContext = {
  inputMessage: string;
  requestKind: "chat" | "prompt_chips";
  snapshot?: FinancialSnapshot;
  syncStatus?: SyncStatus | null;
  onboardingState: SpendableAgentOnboardingState;
  actions?: SpendableAgentActions;
  conversationState: Required<AgentConversationState>;
  forcedTool?: ForcedAgentTool;
  repair?: AgentResponseRepair;
  usedTools: string[];
  availableCards: AgentCard[];
  availablePromptChips: PromptChip[];
  clientAction?: AgentClientAction;
};

type DeterministicAgentToolName =
  | "get_onboarding_state"
  | "start_google_oauth"
  | "save_protected_savings"
  | "start_plaid_link"
  | "refresh_financial_data"
  | "request_delete_data_confirmation"
  | "delete_user_data"
  | "get_free_cash_snapshot"
  | "get_free_cash_drivers"
  | "get_spendable_cash_definition"
  | "get_spending_breakdown"
  | "get_recurring_activity"
  | "forecast_spendable_cash"
  | "simulate_purchase"
  | "get_recent_transactions"
  | "get_true_balances"
  | "get_data_quality"
  | "get_sync_status"
  | "get_free_cash_math"
  | "compose_insight_card";

type ForcedAgentTool = {
  toolName: DeterministicAgentToolName;
  args: unknown;
  requireCard: boolean;
};

type AgentResponseRepair = {
  reason: "invalid_final_output" | "disallowed_language" | "unsupported_promise";
  detail?: string;
};

const emptyToolParameters = z.object({});
const saveProtectedSavingsParameters = z.object({
  amount_cents: z.number().int().min(0).max(10_000_000),
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
  if (runtime) {
    return runtime.run(input);
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
    const context = createSpendableContext(input, repair);

    try {
      const agent = createSpendableAgent(context);
      const runner = createSpendableRunner();
      const result = await runner.run(agent, createAgentInput(input, context), {
        context,
        maxTurns: 5,
      });

      return buildAgentResponse(result.finalOutput, context, input, {
        usedModel: true,
        model: getFreeCashAiModel(),
        transport: getOpenAIClientConfig().transport,
      });
    } catch (error) {
      const agentError = toAgentUnavailableError(error);

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

function getForcedAgentTool(input: RunAiAgentInput): ForcedAgentTool | undefined {
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

  if (isGeneralSpendingQuestion(normalized) && isSpendingPrompt(normalized)) {
    return {
      toolName: "get_free_cash_snapshot",
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

  if (isExplicitMathPrompt(normalized)) {
    return {
      toolName: "get_free_cash_math",
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

  if (isAffirmativeFollowUpToForecast(normalized, input.history)) {
    return {
      toolName: "forecast_spendable_cash",
      args: {
        horizon_days: 14,
      },
      requireCard: true,
    };
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

  if (isExplicitFreeCashDriversPrompt(normalized)) {
    return {
      toolName: "get_free_cash_drivers",
      args: {},
      requireCard: true,
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
  onboardingState: SpendableAgentOnboardingState | undefined,
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

  return undefined;
}

function createSpendableAgent(context: SpendableAgentContext) {
  return new Agent<SpendableAgentContext, typeof agentFinalOutputSchema>({
    name: "PipAgent",
    instructions: createSpendableInstructions,
    model: getFreeCashAiModel(),
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
    tools: createSpendableTools(),
    outputType: agentFinalOutputSchema,
    toolUseBehavior: "run_llm_again",
  });
}

function createSpendableRunner() {
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

function createSpendableTools() {
  return [
    tool<typeof emptyToolParameters, SpendableAgentContext>({
      name: "get_onboarding_state",
      description:
        "Read the user's current Pip setup state, including whether they are signed in, need protected savings, need connected data, or already have financial data.",
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
    tool<typeof emptyToolParameters, SpendableAgentContext>({
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
    tool<typeof saveProtectedSavingsParameters, SpendableAgentContext>({
      name: "save_protected_savings",
      description:
        "Save the monthly protected savings amount. Use when the user gives a dollar amount for protected savings or chooses the default protected savings step.",
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
            message: "The user must sign in before protected savings can be saved.",
          };
        }

        return applyActionResult(context, await context.actions.saveProtectedSavings({
          amountCents: toolInput.amount_cents,
        }));
      },
    }),
    tool<typeof emptyToolParameters, SpendableAgentContext>({
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
            message: "The user must choose protected savings before Plaid can open.",
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
    tool<typeof emptyToolParameters, SpendableAgentContext>({
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
    tool<typeof emptyToolParameters, SpendableAgentContext>({
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
    tool<typeof emptyToolParameters, SpendableAgentContext>({
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
    tool<typeof emptyToolParameters, SpendableAgentContext>({
      name: "get_free_cash_snapshot",
      description:
        "Read the current deterministic Spendable Cash Today snapshot. Use for financial facts when a card is not necessarily needed.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_free_cash_snapshot");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const result = calculateFreeCash(snapshot);

        return {
          metricName: "Spendable Cash Today",
          freeCashToday: formatMoney(result.freeCashTodayCents),
          freeCashTodayCents: result.freeCashTodayCents,
          rollingNet: formatMoney(result.rollingNetCents),
          rollingNetCents: result.rollingNetCents,
          window: result.window,
          warningCount: result.warnings.length,
          dataStateCount: result.dataStates.length,
          suggestedPrompts: getSuggestedPrompts(result),
        };
      },
    }),
    tool<typeof emptyToolParameters, SpendableAgentContext>({
      name: "get_free_cash_drivers",
      description:
        "Get the deterministic drivers behind Spendable Cash Today and make the explanation card available. Use when the user asks why, what changed, or what is behind the number.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_free_cash_drivers");
        const snapshot = context.snapshot;

        if (!snapshot) {
          return noFinancialDataToolResult(context);
        }

        const response = runAgentTool("explain_free_cash", {}, snapshot);
        const result = calculateFreeCash(snapshot);
        addAvailableCards(context, response.cards);

        return {
          metricName: "Spendable Cash Today",
          freeCashToday: formatMoney(result.freeCashTodayCents),
          summary: summarizeFreeCash(result),
          drivers: response.cards[0]?.type === "free_cash_explanation" ? response.cards[0].drivers : [],
          warnings: result.warnings,
          dataStates: result.dataStates,
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
        };
      },
    }),
    tool<typeof insightCardParameters, SpendableAgentContext>({
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
    tool<typeof emptyToolParameters, SpendableAgentContext>({
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

        const result = calculateFreeCash(snapshot);

        return {
          metricName: "Spendable Cash Today",
          currentValue: formatMoney(result.freeCashTodayCents),
          definition:
            "Spendable Cash Today is the daily amount left after recent income, recent spending, refunds, and protected savings are counted.",
          risesWhen: [
            "income or refunds enter the rolling month",
            "old spending leaves the rolling month",
            "protected savings goes down",
          ],
          fallsWhen: [
            "spending or bills enter the rolling month",
            "old income leaves the rolling month",
            "protected savings goes up",
          ],
          suggestedPrompts: getSuggestedPrompts(result),
        };
      },
    }),
    tool<typeof emptyToolParameters, SpendableAgentContext>({
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
    tool<typeof emptyToolParameters, SpendableAgentContext>({
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
    tool<typeof forecastParameters, SpendableAgentContext>({
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
    tool<typeof simulatePurchaseParameters, SpendableAgentContext>({
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

        return {
          amountCents: toolInput.amount_cents,
          amount: formatMoney(toolInput.amount_cents),
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
          simulation:
            card?.type === "purchase_simulation"
              ? {
                  before: formatMoney(card.beforeCents),
                  afterToday: formatMoney(card.afterTodayCents),
                  monthlyAverageAfter: formatMoney(card.monthlyAverageAfterCents),
                }
              : null,
        };
      },
    }),
    tool<typeof recentTransactionsParameters, SpendableAgentContext>({
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
    tool<typeof emptyToolParameters, SpendableAgentContext>({
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
    tool<typeof emptyToolParameters, SpendableAgentContext>({
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
        const result = calculateFreeCash(snapshot);
        addAvailableCards(context, response.cards);

        return {
          warningCount: result.warnings.length,
          warnings: result.warnings,
          dataStates: result.dataStates,
          accountCount: snapshot.accounts.length,
          transactionCount: snapshot.transactions.length,
          syncStatus: formatSyncStatus(context.syncStatus),
          availableCards: response.cards,
          suggestedPrompts: response.promptChips,
        };
      },
    }),
    tool<typeof emptyToolParameters, SpendableAgentContext>({
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
    tool<typeof emptyToolParameters, SpendableAgentContext>({
      name: "get_free_cash_math",
      description:
        "Get the deterministic math breakdown behind Spendable Cash Today. Use only when the user explicitly asks for math, formula, or calculation details.",
      parameters: emptyToolParameters,
      strict: true,
      execute(_input, runContext) {
        const context = getToolContext(runContext);
        recordTool(context, "get_free_cash_math");
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

function createSpendableInstructions(runContext: {
  context: SpendableAgentContext;
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
        "Generate exactly 3 fresh promptChips based on onboarding state, financial context, recent cards, recent tools, and recent prompt chips.",
        "Use concrete, varied next-step ideas. Avoid generic repeats.",
        "For chip labels, prefer short nouns like Upcoming bills, Missing card, Next few days, Payday impact, or Show trend.",
        "Do not use chip labels that start with Discuss. Do not suggest snapshot or view chips.",
        "For chip prompts, write a direct user request. Do not start with Let's discuss unless there is no matching Pip card.",
      ].join("\n")
    : "";

  return [
    "You are Pip, a calm financial assistant for the Pip app.",
    "You speak as Pip in first person. Say I, me, and my when you describe what you do.",
    "Never describe yourself in third person in visible replies. Do not say Pip does, Pip can, Pip will, Pip helps, or Pip shows.",
    "For financial answers, prefer first-person verbs like I found, I see, I counted, or I can.",
    "Do not start financial answers with 'Spendable Cash Today is'. Start from what you found or see.",
    "This is your single-screen app with a top Spendable Cash Today number, temporary cards, prompt chips, and this chat input.",
    "Your job is to explain Spendable Cash Today and help users make simple spending decisions.",
    "Use Spendable Cash Today for the top daily metric. Do not say Free Cash in visible replies.",
    "There is no dashboard, dashboard page, budget page, transaction page, tab view, or separate area to send the user to.",
    "Do not mention dashboards, pages, tabs, sections, navigation, budgeting apps, expense tracking, or financial planning.",
    "Never calculate money yourself. Use tools for any current financial fact, balance, transaction, driver, data-quality status, or purchase simulation.",
    "Use tools for setup and account actions. Do not pretend an action happened unless the matching tool returned ok.",
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
    "If the user asks why the number changed, why this number, what drives Spendable Cash Today, or asks for drivers, call get_free_cash_drivers directly.",
    "Do not ask whether they want drivers, math, or a summary when they already asked why or asked for drivers.",
    "For why or what-changed answers, use a short first-person sentence like: I found $X for today. The biggest factors are income, spending, protected savings, rent, and refunds.",
    "For medium-complex explanations like payday impact, paycheck impact, deposit impact, or factors affecting today's number, call compose_insight_card and let the card carry the detail.",
    "The compose_insight_card tool is the only way to create insight cards. Do not invent card rows or UI in the final answer.",
    "If the user asks what Spendable Cash Today means, how Pip works, or what makes the number rise or fall, call get_spendable_cash_definition.",
    "If the user asks for a trend, forecast, projection, or next-days view, call forecast_spendable_cash.",
    "If the user asks about recurring bills, subscriptions, monthly charges, or likely upcoming repeats, call get_recurring_activity.",
    "If the user asks for a complete, item, category, merchant, income, spending, refund, or card-payment breakdown, call get_spending_breakdown.",
    "Only ask for an amount when the user is clearly asking you to simulate or test a specific purchase but did not provide the amount.",
    "For general spend questions without an amount, call get_free_cash_snapshot. Explain what the number signals, but do not give a max spend limit.",
    "For purchase simulations, answer directly from the tool result. If afterToday is negative, say 'You can, but it would put you $X over today.' If afterToday is not negative, say what would be left today.",
    "If the user asks generally whether negative Spendable Cash Today means they cannot spend money, use get_free_cash_snapshot and explain the signal conversationally without treating it as a purchase simulation.",
    "Negative Spendable Cash Today is a warning about today's signal; it does not literally mean every dollar of spending is impossible.",
    "Only call get_recent_transactions when the user plainly asks to show, list, or identify transactions, charges, purchases, or recent activity.",
    "Do not call get_recent_transactions for general why, math, negative Spendable Cash Today, or can-I-spend questions.",
    "Prefer a short answer plus a structured card. For card answers, keep your sentence short and let the card carry the detail.",
    "When a card is returned, write one short bridge sentence. Do not duplicate the card rows in chat.",
    "Cards are optional. Prefer conversational explanation after the first card.",
    "Do not repeat a card whose type is listed in recent_card_types unless the user clearly asks to see that card, details, or breakdown again.",
    "Tools create any cards. You do not emit card data or card selectors in the final answer.",
    "Do not invent card data, rows, balances, merchants, dates, or transaction details.",
    "Only say show, list, pull, view, card, trend view, forecast, or breakdown when a matching tool returned a card in this same turn.",
    "For broad finance topics without a matching Pip card, say we can talk through it or discuss it. Do not promise to show data.",
    "Forecasts are pattern guesses only. If mentioning a forecast caveat, use one short sentence: Forecast only; not guaranteed.",
    "Do not use guarantee language except the exact forecast caveat phrase: not guaranteed.",
    "Use at most one card unless the user explicitly asks for multiple details.",
    "Never use guaranteed-spending language, affordability claims, recommendations, or tell the user what they should buy.",
    `Never say ${["safe", "to", "spend"].join(" ")}, safe to buy, you can afford, I recommend, financial advice, or financial advisor.`,
    "Do not moralize, shame, praise, or use motivational wellness language.",
    "Do not use emojis by default.",
    "Do not use stock template phrasing like 'Here is...' as the whole reply. Respond to the user's exact wording and current conversation.",
    "Write at a fifth-grade reading level.",
    "Keep visible replies to one short sentence when possible, two short sentences max.",
    "The message must be 35 words or fewer and 220 characters or fewer.",
    "Use common words. Avoid formal phrases like deterministic, rolling-window pattern, liquidity, optimal, analyze, or sufficient.",
    "Never use k shorthand for money. Say $210, not $0.21k.",
    "For card answers, let the card carry the detail. The message should only tell the user what the card is showing.",
    "Do not end card answers with a follow-up question. Prompt chips handle next steps.",
    "Generate up to 3 fresh promptChips that fit the current state and conversation.",
    "Do not use these retired default prompt chips: Why this number?, Can I spend $50?, What changed?",
    "Prompt chip labels should be 2 to 5 simple words. Prompt text should sound like a natural next user message.",
    "Do not return the exact same chip set every time. Avoid generic repeats when the user just asked a specific question.",
    "Use protected setup chip ids only when the chip clearly starts that exact setup step: get-signed-up, connect-data, use-default-savings, set-250-savings.",
    "For normal suggested questions, use ids that start with ai-.",
    "Return only structured output matching the schema, including promptChips.",
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
  context: SpendableAgentContext,
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
              `Answer at a fifth-grade reading level. Use 35 words or fewer and ${agentMessageMaxChars} characters or fewer.`,
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

function createSpendableContext(
  input: RunAiAgentInput,
  repair?: AgentResponseRepair,
): SpendableAgentContext {
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

  const result = calculateFreeCash(snapshot);

  return {
    spendableCashToday: formatMoney(result.freeCashTodayCents),
    isNegative: result.freeCashTodayCents < 0,
    topDrivers: result.drivers.slice(0, 4).map((driver) => driver.label),
    warningLabels: result.warnings.map((warning) => warning.label),
    hasMissingCardWarning: result.warnings.some((warning) => warning.id === "missing-card"),
    windowEndDate: result.window.endDate,
  };
}

function getToolContext(runContext?: { context?: SpendableAgentContext }): SpendableAgentContext {
  if (!runContext?.context) {
    throw new Error("Spendable agent context is missing.");
  }

  return runContext.context;
}

function recordTool(context: SpendableAgentContext, toolName: string) {
  context.usedTools.push(toolName);
}

function addAvailableCards(context: SpendableAgentContext, cards: AgentCard[]) {
  context.availableCards.push(...cards);
}

function setClientAction(
  context: SpendableAgentContext,
  clientAction: AgentClientAction,
): SpendableAgentActionResult {
  context.clientAction = clientAction;

  return {
    ok: true,
    status: clientAction.type,
    clientActionType: clientAction.type,
  };
}

function applyActionResult(
  context: SpendableAgentContext,
  result: SpendableAgentActionResult,
): SpendableAgentActionResult {
  const { clientAction, ...safeResult } = result;

  if (clientAction && clientAction.type !== "none") {
    context.clientAction = clientAction;
  }

  return {
    ...safeResult,
    clientActionType: clientAction?.type ?? result.clientActionType,
  };
}

function noFinancialDataToolResult(context: SpendableAgentContext) {
  return {
    ok: false,
    status: "no_financial_data",
    onboardingState: context.onboardingState,
    message: "Financial data is not connected yet.",
  };
}

function getToolInput<T extends z.ZodTypeAny>(
  context: SpendableAgentContext,
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
  context: SpendableAgentContext,
  input: RunAiAgentInput,
  audit: {
    usedModel: boolean;
    model?: string;
    transport?: AiTransport;
  },
): AgentResponse {
  const parsed = parseAgentFinalOutput(finalOutput);
  const usedTools = uniqueStrings(context.usedTools);
  const cards = input.requestKind === "prompt_chips" ? [] : selectDeterministicCards(parsed, context, input);
  const result = context.snapshot ? calculateFreeCash(context.snapshot) : null;
  const promptChips = selectPromptChips(parsed, context, result);
  const responseMode =
    input.requestKind === "prompt_chips"
      ? "chat_only"
      : cards.length === 0 && parsed.responseMode === "show_card"
        ? usedTools.length > 0
          ? "update_context"
          : "chat_only"
        : cards.length > 0 && context.forcedTool?.requireCard
          ? "show_card"
          : parsed.responseMode;

  if (input.requestKind === "prompt_chips" && promptChips.length < 3) {
    throw new AgentUnavailableError({
      code: "model-returned-no-prompt-chips",
      message: "AI did not return enough prompt chips.",
      status: 502,
      detail: "Prompt chip refresh must include three prompt chips.",
    });
  }

  const guardedMessage = guardVisibleFinalMessage(parsed.message, cards);

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
    },
  });
}

function parseAgentFinalOutput(finalOutput: unknown): AgentFinalOutput {
  try {
    return agentFinalOutputSchema.parse(finalOutput);
  } catch (error) {
    throw new AgentUnavailableError({
      code: "model-returned-invalid-final-output",
      message: "AI returned an invalid final response.",
      status: 502,
      detail: getErrorDetail(error),
      cause: error,
    });
  }
}

function selectDeterministicCards(
  parsed: AgentFinalOutput,
  context: SpendableAgentContext,
  input: RunAiAgentInput,
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
  const selected = uniqueCardsByType([...forcedCards, ...fallbackCards]);
  const suppressExplanation =
    wasCardRecentlyShown(input.conversationState, "free_cash_explanation") &&
    !explicitlyRequestsRepeatedCard(input.message);
  const suppressTransactions = !explicitlyRequestsTransactions(input.message);

  return selected
    .filter((card) => !(suppressExplanation && card.type === "free_cash_explanation"))
    .filter((card) => !(suppressTransactions && card.type === "recent_transactions"))
    .slice(0, wantsMultipleCards ? 3 : 1);
}

function selectPromptChips(
  parsed: AgentFinalOutput,
  context: SpendableAgentContext,
  result: ReturnType<typeof calculateFreeCash> | null,
) : PromptChip[] {
  const fallback = result ? [] : getOnboardingPromptChips(context.onboardingState);
  const generated = sanitizeGeneratedPromptChips(parsed.promptChips, context);

  return mergeGeneratedPromptChips(generated, fallback);
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
  context: SpendableAgentContext,
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
  context: SpendableAgentContext,
  index: number,
): PromptChip | null {
  const label = cleanPromptChipText(chip.label, 36);
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
  context: SpendableAgentContext,
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
  return (
    isExplicitForecastPrompt(normalized) ||
    isExplicitRecurringPrompt(normalized) ||
    isExplicitSpendingBreakdownPrompt(normalized) ||
    isExplicitTransactionsPrompt(normalized) ||
    isExplicitBalancesPrompt(normalized) ||
    isExplicitMathPrompt(normalized) ||
    isExplicitFreeCashDriversPrompt(normalized) ||
    isFlexibleFreeCashDriversPrompt(normalized) ||
    isPaydayImpactPrompt(normalized) ||
    isSpendableFactorsInsightPrompt(normalized) ||
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
  context: SpendableAgentContext,
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
  onboardingState: SpendableAgentOnboardingState;
}): PromptChip[] {
  if (input.snapshot) {
    return [];
  }

  return getOnboardingPromptChips(input.onboardingState);
}

function guardVisibleFinalMessage(message: string, cards: AgentCard[] = []): string {
  if (countWords(message) > 35) {
    throw new AgentUnavailableError({
      code: "model-returned-too-long-final-message",
      message: "AI returned a response that was too long for Pip.",
      status: 502,
      detail: "Visible replies must be 35 words or fewer.",
    });
  }

  const disallowedLanguage = getDisallowedFinalLanguageDetail(message);

  if (disallowedLanguage) {
    const repairedMessage = repairDisallowedFinalLanguageText(message, disallowedLanguage);

    if (
      repairedMessage &&
      countWords(repairedMessage) <= 35 &&
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
      countWords(repairedMessage) <= 35 &&
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
    const repairedMessage = repairUnsupportedCardPromiseText(message, unsupportedPromise);

    if (
      repairedMessage &&
      countWords(repairedMessage) <= 35 &&
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

function repairDisallowedFinalLanguageText(message: string, detail: string): string | null {
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
      .replace(/\bforecast\b/gi, "possible pattern")
      .replace(/\btrend view\b/gi, "trend")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail === "breakdown promised without breakdown card") {
    const repaired = message
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

  if (detail !== "card promised without card") {
    return null;
  }

  const repaired = message
    .replace(/\bshow( me)? (your )?credit card options\b/gi, "talk through credit card options")
    .replace(/\bshow( me)? (your )?card options\b/gi, "talk through card options")
    .replace(/\bshow( me)? (some )?credit cards\b/gi, "talk through credit cards")
    .replace(/\bshow( me)? (some )?cards\b/gi, "talk through cards")
    .replace(/\bview (your )?credit card options\b/gi, "talk through credit card options")
    .replace(/\bview (your )?card options\b/gi, "talk through card options")
    .replace(/\b(show|view|pull|list)( me)? (your )?card (options|choices|types|ideas|offers|details|use|usage)\b/gi, "talk through credit card $4")
    .replace(/\b(show|view|pull|list)( me)? (your )?cards\b/gi, "talk through credit cards")
    .replace(/\bcard (options|choices|types|ideas|offers|details|use|usage)\b/gi, "credit card $1")
    .replace(/\s+/g, " ")
    .trim();

  return repaired === message ? null : repaired;
}

function getUnsupportedCardPromise(message: string, cards: AgentCard[]): string | null {
  const normalized = message.toLowerCase().replace(/[\u2018\u2019]/g, "'");

  if (!containsDisplayPromise(normalized)) {
    return null;
  }

  if (isNoDataCardRefusal(normalized)) {
    return null;
  }

  if (isSuggestionMenuResponse(normalized)) {
    return null;
  }

  if (/\b(forecast|project(?:ion)?|trend|trend view|next \d+\s*days?)\b/.test(normalized)) {
    return hasCard(cards, "spendable_cash_forecast") ? null : "forecast promised without forecast card";
  }

  if (/\b(recurring|repeating|subscription|subscriptions|monthly charges?|bills? coming up|upcoming bills?)\b/.test(normalized)) {
    return hasAnyCard(cards, ["recurring_activity", "spendable_cash_forecast"])
      ? null
      : "recurring activity promised without recurring card";
  }

  if (/\b(breakdown|categories|merchants|card payments?)\b/.test(normalized)) {
    return hasAnyCard(cards, ["spending_breakdown", "free_cash_explanation", "math_breakdown", "insight_card"])
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
    /\b(?:this|the) cards?\b|\bcards?\s+(?:view|options|details|data)\b|\b(?:show|view|pull|list)\b.{0,40}\bcards?\b|\bcards?\b.{0,20}\b(?:shown|below)\b/;

  if (appCardPromisePattern.test(normalizedWithoutCreditCardTopic)) {
    return cards.length > 0 ? null : "card promised without card";
  }

  if (/\b(showing|shown|showed|this card|the card|the view|trend view)\b/.test(normalized)) {
    return cards.length > 0 ? null : "display promised without card";
  }

  return null;
}

function isNoDataCardRefusal(normalized: string): boolean {
  const noDataContext =
    /\b(no data|no financial data|not connected|haven't connected|have not connected|data isn't connected|data is not connected|without connected data|until .*connect(?:ed)? data)\b/.test(normalized);
  const refusalVerb =
    /\b(can'?t|cannot|unable|not able|don't|do not|won't|will not)\b.{0,90}\b(show|list|pull|view|forecast|break ?down|see|simulate|check)\b/.test(normalized);
  const displaySubject =
    /\b(forecast|breakdown|transactions?|subscriptions?|recurring|activity|charges?|purchases?|math|balances?|drivers?|card payments?)\b/.test(normalized);

  return displaySubject && (noDataContext || refusalVerb);
}

function isSuggestionMenuResponse(normalized: string): boolean {
  return /\b(you can ask|you could ask|try asking|ask me about|want to ask|if you want|pick a chip|choose a chip|tap a chip|tell me a dollar amount)\b/.test(normalized);
}

function containsDisplayPromise(normalized: string): boolean {
  return /\b(show|showing|shown|showed|list|listed|pull|pulled|view|card|cards|here is|here are)\b/.test(normalized) ||
    /\btrend view\b/.test(normalized) ||
    (
      /\b(breakdown|forecast|projection|projected)\b/.test(normalized) &&
      /\b(show|showing|shown|showed|list|listed|pull|pulled|view|card|cards|here is|here are)\b/.test(normalized)
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
    [/\bdashboard\b/, "dashboard"],
    [/\bfree cash\b/, "free cash"],
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

  return new AgentUnavailableError({
    code: "openai-request-failed",
    message: "AI request failed.",
    detail: getErrorDetail(error),
    cause: error,
  });
}

function shouldRetryFinalOutput(error: AgentUnavailableError): boolean {
  if (
    error.code === "model-returned-invalid-final-output" ||
    error.code === "model-returned-disallowed-final-message" ||
    error.code === "model-promised-unsupported-card" ||
    error.code === "model-returned-no-prompt-chips" ||
    error.code === "model-returned-too-long-final-message"
  ) {
    return true;
  }

  const detail = `${error.message} ${error.detail ?? ""}`;

  return /invalid output type|schema validation|expected schema|too (?:big|long)|invalid final response/i.test(
    detail,
  );
}

function createAgentResponseRepair(error: AgentUnavailableError): AgentResponseRepair {
  return {
    reason:
      error.code === "model-returned-disallowed-final-message"
        ? "disallowed_language"
        : error.code === "model-promised-unsupported-card"
          ? "unsupported_promise"
        : "invalid_final_output",
    detail: error.detail ? sanitizeErrorDetail(error.detail) : sanitizeErrorDetail(error.message),
  };
}

export function createOpenAIClient(config: OpenAIClientConfig = getOpenAIClientConfig()): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
}

export function shouldUseModel(): boolean {
  return (
    Boolean(process.env.NETLIFY_AI_GATEWAY_BASE_URL && process.env.NETLIFY_AI_GATEWAY_KEY) ||
    Boolean(process.env.OPENAI_API_KEY) ||
    Boolean(process.env.OPENAI_BASE_URL)
  );
}

export function getFreeCashAiModel(env: Record<string, string | undefined> = process.env): string {
  if (env.FREE_CASH_AI_MODEL) {
    return env.FREE_CASH_AI_MODEL;
  }

  if (isNetlifyAiGatewayConfigured(env) || env.OPENAI_BASE_URL) {
    return NETLIFY_AI_GATEWAY_MODEL;
  }

  return FREE_CASH_AI_MODEL;
}

export function getOpenAIApiKeyForSdk(env: Record<string, string | undefined> = process.env): string | undefined {
  return getOpenAIClientConfig(env).apiKey;
}

export function getOpenAIClientConfig(
  env: Record<string, string | undefined> = process.env,
): OpenAIClientConfig {
  if (isNetlifyAiGatewayConfigured(env)) {
    return {
      apiKey: env.NETLIFY_AI_GATEWAY_KEY,
      baseURL: env.NETLIFY_AI_GATEWAY_BASE_URL,
      transport: "netlify-ai-gateway",
    };
  }

  if (env.OPENAI_BASE_URL) {
    return {
      apiKey: env.OPENAI_API_KEY || "netlify-ai-gateway",
      baseURL: env.OPENAI_BASE_URL,
      transport:
        env.FREE_CASH_AI_TRANSPORT === "custom-openai-compatible"
          ? "custom-openai-compatible"
          : "netlify-ai-gateway",
    };
  }

  return {
    apiKey: env.OPENAI_API_KEY,
    transport: "openai-direct",
  };
}

function isNetlifyAiGatewayConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.NETLIFY_AI_GATEWAY_BASE_URL && env.NETLIFY_AI_GATEWAY_KEY);
}

export function getFreeCashAiTransport(
  env: Record<string, string | undefined> = process.env,
): AiTransport {
  return getOpenAIClientConfig(env).transport;
}

function normalizePrompt(message: string): string {
  return message
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isExplicitFreeCashDriversPrompt(normalized: string): boolean {
  return (
    normalized === "why this number" ||
    normalized === "what changed" ||
    /^(show( me)? )?(the )?(free cash )?drivers( behind (this|the) number)?$/.test(normalized) ||
    /^(show( me)? )?(the )?(spendable cash|free cash )?drivers?$/.test(normalized)
  );
}

function isFlexibleFreeCashDriversPrompt(normalized: string): boolean {
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
    !isPaydayImpactPrompt(normalized)
  );
}

function isDataQualityPrompt(normalized: string): boolean {
  return /\b(missing card|missing data|data missing|connect(ed)? data|repair data|stale data|data quality)\b/.test(
    normalized,
  );
}

function isSpendableCashDefinitionPrompt(normalized: string): boolean {
  return (
    /\bwhat is spendable cash\b/.test(normalized) ||
    /\bwhat is spendable cash today\b/.test(normalized) ||
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
    /\b(recurring|repeating|repeat|subscription|subscriptions|bills? coming up|monthly charges?|upcoming bills?)\b/.test(normalized) ||
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

function isAffirmativeFollowUpToForecast(
  normalized: string,
  history: AgentHistoryItem[] | undefined,
): boolean {
  if (!/^(yes|yeah|yep|ok|okay|sure|do that|yes do that|show me|please do|that)$/.test(normalized)) {
    return false;
  }

  return (history ?? []).slice(-4).some((item) => {
    const content = normalizePrompt(item.content);

    return isExplicitForecastPrompt(content) || /\b(trend line|daily amounts|forecast|next week|7 days|14 days)\b/.test(content);
  });
}

function isExplicitTransactionsPrompt(normalized: string): boolean {
  return /^(show( me| my)? )?(recent )?(transactions?|activity|charges?|purchases?)$/.test(
    normalized,
  );
}

function isExplicitBalancesPrompt(normalized: string): boolean {
  return (
    /^(show( me| my)? )?((true|real|actual|account) )?balances?$/.test(normalized) ||
    /^what are my (true|real|actual|account) balances?$/.test(normalized)
  );
}

function isSpendingPrompt(normalized: string): boolean {
  return /\b(spend|buy|purchase|order|afford|pay|cost)\b/.test(normalized);
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

  if (/\b(spend|buy|purchase|order|afford|pay|cost)\b/.test(before)) {
    score += 8;
  }

  if (/\b(what about|how about|instead|rather|does|do to|leave|would)\b/.test(before)) {
    score += 5;
  }

  if (/\b(spend|buy|purchase|order|afford|pay|cost|instead|today)\b/.test(after)) {
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
      (institution.status === "revoked" || isRepairablePlaidErrorCode(institution.errorCode)),
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
    return {
      code: error.code,
      error: error.message,
      detail: error.detail,
      status: error.status,
    };
  }

  return {
    code: "agent-error",
    error: "Agent failed.",
    detail: getErrorDetail(error),
    status: 500,
  };
}

function getErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeErrorDetail(error.message);
  }

  return "Unknown AI error.";
}

function sanitizeErrorDetail(detail: string): string {
  return detail.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 180);
}

export const __agentTestHooks = {
  getForcedAgentTool,
  guardVisibleFinalMessage,
  selectPromptChips,
};
