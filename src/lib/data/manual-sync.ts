import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentAppDate } from "@/lib/date/app-date";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { getDisplayedSpendableCashTodayCents } from "@/lib/pip-cash/spendable-cash-today";
import { loadFinancialSnapshotForUser } from "@/lib/data/financial-repository";
import { recordProductEvent } from "@/lib/data/product-events";
import type {
  FinancialDataProvider,
  FinancialProviderName,
  ProviderInstitutionSyncFailure,
  ProviderInstitutionSyncResult,
  ProviderInstitutionSyncSuccess,
} from "@/lib/providers/FinancialDataProvider";
import { ProviderSyncError, type ProviderConnectionStatus } from "@/lib/providers/provider-errors";
import { getFinancialDataProvider, ProviderUnavailableError } from "@/lib/providers/provider-registry";
import { sanitizeSensitiveText } from "@/lib/security/error-messages";
import type { Account, FinancialSnapshot, Transaction } from "@/lib/types";
import type { Database, Json } from "@/lib/supabase/database.types";

export const MANUAL_SYNC_RATE_LIMIT_MS = 60_000;
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type ManualSyncResult = {
  syncRunId: string;
  provider: FinancialProviderName;
  institutionId: string;
  institutionIds: string[];
  status: "succeeded" | "partial";
  accountCount: number;
  transactionCount: number;
  balanceCount: number;
  pipCashTodayCents: number;
  failedInstitutionCount: number;
  failures: ManualSyncFailure[];
};

export type ManualSyncFailure = {
  code: string;
  message: string;
  repairRequired: boolean;
  connectionStatus?: ProviderConnectionStatus;
  institutionId?: string;
  institutionName?: string;
};

