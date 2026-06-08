import { z } from "zod";
import type { AgentResponse } from "@/lib/agent/card-types";
import { getSuggestedPrompts } from "@/lib/agent/suggested-prompts";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { summarizeFreeCash } from "@/lib/free-cash/explanation";
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
      title: "Why this number changed",
      summary,
      drivers: result.drivers,
      warnings: result.warnings,
      dataStates: result.dataStates,
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
  const afterTodayCents = result.freeCashTodayCents - amountCents;
  const monthlyAverageAfterCents = Math.round(
    (result.rollingNetCents - amountCents) / result.window.dayCount,
  );

  const cards: AgentResponse["cards"] = [
    {
      type: "purchase_simulation",
      title: "Purchase simulation",
      amountCents,
      beforeCents: result.freeCashTodayCents,
      afterTodayCents,
      monthlyAverageAfterCents,
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

  return {
    message: "",
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

  const cards: AgentResponse["cards"] = [
    {
      type: "math_breakdown",
      title: "Math breakdown",
      incomeTotalCents: result.incomeTotalCents,
      spendingTotalCents: result.spendingTotalCents,
      protectedSavingsMonthlyCents: result.protectedSavingsMonthlyCents,
      rollingNetCents: result.rollingNetCents,
      dayCount: result.window.dayCount,
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
    rows: result.drivers.slice(0, 6).map((driver) => ({
      id: driver.id,
      label: driver.label,
      amountCents: driver.amountCents,
      detail: driver.detail,
      tone: driver.tone,
    })),
    footer: "Positive rows lift the number; negative rows pull it down.",
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
