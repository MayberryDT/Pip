import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, FinancialSnapshot, PipCashResult, Transaction, UserSettings } from "@/lib/types";
import type {
  AccountPreferenceRow,
  AccountRow,
  Database,
  Json,
  TransactionRow,
  UserSettingsRow,
} from "@/lib/supabase/database.types";
import { getCurrentAppDate } from "@/lib/date/app-date";
import { isInstitutionStale } from "@/lib/data/sync-status";

export { getCurrentAppDate } from "@/lib/date/app-date";

export async function loadFinancialSnapshotForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<FinancialSnapshot | null> {
  const [
    settingsResult,
    accountsResult,
    accountPreferencesResult,
    transactionsResult,
    missingCardPreferencesResult,
  ] = await Promise.all([
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("accounts").select("*").eq("user_id", userId),
    supabase.from("account_preferences").select("*").eq("user_id", userId),
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

  if (accountPreferencesResult.error) {
    throw accountPreferencesResult.error;
  }

  if (transactionsResult.error) {
    throw transactionsResult.error;
  }

  if (missingCardPreferencesResult.error) {
    throw missingCardPreferencesResult.error;
  }

  const settings = settingsResult.data;
  const accounts = accountsResult.data ?? [];
  const accountPreferences = accountPreferencesResult.data ?? [];
  const transactions = transactionsResult.data ?? [];
  const suppressedMissingCardIssuers = (missingCardPreferencesResult.data ?? []).map(
    (preference) => preference.issuer_name,
  );

  if (!settings || accounts.length === 0) {
    return null;
  }

  return {
    accounts: mapAccountRows(accounts, accountPreferences),
    transactions: transactions.map(mapTransactionRow),
    settings: mapUserSettingsRow(settings, suppressedMissingCardIssuers),
  };
}

export type AccountConnectionAccount = {
  accountId: string;
  name: string;
  kind: Account["kind"];
  lastFour?: string;
  includedInPipCash: boolean;
  isProtectedSavings: boolean;
  active: boolean;
  roleLabel: string;
  warning?: string;
};

export type AccountConnectionInstitution = {
  institutionId: string;
  institutionName: string;
  provider: Database["public"]["Enums"]["financial_provider"];
  providerInstitutionId?: string;
  status: Database["public"]["Enums"]["connection_status"];
  lastSuccessfulSyncAt?: string | null;
  staleAfter?: string | null;
  needsRepair: boolean;
  accounts: AccountConnectionAccount[];
};

export type ConnectedAccountsResult = {
  institutions: AccountConnectionInstitution[];
};

type ConnectedInstitutionRow = Database["public"]["Tables"]["connected_institutions"]["Row"];

export async function loadConnectedAccountsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  now = new Date(),
): Promise<ConnectedAccountsResult> {
  const [institutionsResult, accountsResult, preferencesResult] = await Promise.all([
    supabase
      .from("connected_institutions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .order("institution_name", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("account_preferences").select("*").eq("user_id", userId),
  ]);

  if (institutionsResult.error) {
    throw institutionsResult.error;
  }

  if (accountsResult.error) {
    throw accountsResult.error;
  }

  if (preferencesResult.error) {
    throw preferencesResult.error;
  }

  const preferences = preferencesResult.data ?? [];
  const accounts = mapAccountRows(accountsResult.data ?? [], preferences);
  const accountsByInstitutionId = groupBy(accountsResult.data ?? [], (account) => account.institution_id);
  const mappedAccountsById = new Map(accounts.map((account) => [account.id, account]));

  return {
    institutions: (institutionsResult.data ?? []).map((institution) =>
      mapConnectedInstitution(institution, {
        accounts: accountsByInstitutionId.get(institution.id) ?? [],
        mappedAccountsById,
        now,
      }),
    ),
  };
}

export async function upsertAccountInclusionPreference(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    accountId: string;
    includeInPipCash: boolean;
  },
): Promise<Account> {
  const account = await loadAccountForUser(supabase, input.userId, input.accountId);

  if (!account.active && input.includeInPipCash) {
    throw new Error("That account is inactive. Reopen account selection before using it again.");
  }

  const { error } = await supabase
    .from("account_preferences")
    .upsert(
      {
        user_id: input.userId,
        account_id: input.accountId,
        include_in_pip_cash: input.includeInPipCash,
        hidden_reason: input.includeInPipCash ? null : "user_excluded",
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,account_id",
      },
    );

  if (error) {
    throw error;
  }

  await updateMissingCardSuppressionForAccount(supabase, {
    userId: input.userId,
    account,
    suppressed: !input.includeInPipCash,
  });

  return {
    ...account,
    includedInPipCash: input.includeInPipCash,
    hiddenReason: input.includeInPipCash ? undefined : "user_excluded",
  };
}

export async function upsertAccountProtectedSavingsPreference(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    accountId: string;
    isProtectedSavings: boolean;
  },
): Promise<Account> {
  const account = await loadAccountForUser(supabase, input.userId, input.accountId);
  const { error } = await supabase
    .from("account_preferences")
    .upsert(
      {
        user_id: input.userId,
        account_id: input.accountId,
        is_protected_savings_override: input.isProtectedSavings,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,account_id",
      },
    );

  if (error) {
    throw error;
  }

  return {
    ...account,
    isProtectedSavings: input.isProtectedSavings,
  };
}