export class ManualSyncRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Manual sync was requested too recently.");
    this.name = "ManualSyncRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function runManualSync(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    provider: FinancialProviderName;
    now?: Date;
    bypassRateLimit?: boolean;
  },
): Promise<ManualSyncResult> {
  const now = input.now ?? new Date();

  if (!input.bypassRateLimit) {
    await assertManualSyncAllowed(supabase, {
      userId: input.userId,
      provider: input.provider,
      now,
    });
  }

  const provider = getFinancialDataProvider(input.provider);
  const syncRun = await createSyncRun(supabase, {
    userId: input.userId,
    provider: input.provider,
  });
  const startedAt = now.getTime();

  try {
    const syncResults = await syncProviderConnections(provider, input.userId);
    const successes = syncResults.filter(isSyncSuccess);
    const failures = syncResults.filter((result) => result.type === "failure");

    if (successes.length === 0) {
      const firstFailure = failures[0];

      throw firstFailure
        ? toProviderSyncError(input.provider, firstFailure)
        : new Error("Provider sync returned no connected institutions.");
    }

    const settings = await upsertDefaultSettings(supabase, input.userId, now);
    const institutionIds: string[] = [];
    let accountCount = 0;
    let transactionCount = 0;
    let balanceCount = 0;

    for (const success of successes) {
      const institution = await upsertInstitution(supabase, {
        userId: input.userId,
        provider: input.provider,
        institutionId: success.connection.institutionId,
        institutionName: success.connection.institutionName,
        providerInstitutionId: success.connection.providerInstitutionId,
        status: success.connection.status,
        now,
      });
      const accountIdByProviderId = await upsertAccounts(supabase, {
        userId: input.userId,
        institutionId: institution.id,
        accounts: success.accounts,
      });

      await upsertTransactions(supabase, {
        userId: input.userId,
        transactions: success.transactions,
        accountIdByProviderId,
      });
      await success.commit?.();

      institutionIds.push(institution.id);
      accountCount += success.accounts.length;
      transactionCount += success.transactions.length;
      balanceCount += success.balances.length;
    }

    const storedSnapshot = await loadFinancialSnapshotForUser(supabase, input.userId);
    const snapshot: FinancialSnapshot = storedSnapshot ?? {
      accounts: successes.flatMap((success) => success.accounts),
      transactions: successes.flatMap((success) => success.transactions),
      settings,
    };
    const result = calculatePipCash(snapshot);
    const spendableCashTodayCents = getDisplayedSpendableCashTodayCents(result);
    const v2Metric = result.spendableCashToday;
    const syncFailures = await Promise.all(
      failures.map((failure) =>
        recordProviderFailure(supabase, {
          userId: input.userId,
          provider: input.provider,
          now,
          error: failure.error,
          institutionId: failure.institutionId,
          institutionName: failure.institutionName,
        }),
      ),
    );
    const status = syncFailures.length > 0 ? "partial" : "succeeded";

    await storePipCashSnapshot(supabase, {
      userId: input.userId,
      syncRunId: syncRun.id,
      result,
    });
    await finishSyncRun(supabase, {
      syncRunId: syncRun.id,
      institutionId: institutionIds[0],
      status,
      startedAt,
      now,
      accountCount,
      transactionCount,
      balanceCount,
      ...(syncFailures.length > 0
        ? {
            errorCode: "partial-provider-sync-failure",
            errorMessage: `${syncFailures.length} connected institution${
              syncFailures.length === 1 ? "" : "s"
            } could not refresh.`,
          }
        : {}),
    });
    await recordProductEvent(supabase, input.userId, status === "partial" ? "manual_sync_partial" : "manual_sync_succeeded", {
      provider: input.provider,
      accountCount,
      transactionCount,
      failedInstitutionCount: syncFailures.length,
      pipCashTodayCents: spendableCashTodayCents,
      metricVersion: v2Metric?.metricVersion ?? "legacy",
      spendableCashTodayCents,
      baselineDailyAllowanceCents: v2Metric?.baselineDailyAllowanceCents,
      behaviorAdjustmentCents: v2Metric?.behaviorAdjustmentCents,
      cashRealityAdjustmentCents: v2Metric?.cashRealityAdjustmentCents,
      state: v2Metric?.state,
      confidence: v2Metric?.confidence,
      shortfallCents: v2Metric?.shortfallCents,
      currentMonthVarianceCents: v2Metric?.currentMonthVarianceCents,
    });

    return {
      syncRunId: syncRun.id,
      provider: input.provider,
      institutionId: institutionIds[0],
      institutionIds,
      status,
      accountCount,
      transactionCount,
      balanceCount,
      pipCashTodayCents: spendableCashTodayCents,
      failedInstitutionCount: syncFailures.length,
      failures: syncFailures.map(toManualSyncFailure),
    };
  } catch (error) {
    const failure = getProviderFailure(input.provider, error);

    await finishSyncRun(supabase, {
      syncRunId: syncRun.id,
      institutionId: failure.institutionId,
      status: "failed",
      startedAt,
      now,
      accountCount: 0,
      transactionCount: 0,
      balanceCount: 0,
      errorCode: failure.code,
      errorMessage: failure.message,
    });
    await markInstitutionSyncFailure(supabase, {
      userId: input.userId,
      now,
      failure,
    });
    await recordProductEvent(supabase, input.userId, "manual_sync_failed", {
      provider: failure.provider,
      error: failure.message,
      errorCode: failure.code,
      repairRequired: failure.repairRequired,
      ...(failure.institutionId ? { institutionId: failure.institutionId } : {}),
      ...(failure.institutionName ? { institutionName: failure.institutionName } : {}),
    });

    throw error;
  }
}

async function syncProviderConnections(
  provider: FinancialDataProvider,
  userId: string,
): Promise<ProviderInstitutionSyncResult[]> {
  if (provider.syncConnectedInstitutions) {
    return provider.syncConnectedInstitutions(userId);
  }

  const [connection, accounts, transactions, balances] = await Promise.all([
    provider.handleConnectCallback({ userId }),
    provider.syncAccounts(userId),
    provider.syncTransactions(userId),
    provider.syncBalances(userId),
  ]);

  return [
    {
      type: "success",
      connection,
      accounts,
      transactions,
      balances,
    },
  ];
}

