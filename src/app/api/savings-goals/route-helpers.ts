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
  _existing?: SavingsGoal,
): string | null {
  const targetDate = "targetDate" in input ? input.targetDate : undefined;
  if (targetDate && targetDate <= getCurrentAppDate()) {
    return "Target date must be in the future.";
  }

  return null;
}

export function shouldStalePipCashForGoalChange(
  before: SavingsGoal | null,
  after: SavingsGoal,
): boolean {
  if (!before) {
    return after.status === "active";
  }

  const beforeActive = before.status === "active";
  const afterActive = after.status === "active";

  if (beforeActive !== afterActive) {
    return true;
  }

  if (!afterActive) {
    return false;
  }

  return (
    before.targetAmountCents !== after.targetAmountCents ||
    before.targetDate !== after.targetDate ||
    before.currentAmountCents !== after.currentAmountCents ||
    before.monthlyContributionCents !== after.monthlyContributionCents
  );
}

export function shouldStalePipCashForGoalArchive(goal: SavingsGoal | null): boolean {
  return Boolean(goal && goal.status === "active");
}

export function toSavingsGoalPlanResponse(goal: SavingsGoal): SavingsGoalPlan {
  return buildSavingsGoalPlan(goal, getCurrentAppDate());
}
