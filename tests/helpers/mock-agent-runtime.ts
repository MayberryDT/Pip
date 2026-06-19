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
import { composeTrustPolicyAnswer } from "@/lib/trust/pip-trust-policy";

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
  const pendingAction = getPendingAction(input.conversationState);

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

  if (/^(hi|hello|hey|yo)\b/.test(normalized)) {
    return baseResponse(input, {
      message: "Hi. Ask me about Spendable Cash Today or setup.",
    });
  }

  if (amountCents === null && isFinancialGuidancePrompt(normalized)) {
    return guidanceResponse(input);
  }

  if (isSpendingOpportunityPrompt(normalized)) {
    return toolResponse(input, "show_spending_opportunity", {});
  }

  if (isSavingsGoalListPrompt(normalized)) {
    return savingsGoalSummaryResponse(input);
  }

  if (pendingAction?.type === "create_savings_goal" && amountCents !== null) {
    return savingsGoalPlanResponse(input, amountCents, getPendingSavingsGoalName(pendingAction) ?? "Savings goal");
  }

  if (isSavingsGoalPrompt(normalized)) {
    const goalName = inferSavingsGoalName(input.message);

    if (amountCents === null) {
      return savingsGoalClarifyResponse(input, goalName);
    }

    return savingsGoalPlanResponse(input, amountCents, goalName);
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

  if (isConnectedAccountsPrompt(normalized)) {
    return accountConnectionsResponse(input);
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

function savingsGoalClarifyResponse(input: RunAiAgentInput, name: string): AgentResponse {
  return {
    ...baseResponse(input, {
      message: `What amount should I target for ${name}?`,
      responseMode: "clarify",
    }),
    pendingAction: {
      type: "create_savings_goal",
      name,
    },
  } as AgentResponse;
}

function savingsGoalPlanResponse(input: RunAiAgentInput, targetAmountCents: number, name = "Trip"): AgentResponse {
  const card: AgentResponse["cards"][number] = {
    type: "savings_goal_plan",
    title: "Savings goal",
    goalId: "goal-trip",
    name,
    targetAmountCents,
    currentAmountCents: 0,
    remainingCents: targetAmountCents,
    monthlyContributionCents: 0,
    includeInSpendableCash: false,
    summary: `${formatMoney(targetAmountCents)} left for ${name}. Tracked only for now.`,
  };

  return baseResponse(input, {
    message: "I set up the savings goal plan.",
    cards: [card],
    usedTools: ["create_savings_goal"],
    responseMode: "show_card",
  });
}

function accountConnectionsResponse(input: RunAiAgentInput): AgentResponse {
  const card: AgentResponse["cards"][number] = {
    type: "account_connections",
    title: "Connected accounts",
    institutions: [
      {
        institutionId: "northstar-bank",
        institutionName: "Northstar Bank",
        provider: "mock",
        status: "connected",
        lastSuccessfulSyncAt: "2026-06-18T12:00:00.000Z",
        accounts: [
          {
            accountId: "checking-1",
            name: "Everyday Checking",
            kind: "checking",
            lastFour: "1111",
            includedInPipCash: true,
            isProtectedSavings: false,
            active: true,
            roleLabel: "Included in Spendable Cash Today",
          },
          {
            accountId: "savings-1",
            name: "Travel Savings",
            kind: "savings",
            lastFour: "2222",
            includedInPipCash: false,
            isProtectedSavings: true,
            active: true,
            roleLabel: "Savings account",
          },
        ],
        actions: [
          {
            id: "refresh-northstar-bank",
            label: "Refresh",
            prompt: "Refresh my data",
            style: "secondary",
          },
        ],
      },
    ],
  };

  return baseResponse(input, {
    message: "I found your connected accounts.",
    cards: [card],
    usedTools: ["get_connected_accounts"],
    responseMode: "show_card",
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
        includeInSpendableCash: false,
      },
    ],
  };

  return baseResponse(input, {
    message: "I pulled your savings goals.",
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
    return "I set up the savings goal plan.";
  }

  if (card?.type === "savings_goals_summary") {
    return "I pulled your savings goals.";
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
    /\bwhy\b.{0,40}\b(can'?t|cannot|cant)\b.{0,40}\bspend\b/.test(normalized)
  );
}

function isSpendingOpportunityPrompt(normalized: string): boolean {
  if (isSavingsSetupOrSettingsPrompt(normalized)) {
    return false;
  }

  if (isSavingsGoalPrompt(normalized)) {
    return false;
  }

  const hasOpportunityTerm =
    /\b(cut back|cutback|spend less|save money|save more(?: money)?|save a little|save cash|save this week|overspending|over spending|waste|wasteful|stop buying|trim|lower expenses?|reduce expenses?|cut expenses?|cut costs?|trim costs?)\b/.test(normalized) ||
    /\b(costs?|expenses?)\b.{0,36}\b(cut|trim|lower|reduce)\b/.test(normalized) ||
    /\bwhere can i save\b/.test(normalized);

  if (!hasOpportunityTerm) {
    return false;
  }

  return (
    /\b(what|where|which|find|show|spot|identify|help|how)\b/.test(normalized) ||
    /\b(cut back|cutback|spend less|save money|save more(?: money)?|save a little|save cash|save this week|overspending|over spending|waste|wasteful|stop buying|trim|lower expenses?|reduce expenses?|cut expenses?|cut costs?|trim costs?)\b.*\b(spending|spend|money|buying|recent|this week|category|merchant|where|what|costs?|expenses?|cash)\b/.test(normalized) ||
    /\b(costs?|expenses?)\b.{0,36}\b(cut|trim|lower|reduce)\b/.test(normalized)
  );
}

function isSavingsSetupOrSettingsPrompt(normalized: string): boolean {
  return /\b(monthly savings|protected savings|savings cushion)\b/.test(normalized) ||
    /\bsave\b.{0,24}\b(account settings|settings|preferences)\b/.test(normalized);
}

function isSavingsGoalPrompt(normalized: string): boolean {
  return /\bsavings? goals?\b/.test(normalized) ||
    /\bsave\b.{0,32}\b(for|toward|towards)\b/.test(normalized) ||
    /\b(trip|vacation|travel|car|house|home|wedding|emergency fund|big purchase)\b.{0,40}\b(cost|costs|goal|save|saving|target)\b/.test(normalized);
}

function isConnectedAccountsPrompt(normalized: string): boolean {
  if (/\b(true|actual|real)\s+balances?\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(show|list|manage|view|see)\b.{0,32}\b(bank accounts?|accounts?|connected accounts?|connections?|institutions?)\b/.test(normalized) ||
    /\b(bank accounts?|connected accounts?|account connections?)\b/.test(normalized)
  );
}

function isSavingsGoalListPrompt(normalized: string): boolean {
  return /\b(show|list|what|which|update|progress|how are)\b.{0,32}\bsavings? goals?\b/.test(normalized) ||
    /^savings? goals?$/.test(normalized);
}

function isTrustReceiptPrompt(normalized: string): boolean {
  if (/\b(trust receipt|receipt behind|receipt for|source receipt)\b/.test(normalized)) {
    return true;
  }

  return (
    /\b(can i trust|trustworthy|how reliable|how accurate|accuracy|complete data|what is missing|what data is missing|what may be missing|what data is counted|what does this include|based on fresh data|up to date|current)\b/.test(normalized) &&
    /\b(number|spendable cash|spendable cash today|data|accounts?|current|fresh|today|it|this)\b/.test(normalized)
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

function getPendingAction(conversationState: RunAiAgentInput["conversationState"]) {
  const candidate = (conversationState as { pendingAction?: unknown } | undefined)?.pendingAction;

  if (!candidate || typeof candidate !== "object" || !("type" in candidate)) {
    return null;
  }

  return candidate as {
    type?: string;
    name?: string;
  };
}

function getPendingSavingsGoalName(pendingAction: ReturnType<typeof getPendingAction>): string | null {
  if (!pendingAction) {
    return null;
  }

  return pendingAction.name ?? null;
}

function inferSavingsGoalName(message: string): string {
  const normalized = message.toLowerCase();

  if (/\bbali\b/.test(normalized)) {
    return "Trip to Bali";
  }

  if (/\bbig purchase\b/.test(normalized)) {
    return "Big purchase";
  }

  if (/\btrip|vacation|travel\b/.test(normalized)) {
    return "Trip";
  }

  if (/\bcar\b/.test(normalized)) {
    return "Car";
  }

  if (/\bhouse|home\b/.test(normalized)) {
    return "Home";
  }

  if (/\bwedding\b/.test(normalized)) {
    return "Wedding";
  }

  if (/\bemergency fund\b/.test(normalized)) {
    return "Emergency fund";
  }

  return "Savings goal";
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