function isSyncSuccess(
  result: ProviderInstitutionSyncResult,
): result is ProviderInstitutionSyncSuccess {
  return result.type === "success";
}

export async function assertManualSyncAllowed(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    provider: FinancialProviderName;
    now: Date;
  },
): Promise<void> {
  const { data, error } = await supabase
    .from("sync_runs")
    .select("started_at")
    .eq("user_id", input.userId)
    .eq("provider", input.provider)
    .order("started_at", {
      ascending: false,
    })
    .limit(1);

  if (error) {
    throw error;
  }

  const latestStartedAt = data?.[0]?.started_at;

  if (!latestStartedAt) {
    return;
  }

  const elapsedMs = input.now.getTime() - new Date(latestStartedAt).getTime();

  if (elapsedMs < MANUAL_SYNC_RATE_LIMIT_MS) {
    throw new ManualSyncRateLimitError(
      Math.ceil((MANUAL_SYNC_RATE_LIMIT_MS - elapsedMs) / 1000),
    );
  }
}

async function createSyncRun(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    provider: FinancialProviderName;
  },
) {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      user_id: input.userId,
      provider: input.provider,
      status: "started",
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function upsertInstitution(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    provider: FinancialProviderName;
    institutionId?: string;
    institutionName: string;
    providerInstitutionId?: string;
    status: "connected" | "mocked";
    now: Date;
  },
) {
  let findQuery = supabase
    .from("connected_institutions")
    .select("*")
    .eq("user_id", input.userId)
    .eq("provider", input.provider);

  findQuery = input.institutionId
    ? findQuery.eq("id", input.institutionId)
    : findQuery.eq("institution_name", input.institutionName);

  const { data: existing, error: findError } = await findQuery.maybeSingle();

  if (findError) {
    throw findError;
  }

  const staleAfter = new Date(input.now.getTime() + STALE_AFTER_MS).toISOString();
  const payload = {
    institution_name: input.institutionName,
    provider_institution_id: input.providerInstitutionId ?? existing?.provider_institution_id ?? null,
    status: input.status,
    last_successful_sync_at: input.now.toISOString(),
    stale_after: staleAfter,
    error_code: null,
    error_message: null,
    updated_at: input.now.toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("connected_institutions")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await supabase
      .from("connected_institutions")
      .insert({
        user_id: input.userId,
        provider: input.provider,
        ...payload,
      })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function upsertAccounts(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    institutionId: string;
    accounts: Account[];
  },
): Promise<Map<string, string>> {
  const providerAccountIds = new Set(input.accounts.map((account) => account.id));
  const { data: existingAccounts, error: existingError } = await supabase
    .from("accounts")
    .select("id, provider_account_id")
    .eq("user_id", input.userId)
    .eq("institution_id", input.institutionId);

  if (existingError) {
    throw existingError;
  }

  const inactiveAccountIds = (existingAccounts ?? [])
    .filter((account) => !providerAccountIds.has(account.provider_account_id))
    .map((account) => account.id);

  if (inactiveAccountIds.length > 0) {
    await markAccountsInactive(supabase, {
      userId: input.userId,
      accountIds: inactiveAccountIds,
    });
  }

  if (input.accounts.length === 0) {
    return new Map();
  }

  const rows = input.accounts.map((account) => ({
    user_id: input.userId,
    institution_id: input.institutionId,
    provider_account_id: account.id,
    name: account.name,
    institution_name: account.institutionName,
    kind: account.kind,
    balance_cents: account.balanceCents,
    available_balance_cents: account.availableBalanceCents ?? null,
    last_four: account.lastFour ?? null,
    is_protected_savings: account.isProtectedSavings ?? false,
    active: true,
    raw_provider_data: {} satisfies Json,
  }));
  const { data, error } = await supabase
    .from("accounts")
    .upsert(rows, {
      onConflict: "user_id,provider_account_id",
    })
    .select("id, provider_account_id");

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((row) => [row.provider_account_id, row.id]));
}