export async function loadInstitutionForUser(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    institutionId: string;
  },
): Promise<ConnectedInstitutionRow> {
  const { data, error } = await supabase
    .from("connected_institutions")
    .select("*")
    .eq("user_id", input.userId)
    .eq("id", input.institutionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Institution not found.");
  }

  return data;
}

export async function removeInstitutionForUser(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    institutionId: string;
  },
): Promise<ConnectedInstitutionRow> {
  const institution = await loadInstitutionForUser(supabase, input);
  const { error } = await supabase
    .from("connected_institutions")
    .delete()
    .eq("user_id", input.userId)
    .eq("id", input.institutionId);

  if (error) {
    throw error;
  }

  return institution;
}

export async function loadCachedPipCashResultForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  asOfDate = getCurrentAppDate(),
): Promise<PipCashResult | null> {
  const { data, error } = await supabase
    .from("pip_cash_snapshots")
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

  if (!isPipCashResult(result)) {
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

export async function markPipCashSnapshotsStaleForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { error } = await supabase
    .from("pip_cash_snapshots")
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

export function mapAccountRow(
  row: AccountRow,
  preference?: AccountPreferenceRow | null,
): Account {
  const active = row.active ?? true;
  const preferenceIncluded = preference?.include_in_pip_cash ?? true;

  return {
    id: row.id,
    name: row.name,
    institutionName: row.institution_name,
    kind: row.kind,
    balanceCents: row.balance_cents,
    availableBalanceCents: row.available_balance_cents ?? undefined,
    lastFour: row.last_four ?? undefined,
    isProtectedSavings: preference?.is_protected_savings_override ?? row.is_protected_savings,
    active,
    includedInPipCash: active && preferenceIncluded,
    userLabel: preference?.user_label ?? undefined,
    hiddenReason: preference?.hidden_reason ?? undefined,
  };
}

export function mapAccountRows(
  rows: AccountRow[],
  preferences: AccountPreferenceRow[] = [],
): Account[] {
  const preferenceByAccountId = new Map(
    preferences.map((preference) => [preference.account_id, preference]),
  );

  return rows.map((row) => mapAccountRow(row, preferenceByAccountId.get(row.id) ?? null));
}

async function loadAccountForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
): Promise<Account> {
  const [accountResult, preferenceResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("id", accountId)
      .maybeSingle(),
    supabase
      .from("account_preferences")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .maybeSingle(),
  ]);

  if (accountResult.error) {
    throw accountResult.error;
  }

  if (preferenceResult.error) {
    throw preferenceResult.error;
  }

  if (!accountResult.data) {
    throw new Error("Account not found.");
  }

  return mapAccountRow(accountResult.data, preferenceResult.data ?? null);
}

