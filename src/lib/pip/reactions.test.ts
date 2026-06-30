import { describe, expect, it } from "vitest";
import {
  choosePipReaction,
  comparePipCashResults,
  type PipReactionComparison,
} from "@/lib/pip/reactions";
import type { PipCashResult, SpendableCashTodayResult } from "@/lib/types";

describe("Pip reaction engine", () => {
  it("creates a shortfall reaction when the user enters shortfall", () => {
    const comparison = comparePipCashResults(
      resultWithMetric(metric({ state: "normal", spendableCashTodayCents: 2400 })),
      resultWithMetric(metric({ state: "shortfall", spendableCashTodayCents: 0, shortfallCents: 1200 })),
    );

    expect(choosePipReaction({ comparison, trigger: "manual_refresh" })).toMatchObject({
      reactionType: "shortfall",
      intensity: 2,
      summary: "No extra room today. Essentials first.",
    });
  });

  it("creates a recovered reaction when shortfall clears", () => {
    const comparison = comparePipCashResults(
      resultWithMetric(metric({ state: "shortfall", spendableCashTodayCents: 0, shortfallCents: 1200 })),
      resultWithMetric(metric({ state: "healthy", spendableCashTodayCents: 3200, shortfallCents: 0 })),
    );

    expect(choosePipReaction({ comparison, trigger: "manual_refresh" })).toMatchObject({
      reactionType: "recovered",
      intensity: 2,
    });
  });

  it("classifies material lifts and drops using the current material threshold", () => {
    const smallLift = comparisonWithDelta(600);
    const bigDrop = comparisonWithDelta(-1800);

    expect(choosePipReaction({ comparison: smallLift, trigger: "manual_refresh" })).toMatchObject({
      reactionType: "small_lift",
      intensity: 1,
    });
    expect(choosePipReaction({ comparison: bigDrop, trigger: "manual_refresh" })).toMatchObject({
      reactionType: "big_drop",
      intensity: 2,
    });
  });

  it("does not create a stored reaction for tiny steady changes", () => {
    expect(
      choosePipReaction({
        comparison: comparisonWithDelta(100),
        trigger: "manual_refresh",
      }),
    ).toBeNull();
  });

  it("does not create first-sync noise for low-confidence data", () => {
    const comparison = comparePipCashResults(
      null,
      resultWithMetric(metric({ state: "low_confidence", confidence: "low" })),
    );

    expect(
      choosePipReaction({
        comparison,
        trigger: "manual_refresh",
      }),
    ).toBeNull();
  });

  it("suppresses repeated high-intensity reactions unless the new one has higher priority", () => {
    const now = new Date("2026-06-11T12:00:00.000Z");

    expect(
      choosePipReaction({
        comparison: comparisonWithDelta(-1800),
        trigger: "manual_refresh",
        now,
        recentEvents: [
          {
            reactionType: "big_lift",
            intensity: 2,
            createdAt: "2026-06-11T10:00:00.000Z",
          },
        ],
      }),
    ).toMatchObject({
      reactionType: "big_drop",
    });
    expect(
      choosePipReaction({
        comparison: comparisonWithDelta(1800),
        trigger: "manual_refresh",
        now,
        recentEvents: [
          {
            reactionType: "shortfall",
            intensity: 2,
            createdAt: "2026-06-11T10:00:00.000Z",
          },
        ],
      }),
    ).toBeNull();
  });
});

function comparisonWithDelta(deltaCents: number): PipReactionComparison {
  return comparePipCashResults(
    resultWithMetric(metric({ spendableCashTodayCents: 2000 })),
    resultWithMetric(metric({ spendableCashTodayCents: 2000 + deltaCents })),
  );
}

function resultWithMetric(spendableCashToday: SpendableCashTodayResult): PipCashResult {
  return {
    pipCashTodayCents: spendableCashToday.spendableCashTodayCents,
    rollingNetCents: 0,
    incomeTotalCents: 0,
    spendingTotalCents: 0,
    refundTotalCents: 0,
    protectedSavingsMonthlyCents: 0,
    window: {
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      dayCount: 30,
      daysElapsed: 11,
      daysRemaining: 19,
    },
    drivers: [],
    warnings: [],
    dataStates: [],
    trueBalances: [],
    spendableCashToday,
  };
}

function metric(
  overrides: Partial<SpendableCashTodayResult> = {},
): SpendableCashTodayResult {
  return {
    metricVersion: "v2",
    spendableCashTodayCents: 2000,
    shortfallCents: 0,
    patternShortfallCents: 0,
    behaviorShortfallCents: 0,
    cashShortfallCents: 0,
    baselineDailyAllowanceCents: 2000,
    behaviorAdjustmentCents: 0,
    cashRealityAdjustmentCents: 0,
    cashGuardrailApplied: false,
    cashGuardrailShareOfBaseline: 0,
    materialDailyChangeCents: 500,
    lowConfidenceCapApplied: false,
    adaptiveDailyAllowanceCents: 2000,
    monthlyEverydayPoolCents: 60000,
    averageMonthlyIncomeCents: 100000,
    averageMonthlyRecurringObligationsCents: 20000,
    averageMonthlyEverydaySpendCents: 20000,
    protectedSavingsMonthlyCents: 0,
    hiddenCushionCents: 0,
    allowedSoFarThisMonthCents: 22000,
    actualEverydaySpendSoFarCents: 20000,
    currentMonthVarianceCents: 2000,
    availableCashGuardrailCents: 50000,
    pendingCommittedSpendCents: 0,
    cashDailyCapCents: 3000,
    lookbackStartDate: "2026-03-01",
    lookbackEndDate: "2026-05-31",
    completedMonthCount: 3,
    currentMonthStartDate: "2026-06-01",
    currentMonthElapsedDays: 11,
    recoveryDays: 14,
    confidence: "high",
    state: "normal",
    drivers: [],
    warnings: [],
    dataStates: [],
    legacyRollingDailySurplusCents: 0,
    legacyRollingNetCents: 0,
    ...overrides,
  };
}
