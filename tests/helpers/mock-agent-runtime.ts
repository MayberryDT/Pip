import type { AgentResponse } from "@/lib/agent/card-types";
import {
  FREE_CASH_AI_MODEL,
  getFreeCashAiTransport,
  type AgentRuntime,
  type RunAiAgentInput,
} from "@/lib/agent/ai-agent";
import { getOnboardingPromptChips } from "@/lib/agent/suggested-prompts";
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

  if (input.requestKind === "prompt_chips") {
    return baseResponse(input, {
      message: "Ready.",
      promptChips: [
        {
          id: "ai-what-number-means",
          label: "What does my $43 mean?",
          prompt: "What does my Spendable Cash Today number mean?",
        },
        {
          id: "ai-why-today",
          label: "Why is it $43 today?",
          prompt: "Show the biggest drivers behind today's number",
        },
        {
          id: "ai-teach-money-basic",
          label: "Teach me a money basic",
          prompt: "Teach me one useful money basic",
        },
      ],
    });
  }

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
      message: "Hi. Ask me about Spendable Cash Today or setup.",
    });
  }

  if (isSpendingPrompt(normalized)) {
    if (amountCents === null) {
      if (/\b(any|money|at all|negative)\b/.test(normalized)) {
        return baseResponse(input, {
          message: "I use Spendable Cash Today as a signal, not a hard limit.",
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

  if (
    /^(yes|yeah|yep|ok|okay|sure|do that|yes do that|show me|please do|that)$/.test(normalized) &&
    input.history?.slice(-4).some((item) =>
      /\b(spending breakdown|breakdown|categories|merchants|card payments|income sources)\b/.test(item.content.toLowerCase()),
    )
  ) {
    return toolResponse(input, "show_spending_breakdown", {});
  }

  if (
    /^(yes|yeah|yep|ok|okay|sure|do that|yes do that|show me|please do|that)$/.test(normalized) &&
    input.history?.slice(-4).some((item) =>
      /\b(recurring|repeat(?:ing)? items?|subscriptions?|upcoming bills|bills coming up)\b/.test(item.content.toLowerCase()),
    )
  ) {
    return toolResponse(input, "show_recurring_activity", {});
  }

  if (
    /^(yes|yeah|yep|ok|okay|sure|do that|yes do that|show me|please do|that)$/.test(normalized) &&
    input.history?.slice(-4).some((item) =>
      /\b(recent charges|recent transactions|recent purchases|recent activity)\b/.test(item.content.toLowerCase()),
    )
  ) {
    return toolResponse(input, "show_recent_transactions", { limit: 6 });
  }

  if (
    /^(yes|yeah|yep|ok|okay|sure|do that|yes do that|show me|please do|that)$/.test(normalized) &&
    input.history?.slice(-4).some((item) =>
      /\b(show math|math breakdown|calculation|formula)\b/.test(item.content.toLowerCase()),
    )
  ) {
    return toolResponse(input, "show_math", {});
  }

  if (/\b(recurring|repeating|subscription|subscriptions|bills? (are )?coming up|monthly charges?|upcoming bills?|youtube|premium)\b/.test(normalized)) {
    return toolResponse(input, "show_recurring_activity", {});
  }

  if (/\b(complete|full|item|category|merchant|spending|income|refund|card payment|payments?)\b.*\bbreakdown\b/.test(normalized)) {
    return toolResponse(input, "show_spending_breakdown", {});
  }

  if (isPaydayImpactPrompt(normalized)) {
    return toolResponse(input, "compose_insight_card", { topic: "payday_impact" });
  }

  if (isSpendableFactorsInsightPrompt(normalized)) {
    return toolResponse(input, "compose_insight_card", { topic: "spendable_factors" });
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
      ? "Spendable Cash Today is below zero right now."
      : "I can help with Spendable Cash Today.",
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
    show_pattern_assumptions: "get_pattern_assumptions",
    show_recent_spending_pressure: "get_recent_spending_pressure",
    detect_missing_card: "get_data_quality",
    show_math: "get_free_cash_math",
    compose_insight_card: "compose_insight_card",
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
  const onboardingChips = input.onboardingState
    ? getOnboardingPromptChips(input.onboardingState)
    : [];

  return {
    message: "Mock model response.",
    cards: [],
    promptChips: onboardingChips,
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
    if (card.afterTodayCents < 0) {
      return `You can, but it would put you ${formatMoney(Math.abs(card.afterTodayCents))} over today.`;
    }

    return `That would leave ${formatMoney(card.afterTodayCents)} for today.`;
  }

  if (card?.type === "recent_transactions") {
    return "I found these recent items.";
  }

  if (card?.type === "spending_breakdown") {
    return "I grouped the main money flows.";
  }

  if (card?.type === "recurring_activity") {
    return "I found likely repeating items.";
  }

  if (card?.type === "spendable_cash_forecast") {
    return `I mapped the next ${card.horizonDays} days.`;
  }

  if (card?.type === "math_breakdown") {
    return "I pulled the math.";
  }

  if (card?.type === "insight_card") {
    return "I put the main pieces in a card.";
  }

  if (card?.type === "true_balances") {
    return "I found your actual balances. They are different from Spendable Cash Today.";
  }

  return "I found what changed.";
}

function isSpendingPrompt(normalized: string): boolean {
  return /\b(spend|buy|purchase|order|afford|pay|cost)\b/.test(normalized);
}

function isPaydayImpactPrompt(normalized: string): boolean {
  return (
    /\b(payday|paycheck|paychecks?|payroll|deposit|deposits?|income)\b/.test(normalized) &&
    /\b(affect|affected|impact|impacts?|change|changed|mean|means|help|helps|lift|lifts|money|number|spendable cash)\b/.test(normalized)
  );
}

function isSpendableFactorsInsightPrompt(normalized: string): boolean {
  return (
    /\b(factors?|affect|affects|affected|impact|impacts?|influence|influences)\b/.test(normalized) &&
    /\b(today|number|spendable cash today|spendable cash|money)\b/.test(normalized) &&
    !isPaydayImpactPrompt(normalized)
  );
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
