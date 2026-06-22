import { describe, expect, it } from "vitest";
import { buildRecurringActivity, buildSpendableCashForecast } from "@/lib/pip-cash/insights";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";
import type { FinancialSnapshot, RecurringObligationRule, Transaction } from "@/lib/types";

describe("Spendable Cash forecast", () => {
  it("uses the V2 Spendable Cash Today metric instead of legacy rolling surplus", () => {
    const result = calculatePipCash(fakeSnapshot);
    const forecast = buildSpendableCashForecast(fakeSnapshot, {
      horizonDays: 14,
    });

    expect(result.pipCashTodayCents).not.toBe(result.spendableCashToday?.spendableCashTodayCents);
    expect(forecast.currentSpendableCashCents).toBe(
      result.spendableCashToday?.spendableCashTodayCents,
    );
    expect(forecast.currentSpendableCashCents).not.toBe(result.pipCashTodayCents);
    expect(forecast.points).toHaveLength(14);
    expect(forecast.points[0].deltaFromTodayCents).toBe(
      forecast.points[0].projectedSpendableCashCents - forecast.currentSpendableCashCents,
    );
  });
});

describe("Recurring activity", () => {
  it("shows confirmed monthly obligation rules even without recent matching transactions", () => {
    const activity = buildRecurringActivity(snapshotWith([], {
      recurringObligationRules: [
        rule({
          merchantKey: "city-power",
          label: "City Power",
          expectedAmountCents: 8400,
          expectedDay: 3,
          source: "user_confirmed",
          status: "active",
        }),
      ],
    }));

    expect(activity.items).toEqual([
      expect.objectContaining({
        id: "confirmed-city-power",
        label: "City Power",
        merchantName: "City Power",
        expectedDate: "2026-07-03",
        amountCents: -8400,
        kind: "purchase",
        cadence: "monthly",
        confidence: "high",
        sourceTransactionCount: 0,
        lastSeenDate: "2026-06-20",
      }),
    ]);
  });

  it("schedules confirmed rules later in the current month when the expected day has not passed", () => {
    const activity = buildRecurringActivity(snapshotWith([], {
      recurringObligationRules: [
        rule({
          merchantKey: "phone-plan",
          label: "Phone Plan",
          expectedAmountCents: 8000,
          expectedDay: 28,
          source: "user_confirmed",
          status: "active",
        }),
      ],
    }));

    expect(activity.items[0]).toMatchObject({
      id: "confirmed-phone-plan",
      label: "Phone Plan",
      expectedDate: "2026-06-28",
      amountCents: -8000,
      confidence: "high",
    });
  });

  it("detects a confirmed monthly subscription", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "youtube_mar",
        date: "2026-03-08",
        description: "Youtube Premium",
        merchantName: "Youtube Premium",
        amountCents: -1399,
        category: "subscriptions",
        kind: "purchase",
      }),
      tx({
        id: "youtube_apr",
        date: "2026-04-08",
        description: "Youtube Premium",
        merchantName: "Youtube Premium",
        amountCents: -1399,
        category: "subscriptions",
        kind: "purchase",
      }),
      tx({
        id: "youtube_may",
        date: "2026-05-08",
        description: "Youtube Premium",
        merchantName: "Youtube Premium",
        amountCents: -1399,
        category: "subscriptions",
        kind: "purchase",
      }),
      tx({
        id: "youtube_jun",
        date: "2026-06-08",
        description: "Youtube Premium",
        merchantName: "Youtube Premium",
        amountCents: -1399,
        category: "subscriptions",
        kind: "purchase",
      }),
    ]));

    expect(activity.items[0]).toMatchObject({
      label: "Youtube Premium",
      expectedDate: "2026-07-08",
      amountCents: -1399,
      kind: "purchase",
      cadence: "monthly",
      confidence: "high",
      sourceTransactionCount: 4,
      lastSeenDate: "2026-06-08",
    });
  });

  it("keeps variable monthly utility bills as medium confidence recurring activity", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "power_mar",
        date: "2026-03-03",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -9800,
        category: "utilities",
        kind: "purchase",
      }),
      tx({
        id: "power_apr",
        date: "2026-04-03",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -14300,
        category: "utilities",
        kind: "purchase",
      }),
      tx({
        id: "power_may",
        date: "2026-05-03",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -12100,
        category: "utilities",
        kind: "purchase",
      }),
      tx({
        id: "power_jun",
        date: "2026-06-03",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -12200,
        category: "utilities",
        kind: "purchase",
      }),
    ]));

    expect(activity.items[0]).toMatchObject({
      label: "City Power",
      expectedDate: "2026-07-03",
      amountCents: -12100,
      kind: "purchase",
      cadence: "monthly",
      confidence: "medium",
      sourceTransactionCount: 4,
      lastSeenDate: "2026-06-03",
    });
  });

  it("lets confirmed rules take precedence over detected transactions for the same merchant", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "power_may",
        date: "2026-05-03",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -12100,
        category: "utilities",
        kind: "purchase",
      }),
      tx({
        id: "power_jun",
        date: "2026-06-03",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -12200,
        category: "utilities",
        kind: "purchase",
      }),
    ], {
      recurringObligationRules: [
        rule({
          merchantKey: "city-power",
          label: "City Power",
          expectedAmountCents: 8400,
          expectedDay: 3,
          source: "user_confirmed",
          status: "active",
        }),
      ],
    }));

    expect(activity.items).toHaveLength(1);
    expect(activity.items[0]).toMatchObject({
      id: "confirmed-city-power",
      amountCents: -8400,
      confidence: "high",
    });
  });

  it("lets confirmed rules suppress detected transactions with a more specific merchant label", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "power_may",
        date: "2026-05-03",
        description: "City Power utility bill",
        merchantName: "City Power Utility Bill",
        amountCents: -12100,
        category: "utilities",
        kind: "purchase",
      }),
      tx({
        id: "power_jun",
        date: "2026-06-03",
        description: "City Power utility bill",
        merchantName: "City Power Utility Bill",
        amountCents: -12200,
        category: "utilities",
        kind: "purchase",
      }),
    ], {
      recurringObligationRules: [
        rule({
          merchantKey: "city-power",
          label: "City Power",
          expectedAmountCents: 8400,
          expectedDay: 3,
          source: "user_confirmed",
          status: "active",
        }),
      ],
    }));

    expect(activity.items).toHaveLength(1);
    expect(activity.items[0]).toMatchObject({
      id: "confirmed-city-power",
      amountCents: -8400,
      confidence: "high",
    });
  });

  it("suppresses detected recurring activity when the user ignored that merchant", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "power_apr",
        date: "2026-04-03",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -9800,
        category: "utilities",
        kind: "purchase",
      }),
      tx({
        id: "power_may",
        date: "2026-05-03",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -12100,
        category: "utilities",
        kind: "purchase",
      }),
      tx({
        id: "power_jun",
        date: "2026-06-03",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -12200,
        category: "utilities",
        kind: "purchase",
      }),
    ], {
      recurringObligationRules: [
        rule({
          merchantKey: "city-power",
          label: "City Power",
          expectedAmountCents: 0,
          source: "user_correction",
          status: "ignored",
        }),
      ],
    }));

    expect(activity.items).toEqual([]);
  });

  it("suppresses detected recurring activity when an ignored merchant has a more specific transaction label", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "power_apr",
        date: "2026-04-03",
        description: "City Power utility bill",
        merchantName: "City Power Utility Bill",
        amountCents: -9800,
        category: "utilities",
        kind: "purchase",
      }),
      tx({
        id: "power_may",
        date: "2026-05-03",
        description: "City Power utility bill",
        merchantName: "City Power Utility Bill",
        amountCents: -12100,
        category: "utilities",
        kind: "purchase",
      }),
      tx({
        id: "power_jun",
        date: "2026-06-03",
        description: "City Power utility bill",
        merchantName: "City Power Utility Bill",
        amountCents: -12200,
        category: "utilities",
        kind: "purchase",
      }),
    ], {
      recurringObligationRules: [
        rule({
          merchantKey: "city-power",
          label: "City Power",
          expectedAmountCents: 0,
          source: "user_correction",
          status: "ignored",
        }),
      ],
    }));

    expect(activity.items).toEqual([]);
  });

  it("excludes payroll from default recurring bill activity", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "payroll_apr",
        date: "2026-04-26",
        description: "Payroll deposit",
        merchantName: "Acme Studio",
        amountCents: 210000,
        category: "payroll",
        kind: "income",
      }),
      tx({
        id: "payroll_may_1",
        date: "2026-05-10",
        description: "Payroll deposit",
        merchantName: "Acme Studio",
        amountCents: 210000,
        category: "payroll",
        kind: "income",
      }),
      tx({
        id: "payroll_may_2",
        date: "2026-05-24",
        description: "Payroll deposit",
        merchantName: "Acme Studio",
        amountCents: 210000,
        category: "payroll",
        kind: "income",
      }),
      tx({
        id: "payroll_jun",
        date: "2026-06-07",
        description: "Payroll deposit",
        merchantName: "Acme Studio",
        amountCents: 210000,
        category: "payroll",
        kind: "income",
      }),
    ]));

    expect(activity.items).toEqual([]);
  });

  it("excludes credit-card autopay from default recurring bill activity", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "card_apr",
        date: "2026-04-15",
        description: "Autopay Capital One Visa",
        merchantName: "Capital One",
        amountCents: -62000,
        category: "credit card payment",
        kind: "credit_card_payment",
      }),
      tx({
        id: "card_may",
        date: "2026-05-15",
        description: "Autopay Capital One Visa",
        merchantName: "Capital One",
        amountCents: -59000,
        category: "credit card payment",
        kind: "credit_card_payment",
      }),
      tx({
        id: "card_jun",
        date: "2026-06-15",
        description: "Autopay Capital One Visa",
        merchantName: "Capital One",
        amountCents: -65000,
        category: "credit card payment",
        kind: "credit_card_payment",
      }),
    ]));

    expect(activity.items).toEqual([]);
  });

  it("excludes savings transfers from default recurring bill activity", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "savings_apr",
        date: "2026-04-05",
        description: "Transfer to savings",
        merchantName: "Northstar Bank",
        amountCents: -30000,
        category: "transfer",
        kind: "transfer",
      }),
      tx({
        id: "savings_may",
        date: "2026-05-05",
        description: "Transfer to savings",
        merchantName: "Northstar Bank",
        amountCents: -30000,
        category: "transfer",
        kind: "transfer",
      }),
      tx({
        id: "savings_jun",
        date: "2026-06-05",
        description: "Transfer to savings",
        merchantName: "Northstar Bank",
        amountCents: -30000,
        category: "transfer",
        kind: "transfer",
      }),
    ]));

    expect(activity.items).toEqual([]);
  });

  it("does not treat duplicate same-week purchases as monthly recurring activity", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "streambox_first",
        date: "2026-06-02",
        description: "Streambox Premium",
        merchantName: "Streambox",
        amountCents: -999,
        category: "subscriptions",
        kind: "purchase",
      }),
      tx({
        id: "streambox_second",
        date: "2026-06-06",
        description: "Streambox Premium",
        merchantName: "Streambox",
        amountCents: -999,
        category: "subscriptions",
        kind: "purchase",
      }),
    ]));

    expect(activity.items).toEqual([]);
  });

  it("shows a low-confidence historical bill candidate when monthly bill evidence is older than the fresh detector window", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "internet_jan",
        date: "2026-01-15",
        description: "Fiber Internet monthly bill",
        merchantName: "Fiber Internet",
        amountCents: -7000,
        category: "internet",
        kind: "purchase",
      }),
      tx({
        id: "internet_feb",
        date: "2026-02-15",
        description: "Fiber Internet monthly bill",
        merchantName: "Fiber Internet",
        amountCents: -7000,
        category: "internet",
        kind: "purchase",
      }),
      tx({
        id: "internet_mar",
        date: "2026-03-15",
        description: "Fiber Internet monthly bill",
        merchantName: "Fiber Internet",
        amountCents: -7000,
        category: "internet",
        kind: "purchase",
      }),
    ]));

    expect(activity.items[0]).toMatchObject({
      id: "historical-fiber-internet",
      label: "Fiber Internet",
      expectedDate: "2026-07-15",
      amountCents: -7000,
      confidence: "low",
      sourceTransactionCount: 3,
      lastSeenDate: "2026-03-15",
    });
  });

  it("suppresses historical bill candidates when the user ignored that merchant", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "internet_jan",
        date: "2026-01-15",
        description: "Fiber Internet monthly bill",
        merchantName: "Fiber Internet",
        amountCents: -7000,
        category: "internet",
        kind: "purchase",
      }),
      tx({
        id: "internet_feb",
        date: "2026-02-15",
        description: "Fiber Internet monthly bill",
        merchantName: "Fiber Internet",
        amountCents: -7000,
        category: "internet",
        kind: "purchase",
      }),
      tx({
        id: "internet_mar",
        date: "2026-03-15",
        description: "Fiber Internet monthly bill",
        merchantName: "Fiber Internet",
        amountCents: -7000,
        category: "internet",
        kind: "purchase",
      }),
    ], {
      recurringObligationRules: [
        rule({
          merchantKey: "fiber-internet",
          label: "Fiber Internet",
          expectedAmountCents: 0,
          source: "user_correction",
          status: "ignored",
        }),
      ],
    }));

    expect(activity.items).toEqual([]);
  });

  it("does not show repeat retail purchases as historical bill candidates", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "target_jan",
        date: "2026-01-15",
        description: "Target",
        merchantName: "Target",
        amountCents: -7000,
        category: "shops",
        kind: "purchase",
      }),
      tx({
        id: "target_feb",
        date: "2026-02-15",
        description: "Target",
        merchantName: "Target",
        amountCents: -7000,
        category: "shops",
        kind: "purchase",
      }),
      tx({
        id: "target_mar",
        date: "2026-03-15",
        description: "Target",
        merchantName: "Target",
        amountCents: -7000,
        category: "shops",
        kind: "purchase",
      }),
    ]));

    expect(activity.items).toEqual([]);
  });
});

