import type { AgentResponse } from "@/lib/agent/card-types";
import {
  FREE_CASH_AI_MODEL,
  getFreeCashAiTransport,
  type AgentRuntime,
  type RunAiAgentInput,
} from "@/lib/agent/ai-agent";
import { getOnboardingPromptChips, getSuggestedPrompts } from "@/lib/agent/suggested-prompts";
import { runAgentTool } from "@/lib/agent/tool-runner";
import { fakeSnapshot } from "@/lib/fake-data";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { formatMoney } from "@/lib/money";

export function createMockModelClient(): AgentRuntime {
  return {
    async run(input) {
      return createMockResponse(input);
    },
  };
}

function createMockResponse(input: RunAiAgentInput): AgentResponse {
  const snapshot = input.snapshot ?? fakeSnapshot;
  const result = calculateFreeCash(snapshot);
  const normalized = input.message.trim().toLowerCase();
  const amountCents = extractDollarAmount(input.message);

  if (input.selectedPromptChipId === "get-signed-up") {
    return baseResponse(input, {
      message: "I’ll send you to Google to start.",
      usedTools: ["start_google_oauth"],
      clientAction: {
        type: "oauth_redirect",
        url: "/api/auth/oauth/google",
      },
    });
  }

  if (
    input.selectedPromptChipId === "use-default-savings" ||
    input.selectedPromptChipId === "set-250-savings"
  ) {
    return baseResponse(input, {
      message: "I saved that amount and will reload setup.",
      usedTools: ["save_protected_savings"],
      clientAction: {
        type: "reload",
      },
    });
  }

  if (input.selectedPromptChipId === "connect-data") {
    const guest = input.onboardingState?.status === "guest";

    return baseResponse(input, {
      message: guest ? "I’ll send you to Google first." : "I’ll open Plaid now.",
      usedTools: [guest ? "start_google_oauth" : "start_plaid_link"],
      clientAction: guest
        ? {
            type: "oauth_redirect",
            url: "/api/auth/oauth/google",
          }
        : {
            type: "open_plaid",
            plaid: {
              kind: "plaid",
              linkToken: "link-sandbox-test",
              environment: "sandbox",
              products: ["transactions"],
              mode: "connect",
            },
          },
    });
  }

  if (/^(hi|hello|hey|yo)\b/.test(normalized)) {
    return baseResponse(input, {
      message: "Hi. Ask me about Spendable Cash or setup.",
    });
  }

  if (isSpendingPrompt(normalized)) {
    if (amountCents === null) {
      if (/\b(any|money|at all|negative)\b/.test(normalized)) {
        return baseResponse(input, {
          message: "Spendable Cash is a signal, not a hard limit.",
          usedTools: ["get_free_cash_snapshot"],
        });
      }

      return baseResponse(input, {
        message: "Tell me the purchase amount to test.",
        responseMode: "clarify",
      });
    }

    return toolResponse(input, "simulate_purchase", { amount_cents: amountCents });
  }

  if (isShortPurchaseFollowUp(normalized, input.history) && amountCents !== null) {
    return toolResponse(input, "simulate_purchase", { amount_cents: amountCents });
  }

  if (/\bbalances?\b|actual balance|true balance/.test(normalized)) {
    return toolResponse(input, "show_true_balances", {});
  }

  if (/\b(forecast|project|projection|trend|tomorrow|next day|next week|next \d+\s*days?)\b/.test(normalized)) {
    return toolResponse(input, "show_spendable_cash_forecast", {
      horizon_days: extractForecastHorizonDays(normalized),
    });
  }

  if (
    /^(yes|yeah|yep|ok|okay|sure|do that|yes do that|show me|please do|that)$/.test(normalized) &&
    input.history?.slice(-4).some((item) =>
      /\b(trend line|daily amounts|forecast|next week|7 days|14 days)\b/.test(item.content.toLowerCase()),
    )
  ) {
    return toolResponse(input, "show_spendable_cash_forecast", {
      horizon_days: 14,
    });
  }

  if (/\b(recurring|repeating|subscription|subscriptions|bills? coming up|monthly charges?|upcoming bills?|youtube|premium)\b/.test(normalized)) {
    return toolResponse(input, "show_recurring_activity", {});
  }

  if (/\b(complete|full|item|category|merchant|spending|income|refund|card payment|payments?)\b.*\bbreakdown\b/.test(normalized)) {
    return toolResponse(input, "show_spending_breakdown", {});
  }

  if (/\btransactions?\b|\brecent\b|\bcharges?\b|\bactivity\b/.test(normalized)) {
    return toolResponse(input, "show_recent_transactions", { limit: 6 });
  }

  if (/\bmath\b|\bformula\b|\bcalculation\b/.test(normalized)) {
    return toolResponse(input, "show_math", {});
  }

  if (/\bwhy\b|\bchanged\b|\bfree cash\b|\bnumber\b|\bbehind\b/.test(normalized)) {
    if (input.conversationState?.shownCards?.some((card) => card.type === "free_cash_explanation")) {
      return baseResponse(input, {
        message: "The same drivers still apply.",
      });
    }

    return toolResponse(input, "explain_free_cash", {});
  }

  return baseResponse(input, {
    message: result.freeCashTodayCents < 0
      ? "Spendable Cash is below zero right now."
      : "I can help with Spendable Cash.",
  });
}

