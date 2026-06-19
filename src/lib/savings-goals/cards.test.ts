import { describe, expect, it } from "vitest";
import {
  buildSavingsGoalPlanCard,
  buildSavingsGoalsSummaryCard,
} from "@/lib/savings-goals/cards";
import { buildSavingsGoalPlan } from "@/lib/savings-goals/plan";
import type { SavingsGoal } from "@/lib/savings-goals/types";

describe("savings goal cards", () => {
  it("uses deploy-ready Savings Goals copy and no-money-movement boundaries", () => {
    const plan = buildSavingsGoalPlan(
      goal({
        name: "Japan trip",
        targetAmountCents: 500000,
        targetDate: "2026-12-01",
      }),
      "2026-06-19",
    );
    const planCard = buildSavingsGoalPlanCard(plan);
    const summaryCard = buildSavingsGoalsSummaryCard([plan]);

    expect(planCard.title).toBe("Savings Goals");
    if (planCard.type !== "savings_goal_plan") {
      throw new Error(`Expected savings_goal_plan, received ${planCard.type}`);
    }
    expect(planCard.summary).toContain("Tracked in Pip");
    expect(planCard.summary).toContain("Pip does not move money");
    expect(summaryCard.title).toBe("Savings Goals");
    if (summaryCard.type !== "savings_goals_summary") {
      throw new Error(`Expected savings_goals_summary, received ${summaryCard.type}`);
    }
    expect(summaryCard.summary).toContain("tracked in Pip");
    expect(summaryCard.summary).toContain("Pip does not move money");
  });
});

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "goal-1",
    userId: "user-1",
    name: "Trip",
    targetAmountCents: 500000,
    targetDate: "2026-12-01",
    startingAmountCents: 0,
    currentAmountCents: 0,
    monthlyContributionCents: 0,
    includeInSpendableCash: false,
    status: "active",
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    ...overrides,
  };
}
