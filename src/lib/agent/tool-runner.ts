import { z } from "zod";
import type { AgentResponse } from "@/lib/agent/card-types";
import { getSuggestedPrompts } from "@/lib/agent/suggested-prompts";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { summarizeFreeCash } from "@/lib/free-cash/explanation";
import {
  getDisplayedSpendableCashTodayCents,
  simulateSpendablePurchase,
} from "@/lib/free-cash/spendable-cash-today";
import {
  buildRecurringActivity,
  buildSpendableCashForecast,
  buildSpendingBreakdown,
} from "@/lib/free-cash/insights";
import { fakeSnapshot } from "@/lib/fake-data";
import { formatMoney } from "@/lib/money";
import type { FinancialSnapshot } from "@/lib/types";

export const agentToolNames = [
  "explain_free_cash",
  "simulate_purchase",
  "show_true_balances",
  "show_recent_transactions",
  "show_spending_breakdown",
  "show_recurring_activity",
  "show_spendable_cash_forecast",
  "define_spendable_cash",
  "show_pattern_assumptions",
  "show_recent_spending_pressure",
  "detect_missing_card",
  "show_math",
  "compose_insight_card",
  "answer_unrelated",
] as const;

export type AgentToolName = (typeof agentToolNames)[number];

const simulatePurchaseArgsSchema = z.object({
  amount_cents: z.number().int().positive().max(1000000),
});

const recentTransactionsArgsSchema = z.object({
  limit: z.number().int().min(1).max(12).default(6),
});
const forecastArgsSchema = z.object({
  horizon_days: z.number().int().min(1).max(14).default(14),
});
const insightCardArgsSchema = z.object({
  topic: z.enum(["payday_impact", "spendable_factors"]),
});

const emptyArgsSchema = z.object({}).passthrough();

export function runAgentTool(
  toolName: AgentToolName,
  rawArgs: unknown = {},
  snapshot: FinancialSnapshot = fakeSnapshot,
): AgentResponse {
  switch (toolName) {
    case "explain_free_cash":
      return explainFreeCash(snapshot);
    case "simulate_purchase": {
      const args = simulatePurchaseArgsSchema.parse(rawArgs ?? {});
      return simulatePurchase(args.amount_cents, snapshot);
    }
    case "show_true_balances":
      emptyArgsSchema.parse(rawArgs ?? {});
      return showTrueBalances(snapshot);
    case "show_recent_transactions": {
      const args = recentTransactionsArgsSchema.parse(rawArgs ?? {});
      return showRecentTransactions(args.limit, snapshot);
    }
    case "show_spending_breakdown":
      emptyArgsSchema.parse(rawArgs ?? {});
      return showSpendingBreakdown(snapshot);
    case "show_recurring_activity":
      emptyArgsSchema.parse(rawArgs ?? {});
      return showRecurringActivity(snapshot);
    case "show_spendable_cash_forecast": {
      const args = forecastArgsSchema.parse(rawArgs ?? {});
      return showSpendableCashForecast(args.horizon_days, snapshot);
    }
    case "define_spendable_cash":
      emptyArgsSchema.parse(rawArgs ?? {});
      return defineSpendableCash(snapshot);
    case "show_pattern_assumptions":
      emptyArgsSchema.parse(rawArgs ?? {});
      return showPatternAssumptions(snapshot);
    case "show_recent_spending_pressure":
      emptyArgsSchema.parse(rawArgs ?? {});
      return showRecentSpendingPressure(snapshot);
    case "detect_missing_card":
      emptyArgsSchema.parse(rawArgs ?? {});
      return detectMissingCard(snapshot);
    case "show_math":
      emptyArgsSchema.parse(rawArgs ?? {});
      return showMath(snapshot);
    case "compose_insight_card": {
      const args = insightCardArgsSchema.parse(rawArgs ?? {});
      return composeInsightCard(args.topic, snapshot);
    }
    case "answer_unrelated":
      emptyArgsSchema.parse(rawArgs ?? {});
      return answerUnrelated(snapshot);
  }
}

export function isAgentToolName(value: string): value is AgentToolName {
  return agentToolNames.includes(value as AgentToolName);
}

function baseAudit(toolName: AgentToolName) {
  return {
    toolNames: [toolName],
    usedModel: false,
  };
}

function baseResponse(toolName: AgentToolName, cards: AgentResponse["cards"]): Pick<AgentResponse, "usedTools" | "responseMode" | "audit"> {
  return {
    usedTools: [toolName],
    responseMode: cards.length > 0 ? "show_card" : "chat_only",
    audit: baseAudit(toolName),
  };
}

