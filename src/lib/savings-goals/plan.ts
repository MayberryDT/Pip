import type { SavingsGoal, SavingsGoalPlan } from "@/lib/savings-goals/types";
import { getCurrentAppDate } from "@/lib/date/app-date";

const DAYS_PER_MONTH = 30.44;

export type SavingsGoalContributionResolution = {
  goalId: string;
  name: string;
  monthlyContributionCents: number;
  source: "explicit" | "target_date";
  needsPlan: boolean;
};

export function buildSavingsGoalPlan(goal: SavingsGoal, asOfDate: string): SavingsGoalPlan {
  const remainingCents = Math.max(0, goal.targetAmountCents - goal.currentAmountCents);
  const progressRatio = goal.targetAmountCents > 0
    ? clamp(goal.currentAmountCents / goal.targetAmountCents, 0, 1)
    : 0;
  const monthsRemaining = goal.targetDate
    ? getMonthsRemaining(asOfDate, goal.targetDate)
    : undefined;
  const recommendedMonthlyContributionCents =
    monthsRemaining && monthsRemaining > 0
      ? Math.ceil(remainingCents / monthsRemaining)
      : undefined;
  const recommendedDailyContributionCents =
    recommendedMonthlyContributionCents === undefined
      ? undefined
      : Math.ceil(recommendedMonthlyContributionCents / DAYS_PER_MONTH);
  const effectiveMonthlyContributionCents =
    goal.monthlyContributionCents || recommendedMonthlyContributionCents || 0;
  const onTrack = monthsRemaining && monthsRemaining > 0
    ? effectiveMonthlyContributionCents * monthsRemaining >= remainingCents
    : undefined;

  return {
    goal: remainingCents === 0 && goal.status === "active"
      ? {
          ...goal,
          status: "completed",
        }
      : goal,
    remainingCents,
    progressRatio,
    monthsRemaining,
    recommendedMonthlyContributionCents,
    recommendedDailyContributionCents,
    onTrack,
    warning: getSavingsGoalWarning(goal, remainingCents),
  };
}

export function resolveSavingsGoalMonthlyContribution(
  goal: SavingsGoal,
  asOfDate: string,
): SavingsGoalContributionResolution {
  if (goal.status !== "active") {
    return {
      goalId: goal.id,
      name: goal.name,
      monthlyContributionCents: 0,
      source: "explicit",
      needsPlan: false,
    };
  }

  if (goal.monthlyContributionCents > 0) {
    return {
      goalId: goal.id,
      name: goal.name,
      monthlyContributionCents: goal.monthlyContributionCents,
      source: "explicit",
      needsPlan: false,
    };
  }

  const plan = buildSavingsGoalPlan(goal, asOfDate);

  return {
    goalId: goal.id,
    name: goal.name,
    monthlyContributionCents: plan.recommendedMonthlyContributionCents ?? 0,
    source: "target_date",
    needsPlan: plan.recommendedMonthlyContributionCents === undefined,
  };
}

export function getActiveSavingsGoalMonthlyCents(
  goals: SavingsGoal[] = [],
  asOfDate: string,
) {
  return goals.reduce(
    (sum, goal) =>
      sum + resolveSavingsGoalMonthlyContribution(goal, asOfDate).monthlyContributionCents,
    0,
  );
}

export function getProtectedSavingsGoalMonthlyCents(
  goals: SavingsGoal[] = [],
  asOfDate = getCurrentAppDate(),
) {
  return getActiveSavingsGoalMonthlyCents(goals, asOfDate);
}

function getSavingsGoalWarning(goal: SavingsGoal, remainingCents: number): string | undefined {
  if (goal.includeInSpendableCash && goal.monthlyContributionCents === 0 && remainingCents > 0) {
    return "This goal is protected, but it does not have a monthly contribution yet.";
  }

  return undefined;
}

function getMonthsRemaining(asOfDate: string, targetDate: string) {
  const start = parseDate(asOfDate);
  const end = parseDate(targetDate);
  const dayDiff = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);

  if (dayDiff <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(dayDiff / DAYS_PER_MONTH));
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
