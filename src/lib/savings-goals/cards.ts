import { formatMoney } from "@/lib/money";
import { getProtectedSavingsGoalMonthlyCents } from "@/lib/savings-goals/plan";
import type { SavingsGoalPlan } from "@/lib/savings-goals/types";
import type { AgentCard } from "@/lib/agent/card-types";

export function buildSavingsGoalPlanCard(plan: SavingsGoalPlan): AgentCard {
  const monthlyContributionCents =
    plan.goal.monthlyContributionCents || plan.recommendedMonthlyContributionCents || 0;

  return {
    type: "savings_goal_plan",
    title: "Savings Goals",
    goalId: plan.goal.id,
    name: plan.goal.name,
    targetAmountCents: plan.goal.targetAmountCents,
    currentAmountCents: plan.goal.currentAmountCents,
    remainingCents: plan.remainingCents,
    ...(plan.goal.targetDate ? { targetDate: plan.goal.targetDate } : {}),
    ...(plan.recommendedMonthlyContributionCents === undefined
      ? {}
      : { recommendedMonthlyContributionCents: plan.recommendedMonthlyContributionCents }),
    monthlyContributionCents,
    includeInSpendableCash: plan.goal.includeInSpendableCash,
    ...(plan.onTrack === undefined ? {} : { onTrack: plan.onTrack }),
    summary: buildSavingsGoalPlanSummary(plan, monthlyContributionCents),
  };
}

export function buildSavingsGoalsSummaryCard(plans: SavingsGoalPlan[]): AgentCard {
  const activePlans = plans.filter((plan) => plan.goal.status === "active");
  const protectedMonthlyContributionCents = getProtectedSavingsGoalMonthlyCents(
    activePlans.map((plan) => plan.goal),
  );

  return {
    type: "savings_goals_summary",
    title: "Savings Goals",
    summary: activePlans.length > 0
      ? `${activePlans.length} active savings goal${activePlans.length === 1 ? "" : "s"} tracked inside Monthly Savings. Pip does not move money.`
      : "No active savings goals yet. Pip does not move money.",
    activeGoalCount: activePlans.length,
    protectedMonthlyContributionCents,
    goals: activePlans.slice(0, 5).map((plan) => ({
      goalId: plan.goal.id,
      name: plan.goal.name,
      targetAmountCents: plan.goal.targetAmountCents,
      currentAmountCents: plan.goal.currentAmountCents,
      remainingCents: plan.remainingCents,
      ...(plan.goal.targetDate ? { targetDate: plan.goal.targetDate } : {}),
      monthlyContributionCents:
        plan.goal.monthlyContributionCents || plan.recommendedMonthlyContributionCents || 0,
      includeInSpendableCash: plan.goal.includeInSpendableCash,
      ...(plan.onTrack === undefined ? {} : { onTrack: plan.onTrack }),
    })),
  };
}

function buildSavingsGoalPlanSummary(
  plan: SavingsGoalPlan,
  monthlyContributionCents: number,
): string {
  const base = `${formatMoney(plan.remainingCents)} left for ${plan.goal.name}.`;

  if (monthlyContributionCents > 0) {
    return `${base} ${formatMoney(monthlyContributionCents)}/month uses the same Monthly Savings system as Spendable Cash Today. Pip tracks the plan, but does not move money.`;
  }

  return `${base} Add a monthly savings amount or target date to see how this goal affects Spendable Cash Today. Pip tracks the plan, but does not move money.`;
}