async function markAccountsInactive(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    accountIds: string[];
  },
) {
  const now = new Date().toISOString();
  const { error: accountError } = await supabase
    .from("accounts")
    .update({
      active: false,
      updated_at: now,
    })
    .eq("user_id", input.userId)
    .in("id", input.accountIds);

  if (accountError) {
    throw accountError;
  }

  const preferenceRows = input.accountIds.map((accountId) => ({
    user_id: input.userId,
    account_id: accountId,
    include_in_pip_cash: false,
    hidden_reason: "provider_unselected",
    updated_at: now,
  }));

  const { error: preferenceError } = await supabase
    .from("account_preferences")
    .upsert(preferenceRows, {
      onConflict: "user_id,account_id",
    });

  if (preferenceError) {
    throw preferenceError;
  }
}

async function upsertTransactions(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    transactions: Transaction[];
    accountIdByProviderId: Map<string, string>;
  },
) {
  const rows = input.transactions.flatMap((transaction) => {
    const accountId = input.accountIdByProviderId.get(transaction.accountId);

    if (!accountId) {
      return [];
    }

    return [
      {
        user_id: input.userId,
        account_id: accountId,
        provider_transaction_id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        merchant_name: transaction.merchantName ?? null,
        amount_cents: transaction.amountCents,
        category: transaction.category ?? null,
        kind: transaction.kind ?? null,
        pending: transaction.pending ?? false,
        metadata: (transaction.metadata ?? {}) satisfies Json,
        raw_provider_data: {} satisfies Json,
      },
    ];
  });

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from("transactions").upsert(rows, {
    onConflict: "user_id,provider_transaction_id",
  });

  if (error) {
    throw error;
  }
}

async function upsertDefaultSettings(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date,
) {
  const { data: existing, error: findError } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) {
    throw findError;
  }

  if (existing) {
    return {
      asOfDate: getCurrentAppDate(now),
      protectedSavingsMonthlyCents: existing.protected_savings_monthly_cents,
    };
  }

  const { data, error } = await supabase
    .from("user_settings")
    .insert({
      user_id: userId,
      protected_savings_monthly_cents: 20000,
      manual_refresh_only: true,
      updated_at: now.toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return {
    asOfDate: getCurrentAppDate(now),
    protectedSavingsMonthlyCents: data.protected_savings_monthly_cents,
  };
}

async function storePipCashSnapshot(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    syncRunId: string;
    result: ReturnType<typeof calculatePipCash>;
  },
) {
  const { error } = await supabase.from("pip_cash_snapshots").insert({
    user_id: input.userId,
    as_of_date: input.result.window.endDate,
    pip_cash_today_cents: input.result.pipCashTodayCents,
    rolling_net_cents: input.result.rollingNetCents,
    income_total_cents: input.result.incomeTotalCents,
    spending_total_cents: input.result.spendingTotalCents,
    refund_total_cents: input.result.refundTotalCents,
    protected_savings_monthly_cents: input.result.protectedSavingsMonthlyCents,
    result: input.result as unknown as Json,
    stale: false,
    source_sync_run_id: input.syncRunId,
  });

  if (error) {
    throw error;
  }
}

async function finishSyncRun(
  supabase: SupabaseClient<Database>,
  input: {
    syncRunId: string;
    institutionId?: string;
    status: "succeeded" | "failed" | "partial";
    startedAt: number;
    now: Date;
    accountCount: number;
    transactionCount: number;
    balanceCount: number;
    errorCode?: string;
    errorMessage?: string;
  },
) {
  const { error } = await supabase
    .from("sync_runs")
    .update({
      status: input.status,
      institution_id: input.institutionId ?? null,
      completed_at: input.now.toISOString(),
      duration_ms: Math.max(0, input.now.getTime() - input.startedAt),
      account_count: input.accountCount,
      transaction_count: input.transactionCount,
      balance_count: input.balanceCount,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
    })
    .eq("id", input.syncRunId);

  if (error) {
    throw error;
  }
}

