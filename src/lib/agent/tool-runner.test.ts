import { describe, expect, it } from "vitest";
import { runAgentTool } from "@/lib/agent/tool-runner";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot, getFakeSnapshot } from "@/lib/fake-data";
import type { FinancialSnapshot } from "@/lib/types";

describe("agent tool runner", () => {
  it("returns deterministic explanation, simulation, balances, math, and missing-card cards", () => {
    const result = calculatePipCash(fakeSnapshot);

    expect(runAgentTool("explain_pip_cash", {}, fakeSnapshot).cards[0]).toMatchObject({
      type: "pip_cash_explanation",
      title: "Spendable Cash Today",
    });
    expect(runAgentTool("simulate_purchase", { amount_cents: 5000 }, fakeSnapshot).cards[0]).toMatchObject({
      type: "purchase_simulation",
      amountCents: 5000,
      beforeCents: result.spendableCashToday?.spendableCashTodayCents,
      todayRemainingCents: (result.spendableCashToday?.spendableCashTodayCents ?? 0) - 5000,
      todayOverageCents: Math.max(0, 5000 - (result.spendableCashToday?.spendableCashTodayCents ?? 0)),
      dailyEffectCents: expect.any(Number),
    });
    expect(runAgentTool("show_true_balances", {}, fakeSnapshot).cards[0]).toMatchObject({
      type: "true_balances",
      balances: result.trueBalances,
    });
    expect(runAgentTool("show_math", {}, fakeSnapshot).cards[0]).toMatchObject({
      type: "math_breakdown",
      incomeTotalCents: result.incomeTotalCents,
      spendingTotalCents: result.spendingTotalCents,
      protectedSavingsMonthlyCents: result.protectedSavingsMonthlyCents,
      rollingNetCents: result.rollingNetCents,
      dayCount: result.window.dayCount,
    });
    expect(runAgentTool("compose_insight_card", { topic: "payday_impact" }, fakeSnapshot).cards[0]).toMatchObject({
      type: "insight_card",
      title: "Payday impact",
      rows: expect.arrayContaining([
        expect.objectContaining({
          id: "income-average",
          amountCents: result.spendableCashToday?.averageMonthlyIncomeCents,
        }),
        expect.objectContaining({
          id: "today",
          amountCents: result.spendableCashToday?.spendableCashTodayCents,
        }),
      ]),
    });
    expect(runAgentTool("compose_insight_card", { topic: "spendable_factors" }, fakeSnapshot).cards[0]).toMatchObject({
      type: "insight_card",
      title: "What affects today",
      rows: expect.arrayContaining([
        expect.objectContaining({
          id: "baseline-room",
        }),
        expect.objectContaining({
          id: "recent-spending-adjustment",
        }),
        expect.objectContaining({
          id: "protected-savings",
        }),
      ]),
    });
    expect(runAgentTool("show_pattern_assumptions", {}, fakeSnapshot).cards[0]).toMatchObject({
      type: "insight_card",
      title: "Pattern assumptions",
    });
    expect(runAgentTool("show_recent_spending_pressure", {}, fakeSnapshot).cards[0]).toMatchObject({
      type: "insight_card",
      title: "Recent spending pressure",
    });
    expect(runAgentTool("show_spending_opportunity", {}, getFakeSnapshot("cutback-dining")).cards[0]).toMatchObject({
      type: "insight_card",
      title: "Cutback opportunity",
    });
    expect(runAgentTool("detect_missing_card", {}, fakeSnapshot).cards[0]).toMatchObject({
      type: "missing_card_nudge",
      issuerName: "Capital One",
    });
    expect(runAgentTool("show_trust_receipt", {}, fakeSnapshot).cards[0]).toMatchObject({
      type: "trust_receipt",
      title: "Trust receipt",
      rows: expect.arrayContaining([
        expect.objectContaining({
          id: "freshness",
        }),
        expect.objectContaining({
          id: "confidence",
        }),
      ]),
    });
    expect(runAgentTool("show_spending_breakdown", {}, fakeSnapshot).cards[0]).toMatchObject({
      type: "spending_breakdown",
      title: "Spending breakdown",
    });
    expect(runAgentTool("show_recurring_activity", {}, fakeSnapshot).cards[0]).toMatchObject({
      type: "recurring_activity",
      title: "Likely recurring activity",
    });
    expect(runAgentTool("show_spendable_cash_forecast", { horizon_days: 7 }, fakeSnapshot).cards[0]).toMatchObject({
      type: "spendable_cash_forecast",
      title: "7-day forecast",
      horizonDays: 7,
      disclaimer: "Forecast only; not guaranteed.",
    });
    expect(runAgentTool("get_financial_guidance_context", {}, fakeSnapshot)).toMatchObject({
      usedTools: ["get_financial_guidance_context"],
      cards: [],
      responseMode: "chat_only",
    });
  });

  it("requires purchase simulations to include an explicit amount", () => {
    expect(() => runAgentTool("simulate_purchase", {}, fakeSnapshot)).toThrow();
  });

  it("uses unified Monthly Savings amounts in math and insight cards", () => {
    const snapshot = snapshotWithMonthlySavingsGoal();
    const mathCard = runAgentTool("show_math", {}, snapshot).cards[0];
    const insightCard = runAgentTool("compose_insight_card", { topic: "payday_impact" }, snapshot).cards[0];

    expect(mathCard).toMatchObject({
      type: "math_breakdown",
      protectedSavingsMonthlyCents: 35000,
    });
    expect(insightCard).toMatchObject({
      type: "insight_card",
      rows: expect.arrayContaining([
        expect.objectContaining({
          id: "savings",
          amountCents: -35000,
        }),
      ]),
    });
  });

  it("limits recent transactions to the current rolling window and requested count", () => {
    const response = runAgentTool("show_recent_transactions", { limit: 2 }, fakeSnapshot);
    const card = response.cards[0];

    expect(card).toMatchObject({
      type: "recent_transactions",
      title: "Recent transactions",
    });

    if (card?.type !== "recent_transactions") {
      throw new Error("Expected recent transactions card.");
    }

    expect(card.transactions.map((transaction) => transaction.id)).toEqual([
      "tx_weekend",
      "tx_coffee",
    ]);
    expect(card.transactions).toHaveLength(2);
    expect(card.transactions.every((transaction) => transaction.date >= "2026-05-20")).toBe(true);
  });

  it("uses real-data connect language when there is no missing-card warning", () => {
    const response = runAgentTool("detect_missing_card", {}, cleanSnapshot);

    expect(response.cards[0]).toEqual({
      type: "connect_account",
      title: "Connect or repair data",
      detail:
        "Ask me in chat to connect Plaid, repair a stale bank connection, or add the card that is missing from Spendable Cash Today.",
    });
  });

  it("detects a likely monthly subscription for recurring activity", () => {
    const response = runAgentTool("show_recurring_activity", {}, recurringSnapshot);
    const card = response.cards[0];

    if (card?.type !== "recurring_activity") {
      throw new Error("Expected recurring activity card.");
    }

    expect(card.items[0]).toMatchObject({
      label: "Youtube Premium",
      expectedDate: "2026-07-08",
      amountCents: -1399,
    });
  });

  it("keeps provider category taxonomy and reason codes out of cutback card copy", () => {
    const response = runAgentTool("show_spending_opportunity", {}, providerCategorySnapshot);
    const card = response.cards[0];

    if (card?.type !== "insight_card") {
      throw new Error("Expected cutback insight card.");
    }

    const visibleCopy = [
      card.title,
      card.summary,
      ...card.rows.flatMap((row) => [row.label, row.detail ?? "", row.valueText ?? ""]),
      card.footer ?? "",
    ].join(" ");

    expect(card.summary).toContain("Services is $95");
    expect(card.footer).toBe("Based on recent repeat spending and merchant concentration.");
    expect(visibleCopy).not.toMatch(/general_services|other_general_services/i);
    expect(visibleCopy).not.toMatch(
      /discretionary_category|recent_increase|frequent_transactions|material_spend|merchant_concentration/,
    );
  });
});

