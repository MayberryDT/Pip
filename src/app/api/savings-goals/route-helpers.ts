import { z } from "zod";
import { getCurrentAppDate } from "@/lib/data/financial-repository";
import { buildSavingsGoalPlan } from "@/lib/savings-goals/plan";
import type {
  SavingsGoal,
  SavingsGoalInput,
  SavingsGoalPlan,
  SavingsGoalUpdate,
} from "@/lib/savings-goals/types";

const maxGoalAmountCents = 100_000_000;

export const savingsGoalCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  targetAmountCents: z.number().int().positive().max(maxGoalAmountCents),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startingAmountCents: z.number().int().min(0).max(maxGoalAmountCents).optional(),
  currentAmountCents: z.number().int().min(0).max(maxGoalAmountCents).optional(),
  monthlyContributionCents: z.number().int().min(0).max(maxGoalAmountCents).optional(),
  includeInSpendableCash: z.boolean().optional(),
});

export const savingsGoalUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  targetAmountCents: z.number().int().positive().max(maxGoalAmountCents).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  startingAmountCents: z.number().int().min(0).max(maxGoalAmountCents).optional(),
  currentAmountCents: z.number().int().min(0).max(maxGoalAmountCents).optional(),
  monthlyContributionCents: z.number().int().min(0).max(maxGoalAmountCents).optional(),
  includeInSpendableCash: z.boolean().optional(),
  status: z.enum(["active", "paused", "completed", "archived"]).optional(),
});

export function validateSavingsGoalInput(
  input: SavingsGoalInput | SavingsGoalUpdate,
  existing?: SavingsGoal,
): string | null {
  const targetDate = "targetDate" in input ? input.targetDate : undefined;
  if (targetDate && targetDate <= getCurrentAppDate()) {
    return "Target date must be in the future.";
  }

  const includeInSpendableCash =
    input.includeInSpendableCash ?? existing?.includeInSpendableCash ?? false;
  const monthlyContributionCents =
    input.monthlyContributionCents ?? existing?.monthlyContributionCents ?? 0;

  if (includeInSpendableCash && monthlyContributionCents <= 0) {
    return "Protected savings goals need a monthly contribution.";
  }

  return null;
}

export function shouldStalePipCashForGoalChange(
  before: SavingsGoal | null,
  after: SavingsGoal,
): boolean {
  if (!before) {
    return after.includeInSpendableCash && after.monthlyContributionCents > 0;
  }

  const beforeProtected = before.status === "active" && before.includeInSpendableCash;
  const afterProtected = after.status === "active" && after.includeInSpendableCash;

  return (
    beforeProtected !== afterProtected ||
    (afterProtected && before.monthlyContributionCents !== after.monthlyContributionCents)
  );
}

export function shouldStalePipCashForGoalArchive(goal: SavingsGoal | null): boolean {
  return Boolean(
    goal &&
      goal.status === "active" &&
      goal.includeInSpendableCash &&
      goal.monthlyContributionCents > 0,
  );
}

export function toSavingsGoalPlanResponse(goal: SavingsGoal): SavingsGoalPlan {
  return buildSavingsGoalPlan(goal, getCurrentAppDate());
}