async function recordProviderFailure(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    provider: FinancialProviderName;
    now: Date;
    error: unknown;
    institutionId?: string;
    institutionName?: string;
  },
): Promise<ProviderFailure> {
  const mappedFailure = getProviderFailure(input.provider, input.error);
  const failure = {
    ...mappedFailure,
    institutionId: mappedFailure.institutionId ?? input.institutionId,
    institutionName: mappedFailure.institutionName ?? input.institutionName,
    status:
      mappedFailure.status ??
      (input.institutionId || input.institutionName ? "failed" : undefined),
  };

  await markInstitutionSyncFailure(supabase, {
    userId: input.userId,
    now: input.now,
    failure,
  });
  await recordProductEvent(supabase, input.userId, "manual_sync_failed", {
    provider: failure.provider,
    error: failure.message,
    errorCode: failure.code,
    repairRequired: failure.repairRequired,
    ...(failure.institutionId ? { institutionId: failure.institutionId } : {}),
    ...(failure.institutionName ? { institutionName: failure.institutionName } : {}),
  });

  return failure;
}

function toManualSyncFailure(failure: ProviderFailure): ManualSyncFailure {
  return {
    code: failure.code,
    message: failure.message,
    repairRequired: failure.repairRequired,
    ...(failure.status ? { connectionStatus: failure.status } : {}),
    ...(failure.institutionId ? { institutionId: failure.institutionId } : {}),
    ...(failure.institutionName ? { institutionName: failure.institutionName } : {}),
  };
}

type ProviderFailure = {
  provider: FinancialProviderName;
  code: string;
  message: string;
  status?: ProviderConnectionStatus;
  institutionId?: string;
  institutionName?: string;
  repairRequired: boolean;
};

async function markInstitutionSyncFailure(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    now: Date;
    failure: ProviderFailure;
  },
) {
  if (!input.failure.status) {
    return;
  }

  if (!input.failure.institutionId && !input.failure.institutionName) {
    return;
  }

  let query = supabase
    .from("connected_institutions")
    .update({
      status: input.failure.status,
      stale_after: input.now.toISOString(),
      error_code: input.failure.code,
      error_message: input.failure.message,
      updated_at: input.now.toISOString(),
    })
    .eq("user_id", input.userId)
    .eq("provider", input.failure.provider);

  if (input.failure.institutionId) {
    query = query.eq("id", input.failure.institutionId);
  } else if (input.failure.institutionName) {
    query = query.eq("institution_name", input.failure.institutionName);
  }

  const { error } = await query;

  if (error) {
    throw error;
  }
}

function getProviderFailure(provider: FinancialProviderName, error: unknown): ProviderFailure {
  if (error instanceof ProviderSyncError) {
    return {
      provider: error.provider,
      code: error.code,
      message: getErrorMessage(error),
      status: error.status,
      institutionId: error.institutionId,
      institutionName: error.institutionName,
      repairRequired: error.repairRequired,
    };
  }

  if (error instanceof ProviderUnavailableError) {
    return {
      provider: error.provider,
      code: error.code,
      message: getErrorMessage(error),
      repairRequired: false,
    };
  }

  const structuredProviderError = getStructuredProviderError(provider, error);

  if (structuredProviderError) {
    return structuredProviderError;
  }

  return {
    provider,
    code: "manual-sync-error",
    message: getErrorMessage(error),
    repairRequired: false,
  };
}

