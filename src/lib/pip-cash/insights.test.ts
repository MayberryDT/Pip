import { describe, expect, it } from "vitest";
import { buildRecurringActivity, buildSpendableCashForecast } from "@/lib/pip-cash/insights";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";
import type { FinancialSnapshot, Transaction } from "@/lib/types";

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
});

function snapshotWith(transactions: Transaction[]): FinancialSnapshot {
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
  };
}

function tx(input: Omit<Transaction, "accountId"> & { accountId?: string }): Transaction {
  return {
    accountId: "checking",
    ...input,
  };
}
