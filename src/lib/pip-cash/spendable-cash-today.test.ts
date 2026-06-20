import { describe, expect, it } from "vitest";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import {
  cashGuardrailPipSnapshot,
  fakeSnapshot,
  healthyPipSnapshot,
  lowConfidencePipSnapshot,
  missingCardPipSnapshot,
  overspendingPipSnapshot,
  shortfallPipSnapshot,
} from "@/lib/fake-data";
import {
  classifySpendableTransaction,
  getSpendableCashTodaySubtitle,
  simulateSpendablePurchase,
} from "@/lib/pip-cash/spendable-cash-today";
import type { Account, Transaction } from "@/lib/types";

describe("Spendable Cash Today V2", () => {
  it("builds a completed-month baseline before current-month spending", () => {
    const result = calculatePipCash(healthyPipSnapshot).spendableCashToday;

    expect(result).toMatchObject({
      metricVersion: "v2",
      completedMonthCount: 3,
      confidence: "high",
      averageMonthlyIncomeCents: 420000,
      averageMonthlyRecurringObligationsCents: 172000,
      monthlySavingsCents: 20000,
      savingsGoalMonthlyCents: 0,
      totalSavingsProtectedMonthlyCents: 20000,
      protectedSavingsMonthlyCents: 20000,
      hiddenCushionCents: 12600,
      monthlyEverydayPoolCents: 215400,
      baselineDailyAllowanceCents: 7076,
    });
  });

  it("includes every active savings goal in Spendable Cash Today", () => {
    const base = calculatePipCash(healthyPipSnapshot).spendableCashToday;
    const withGoal = calculatePipCash({
      ...healthyPipSnapshot,
      savingsGoals: [
        {
          id: "goal-1",
          userId: "user-1",
          name: "Japan",
          targetAmountCents: 300000,
          targetDate: "2026-12-20",
          startingAmountCents: 0,
          currentAmountCents: 0,
          monthlyContributionCents: 50000,
          includeInSpendableCash: false,
          status: "active",
          createdAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
      ],
    }).spendableCashToday;

    expect(withGoal?.savingsGoalMonthlyCents).toBe(50000);
    expect(withGoal?.monthlyEverydayPoolCents).toBe(
      (base?.monthlyEverydayPoolCents ?? 0) - 50000,
    );
  });

  it("holds protected savings goal contributions out separately", () => {
    const base = calculatePipCash(healthyPipSnapshot).spendableCashToday;
    const protectedGoal = calculatePipCash({
      ...healthyPipSnapshot,
      savingsGoals: [
        {
          id: "goal-1",
          userId: "user-1",
          name: "Trip",
          targetAmountCents: 500000,
          targetDate: "2027-06-18",
          startingAmountCents: 0,
          currentAmountCents: 100000,
          monthlyContributionCents: 3044,
          includeInSpendableCash: true,
          status: "active",
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z",
        },
      ],
    }).spendableCashToday;

    expect(protectedGoal?.savingsGoalMonthlyCents).toBe(3044);
    expect(protectedGoal?.totalSavingsProtectedMonthlyCents).toBe(23044);
    expect(protectedGoal?.monthlyEverydayPoolCents).toBe(
      (base?.monthlyEverydayPoolCents ?? 0) - 3044,
    );
    expect(protectedGoal?.drivers.map((driver) => driver.id)).toContain("savings-goals");
  });

  it("lowers today's room when current-month everyday spending is ahead of pace", () => {
    const result = calculatePipCash(overspendingPipSnapshot).spendableCashToday;

    expect(result?.state).toBe("overspending");
    expect(result?.behaviorAdjustmentCents).toBeLessThan(0);
    expect(result?.actualEverydaySpendSoFarCents).toBeGreaterThan(
      result?.allowedSoFarThisMonthCents ?? 0,
    );
  });

  it("uses cash as a cap rather than the primary model", () => {
    const result = calculatePipCash(cashGuardrailPipSnapshot).spendableCashToday;

    expect(result?.spendableCashTodayCents).toBe(200);
    expect(result?.cashDailyCapCents).toBe(200);
    expect(result?.cashRealityAdjustmentCents).toBeGreaterThan(0);
    expect(result?.drivers.map((driver) => driver.id)).toContain("cash-guardrail");
  });

  it("floors the public number at zero and keeps a separate shortfall", () => {
    const result = calculatePipCash(shortfallPipSnapshot).spendableCashToday;

    expect(result?.spendableCashTodayCents).toBe(0);
    expect(result?.shortfallCents).toBeGreaterThan(0);
    expect(result?.state).toBe("shortfall");
  });

  it("marks early estimates as low confidence", () => {
    const result = calculatePipCash(lowConfidencePipSnapshot).spendableCashToday;

    expect(result?.completedMonthCount).toBe(0);
    expect(result?.confidence).toBe("low");
    expect(result?.state).toBe("low_confidence");
    expect(result?.dataStates.map((state) => state.id)).toContain("low-confidence");
  });

  it("keeps missing-card warnings attached to the V2 metric", () => {
    const result = calculatePipCash(missingCardPipSnapshot).spendableCashToday;

    expect(result?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-card",
          issuerName: "Capital One",
        }),
      ]),
    );
    expect(result?.drivers.map((driver) => driver.id)).toContain("missing-data");
  });

  it("writes the top-number subtitle in Pip's voice", () => {
    const baseResult = calculatePipCash(fakeSnapshot);
    const baseMetric = baseResult.spendableCashToday;
    const subtitleForState = (state: NonNullable<typeof baseMetric>["state"]) =>
      getSpendableCashTodaySubtitle({
        ...baseResult,
        spendableCashToday: baseMetric
          ? {
              ...baseMetric,
              state,
              shortfallCents: state === "shortfall" ? 1200 : 0,
              warnings: [],
            }
          : undefined,
      });
    const subtitles = [
      getSpendableCashTodaySubtitle(null),
      getSpendableCashTodaySubtitle({
        ...baseResult,
        pipCashTodayCents: -1200,
        spendableCashToday: undefined,
      }),
      getSpendableCashTodaySubtitle(calculatePipCash(fakeSnapshot)),
      getSpendableCashTodaySubtitle(calculatePipCash(healthyPipSnapshot)),
      getSpendableCashTodaySubtitle(calculatePipCash(overspendingPipSnapshot)),
      getSpendableCashTodaySubtitle(calculatePipCash(shortfallPipSnapshot)),
      getSpendableCashTodaySubtitle(calculatePipCash(lowConfidencePipSnapshot)),
      getSpendableCashTodaySubtitle(calculatePipCash(missingCardPipSnapshot)),
      subtitleForState("tight"),
      subtitleForState("missing_data"),
    ];

    expect(subtitles).toContain("I’m missing a card, so I may adjust this after you connect it.");
    expect(subtitles).toContain("I’d keep today light.");
    expect(subtitles).toContain("I need more connected data before I trust this read.");
    expect(subtitles.every((subtitle) => /^I(?:\b|’|')/.test(subtitle))).toBe(true);
    expect(subtitles.join(" ")).not.toMatch(/This may change|That’s your room|You spent|Recent spending lowered|No extra room/);
  });

  it("applies simulated purchases as direct same-day spend", () => {
    const result = calculatePipCash(fakeSnapshot);
    const simulation = simulateSpendablePurchase(2500, fakeSnapshot, {
      before: result.spendableCashToday,
      warnings: result.warnings,
      dataStates: result.dataStates,
      legacyRollingDailySurplusCents: result.pipCashTodayCents,
      legacyRollingNetCents: result.rollingNetCents,
    });

    expect(simulation.beforeCents).toBe(result.spendableCashToday?.spendableCashTodayCents);
    expect(simulation.todayRemainingCents).toBe(
      (result.spendableCashToday?.spendableCashTodayCents ?? 0) - 2500,
    );
    expect(simulation.todayRemainingCents).toBe(simulation.afterTodayCents);
    expect(simulation.afterTodayCents).toBe(simulation.after.spendableCashTodayCents);
    expect(simulation.after.sameDayDiscretionarySpendCents).toBe(2500);
  });

  it("subtracts same-day discretionary spend directly from today's number", () => {
    const baseline = calculatePipCash(healthyPipSnapshot).spendableCashToday;
    const withTodayPurchase = calculatePipCash({
      ...healthyPipSnapshot,
      transactions: [
        ...healthyPipSnapshot.transactions,
        {
          id: "target-today",
          accountId: "acct_visa",
          date: healthyPipSnapshot.settings.asOfDate,
          description: "Target",
          merchantName: "Target",
          amountCents: -1800,
          category: "shopping",
          kind: "purchase",
        },
      ],
    }).spendableCashToday;

    expect(withTodayPurchase?.startingSpendableCashTodayCents).toBe(
      baseline?.spendableCashTodayCents,
    );
    expect(withTodayPurchase?.sameDayDiscretionarySpendCents).toBe(1800);
    expect(withTodayPurchase?.spendableCashTodayCents).toBe(
      (baseline?.spendableCashTodayCents ?? 0) - 1800,
    );
    expect(withTodayPurchase?.sameDayLedger.items[0]).toMatchObject({
      transactionId: "target-today",
      treatment: "daily_spend",
      amountCents: -1800,
    });
  });

  it("subtracts same-day pending purchases once with a pending marker", () => {
    const baseline = calculatePipCash(healthyPipSnapshot).spendableCashToday;
    const withPendingPurchase = calculatePipCash({
      ...healthyPipSnapshot,
      transactions: [
        ...healthyPipSnapshot.transactions,
        {
          id: "target-pending-today",
          accountId: "acct_visa",
          date: healthyPipSnapshot.settings.asOfDate,
          description: "Target",
          merchantName: "Target",
          amountCents: -1800,
          category: "shopping",
          kind: "purchase",
          pending: true,
        },
      ],
    }).spendableCashToday;

    expect(withPendingPurchase?.startingSpendableCashTodayCents).toBe(
      baseline?.spendableCashTodayCents,
    );
    expect(withPendingPurchase?.sameDayDiscretionarySpendCents).toBe(1800);
    expect(withPendingPurchase?.sameDayPendingSpendCents).toBe(1800);
    expect(withPendingPurchase?.pendingCommittedSpendCents).toBe(0);
    expect(withPendingPurchase?.availableCashGuardrailCents).toBe(
      baseline?.availableCashGuardrailCents,
    );
    expect(withPendingPurchase?.spendableCashTodayCents).toBe(
      (baseline?.spendableCashTodayCents ?? 0) - 1800,
    );
  });

  it("does not keep a pending duplicate in committed spend after same-day ledger dedupe", () => {
    const baseline = calculatePipCash(healthyPipSnapshot).spendableCashToday;
    const withPendingAndPosted = calculatePipCash({
      ...healthyPipSnapshot,
      transactions: [
        ...healthyPipSnapshot.transactions,
        {
          id: "target-pending-today",
          accountId: "acct_visa",
          date: healthyPipSnapshot.settings.asOfDate,
          description: "Target",
          merchantName: "Target",
          amountCents: -1800,
          category: "shopping",
          kind: "purchase",
          pending: true,
        },
        {
          id: "target-posted-today",
          accountId: "acct_visa",
          date: healthyPipSnapshot.settings.asOfDate,
          description: "Target",
          merchantName: "Target",
          amountCents: -1800,
          category: "shopping",
          kind: "purchase",
        },
      ],
    }).spendableCashToday;

    expect(withPendingAndPosted?.pendingCommittedSpendCents).toBe(0);
    expect(withPendingAndPosted?.sameDayDiscretionarySpendCents).toBe(1800);
    expect(withPendingAndPosted?.sameDayPendingSpendCents).toBe(0);
    expect(withPendingAndPosted?.sameDayLedger.items.map((item) => item.transactionId)).toEqual([
      "target-posted-today",
    ]);
    expect(withPendingAndPosted?.spendableCashTodayCents).toBe(
      (baseline?.spendableCashTodayCents ?? 0) - 1800,
    );
  });

  it("reconciles confirmed same-day bill variance without double subtracting the bill", () => {
    const baseSnapshot = {
      ...healthyPipSnapshot,
      recurringObligationRules: [
        {
          id: "rent-rule",
          userId: "user-1",
          merchantKey: "city-rent",
          label: "City Rent",
          expectedAmountCents: 120000,
          cadence: "monthly" as const,
          source: "user_confirmed" as const,
          status: "active" as const,
          createdAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
      ],
    };
    const baseline = calculatePipCash(baseSnapshot).spendableCashToday;
    const withBill = (amountCents: number) =>
      calculatePipCash({
        ...baseSnapshot,
        transactions: [
          ...baseSnapshot.transactions,
          {
            id: `city-rent-${amountCents}`,
            accountId: "acct_checking",
            date: baseSnapshot.settings.asOfDate,
            description: "City Rent",
            merchantName: "City Rent",
            amountCents,
            category: "rent",
            kind: "rent",
          },
        ],
      }).spendableCashToday;

    expect(withBill(-120000)?.spendableCashTodayCents).toBe(
      baseline?.spendableCashTodayCents,
    );
    expect(withBill(-120000)?.billVarianceCents).toBe(0);
    expect(withBill(-125000)?.spendableCashTodayCents).toBe(
      (baseline?.spendableCashTodayCents ?? 0) - 5000,
    );
    expect(withBill(-125000)?.billVarianceCents).toBe(-5000);
    expect(withBill(-115000)?.spendableCashTodayCents).toBe(
      (baseline?.spendableCashTodayCents ?? 0) + 5000,
    );
    expect(withBill(-115000)?.billVarianceCents).toBe(5000);
  });

  it("keeps pending confirmed bills out of the cash guardrail before variance handling", () => {
    const baseSnapshot = {
      ...cashGuardrailPipSnapshot,
      recurringObligationRules: [
        {
          id: "storage-rule",
          userId: "user-1",
          merchantKey: "storage-unit",
          label: "Storage Unit",
          expectedAmountCents: 1200,
          cadence: "monthly" as const,
          source: "user_confirmed" as const,
          status: "active" as const,
          createdAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
      ],
    };
    const baseline = calculatePipCash(baseSnapshot).spendableCashToday;
    const withPendingBill = calculatePipCash({
      ...baseSnapshot,
      transactions: [
        ...baseSnapshot.transactions,
        {
          id: "storage-pending-today",
          accountId: "acct_checking",
          date: baseSnapshot.settings.asOfDate,
          description: "Storage Unit",
          merchantName: "Storage Unit",
          amountCents: -1200,
          category: "storage",
          kind: "purchase",
          pending: true,
        },
      ],
    }).spendableCashToday;

    expect(withPendingBill?.pendingCommittedSpendCents).toBe(0);
    expect(withPendingBill?.cashDailyCapCents).toBe(baseline?.cashDailyCapCents);
    expect(withPendingBill?.sameDayDiscretionarySpendCents).toBe(0);
    expect(withPendingBill?.sameDayPendingSpendCents).toBe(0);
    expect(withPendingBill?.billVarianceCents).toBe(0);
    expect(withPendingBill?.spendableCashTodayCents).toBe(
      baseline?.spendableCashTodayCents,
    );
  });

  it("classifies hidden transaction groups for recurring obligations and everyday spending", () => {
    const accountById = new Map<string, Account>([
      [
        "checking",
        {
          id: "checking",
          name: "Checking",
          institutionName: "Bank",
          kind: "checking",
          balanceCents: 100000,
        },
      ],
    ]);
    const tx = (input: Partial<Transaction>): Transaction => ({
      id: "tx",
      accountId: "checking",
      date: "2026-06-10",
      description: "Card purchase",
      amountCents: -1000,
      ...input,
    });

    expect(
      classifySpendableTransaction(
        tx({
          description: "City Power",
          merchantName: "City Power",
          category: "utilities",
          kind: "purchase",
        }),
        accountById,
      ),
    ).toMatchObject({
      group: "recurring_obligation",
      confidence: "high",
    });
    expect(
      classifySpendableTransaction(
        tx({
          description: "Grocery",
          merchantName: "City Market",
          category: "groceries",
          kind: "purchase",
        }),
        accountById,
      ),
    ).toMatchObject({
      group: "everyday_spending",
      confidence: "high",
    });
    expect(
      classifySpendableTransaction(
        tx({
          description: "Autopay Visa",
          category: "credit card payment",
          kind: "credit_card_payment",
        }),
        accountById,
      ),
    ).toMatchObject({
      group: "card_settlement",
      confidence: "high",
    });
  });
});
