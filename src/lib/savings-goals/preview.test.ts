import { describe, expect, it } from "vitest";
import { buildSavingsGoalPreview } from "@/lib/savings-goals/preview";
import { fakeSnapshot } from "@/lib/fake-data";

describe("buildSavingsGoalPreview", () => {
  it("shows Spendable Cash Today impact before a savings goal is saved", () => {
    const preview = buildSavingsGoalPreview({
      snapshot: fakeSnapshot,
      draft: {
        type: "preview_savings_goal",
        name: "Japan",
        targetAmountCents: 240000,
        targetDate: "2026-12-31",
        includeInSpendableCash: true,
      },
    });

    expect(preview.missing).toEqual([]);
    expect(preview.card).toMatchObject({
      type: "savings_goal_preview",
      name: "Japan",
      targetAmountCents: 240000,
      includeInSpendableCash: true,
      monthlyContributionCents: expect.any(Number),
      monthlySavingsAfterGoalCents: expect.any(Number),
      monthlySavingsIncreaseCents: expect.any(Number),
      currentSpendableCashTodayCents: expect.any(Number),
      spendableCashTodayAfterGoalCents: expect.any(Number),
      dailyRoomDeltaCents: expect.any(Number),
    });
    expect(preview.card?.monthlyContributionCents).toBeGreaterThan(0);
    expect(preview.card?.spendableCashTodayAfterGoalCents).toBeLessThanOrEqual(
      preview.card?.currentSpendableCashTodayCents ?? 0,
    );
  });

  it("keeps a covered goal inside the existing Monthly Savings amount", () => {
    const snapshot = {
      ...fakeSnapshot,
      settings: {
        ...fakeSnapshot.settings,
        protectedSavingsMonthlyCents: 30000,
      },
      savingsGoals: [],
    };
    const preview = buildSavingsGoalPreview({
      snapshot,
      draft: {
        type: "preview_savings_goal",
        name: "Japan",
        targetAmountCents: 300000,
        monthlyContributionCents: 28600,
        includeInSpendableCash: true,
      },
    });

    expect(preview.card).toMatchObject({
      monthlySavingsAfterGoalCents: 30000,
      monthlySavingsIncreaseCents: 0,
      dailyRoomDeltaCents: 0,
    });
    expect(preview.card?.summary).toContain("fits inside your current Monthly Savings");
  });

  it("raises Monthly Savings only when a goal needs more than the current amount", () => {
    const snapshot = {
      ...fakeSnapshot,
      settings: {
        ...fakeSnapshot.settings,
        protectedSavingsMonthlyCents: 30000,
      },
      savingsGoals: [],
    };
    const preview = buildSavingsGoalPreview({
      snapshot,
      draft: {
        type: "preview_savings_goal",
        name: "Emergency fund",
        targetAmountCents: 500000,
        monthlyContributionCents: 43000,
        includeInSpendableCash: true,
      },
    });

    expect(preview.card).toMatchObject({
      monthlySavingsAfterGoalCents: 43000,
      monthlySavingsIncreaseCents: 13000,
    });
    expect(preview.card?.dailyRoomDeltaCents).toBeLessThan(0);
    expect(preview.card?.summary).toContain("raises Monthly Savings by $130/month");
  });

  it("soft-flags goals that would leave the user too tight", () => {
    const preview = buildSavingsGoalPreview({
      snapshot: fakeSnapshot,
      draft: {
        type: "preview_savings_goal",
        name: "Fast emergency fund",
        targetAmountCents: 300000,
        monthlyContributionCents: 250000,
        includeInSpendableCash: true,
      },
    });

    expect(preview.card?.warningLevel).toBe("too_tight");
    expect(preview.card?.summary.toLowerCase()).toContain("difficult");
  });

  it("does not invent a preview when the monthly plan is missing", () => {
    const preview = buildSavingsGoalPreview({
      snapshot: fakeSnapshot,
      draft: {
        type: "preview_savings_goal",
        name: "Japan",
        targetAmountCents: 240000,
        includeInSpendableCash: true,
      },
    });

    expect(preview.card).toBeNull();
    expect(preview.missing).toEqual(["target_date_or_monthly_contribution"]);
  });
});