function toProviderSyncError(
  provider: FinancialProviderName,
  failure: ProviderInstitutionSyncFailure,
): ProviderSyncError {
  const mappedFailure = getProviderFailure(provider, failure.error);

  return new ProviderSyncError({
    provider: mappedFailure.provider,
    code: mappedFailure.code,
    message: mappedFailure.message,
    status: mappedFailure.status ?? "failed",
    institutionId: mappedFailure.institutionId ?? failure.institutionId,
    institutionName: mappedFailure.institutionName ?? failure.institutionName,
    repairRequired: mappedFailure.repairRequired,
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeSyncErrorMessage(error.message);
  }

  const payload = getErrorPayload(error);
  const message = getStringField(payload, "message") ??
    getStringField(payload, "error_message") ??
    getStringField(payload, "display_message") ??
    (typeof error === "string" && error.trim() ? error : null);

  return sanitizeSyncErrorMessage(message ?? "Unknown sync error.");
}

function getStructuredProviderError(
  provider: FinancialProviderName,
  error: unknown,
): ProviderFailure | null {
  const payload = getErrorPayload(error);
  const rawCode = getStringField(payload, "error_code") ?? getStringField(payload, "code");
  const rawMessage =
    getStringField(payload, "display_message") ??
    getStringField(payload, "error_message") ??
    getStringField(payload, "message");

  if (!rawCode && !rawMessage) {
    return null;
  }

  const code = rawCode ? normalizeProviderErrorCode(rawCode) : "manual-sync-error";
  const plaidMapping = provider === "plaid" && rawCode ? getPlaidFailureMapping(rawCode) : null;
  const message = plaidMapping?.message ??
    (rawMessage
      ? sanitizeSyncErrorMessage(rawMessage)
      : sanitizeSyncErrorMessage(`${provider} sync failed with ${rawCode}.`));

  return {
    provider,
    code,
    message,
    status: plaidMapping?.status ?? (rawCode ? "failed" : undefined),
    repairRequired: plaidMapping?.repairRequired ?? false,
  };
}

function getPlaidFailureMapping(errorCode: string): {
  status: ProviderConnectionStatus;
  message?: string;
  repairRequired: boolean;
} {
  switch (errorCode.trim().toUpperCase().replace(/-/g, "_")) {
    case "ITEM_LOGIN_REQUIRED":
    case "INVALID_CREDENTIALS":
    case "INVALID_MFA":
    case "ITEM_LOCKED":
    case "MFA_NOT_SUPPORTED":
    case "USER_SETUP_REQUIRED":
      return {
        status: "failed",
        message: "Plaid needs this bank connection repaired. Reconnect the bank to refresh access.",
        repairRequired: true,
      };
    case "INVALID_ACCESS_TOKEN":
    case "ITEM_NOT_FOUND":
    case "USER_PERMISSION_REVOKED":
    case "USER_ACCOUNT_REVOKED":
    case "ACCESS_NOT_GRANTED":
      return {
        status: "revoked",
        message: "Plaid access for this bank was revoked. Reconnect the bank to continue syncing.",
        repairRequired: true,
      };
    case "NO_ACCOUNTS":
      return {
        status: "failed",
        message: "Plaid did not return an eligible account. Reconnect and choose the accounts Pip should use.",
        repairRequired: true,
      };
    case "PRODUCT_NOT_READY":
      return {
        status: "stale",
        message: "Plaid is still preparing this bank's transaction data. Try syncing again in a few minutes.",
        repairRequired: false,
      };
    case "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION":
      return {
        status: "stale",
        message: "Plaid transaction data changed during sync. Try syncing again.",
        repairRequired: false,
      };
    default:
      return {
        status: "failed",
        repairRequired: false,
      };
  }
}

function getErrorPayload(error: unknown): Record<string, unknown> | null {
  const direct = asRecord(error);
  const response = asRecord(direct?.response);
  const data = asRecord(response?.data);

  return data ?? direct;
}

function getStringField(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeProviderErrorCode(errorCode: string): string {
  return errorCode.trim().toLowerCase().replace(/_/g, "-").slice(0, 120);
}

function sanitizeSyncErrorMessage(message: string): string {
  return sanitizeSensitiveText(message).slice(0, 240);
}