const cleanSnapshot: FinancialSnapshot = {
  settings: {
    asOfDate: "2026-06-20",
    protectedSavingsMonthlyCents: 0,
  },
  accounts: [
    {
      id: "checking",
      name: "Everyday Checking",
      institutionName: "Plaid Bank",
      kind: "checking",
      balanceCents: 10000,
    },
  ],
  transactions: [],
};

const recurringSnapshot: FinancialSnapshot = {
  settings: {
    asOfDate: "2026-06-20",
    protectedSavingsMonthlyCents: 0,
  },
  accounts: [
    {
      id: "checking",
      name: "Everyday Checking",
      institutionName: "Plaid Bank",
      kind: "checking",
      balanceCents: 10000,
    },
  ],
  transactions: [
    {
      id: "youtube_may",
      accountId: "checking",
      date: "2026-05-08",
      description: "Youtube Premium",
      merchantName: "Youtube Premium",
      amountCents: -1399,
      category: "subscriptions",
      kind: "purchase",
    },
    {
      id: "youtube_june",
      accountId: "checking",
      date: "2026-06-08",
      description: "Youtube Premium",
      merchantName: "Youtube Premium",
      amountCents: -1399,
      category: "subscriptions",
      kind: "purchase",
    },
  ],
};

const providerCategorySnapshot: FinancialSnapshot = {
  settings: {
    asOfDate: "2026-06-16",
    protectedSavingsMonthlyCents: 0,
  },
  accounts: [
    {
      id: "checking",
      name: "Everyday Checking",
      institutionName: "Plaid Bank",
      kind: "checking",
      balanceCents: 10000,
    },
  ],
  transactions: [
    {
      id: "service-1",
      accountId: "checking",
      date: "2026-06-04",
      description: "Repair Desk",
      merchantName: "Repair Desk",
      amountCents: -4500,
      category: "general_services:general_services_other_general_services",
      kind: "purchase",
    },
    {
      id: "service-2",
      accountId: "checking",
      date: "2026-06-08",
      description: "Laundry App",
      merchantName: "Laundry App",
      amountCents: -2500,
      category: "general_services:general_services_other_general_services",
      kind: "purchase",
    },
    {
      id: "service-3",
      accountId: "checking",
      date: "2026-06-14",
      description: "Home Task Co",
      merchantName: "Home Task Co",
      amountCents: -2500,
      category: "general_services:general_services_other_general_services",
      kind: "purchase",
    },
  ],
};

function snapshotWithMonthlySavingsGoal(): FinancialSnapshot {
  return {
    ...fakeSnapshot,
    settings: {
      ...fakeSnapshot.settings,
      protectedSavingsMonthlyCents: 30000,
    },
    savingsGoals: [
      {
        id: "goal-1",
        userId: "user-1",
        name: "Trip",
        targetAmountCents: 500000,
        targetDate: "2027-06-18",
        startingAmountCents: 0,
        currentAmountCents: 100000,
        monthlyContributionCents: 35000,
        includeInSpendableCash: true,
        status: "active",
        createdAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
    ],
  };
}
