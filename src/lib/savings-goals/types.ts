export type SavingsGoalStatus = "active" | "paused" | "completed" | "archived";

export type SavingsGoal = {
  id: string;
  userId: string;
  name: string;
  targetAmountCents: number;
  targetDate?: string;
  startingAmountCents: number;
  currentAmountCents: number;
  monthlyContributionCents: number;
  includeInSpendableCash: boolean;
  status: SavingsGoalStatus;
  createdAt: string;
  updatedAt: string;
};

export type SavingsGoalPlan = {
  goal: SavingsGoal;
  remainingCents: number;
  progressRatio: number;
  monthsRemaining?: number;
  recommendedMonthlyContributionCents?: number;
  recommendedDailyContributionCents?: number;
  onTrack?: boolean;
  warning?: string;
};

export type SavingsGoalInput = {
  name: string;
  targetAmountCents: number;
  targetDate?: string;
  startingAmountCents?: number;
  currentAmountCents?: number;
  monthlyContributionCents?: number;
  includeInSpendableCash?: boolean;
};

export type SavingsGoalUpdate = Omit<Partial<SavingsGoalInput>, "targetDate"> & {
  targetDate?: string | null;
  status?: SavingsGoalStatus;
};
