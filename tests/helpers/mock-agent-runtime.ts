import type { AgentResponse } from "@/lib/agent/card-types";
import {
  PIP_AI_MODEL,
  getPipAiTransport,
  type AgentRuntime,
  type RunAiAgentInput,
} from "@/lib/agent/ai-agent";
import { getOnboardingPromptChips } from "@/lib/agent/suggested-prompts";
import { buildFinancialGuidanceToolResult, runAgentTool } from "@/lib/agent/tool-runner";
import { fakeSnapshot } from "@/lib/fake-data";
import { calculatePipCash } from "@/lib/pip-cash/engine";
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
  const result = calculatePipCash(snapshot);
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

  if (amountCents === null && isFinancialGuidancePrompt(normalized)) {
    return guidanceResponse(input);
  }

  if (isSpendingPrompt(normalized)) {
    if (amountCents === null) {
      if (/\b(any|money|at all|negative)\b/.test(normalized)) {
        return baseResponse(input, {
          message: "I use Spendable Cash Today as a signal, not a hard limit.",
          usedTools: ["get_pip_cash_snapshot"],
        });
      }

      return baseResponse(input, {
        message: "Tell me the purchase amount to test.",
        responseMode: "clarify",
      });
    }

    return toolResponse(input, "simulate_purchase", { amount_cents: amountCents }, {
      includeGuidance: isJudgmentalPurchasePrompt(normalized),
    });
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

  if (/\bwhy\b|\bchanged\b|\bpip cash\b|\bnumber\b|\bbehind\b/.test(normalized)) {
    if (input.conversationState?.shownCards?.some((card) => card.type === "pip_cash_explanation")) {
      return baseResponse(input, {
        message: "The same drivers still apply.",
      });
    }

    return toolResponse(input, "explain_pip_cash", {});
  }

  return baseResponse(input, {
    message: result.pipCashTodayCents < 0
      ? "Spendable Cash Today is below zero right now."
      : "I can help with Spendable Cash Today.",
  });
}

function toolResponse(
  input: RunAiAgentInput,
  toolName: Parameters<typeof runAgentTool>[0],
  args: unknown,
  options: {
    includeGuidance?: boolean;
  } = {},
): AgentResponse {
  const snapshot = input.snapshot ?? fakeSnapshot;
  const response = runAgentTool(toolName, args, snapshot);
  const toolNameByRunner = {
    explain_pip_cash: "get_pip_cash_drivers",
    simulate_purchase: "simulate_purchase",
    show_true_balances: "get_true_balances",
    show_recent_transactions: "get_recent_transactions",
    show_spending_breakdown: "get_spending_breakdown",
    show_recurring_activity: "get_recurring_activity",
    show_spendable_cash_forecast: "forecast_spendable_cash",
    define_spendable_cash: "get_spendable_cash_definition",
    show_pattern_assumptions: "get_pattern_assumptions",
    show_recent_spending_pressure: "get_recent_spending_pressure",
    get_financial_guidance_context: "get_financial_guidance_context",
    detect_missing_card: "get_data_quality",
    show_math: "get_pip_cash_math",
    compose_insight_card: "compose_insight_card",
    answer_unrelated: "answer_unrelated",
  } satisfies Record<Parameters<typeof runAgentTool>[0], string>;
  const usedTools = options.includeGuidance
    ? [toolNameByRunner[toolName], "get_financial_guidance_context"]
    : [toolNameByRunner[toolName]];
  const guidanceContext = options.includeGuidance
    ? buildFinancialGuidanceToolResult(snapshot).context
    : null;

  return {
    ...response,
    message: options.includeGuidance
      ? `${createToolMessage(response)} My read: keep it under today's number unless it matters.`
      : createToolMessage(response),
    usedTools,
    responseMode: options.includeGuidance ? response.responseMode : response.responseMode,
    audit: {
      toolNames: usedTools,
      usedModel: true,
      model: PIP_AI_MODEL,
      transport: getPipAiTransport(),
          guidance: guidanceContext
            ? {
                validationOutcome: "context_built",
                guidanceSource: "none",
                metricVersion: "v2",
            state: guidanceContext.currentRead.state,
            confidence: guidanceContext.currentRead.confidence,
            evidenceIds: guidanceContext.evidence.map((evidence) => evidence.id),
            spendableCashTodayCents: guidanceContext.currentRead.spendableCashTodayCents,
            shortfallCents: guidanceContext.currentRead.shortfallCents,
            baselineDailyAllowanceCents: guidanceContext.pattern.baselineDailyAllowanceCents,
            behaviorAdjustmentCents: guidanceContext.behavior.behaviorAdjustmentCents,
            cashRealityAdjustmentCents: guidanceContext.cash.cashRealityAdjustmentCents,
            currentMonthVarianceCents: guidanceContext.behavior.currentMonthVarianceCents,
          }
        : undefined,
    },
  };
}

