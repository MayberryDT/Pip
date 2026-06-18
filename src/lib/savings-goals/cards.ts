import { formatMoney } from "@/lib/money";
import { getProtectedSavingsGoalMonthlyCents } from "@/lib/savings-goals/plan";
import type { SavingsGoalPlan } from "@/lib/savings-goals/types";
import type { AgentCard } from "@/lib/agent/card-types";

export function buildSavingsGoalPlanCard(plan: SavingsGoalPlan): AgentCard {
  const monthlyContributionCents =
    plan.goal.monthlyContributionCents || plan.recommendedMonthlyContributionCents || 0;

  return {
    type: "savings_goal_plan",
    title: "Savings goal",
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
    title: "Savings goals",
    summary: activePlans.length > 0
      ? `${activePlans.length} active savings goal${activePlans.length === 1 ? "" : "s"} tracked.`
      : "No active savings goals yet.",
    activeGoalCount: activePlans.length,
    protectedMonthlyContributionCents,
    goals: activePlans.slice(0, 5).map((plan) => ({
      goalId: plan.goal.id,
      name: plan.goal.name,
      targetAmountCents: plan.goal.targetAmountCents,
      currentAmountCents: plan.goal.currentAmountCents,
      remainingCents: plan.remainingCents,
      ...(plan.goal.targetDate ? { targetDate: plan.goal.targetDate } : {}),
      monthlyContributionCents: plan.goal.monthlyContributionCents,
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

  if (plan.goal.includeInSpendableCash && monthlyContributionCents > 0) {
    return `${base} ${formatMoney(monthlyContributionCents)}/month is kept out of Spendable Cash Today.`;
  }

  if (monthlyContributionCents > 0) {
    return `${base} ${formatMoney(monthlyContributionCents)}/month would keep it on pace.`;
  }

  return `${base} Tracked only for now.`;
}