async function updateMissingCardSuppressionForAccount(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    account: Account;
    suppressed: boolean;
  },
) {
  if (input.account.kind !== "credit_card") {
    return;
  }

  if (input.suppressed) {
    const { error } = await supabase
      .from("missing_card_preferences")
      .upsert(
        {
          user_id: input.userId,
          issuer_name: input.account.institutionName,
        },
        {
          onConflict: "user_id,issuer_name",
        },
      );

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase
    .from("missing_card_preferences")
    .delete()
    .eq("user_id", input.userId)
    .eq("issuer_name", input.account.institutionName);

  if (error) {
    throw error;
  }
}

function mapConnectedInstitution(
  institution: ConnectedInstitutionRow,
  input: {
    accounts: AccountRow[];
    mappedAccountsById: Map<string, Account>;
    now: Date;
  },
): AccountConnectionInstitution {
  const needsRepair = isInstitutionStale(institution, input.now);

  return {
    institutionId: institution.id,
    institutionName: institution.institution_name,
    provider: institution.provider,
    providerInstitutionId: institution.provider_institution_id ?? undefined,
    status: needsRepair && institution.status === "connected" ? "stale" : institution.status,
    lastSuccessfulSyncAt: institution.last_successful_sync_at,
    staleAfter: institution.stale_after,
    needsRepair,
    accounts: input.accounts.map((row) => {
      const account = input.mappedAccountsById.get(row.id) ?? mapAccountRow(row);

      return {
        accountId: account.id,
        name: account.name,
        kind: account.kind,
        lastFour: account.lastFour,
        includedInPipCash: account.includedInPipCash ?? true,
        isProtectedSavings: Boolean(account.isProtectedSavings),
        active: account.active ?? true,
        roleLabel: getAccountRoleLabel(account, needsRepair),
        warning: getAccountWarning(account, needsRepair),
      };
    }),
  };
}

function getAccountRoleLabel(account: Account, institutionNeedsRepair: boolean): string {
  if (institutionNeedsRepair) {
    return "Needs repair";
  }

  if (account.active === false) {
    return "Inactive";
  }

  if (account.includedInPipCash === false) {
    return "Excluded from today's number";
  }

  if (account.isProtectedSavings) {
    return "Protected savings";
  }

  if (account.kind === "credit_card") {
    return "Card spending included";
  }

  return "Used in today's number";
}

function getAccountWarning(
  account: Account,
  institutionNeedsRepair: boolean,
): string | undefined {
  if (institutionNeedsRepair) {
    return "Reconnect to keep today's number accurate.";
  }

  if (account.active === false) {
    return "This account is no longer selected at the provider.";
  }

  return undefined;
}

function groupBy<T, K>(items: T[], getKey: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const group = groups.get(key) ?? [];

    group.push(item);
    groups.set(key, group);
  }

  return groups;
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

function isPipCashResult(value: unknown): value is PipCashResult {
  const record = asRecord(value);

  if (!record) {
    return false;
  }

  return (
    typeof record.pipCashTodayCents === "number" &&
    typeof record.rollingNetCents === "number" &&
    typeof record.incomeTotalCents === "number" &&
    typeof record.spendingTotalCents === "number" &&
    typeof record.refundTotalCents === "number" &&
    typeof record.protectedSavingsMonthlyCents === "number" &&
    Boolean(asRecord(record.window)) &&
    Array.isArray(record.drivers) &&
    Array.isArray(record.warnings) &&
    Array.isArray(record.dataStates) &&
    Array.isArray(record.trueBalances) &&
    (record.spendableCashToday === undefined || isSpendableCashTodayResult(record.spendableCashToday))
  );
}

function isSpendableCashTodayResult(value: unknown): boolean {
  const record = asRecord(value);

  return Boolean(
    record &&
      record.metricVersion === "v2" &&
      typeof record.spendableCashTodayCents === "number" &&
      typeof record.shortfallCents === "number" &&
      typeof record.baselineDailyAllowanceCents === "number" &&
      typeof record.behaviorAdjustmentCents === "number" &&
      typeof record.cashRealityAdjustmentCents === "number" &&
      typeof record.state === "string" &&
      typeof record.confidence === "string" &&
      Array.isArray(record.drivers) &&
      Array.isArray(record.warnings) &&
      Array.isArray(record.dataStates),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}