function guidanceResponse(input: RunAiAgentInput): AgentResponse {
  const snapshot = input.snapshot ?? fakeSnapshot;
  const guidance = buildFinancialGuidanceToolResult(snapshot).context;
  const evidenceIds = guidance.evidence.map((evidence) => evidence.id);
  const hot = evidenceIds.includes("recent-spending-hot");
  const shortfall = guidance.currentRead.state === "shortfall";
  const card: AgentResponse["cards"][number] = {
    type: "guidance_card",
    title: "My read",
    stance: shortfall ? "shortfall" : hot ? "watch" : "stable",
    summary: shortfall
      ? "There is no extra room today, so optional spending adds pressure."
      : hot
        ? "You are not in crisis, but recent spending is running hot."
        : "You look steady, with bills and savings already held back.",
    rows: [
      {
        label: hot ? "Main pressure" : "Today",
        detail: hot
          ? "Recent everyday spending is ahead of pace."
          : "The read is based on today's Spendable Cash evidence.",
        tone: hot ? "warning" : "neutral",
        evidenceIds: hot ? ["recent-spending-hot"] : ["spendable-today"],
      },
      {
        label: "Why it matters",
        detail: "Bills, savings, and cash reality are already reflected.",
        tone: "neutral",
        evidenceIds: ["bills-held-back", "protected-savings"],
      },
    ],
  };
  const usedTools = ["get_financial_guidance_context"];

  return baseResponse(input, {
    message: hot
      ? "My read: you are okay, but recent spending is running hot."
      : "My read: you look steady, with the main holds already counted.",
    cards: [card],
    usedTools,
    responseMode: "guidance",
    audit: {
      toolNames: usedTools,
      usedModel: true,
      model: PIP_AI_MODEL,
      transport: getPipAiTransport(),
      guidance: {
        validationOutcome: "shown",
        guidanceSource: "model_draft",
        metricVersion: "v2",
        state: guidance.currentRead.state,
        confidence: guidance.currentRead.confidence,
        stance: card.type === "guidance_card" ? card.stance : undefined,
        evidenceIds: card.type === "guidance_card"
          ? [...new Set(card.rows.flatMap((row) => row.evidenceIds))]
          : evidenceIds,
        spendableCashTodayCents: guidance.currentRead.spendableCashTodayCents,
        shortfallCents: guidance.currentRead.shortfallCents,
        baselineDailyAllowanceCents: guidance.pattern.baselineDailyAllowanceCents,
        behaviorAdjustmentCents: guidance.behavior.behaviorAdjustmentCents,
        cashRealityAdjustmentCents: guidance.cash.cashRealityAdjustmentCents,
        currentMonthVarianceCents: guidance.behavior.currentMonthVarianceCents,
      },
    },
  });
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
      model: PIP_AI_MODEL,
      transport: getPipAiTransport(),
      ...overrides.audit,
    },
  };
}

function createToolMessage(response: AgentResponse): string {
  const card = response.cards[0];

  if (card?.type === "purchase_simulation") {
    if (card.todayRemainingCents < 0) {
      return `That would put Spendable Cash Today at ${formatMoney(card.todayRemainingCents)}.`;
    }

    return `That would leave ${formatMoney(card.todayRemainingCents)} in Spendable Cash Today.`;
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
  return /\b(spend(?:ing)?|buy(?:ing)?|purchase|purchasing|order(?:ing)?|afford|pay(?:ing)?|cost)\b/.test(normalized);
}

function isFinancialGuidancePrompt(normalized: string): boolean {
  return (
    /\b(what do you think|how am i doing|give me advice|any advice|what should i do|am i okay|is this bad|what would you do|help me fix this|how do i improve|am i spending too much|is my spending bad|am i broke|why am i broke|i'?m broke|in trouble|should i lower my cushion|should i save more|should i stop spending|what'?s your read|my read)\b/.test(normalized) ||
    /\bwhy\b.{0,40}\b(can'?t|cannot|cant)\b.{0,40}\bspend\b/.test(normalized)
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

    candidates.push({
      amountCents: Math.round(amount * 100),
      index: match.index ?? 0,
      score: scorePurchaseAmountCandidate(normalized, match.index ?? 0),
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score || right.index - left.index);

  return candidates[0]?.amountCents ?? null;
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

  if (/\b(balance|checking|paycheck|income|deposit|have|left)\b/.test(before)) {
    score -= 4;
  }

  if (/\b(balance|checking|paycheck|income|deposit)\b/.test(after)) {
    score -= 4;
  }

  return score;
}

function extractForecastHorizonDays(message: string): number {
  const match = message.match(/\b(\d{1,2})\s*-?\s*days?\b/);

  if (!match) {
    return 14;
  }

  return Math.min(Math.max(Number(match[1]), 1), 14);
}