function explainFreeCash(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const summary = summarizeFreeCash(result);

  const cards: AgentResponse["cards"] = [
    {
      type: "free_cash_explanation",
      title: "Spendable Cash Today",
      summary,
      drivers: result.spendableCashToday?.drivers ?? result.drivers,
      warnings: result.spendableCashToday?.warnings ?? result.warnings,
      dataStates: result.spendableCashToday?.dataStates ?? result.dataStates,
    },
  ];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("explain_free_cash", cards),
  };
}

function simulatePurchase(amountCents: number, snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const simulation = simulateSpendablePurchase(amountCents, snapshot, {
    before: result.spendableCashToday,
    warnings: result.warnings,
    dataStates: result.dataStates,
    legacyRollingDailySurplusCents: result.freeCashTodayCents,
    legacyRollingNetCents: result.rollingNetCents,
  });

  const cards: AgentResponse["cards"] = [
    {
      type: "purchase_simulation",
      title: "Purchase simulation",
      amountCents,
      beforeCents: simulation.beforeCents,
      todayRemainingCents: simulation.todayRemainingCents,
      todayOverageCents: simulation.todayOverageCents,
      afterTodayCents: simulation.afterTodayCents,
      monthlyAverageAfterCents: simulation.after.legacyRollingDailySurplusCents,
      dailyEffectCents: simulation.dailyEffectCents,
      shortfallCents: simulation.shortfallCents,
    },
  ];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("simulate_purchase", cards),
  };
}

function showTrueBalances(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);

  const cards: AgentResponse["cards"] = [
    {
      type: "true_balances",
      title: "True balances",
      balances: result.trueBalances,
    },
  ];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("show_true_balances", cards),
  };
}

function showRecentTransactions(limit: number, snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const recentTransactions = snapshot.transactions
    .filter((transaction) => transaction.date >= result.window.startDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);

  const cards: AgentResponse["cards"] = [
    {
      type: "recent_transactions",
      title: "Recent transactions",
      transactions: recentTransactions,
    },
  ];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("show_recent_transactions", cards),
  };
}

function showSpendingBreakdown(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const breakdown = buildSpendingBreakdown(snapshot);
  const cards: AgentResponse["cards"] = [
    {
      type: "spending_breakdown",
      title: "Spending breakdown",
      window: breakdown.window,
      totals: breakdown.totals,
      topCategories: breakdown.topCategories,
      topMerchants: breakdown.topMerchants,
      incomeSources: breakdown.incomeSources,
    },
  ];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("show_spending_breakdown", cards),
  };
}

function showRecurringActivity(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const recurringActivity = buildRecurringActivity(snapshot);
  const cards: AgentResponse["cards"] = [
    {
      type: "recurring_activity",
      title: "Likely recurring activity",
      asOfDate: recurringActivity.asOfDate,
      horizonDays: recurringActivity.horizonDays,
      items: recurringActivity.items,
    },
  ];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("show_recurring_activity", cards),
  };
}

function showSpendableCashForecast(
  horizonDays: number,
  snapshot: FinancialSnapshot,
): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const forecast = buildSpendableCashForecast(snapshot, {
    horizonDays,
  });
  const cards: AgentResponse["cards"] = [
    {
      type: "spendable_cash_forecast",
      title: `${forecast.horizonDays}-day forecast`,
      asOfDate: forecast.asOfDate,
      horizonDays: forecast.horizonDays,
      currentSpendableCashCents: forecast.currentSpendableCashCents,
      projectedSpendableCashCents: forecast.projectedSpendableCashCents,
      dailyTrendCents: forecast.dailyTrendCents,
      disclaimer: forecast.disclaimer,
      points: forecast.points,
      recurringItems: forecast.recurringItems,
    },
  ];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("show_spendable_cash_forecast", cards),
  };
}

function defineSpendableCash(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const metric = result.spendableCashToday;

  return {
    message: metric
      ? `Spendable Cash Today is ${formatMoney(metric.spendableCashTodayCents)} today based on your normal money pattern, protected savings, recurring bills, recent spending pace, and available cash.`
      : "",
    cards: [],
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("define_spendable_cash", []),
  };
}

function detectMissingCard(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const warning = result.warnings.find((item) => item.id === "missing-card");

  const cards: AgentResponse["cards"] = [
    warning
      ? {
          type: "missing_card_nudge",
          title: warning.label,
          detail: warning.detail,
          issuerName: warning.issuerName,
        }
      : {
          type: "connect_account",
          title: "Connect or repair data",
          detail:
            "Ask me in chat to connect Plaid, repair a stale bank connection, or add the card that is missing from Spendable Cash Today.",
        },
  ];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("detect_missing_card", cards),
  };
}