function toolResponse(
  input: RunAiAgentInput,
  toolName: Parameters<typeof runAgentTool>[0],
  args: unknown,
): AgentResponse {
  const snapshot = input.snapshot ?? fakeSnapshot;
  const response = runAgentTool(toolName, args, snapshot);
  const toolNameByRunner = {
    explain_free_cash: "get_free_cash_drivers",
    simulate_purchase: "simulate_purchase",
    show_true_balances: "get_true_balances",
    show_recent_transactions: "get_recent_transactions",
    show_spending_breakdown: "get_spending_breakdown",
    show_recurring_activity: "get_recurring_activity",
    show_spendable_cash_forecast: "forecast_spendable_cash",
    define_spendable_cash: "get_spendable_cash_definition",
    detect_missing_card: "get_data_quality",
    show_math: "get_free_cash_math",
    answer_unrelated: "answer_unrelated",
  } satisfies Record<Parameters<typeof runAgentTool>[0], string>;
  const usedTools = [toolNameByRunner[toolName]];

  return {
    ...response,
    message: createToolMessage(response),
    usedTools,
    audit: {
      toolNames: usedTools,
      usedModel: true,
      model: FREE_CASH_AI_MODEL,
      transport: getFreeCashAiTransport(),
    },
  };
}

function baseResponse(
  input: RunAiAgentInput,
  overrides: Partial<AgentResponse>,
): AgentResponse {
  const snapshot = input.snapshot ?? fakeSnapshot;
  const onboardingChips = input.onboardingState
    ? getOnboardingPromptChips(input.onboardingState)
    : [];

  return {
    message: "Mock model response.",
    cards: [],
    promptChips: onboardingChips.length > 0
      ? onboardingChips
      : getSuggestedPrompts(calculateFreeCash(snapshot)),
    usedTools: [],
    responseMode: "chat_only",
    ...overrides,
    audit: {
      toolNames: overrides.usedTools ?? [],
      usedModel: true,
      model: FREE_CASH_AI_MODEL,
      transport: getFreeCashAiTransport(),
      ...overrides.audit,
    },
  };
}

function createToolMessage(response: AgentResponse): string {
  const card = response.cards[0];

  if (card?.type === "purchase_simulation") {
    return `That would put Spendable Cash at ${formatMoney(card.afterTodayCents)}.`;
  }

  if (card?.type === "recent_transactions") {
    return "These are the recent items.";
  }

  if (card?.type === "spending_breakdown") {
    return "This breaks down the main money groups.";
  }

  if (card?.type === "recurring_activity") {
    return "These are likely repeating items.";
  }

  if (card?.type === "spendable_cash_forecast") {
    return `This forecasts ${card.horizonDays} days.`;
  }

  if (card?.type === "math_breakdown") {
    return "This is the math.";
  }

  if (card?.type === "true_balances") {
    return "These are the real balances.";
  }

  return "This shows what changed.";
}

function isSpendingPrompt(normalized: string): boolean {
  return /\b(spend|buy|purchase|order|afford|pay|cost)\b/.test(normalized);
}

function isShortPurchaseFollowUp(
  normalized: string,
  history: RunAiAgentInput["history"],
): boolean {
  return (
    /\b(what about|instead|how about)\b/.test(normalized) &&
    Boolean(history?.some((item) => item.role === "user" && isSpendingPrompt(item.content.toLowerCase())))
  );
}

function extractDollarAmount(message: string): number | null {
  const match = message.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);

  if (!match) {
    return null;
  }

  return Math.round(Number.parseFloat(match[1]) * 100);
}

function extractForecastHorizonDays(message: string): number {
  const match = message.match(/\b(\d{1,2})\s*-?\s*days?\b/);

  if (!match) {
    return 14;
  }

  return Math.min(Math.max(Number(match[1]), 1), 14);
}
