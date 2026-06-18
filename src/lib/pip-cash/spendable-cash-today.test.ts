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

  it("keeps tracked-only savings goals out of Spendable Cash Today", () => {
    const base = calculatePipCash(healthyPipSnapshot).spendableCashToday;
    const trackedOnly = calculatePipCash({
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
          monthlyContributionCents: 50000,
          includeInSpendableCash: false,
          status: "active",
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z",
        },
      ],
    }).spendableCashToday;

    expect(trackedOnly?.monthlyEverydayPoolCents).toBe(base?.monthlyEverydayPoolCents);
    expect(trackedOnly?.savingsGoalMonthlyCents).toBe(0);
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

  it("separates immediate purchase room from the recomputed V2 allowance", () => {
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
    expect(simulation.todayRemainingCents).not.toBe(simulation.afterTodayCents);
    expect(simulation.afterTodayCents).toBe(simulation.after.spendableCashTodayCents);
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