function showMath(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const metric = result.spendableCashToday;

  const cards: AgentResponse["cards"] = [
    {
      type: "math_breakdown",
      title: "Math breakdown",
      incomeTotalCents: result.incomeTotalCents,
      spendingTotalCents: result.spendingTotalCents,
      protectedSavingsMonthlyCents: result.protectedSavingsMonthlyCents,
      rollingNetCents: result.rollingNetCents,
      dayCount: result.window.dayCount,
      spendableCashTodayCents: metric?.spendableCashTodayCents,
      baselineDailyAllowanceCents: metric?.baselineDailyAllowanceCents,
      behaviorAdjustmentCents: metric?.behaviorAdjustmentCents,
      cashRealityAdjustmentCents: metric?.cashRealityAdjustmentCents,
      legacyRollingDailySurplusCents: metric?.legacyRollingDailySurplusCents,
    },
  ];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("show_math", cards),
  };
}

function composeInsightCard(
  topic: z.infer<typeof insightCardArgsSchema>["topic"],
  snapshot: FinancialSnapshot,
): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const card = topic === "payday_impact"
    ? buildPaydayImpactCard(result)
    : buildSpendableFactorsCard(result);
  const cards: AgentResponse["cards"] = [card];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("compose_insight_card", cards),
  };
}

function buildPaydayImpactCard(result: ReturnType<typeof calculateFreeCash>): Extract<AgentResponse["cards"][number], { type: "insight_card" }> {
  const metric = result.spendableCashToday;

  if (metric) {
    return {
      type: "insight_card",
      title: "Payday impact",
      summary:
        `Income averages ${formatMoney(metric.averageMonthlyIncomeCents)} per month before bills, protected savings, and the cushion are held back.`,
      rows: [
        {
          id: "income-average",
          label: "Income pattern",
          amountCents: metric.averageMonthlyIncomeCents,
          detail: "Completed-month income average.",
          tone: metric.averageMonthlyIncomeCents > 0 ? "positive" : "neutral",
        },
        {
          id: "bills",
          label: "Bills held back",
          amountCents: -metric.averageMonthlyRecurringObligationsCents,
          detail: "Likely recurring obligations.",
          tone: metric.averageMonthlyRecurringObligationsCents > 0 ? "negative" : "neutral",
        },
        {
          id: "savings",
          label: "Protected savings",
          amountCents: -metric.protectedSavingsMonthlyCents,
          detail: "Held back before today exists.",
          tone: "neutral",
        },
        {
          id: "today",
          label: "Today",
          amountCents: metric.spendableCashTodayCents,
          detail: "Pattern-based room after recent spending and cash reality.",
          tone: metric.spendableCashTodayCents > 0 ? "positive" : "warning",
        },
      ],
      footer: "I do not rely on exact upcoming paycheck dates for this number.",
    };
  }

  const dailyIncomeCents = Math.round(result.incomeTotalCents / result.window.dayCount);

  return {
    type: "insight_card",
    title: "Payday impact",
    summary:
      `Income adds ${formatMoney(result.incomeTotalCents)} inside this rolling month. Spread over ${result.window.dayCount} days, that is about ${formatMoney(dailyIncomeCents)} per day before spending and protected savings.`,
    rows: [
      {
        id: "income",
        label: "Income counted",
        amountCents: result.incomeTotalCents,
        detail: "Paychecks and deposits inside the rolling month.",
        tone: result.incomeTotalCents > 0 ? "positive" : "neutral",
      },
      {
        id: "daily-income",
        label: "Daily lift",
        amountCents: dailyIncomeCents,
        detail: `Income spread across ${result.window.dayCount} days.`,
        tone: dailyIncomeCents > 0 ? "positive" : "neutral",
      },
      {
        id: "spending",
        label: "Spending and bills",
        amountCents: -result.spendingTotalCents,
        detail: "Spending offsets income before today's number.",
        tone: result.spendingTotalCents > 0 ? "negative" : "neutral",
      },
      {
        id: "protected-savings",
        label: "Protected savings",
        amountCents: -result.protectedSavingsMonthlyCents,
        detail: "Held out before I calculate Spendable Cash Today.",
        tone: result.protectedSavingsMonthlyCents > 0 ? "neutral" : "positive",
      },
      {
        id: "today",
        label: "Today",
        amountCents: result.freeCashTodayCents,
        detail: "After income, spending, and protected savings.",
        tone: toneForAmount(result.freeCashTodayCents),
      },
    ],
    footer: "Payday helps most while it stays inside the rolling window.",
  };
}