function snapshotWith(
  transactions: Transaction[],
  overrides: Partial<Pick<FinancialSnapshot, "recurringObligationRules">> = {},
): FinancialSnapshot {
  return {
    settings: {
      asOfDate: "2026-06-20",
      protectedSavingsMonthlyCents: 0,
    },
    accounts: [
      {
        id: "checking",
        name: "Everyday Checking",
        institutionName: "Northstar Bank",
        kind: "checking",
        balanceCents: 100000,
      },
      {
        id: "savings",
        name: "Protected Savings",
        institutionName: "Northstar Bank",
        kind: "savings",
        balanceCents: 500000,
        isProtectedSavings: true,
      },
      {
        id: "credit-card",
        name: "Everyday Visa",
        institutionName: "Capital One",
        kind: "credit_card",
        balanceCents: -10000,
      },
    ],
    transactions,
    ...overrides,
  };
}

function tx(input: Omit<Transaction, "accountId"> & { accountId?: string }): Transaction {
  return {
    accountId: "checking",
    ...input,
  };
}

function rule(overrides: Partial<RecurringObligationRule>): RecurringObligationRule {
  return {
    id: "rule-1",
    userId: "user-1",
    merchantKey: "city-power",
    label: "City Power",
    expectedAmountCents: 8400,
    cadence: "monthly",
    source: "user_confirmed",
    status: "active",
    lastConfirmedAt: "2026-06-20T00:00:00.000Z",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...overrides,
  };
}
