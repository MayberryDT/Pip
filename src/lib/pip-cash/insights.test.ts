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

  it("detects production-shaped monthly obligations without explicit bill keywords", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "video_apr",
        date: "2026-04-04",
        description: "Video Stream",
        merchantName: "Video Stream",
        amountCents: -1466,
        category: "entertainment:entertainment_tv_and_movies",
        kind: "purchase",
      }),
      tx({
        id: "video_may",
        date: "2026-05-04",
        description: "Video Stream",
        merchantName: "Video Stream",
        amountCents: -1466,
        category: "entertainment:entertainment_tv_and_movies",
        kind: "purchase",
      }),
      tx({
        id: "video_jun",
        date: "2026-06-04",
        description: "Video Stream",
        merchantName: "Video Stream",
        amountCents: -1466,
        category: "entertainment:entertainment_tv_and_movies",
        kind: "purchase",
      }),
      tx({
        id: "loan_apr",
        date: "2026-04-05",
        description: "Credit Builder",
        merchantName: "Credit Builder",
        amountCents: -2620,
        category: "loan_payments:loan_payments_other_payment",
        kind: "purchase",
      }),
      tx({
        id: "loan_may",
        date: "2026-05-05",
        description: "Credit Builder",
        merchantName: "Credit Builder",
        amountCents: -2620,
        category: "loan_payments:loan_payments_other_payment",
        kind: "purchase",
      }),
      tx({
        id: "loan_jun",
        date: "2026-06-05",
        description: "Credit Builder",
        merchantName: "Credit Builder",
        amountCents: -2620,
        category: "loan_payments:loan_payments_other_payment",
        kind: "purchase",
      }),
      tx({
        id: "tool_apr",
        date: "2026-04-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "tool_may",
        date: "2026-05-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "tool_jun",
        date: "2026-06-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "api_apr",
        date: "2026-04-01",
        description: "Research API",
        merchantName: "Research API",
        amountCents: -1504,
        category: "food_and_drink:food_and_drink_restaurant",
        kind: "purchase",
      }),
      tx({
        id: "api_may",
        date: "2026-05-01",
        description: "Research API",
        merchantName: "Research API",
        amountCents: -1504,
        category: "food_and_drink:food_and_drink_restaurant",
        kind: "purchase",
      }),
      tx({
        id: "api_jun",
        date: "2026-06-01",
        description: "Research API",
        merchantName: "Research API",
        amountCents: -1504,
        category: "food_and_drink:food_and_drink_restaurant",
        kind: "purchase",
      }),
    ]));

    expect(activity.items.map((item) => ({
      label: item.label,
      expectedDate: item.expectedDate,
      amountCents: item.amountCents,
      confidence: item.confidence,
    }))).toEqual([
      {
        label: "Research API",
        expectedDate: "2026-07-01",
        amountCents: -1504,
        confidence: "high",
      },
      {
        label: "Video Stream",
        expectedDate: "2026-07-04",
        amountCents: -1466,
        confidence: "high",
      },
      {
        label: "Credit Builder",
        expectedDate: "2026-07-05",
        amountCents: -2620,
        confidence: "high",
      },
      {
        label: "Workspace Tool",
        expectedDate: "2026-07-10",
        amountCents: -500,
        confidence: "high",
      },
    ]);
  });

  it("allows two-month recurring evidence for strong subscription categories", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "tv_may",
        date: "2026-05-04",
        description: "Movie Box",
        merchantName: "Movie Box",
        amountCents: -1899,
        category: "entertainment:entertainment_tv_and_movies",
        kind: "purchase",
      }),
      tx({
        id: "tv_jun",
        date: "2026-06-04",
        description: "Movie Box",
        merchantName: "Movie Box",
        amountCents: -1899,
        category: "entertainment:entertainment_tv_and_movies",
        kind: "purchase",
      }),
    ]));

    expect(activity.items[0]).toMatchObject({
      label: "Movie Box",
      expectedDate: "2026-07-04",
      amountCents: -1899,
      sourceTransactionCount: 2,
    });
  });

  it("does not show unstable two-month entertainment spend as a recurring bill", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "arcade_may",
        date: "2026-05-01",
        description: "Arcade Night",
        merchantName: "Arcade Night",
        amountCents: -4000,
        category: "entertainment:entertainment_other_entertainment",
        kind: "purchase",
      }),
      tx({
        id: "arcade_jun",
        date: "2026-06-08",
        description: "Arcade Night",
        merchantName: "Arcade Night",
        amountCents: -10000,
        category: "entertainment:entertainment_other_entertainment",
        kind: "purchase",
      }),
    ]));

    expect(activity.items).toEqual([]);
  });

  it("uses the stable monthly charge when a merchant has extra same-month charges", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "cloud_apr",
        date: "2026-04-10",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -2000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "cloud_may",
        date: "2026-05-10",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -2000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "cloud_jun_extra",
        date: "2026-06-02",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -300,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "cloud_jun",
        date: "2026-06-10",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -2000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
    ]));

    expect(activity.items[0]).toMatchObject({
      label: "Cloud Host",
      expectedDate: "2026-07-10",
      amountCents: -2000,
      confidence: "high",
      sourceTransactionCount: 3,
      lastSeenDate: "2026-06-10",
    });
  });

  it("prefers the larger stable monthly charge when a merchant has two stable recurring patterns", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "cloud_apr_addon",
        date: "2026-04-02",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -300,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "cloud_apr_main",
        date: "2026-04-10",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -2000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "cloud_may_addon",
        date: "2026-05-02",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -300,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "cloud_may_main",
        date: "2026-05-10",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -2000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "cloud_jun_addon",
        date: "2026-06-02",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -300,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "cloud_jun_main",
        date: "2026-06-10",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -2000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
    ]));

    expect(activity.items[0]).toMatchObject({
      label: "Cloud Host",
      expectedDate: "2026-07-10",
      amountCents: -2000,
      confidence: "high",
      sourceTransactionCount: 3,
      lastSeenDate: "2026-06-10",
    });
  });

  it("prefers a larger variable bill over a smaller stable add-on for the same merchant", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "power_mar_addon",
        date: "2026-03-01",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -500,
        category: "utilities",
        kind: "purchase",
      }),
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
        id: "power_apr_addon",
        date: "2026-04-01",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -500,
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
        id: "power_may_addon",
        date: "2026-05-01",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -500,
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
        id: "power_jun_addon",
        date: "2026-06-01",
        description: "City Power utility bill",
        merchantName: "City Power",
        amountCents: -500,
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
      confidence: "medium",
      sourceTransactionCount: 4,
      lastSeenDate: "2026-06-03",
    });
  });

  it("lets confirmed rules take precedence over newly eligible strict-cadence services", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "tool_apr",
        date: "2026-04-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "tool_may",
        date: "2026-05-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "tool_jun",
        date: "2026-06-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
    ], {
      recurringObligationRules: [
        rule({
          merchantKey: "workspace-tool",
          label: "Workspace Tool",
          expectedAmountCents: 1200,
          expectedDay: 12,
          source: "user_confirmed",
          status: "active",
        }),
      ],
    }));

    expect(activity.items).toHaveLength(1);
    expect(activity.items[0]).toMatchObject({
      id: "confirmed-workspace-tool",
      expectedDate: "2026-07-12",
      amountCents: -1200,
      confidence: "high",
    });
  });

  it("suppresses newly eligible strict-cadence services when the user ignored the merchant", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "tool_apr",
        date: "2026-04-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "tool_may",
        date: "2026-05-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "tool_jun",
        date: "2026-06-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
    ], {
      recurringObligationRules: [
        rule({
          merchantKey: "workspace-tool",
          label: "Workspace Tool",
          expectedAmountCents: 0,
          source: "user_correction",
          status: "ignored",
        }),
      ],
    }));

    expect(activity.items).toEqual([]);
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

  it("does not show loose grocery habits as recurring bills", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "market_apr",
        date: "2026-04-02",
        description: "Corner Market",
        merchantName: "Corner Market",
        amountCents: -7100,
        category: "food_and_drink:food_and_drink_groceries",
        kind: "purchase",
      }),
      tx({
        id: "market_may",
        date: "2026-05-04",
        description: "Corner Market",
        merchantName: "Corner Market",
        amountCents: -9600,
        category: "food_and_drink:food_and_drink_groceries",
        kind: "purchase",
      }),
      tx({
        id: "market_jun",
        date: "2026-06-01",
        description: "Corner Market",
        merchantName: "Corner Market",
        amountCents: -8300,
        category: "food_and_drink:food_and_drink_groceries",
        kind: "purchase",
      }),
    ]));

    expect(activity.items).toEqual([]);
  });

  it("does not show two-month generic service repeats without strict evidence", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "service_may",
        date: "2026-05-12",
        description: "Local Service",
        merchantName: "Local Service",
        amountCents: -4000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "service_jun",
        date: "2026-06-12",
        description: "Local Service",
        merchantName: "Local Service",
        amountCents: -4000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
    ]));

    expect(activity.items).toEqual([]);
  });

  it.each([
    ["gas"],
    ["travel"],
    ["general merchandise"],
    ["retail"],
  ])("does not show strict monthly %s purchases as recurring bills", (category) => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: `${category}_apr`,
        date: "2026-04-06",
        description: "Everyday Merchant",
        merchantName: "Everyday Merchant",
        amountCents: -4400,
        category,
        kind: "purchase",
      }),
      tx({
        id: `${category}_may`,
        date: "2026-05-06",
        description: "Everyday Merchant",
        merchantName: "Everyday Merchant",
        amountCents: -4400,
        category,
        kind: "purchase",
      }),
      tx({
        id: `${category}_jun`,
        date: "2026-06-06",
        description: "Everyday Merchant",
        merchantName: "Everyday Merchant",
        amountCents: -4400,
        category,
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