function buildSpendableFactorsCard(result: ReturnType<typeof calculateFreeCash>): Extract<AgentResponse["cards"][number], { type: "insight_card" }> {
  return {
    type: "insight_card",
    title: "What affects today",
    summary: summarizeFreeCash(result),
    rows: (result.spendableCashToday?.drivers ?? result.drivers).slice(0, 6).map((driver) => ({
      id: driver.id,
      label: driver.label,
      amountCents: driver.amountCents,
      detail: driver.detail,
      tone: driver.tone,
    })),
    footer: "Positive rows lift the number; negative rows pull it down.",
  };
}

function showPatternAssumptions(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const metric = result.spendableCashToday;
  const rows = metric
    ? [
        {
          id: "income",
          label: "Income pattern",
          amountCents: metric.averageMonthlyIncomeCents,
          detail: `${metric.completedMonthCount} completed month${metric.completedMonthCount === 1 ? "" : "s"} in the baseline.`,
          tone: metric.averageMonthlyIncomeCents > 0 ? "positive" as const : "neutral" as const,
        },
        {
          id: "obligations",
          label: "Bills held back",
          amountCents: -metric.averageMonthlyRecurringObligationsCents,
          detail: "Recurring obligations detected from merchants, categories, and cadence.",
          tone: metric.averageMonthlyRecurringObligationsCents > 0 ? "negative" as const : "neutral" as const,
        },
        {
          id: "everyday",
          label: "Everyday context",
          amountCents: -metric.averageMonthlyEverydaySpendCents,
          detail: "Used for context, not subtracted from the daily room.",
          tone: metric.averageMonthlyEverydaySpendCents > 0 ? "negative" as const : "neutral" as const,
        },
        {
          id: "confidence",
          label: "Confidence",
          valueText: metric.confidence,
          detail: "Lower confidence means the number is more conservative.",
          tone: metric.confidence === "low" ? "warning" as const : "neutral" as const,
        },
      ]
    : [];
  const cards: AgentResponse["cards"] = [
    {
      type: "insight_card",
      title: "Pattern assumptions",
      summary: metric
        ? "I use completed months for the baseline and current-month spending only as an adjustment."
        : "I need a current Spendable Cash result before I can show assumptions.",
      rows,
      footer: "This is pattern-based, not a category budget.",
    },
  ];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("show_pattern_assumptions", cards),
  };
}

function showRecentSpendingPressure(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const metric = result.spendableCashToday;
  const cards: AgentResponse["cards"] = [
    {
      type: "insight_card",
      title: "Recent spending pressure",
      summary: metric
        ? summarizeFreeCash(result)
        : "I need a current Spendable Cash result before I can compare recent spending pace.",
      rows: metric
        ? [
            {
              id: "allowed",
              label: "Allowed so far",
              amountCents: metric.allowedSoFarThisMonthCents,
              detail: "Normal room multiplied by elapsed days this month.",
              tone: "positive",
            },
            {
              id: "actual",
              label: "Spent so far",
              amountCents: -metric.actualEverydaySpendSoFarCents,
              detail: "Everyday spending after refunds.",
              tone: metric.actualEverydaySpendSoFarCents > 0 ? "negative" : "neutral",
            },
            {
              id: "variance",
              label: "Pace difference",
              amountCents: metric.currentMonthVarianceCents,
              detail: "Positive means lighter than pace; negative means ahead of pace.",
              tone: toneForAmount(metric.currentMonthVarianceCents),
            },
            {
              id: "daily",
              label: "Daily adjustment",
              amountCents: metric.behaviorAdjustmentCents,
              detail: `Spread across ${metric.recoveryDays} days.`,
              tone: toneForAmount(metric.behaviorAdjustmentCents),
            },
          ]
        : [],
      footer: "Recent spending changes the next days; it does not rewrite the whole baseline.",
    },
  ];

  return {
    message: "",
    cards,
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("show_recent_spending_pressure", cards),
  };
}

function toneForAmount(amountCents: number): "positive" | "negative" | "neutral" {
  if (amountCents > 0) {
    return "positive";
  }

  if (amountCents < 0) {
    return "negative";
  }

  return "neutral";
}

function answerUnrelated(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);

  return {
    message: "",
    cards: [],
    promptChips: getSuggestedPrompts(result),
    ...baseResponse("answer_unrelated", []),
  };
}
