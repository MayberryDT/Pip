import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, FinancialSnapshot, FreeCashResult, Transaction, UserSettings } from "@/lib/types";
import type {
  AccountRow,
  Database,
  Json,
  TransactionRow,
  UserSettingsRow,
} from "@/lib/supabase/database.types";
import { getCurrentAppDate } from "@/lib/date/app-date";

export { getCurrentAppDate } from "@/lib/date/app-date";

export async function loadFinancialSnapshotForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<FinancialSnapshot | null> {
  const [
    settingsResult,
    accountsResult,
    transactionsResult,
    missingCardPreferencesResult,
  ] = await Promise.all([
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("accounts").select("*").eq("user_id", userId),
    supabase.from("transactions").select("*").eq("user_id", userId).order("date", {
      ascending: false,
    }),
    supabase.from("missing_card_preferences").select("issuer_name").eq("user_id", userId),
  ]);

  if (settingsResult.error) {
    throw settingsResult.error;
  }

  if (accountsResult.error) {
    throw accountsResult.error;
  }

  if (transactionsResult.error) {
    throw transactionsResult.error;
  }

  if (missingCardPreferencesResult.error) {
    throw missingCardPreferencesResult.error;
  }

  const settings = settingsResult.data;
  const accounts = accountsResult.data ?? [];
  const transactions = transactionsResult.data ?? [];
  const suppressedMissingCardIssuers = (missingCardPreferencesResult.data ?? []).map(
    (preference) => preference.issuer_name,
  );

  if (!settings || accounts.length === 0) {
    return null;
  }

  return {
    accounts: accounts.map(mapAccountRow),
    transactions: transactions.map(mapTransactionRow),
    settings: mapUserSettingsRow(settings, suppressedMissingCardIssuers),
  };
}

export async function loadCachedFreeCashResultForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  asOfDate = getCurrentAppDate(),
): Promise<FreeCashResult | null> {
  const { data, error } = await supabase
    .from("free_cash_snapshots")
    .select("result")
    .eq("user_id", userId)
    .eq("as_of_date", asOfDate)
    .eq("stale", false)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const result = data?.[0]?.result;

  if (!isFreeCashResult(result)) {
    return null;
  }

  return result;
}

export async function upsertUserSettings(
  supabase: SupabaseClient<Database>,
  userId: string,
  settings: Pick<UserSettings, "protectedSavingsMonthlyCents">,
) {
  const { data, error } = await supabase
    .from("user_settings")
    .upsert({
      user_id: userId,
      protected_savings_monthly_cents: settings.protectedSavingsMonthlyCents,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapUserSettingsRow(data);
}

export async function markFreeCashSnapshotsStaleForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { error } = await supabase
    .from("free_cash_snapshots")
    .update({
      stale: true,
    })
    .eq("user_id", userId)
    .eq("stale", false);

  if (error) {
    throw error;
  }
}

export async function deleteCurrentUserFinancialData(supabase: SupabaseClient<Database>) {
  const { error } = await supabase.rpc("delete_current_user_financial_data");

  if (error) {
    throw error;
  }
}

export function mapUserSettingsRow(
  row: UserSettingsRow,
  suppressedMissingCardIssuers: string[] = [],
): UserSettings {
  return {
    asOfDate: getCurrentAppDate(),
    protectedSavingsMonthlyCents: row.protected_savings_monthly_cents,
    suppressedMissingCardIssuers,
  };
}

export function mapAccountRow(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    institutionName: row.institution_name,
    kind: row.kind,
    balanceCents: row.balance_cents,
    availableBalanceCents: row.available_balance_cents ?? undefined,
    lastFour: row.last_four ?? undefined,
    isProtectedSavings: row.is_protected_savings,
  };
}

export function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    description: row.description,
    merchantName: row.merchant_name ?? undefined,
    amountCents: row.amount_cents,
    category: row.category ?? undefined,
    kind: row.kind ?? undefined,
    pending: row.pending,
    metadata: getTransactionMetadata(row.metadata),
  };
}

function getTransactionMetadata(metadata: Json): Transaction["metadata"] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  return {
    issuerName: typeof metadata.issuerName === "string" ? metadata.issuerName : undefined,
    matchedConnectedCard:
      typeof metadata.matchedConnectedCard === "boolean" ? metadata.matchedConnectedCard : undefined,
    linkedTransactionId:
      typeof metadata.linkedTransactionId === "string" ? metadata.linkedTransactionId : undefined,
  };
}

function isFreeCashResult(value: unknown): value is FreeCashResult {
  const record = asRecord(value);

  if (!record) {
    return false;
  }

  return (
    typeof record.freeCashTodayCents === "number" &&
    typeof record.rollingNetCents === "number" &&
    typeof record.incomeTotalCents === "number" &&
    typeof record.spendingTotalCents === "number" &&
    typeof record.refundTotalCents === "number" &&
    typeof record.protectedSavingsMonthlyCents === "number" &&
    Boolean(asRecord(record.window)) &&
    Array.isArray(record.drivers) &&
    Array.isArray(record.warnings) &&
    Array.isArray(record.dataStates) &&
    Array.isArray(record.trueBalances)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}
