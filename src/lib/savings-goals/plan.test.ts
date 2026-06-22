import { describe, expect, it } from "vitest";
import {
  buildSavingsGoalPlan,
  getActiveSavingsGoalMonthlyCents,
  getProtectedSavingsGoalMonthlyCents,
  resolveSavingsGoalMonthlyContribution,
} from "@/lib/savings-goals/plan";
import type { SavingsGoal } from "@/lib/savings-goals/types";

describe("savings goal plan", () => {
  it("calculates remaining amount, progress, and deadline contribution deterministically", () => {
    const plan = buildSavingsGoalPlan(
      goal({
        targetAmountCents: 500000,
        currentAmountCents: 100000,
        targetDate: "2027-06-18",
      }),
      "2026-06-18",
    );

    expect(plan.remainingCents).toBe(400000);
    expect(plan.progressRatio).toBe(0.2);
    expect(plan.monthsRemaining).toBe(12);
    expect(plan.recommendedMonthlyContributionCents).toBe(33334);
    expect(plan.recommendedDailyContributionCents).toBe(1096);
    expect(plan.onTrack).toBe(true);
  });

  it("does not invent urgency when there is no target date", () => {
    const plan = buildSavingsGoalPlan(goal({ targetDate: undefined }), "2026-06-18");

    expect(plan.monthsRemaining).toBeUndefined();
    expect(plan.recommendedMonthlyContributionCents).toBeUndefined();
    expect(plan.onTrack).toBeUndefined();
  });

  it("marks an active goal completed when progress reaches the target", () => {
    const plan = buildSavingsGoalPlan(
      goal({
        targetAmountCents: 120000,
        currentAmountCents: 125000,
      }),
      "2026-06-18",
    );

    expect(plan.remainingCents).toBe(0);
    expect(plan.progressRatio).toBe(1);
    expect(plan.goal.status).toBe("completed");
  });

  it("does not charge a monthly contribution for active goals already funded by progress", () => {
    expect(
      resolveSavingsGoalMonthlyContribution(
        goal({
          targetAmountCents: 120000,
          currentAmountCents: 125000,
          monthlyContributionCents: 40000,
        }),
        "2026-06-18",
      ),
    ).toMatchObject({
      monthlyContributionCents: 0,
      needsPlan: false,
    });
  });

  it("warns when an active goal has no monthly contribution or target-derived plan", () => {
    const plan = buildSavingsGoalPlan(
      goal({
        targetDate: undefined,
        monthlyContributionCents: 0,
      }),
      "2026-06-18",
    );

    expect(plan.warning).toBe(
      "Add a monthly savings amount or target date to see how this goal affects Spendable Cash Today.",
    );
  });

  it("sums every active monthly goal contribution", () => {
    expect(
      getActiveSavingsGoalMonthlyCents(
        [
          goal({ monthlyContributionCents: 10000, includeInSpendableCash: true }),
          goal({ monthlyContributionCents: 20000, includeInSpendableCash: false }),
          goal({
            monthlyContributionCents: 30000,
            includeInSpendableCash: true,
            status: "paused",
          }),
        ],
        "2026-06-18",
      ),
    ).toBe(30000);
  });

  it("keeps the protected helper as an all-active compatibility wrapper", () => {
    expect(
      getProtectedSavingsGoalMonthlyCents(
        [
          goal({ monthlyContributionCents: 10000, includeInSpendableCash: true }),
          goal({ monthlyContributionCents: 20000, includeInSpendableCash: false }),
          goal({
            monthlyContributionCents: 30000,
            includeInSpendableCash: true,
            status: "paused",
          }),
        ],
        "2026-06-18",
      ),
    ).toBe(30000);
  });

  it("derives an active goal contribution from its target date when monthly amount is missing", () => {
    expect(
      resolveSavingsGoalMonthlyContribution(
        goal({
          targetAmountCents: 500000,
          currentAmountCents: 100000,
          monthlyContributionCents: 0,
          targetDate: "2027-06-18",
        }),
        "2026-06-18",
      ),
    ).toMatchObject({
      monthlyContributionCents: 33334,
      source: "target_date",
      needsPlan: false,
    });
  });
});

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "goal-1",
    userId: "user-1",
    name: "Trip",
    targetAmountCents: 500000,
    targetDate: "2027-06-18",
    startingAmountCents: 0,
    currentAmountCents: 0,
    monthlyContributionCents: 40000,
    includeInSpendableCash: false,
    status: "active",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
    ...overrides,
  };
}
