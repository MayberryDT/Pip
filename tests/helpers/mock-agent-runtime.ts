import type { AgentResponse } from "@/lib/agent/card-types";
import {
  PIP_AI_MODEL,
  getPipAiTransport,
  type AgentRuntime,
  type RunAiAgentInput,
} from "@/lib/agent/ai-agent";
import { getOnboardingPromptChips } from "@/lib/agent/suggested-prompts";
import { buildFinancialGuidanceToolResult, runAgentTool } from "@/lib/agent/tool-runner";
import {
  buildSavingsGoalDraft,
  createOrdinaryPendingAction,
  getSavingsGoalPreviewMissingFields,
  isCancellationPrompt,
  isContextualConfirmation,
} from "@/lib/agent/pending-actions";
import { fakeSnapshot } from "@/lib/fake-data";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { formatMoney } from "@/lib/money";
import { composeTrustPolicyAnswer } from "@/lib/trust/pip-trust-policy";
import { buildSavingsGoalPreview } from "@/lib/savings-goals/preview";

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

  if (input.selectedPromptChipId === "ai-trust-receipt") {
    return toolResponse(input, "show_trust_receipt", {});
  }

  if (input.selectedPromptChipId === "ai-spending-breakdown") {
    return toolResponse(input, "show_spending_breakdown", {});
  }

  if (/^(hi|hello|hey|yo)\b/.test(normalized)) {
    return baseResponse(input, {
      message: "Hi. Ask me about Spendable Cash Today or setup.",
    });
  }

  if (isSpendingOpportunityPrompt(normalized)) {
    return toolResponse(input, "show_spending_opportunity", {});
  }

  if (amountCents === null && isFinancialGuidancePrompt(normalized)) {
    return guidanceResponse(input);
  }

  if (isDataQualityPrompt(normalized)) {
    return toolResponse(input, "detect_missing_card", {});
  }

  if (isSavingsGoalListPrompt(normalized)) {
    return savingsGoalSummaryResponse(input);
  }

  if (
    input.conversationState?.pendingAction?.type === "ordinary_write" &&
    input.conversationState.pendingAction.action === "create_savings_goal" &&
    isContextualConfirmation(input.message)
  ) {
    const payload = input.conversationState.pendingAction.payload ?? {};
    const targetAmountCents =
      typeof payload.targetAmountCents === "number" ? payload.targetAmountCents : amountCents ?? 500000;

    return savingsGoalPlanResponse(input, targetAmountCents);
  }

  if (isCancellationPrompt(input.message)) {
    return baseResponse(input, {
      message: "No problem. I will leave that savings goal alone.",
      responseMode: "chat_only",
    });
  }

  if (isSavingsGoalPrompt(normalized)) {
    return savingsGoalPreviewResponse(input);
  }

  if (isTrustReceiptPrompt(normalized)) {
    return toolResponse(input, "show_trust_receipt", {});
  }

  if (isTrustPolicyPrompt(normalized)) {
    return baseResponse(input, {
      message: composeTrustPolicyAnswer(input.message, {
        platform: input.platform,
      }).message,
      usedTools: ["get_trust_policy"],
    });
  }

  if (isRecentTransactionPrompt(normalized)) {
    return toolResponse(input, "show_recent_transactions", { limit: 6 });
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

  if (isRecurringAggregatePrompt(normalized)) {
    const response = runAgentTool("show_recurring_activity", {}, snapshot);
    const card = response.cards[0];

    if (card?.type === "recurring_activity") {
      if (!hasRecentRecurringActivityContext(input)) {
        return toolResponse(input, "show_recurring_activity", {});
      }

      const expenseItems = card.items.filter((item) => item.amountCents < 0);
      const expenseTotalCents = expenseItems.reduce(
        (total, item) => total + Math.abs(item.amountCents),
        0,
      );

      return baseResponse(input, {
        message: `Your repeat expenses total ${formatMoney(expenseTotalCents)} right now.`,
        usedTools: ["get_recurring_activity"],
        responseMode: "chat_only",
        cards: [],
        promptChips: response.promptChips,
      });
    }
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

  if (isExplicitMathPrompt(normalized)) {
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

function savingsGoalPlanResponse(input: RunAiAgentInput, targetAmountCents: number): AgentResponse {
  const card: AgentResponse["cards"][number] = {
    type: "savings_goal_plan",
    title: "Savings goal",
    goalId: "goal-trip",
    name: "Trip",
    targetAmountCents,
    currentAmountCents: 0,
    remainingCents: targetAmountCents,
    monthlyContributionCents: 0,
    includeInSpendableCash: true,
    summary: `${formatMoney(targetAmountCents)} left for Trip. Its monthly plan counts in Spendable Cash Today.`,
  };

  return baseResponse(input, {
    message: "Trip is tracked now, and its monthly plan counts in Spendable Cash Today.",
    cards: [card],
    usedTools: ["create_savings_goal"],
    responseMode: "show_card",
  });
}

function savingsGoalPreviewResponse(input: RunAiAgentInput): AgentResponse {
  const snapshot = input.snapshot ?? fakeSnapshot;
  const draft = buildSavingsGoalDraft({
    message: input.message,
    pendingAction: input.conversationState?.pendingAction?.type === "preview_savings_goal"
      ? input.conversationState.pendingAction
      : undefined,
    asOfDate: snapshot.settings.asOfDate,
  });
  const missing = getSavingsGoalPreviewMissingFields(draft);

  if (missing.length > 0) {
    return baseResponse(input, {
      message: missing.includes("target_amount")
        ? `How much do you want to save for ${draft.name}?`
        : `When do you want ${draft.name}, or how much do you want to save each month?`,
      usedTools: ["preview_savings_goal"],
      responseMode: "clarify",
      pendingAction: {
        ...draft,
        missing,
      },
    });
  }

  const preview = buildSavingsGoalPreview({
    snapshot,
    draft,
  });

  if (!preview.card) {
    return baseResponse(input, {
      message: "Tell me the date or monthly amount so I can preview that goal.",
      usedTools: ["preview_savings_goal"],
      responseMode: "clarify",
      pendingAction: {
        ...draft,
        missing: preview.missing,
      },
    });
  }

  return baseResponse(input, {
    message: `${draft.name} would need ${formatMoney(preview.card.monthlyContributionCents)}/month.`,
    cards: [preview.card],
    usedTools: ["preview_savings_goal"],
    responseMode: "show_card",
    pendingAction: createOrdinaryPendingAction({
      action: "create_savings_goal",
      summary: `Create ${draft.name} savings goal`,
      payload: {
        name: draft.name,
        targetAmountCents: draft.targetAmountCents,
        targetDate: draft.targetDate,
        startingAmountCents: draft.startingAmountCents,
        currentAmountCents: draft.currentAmountCents,
        monthlyContributionCents: preview.card.monthlyContributionCents,
        includeInSpendableCash: true,
      },
      now: new Date("2026-06-20T12:00:00.000Z"),
    }),
  });
}

function savingsGoalSummaryResponse(input: RunAiAgentInput): AgentResponse {
  const card: AgentResponse["cards"][number] = {
    type: "savings_goals_summary",
    title: "Savings goals",
    summary: "1 active savings goal tracked.",
    activeGoalCount: 1,
    protectedMonthlyContributionCents: 0,
    goals: [
      {
        goalId: "goal-trip",
        name: "Trip",
        targetAmountCents: 500000,
        currentAmountCents: 0,
        remainingCents: 500000,
        monthlyContributionCents: 0,
        includeInSpendableCash: true,
      },
    ],
  };

  return baseResponse(input, {
    message: "Trip is the savings goal I see right now.",
    cards: [card],
    usedTools: ["list_savings_goals"],
    responseMode: "show_card",
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
    show_spending_opportunity: "get_spending_opportunity",
    get_financial_guidance_context: "get_financial_guidance_context",
    detect_missing_card: "get_data_quality",
    show_trust_receipt: "get_trust_receipt",
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

  if (card?.type === "trust_receipt") {
    return "I pulled the receipt behind today's number.";
  }

  if (card?.type === "savings_goal_plan") {
    return `${card.name} is tracked now, and its monthly plan counts in Spendable Cash Today.`;
  }

  if (card?.type === "savings_goals_summary") {
    return card.goals[0]
      ? `${card.goals[0].name} is the savings goal I see right now.`
      : "I do not see an active savings goal yet.";
  }

  if (card?.type === "insight_card") {
    if (/\b(cutback|cut back|spending opportunity)\b/i.test(`${card.title} ${card.summary}`)) {
      return `I found a cutback opportunity: ${card.summary}`;
    }

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
    /\b(what do you think|how am i doing|give me advice|any advice|what should i do|am i okay|is this bad|what would you do|help me fix this|how do i improve|am i spending too much|is my spending bad|am i broke|why am i broke|i'?m broke|in trouble|should i lower my monthly savings|should i lower my cushion|should i save more|should i stop spending|what'?s your read|my read)\b/.test(normalized) ||
    /\bshould i\b.{0,24}\bslow down\b/.test(normalized) ||
    /\bwhy\b.{0,40}\b(can'?t|cannot|cant)\b.{0,40}\bspend\b/.test(normalized)
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
    /\bwhere can i save\b/.test(normalized);

  if (!hasOpportunityTerm) {
    return false;
  }

  return (
    /\b(what|where|which|find|show|spot|identify|help|how)\b/.test(normalized) ||
    /\bspending opportunit(?:y|ies)\b/.test(normalized) ||
    /\b(cut back|cutback|spend less|save money|save more(?: money)?|save a little|save cash|save this week|overspending|over spending|waste|wasteful|stop buying|trim|lower expenses?|reduce expenses?|cut expenses?|cut costs?|trim costs?)\b.*\b(spending|spend|money|buying|recent|this week|category|merchant|where|what|costs?|expenses?|cash)\b/.test(normalized) ||
    /\b(i want to|help me|how can i|how do i|where can i|ways? to)\b.{0,24}\bsave money\b/.test(normalized) ||
    /\bsave money\b.{0,24}\b(this week|from spending|on spending|recent spending|where|how|help)\b/.test(normalized) ||
    /\b(costs?|expenses?)\b.{0,36}\b(cut|trim|lower|reduce)\b/.test(normalized)
  );
}

function isDataQualityPrompt(normalized: string): boolean {
  return /\b(missing card|card missing|missing data|data missing|data (?:might|may|could) be missing|what data (?:might|may|could) be missing|connect(ed)? data|repair data|data quality|pending transactions?|pending items?)\b/.test(
    normalized,
  );
}

function isSavingsSetupOrSettingsPrompt(normalized: string): boolean {
  return /\b(monthly savings|protected savings|savings cushion)\b/.test(normalized) ||
    /\bsave\b.{0,24}\b(account settings|settings|preferences)\b/.test(normalized) ||
    /\bsavings? goals?\b/.test(normalized) ||
    /\bsave\b.{0,32}\b(for|toward|towards)\b/.test(normalized);
}

function isExplicitMathPrompt(normalized: string): boolean {
  return (
    /\bhow did you\b.{0,32}\b(get|calculate|come up with)\b.{0,32}\b(number|spendable cash|spendable cash today)\b/.test(normalized) ||
    /\bwhat\b.{0,32}\b(went into|numbers went into|calculation|formula)\b.{0,32}\b(number|spendable cash|spendable cash today|this)\b/.test(normalized)
  );
}

function isRecurringAggregatePrompt(normalized: string): boolean {
  return (
    /\b(total|sum|add(?:ed)? up|altogether|how much|how many dollars|spending a month|spend a month)\b/.test(normalized) &&
    /\b(these monthly bills?|my monthly bills?|monthly bills?|recurring bills?|subscriptions?|monthly charges?)\b/.test(normalized)
  );
}

function hasRecentRecurringActivityContext(input: RunAiAgentInput): boolean {
  return Boolean(
    input.conversationState?.lastToolNames?.includes("get_recurring_activity") ||
      input.conversationState?.shownCards?.some((card) => card.type === "recurring_activity") ||
      input.history?.slice(-6).some((item) =>
        item.role === "assistant" &&
        /\b(recurring|repeat(?:ing)? items?|subscriptions?|upcoming bills?|bills? coming up|monthly bills?)\b/i.test(item.content)
      ),
  );
}

function isSavingsGoalPrompt(normalized: string): boolean {
  return /\bsavings? goals?\b/.test(normalized) ||
    /\bsave\b.{0,32}\b(for|toward|towards)\b/.test(normalized) ||
    /\b(trip|vacation|travel|car|house|home|wedding|computer|emergency fund|big purchase)\b.{0,80}\b(cost|costs|goal|save|saving|target|\$|\d)\b/.test(normalized);
}

function isSavingsGoalListPrompt(normalized: string): boolean {
  return /\b(show|list|what|which|update|progress|how are)\b.{0,32}\bsavings? goals?\b/.test(normalized) ||
    /^savings? goals?$/.test(normalized);
}

function isRecentTransactionPrompt(normalized: string): boolean {
  return (
    /\bwhat did i (?:buy|spend)\b.{0,32}\b(lately|recently|yesterday|this week|last week)?\b/.test(normalized) ||
    /\bwhat have i been (?:buying|spending)\b.{0,32}\b(lately|recently|this week|last week)?\b/.test(normalized) ||
    /\b(show|list|pull up|find)\b.{0,32}\b(recent|latest)\b.{0,20}\b(transactions?|charges?|purchases?|activity)\b/.test(normalized) ||
    /\bwhat charges hit\b/.test(normalized)
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
    /\b(financial advice|advisor|guarantee|guaranteed|legal entity|who operates|refund|trial|cancel subscription|subscription (?:billing|price|pricing|refund|trial|cancel|cancellation))\b/.test(normalized)
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
