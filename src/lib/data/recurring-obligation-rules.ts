import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurringObligationRule } from "@/lib/types";
import type { Database, RecurringObligationRuleRow } from "@/lib/supabase/database.types";

export type RecurringObligationRuleInput = {
  merchantKey: string;
  label: string;
  expectedAmountCents: number;
  expectedDay?: number;
};

export async function listRecurringObligationRulesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RecurringObligationRule[]> {
  const { data, error } = await supabase
    .from("recurring_obligation_rules")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRecurringObligationRuleRow);
}

export async function upsertRecurringObligationRuleForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: RecurringObligationRuleInput,
): Promise<RecurringObligationRule> {
  const { data, error } = await supabase
    .from("recurring_obligation_rules")
    .upsert(
      {
        user_id: userId,
        merchant_key: normalizeMerchantKey(input.merchantKey),
        label: input.label.trim(),
        expected_amount_cents: input.expectedAmountCents,
        expected_day: input.expectedDay ?? null,
        cadence: "monthly",
        source: "user_confirmed",
        status: "active",
        last_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,merchant_key" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapRecurringObligationRuleRow(data);
}

export async function ignoreRecurringObligationForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  merchantName: string,
): Promise<RecurringObligationRule> {
  const { data, error } = await supabase
    .from("recurring_obligation_rules")
    .upsert(
      {
        user_id: userId,
        merchant_key: normalizeMerchantKey(merchantName),
        label: merchantName.trim(),
        expected_amount_cents: 0,
        expected_day: null,
        cadence: "monthly",
        source: "user_correction",
        status: "ignored",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,merchant_key" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapRecurringObligationRuleRow(data);
}

export function mapRecurringObligationRuleRow(
  row: RecurringObligationRuleRow,
): RecurringObligationRule {
  return {
    id: row.id,
    userId: row.user_id,
    merchantKey: row.merchant_key,
    label: row.label,
    expectedAmountCents: row.expected_amount_cents,
    expectedDay: row.expected_day ?? undefined,
    cadence: row.cadence,
    source: row.source,
    status: row.status,
    lastConfirmedAt: row.last_confirmed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeMerchantKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
