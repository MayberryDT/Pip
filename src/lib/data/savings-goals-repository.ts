import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SavingsGoal,
  SavingsGoalInput,
  SavingsGoalUpdate,
} from "@/lib/savings-goals/types";
import type { Database, SavingsGoalRow } from "@/lib/supabase/database.types";

export async function listSavingsGoalsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SavingsGoal[]> {
  const { data, error } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapSavingsGoalRow);
}

export async function loadSavingsGoalForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  goalId: string,
): Promise<SavingsGoal | null> {
  const { data, error } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("user_id", userId)
    .eq("id", goalId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapSavingsGoalRow(data) : null;
}

export async function createSavingsGoalForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: SavingsGoalInput,
): Promise<SavingsGoal> {
  const { data, error } = await supabase
    .from("savings_goals")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      target_amount_cents: input.targetAmountCents,
      target_date: input.targetDate ?? null,
      starting_amount_cents: input.startingAmountCents ?? 0,
      current_amount_cents: input.currentAmountCents ?? input.startingAmountCents ?? 0,
      monthly_contribution_cents: input.monthlyContributionCents ?? 0,
      include_in_spendable_cash: input.includeInSpendableCash ?? false,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapSavingsGoalRow(data);
}

export async function updateSavingsGoalForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  goalId: string,
  input: SavingsGoalUpdate,
): Promise<SavingsGoal> {
  const { data, error } = await supabase
    .from("savings_goals")
    .update(toSavingsGoalUpdateRow(input))
    .eq("user_id", userId)
    .eq("id", goalId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapSavingsGoalRow(data);
}

export async function archiveSavingsGoalForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  goalId: string,
): Promise<SavingsGoal> {
  return updateSavingsGoalForUser(supabase, userId, goalId, {
    status: "archived",
    includeInSpendableCash: false,
  });
}

export function mapSavingsGoalRow(row: SavingsGoalRow): SavingsGoal {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    targetAmountCents: row.target_amount_cents,
    targetDate: row.target_date ?? undefined,
    startingAmountCents: row.starting_amount_cents,
    currentAmountCents: row.current_amount_cents,
    monthlyContributionCents: row.monthly_contribution_cents,
    includeInSpendableCash: row.include_in_spendable_cash,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSavingsGoalUpdateRow(input: SavingsGoalUpdate) {
  return {
    ...(input.name === undefined ? {} : { name: input.name.trim() }),
    ...(input.targetAmountCents === undefined
      ? {}
      : { target_amount_cents: input.targetAmountCents }),
    ...(input.targetDate === undefined ? {} : { target_date: input.targetDate ?? null }),
    ...(input.startingAmountCents === undefined
      ? {}
      : { starting_amount_cents: input.startingAmountCents }),
    ...(input.currentAmountCents === undefined
      ? {}
      : { current_amount_cents: input.currentAmountCents }),
    ...(input.monthlyContributionCents === undefined
      ? {}
      : { monthly_contribution_cents: input.monthlyContributionCents }),
    ...(input.includeInSpendableCash === undefined
      ? {}
      : { include_in_spendable_cash: input.includeInSpendableCash }),
    ...(input.status === undefined ? {} : { status: input.status }),
    updated_at: new Date().toISOString(),
  };
}
