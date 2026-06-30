import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentAppDate } from "@/lib/date/app-date";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { getDisplayedSpendableCashTodayCents } from "@/lib/pip-cash/spendable-cash-today";
import {
  loadCachedPipCashResultForUser,
  loadFinancialSnapshotForUser,
} from "@/lib/data/financial-repository";
import {
  createPipReactionEventForUser,
  loadRecentPipReactionEventsForUser,
} from "@/lib/data/pip-reactions";
import { recordProductEventSafely } from "@/lib/data/product-events";
import {
  choosePipReaction,
  comparePipCashResults,
  type PipReactionType,
  type PipReactionTrigger,
} from "@/lib/pip/reactions";
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
import type {
  Account,
  FinancialSnapshot,
  PipCashResult,
  SameDayLedgerItem,
  SameDayLedgerTreatment,
  Transaction,
} from "@/lib/types";
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
  previousSpendableCashTodayCents?: number;
  currentSpendableCashTodayCents?: number;
  spendableDeltaCents?: number;
  sameDayNewSpendCents?: number;
  sameDayNewTransactions?: ManualSyncSameDayTransactionSummary[];
  createdReactionSummary?: ManualSyncCreatedReactionSummary;
  failedInstitutionCount: number;
  failures: ManualSyncFailure[];
  createdReactionType?: PipReactionType;
};

export type ManualSyncSameDayTransactionSummary = {
  date: string;
  label: string;
  amountCents: number;
  pending: boolean;
  treatment: SameDayLedgerTreatment;
};

export type ManualSyncCreatedReactionSummary = {
  reactionType: PipReactionType;
  trigger: PipReactionTrigger;
  currentState: string;
  previousState?: string;
  spendableDeltaCents: number;
  intensity: 1 | 2 | 3;
  summary?: string;
};

export type PipSyncReason =
  | "manual"
  | "repair"
  | "account_selection"
  | "app_open"
  | "plaid_webhook"
  | "scheduled"
  | "settings_change"
  | "account_change";

export type ProviderSyncResult = ManualSyncResult;

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
    writeSupabase?: SupabaseClient<Database>;
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

  return runProviderSync(supabase, {
    userId: input.userId,
    provider: input.provider,
    reason: "manual",
    now,
    writeSupabase: input.writeSupabase,
  });
}

export async function runProviderSync(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    provider: FinancialProviderName;
    reason: PipSyncReason;
    institutionId?: string;
    now?: Date;
    writeSupabase?: SupabaseClient<Database>;
  },
): Promise<ProviderSyncResult> {
  const now = input.now ?? new Date();
  const writeSupabase = input.writeSupabase ?? supabase;
  const provider = getFinancialDataProvider(input.provider);
  const syncRun = await createSyncRun(writeSupabase, {
    userId: input.userId,
    provider: input.provider,
    institutionId: input.institutionId,
  });
  const startedAt = now.getTime();

  try {
    const syncResults = await syncProviderConnections(provider, input.userId, {
      institutionId: input.institutionId,
    });
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
      const institution = await upsertInstitution(writeSupabase, {
        userId: input.userId,
        provider: input.provider,
        institutionId: success.connection.institutionId,
        institutionName: success.connection.institutionName,
        providerInstitutionId: success.connection.providerInstitutionId,
        status: success.connection.status,
        now,
      });
      const accountIdByProviderId = await upsertAccounts(writeSupabase, {
        userId: input.userId,
        institutionId: institution.id,
        accounts: success.accounts,
      });

      await upsertTransactions(writeSupabase, {
        userId: input.userId,
        transactions: success.transactions,
        accountIdByProviderId,
      });
      await deleteRemovedProviderTransactions(writeSupabase, {
        userId: input.userId,
        providerTransactionIds: success.removedTransactionProviderIds ?? [],
      });
      await success.commit?.();

      institutionIds.push(institution.id);
      accountCount += success.accounts.length;
      transactionCount += success.transactions.length;
      balanceCount += success.balances.length;
    }

    const storedSnapshot = await loadFinancialSnapshotForUser(supabase, input.userId);
    const previousPipCashResult = await loadCachedPipCashResultForUser(
      supabase,
      input.userId,
      getCurrentAppDate(now),
    );
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
        recordProviderFailure(writeSupabase, {
          userId: input.userId,
          provider: input.provider,
          reason: input.reason,
          now,
          error: failure.error,
          institutionId: failure.institutionId,
          institutionName: failure.institutionName,
        }),
      ),
    );
    const status = syncFailures.length > 0 ? "partial" : "succeeded";

    await storePipCashSnapshot(writeSupabase, {
      userId: input.userId,
      syncRunId: syncRun.id,
      result,
    });
    const createdReaction = await maybeCreateSyncReaction(supabase, {
      userId: input.userId,
      reason: input.reason,
      previousResult: previousPipCashResult,
      currentResult: result,
      now,
    });
    const previousSpendableCashTodayCents = previousPipCashResult
      ? getDisplayedSpendableCashTodayCents(previousPipCashResult)
      : undefined;
    const sameDayNewTransactions = getSameDayNewTransactions(previousPipCashResult, result);
    const sameDayNewSpendCents = getSameDayNewSpendCents(sameDayNewTransactions);

    await finishSyncRun(writeSupabase, {
      userId: input.userId,
      syncRunId: syncRun.id,
      institutionId: input.institutionId ?? institutionIds[0],
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
    await recordSyncCompletionEvent(supabase, {
      userId: input.userId,
      reason: input.reason,
      status,
      createdReactionType: createdReaction?.reactionType,
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
      ...(previousSpendableCashTodayCents !== undefined
        ? {
            previousSpendableCashTodayCents,
            spendableDeltaCents: spendableCashTodayCents - previousSpendableCashTodayCents,
          }
        : {}),
      currentSpendableCashTodayCents: spendableCashTodayCents,
      sameDayNewSpendCents,
      sameDayNewTransactions,
      failedInstitutionCount: syncFailures.length,
      failures: syncFailures.map(toManualSyncFailure),
      ...(createdReaction ? { createdReactionSummary: toCreatedReactionSummary(createdReaction) } : {}),
      ...(createdReaction?.reactionType ? { createdReactionType: createdReaction.reactionType } : {}),
    };
  } catch (error) {
    const failure = getProviderFailure(input.provider, error);

    await finishSyncRun(writeSupabase, {
      userId: input.userId,
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
    await markInstitutionSyncFailure(writeSupabase, {
      userId: input.userId,
      now,
      failure,
    });
    await recordSyncFailureEvent(supabase, {
      userId: input.userId,
      reason: input.reason,
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

function getSameDayNewTransactions(
  previousResult: PipCashResult | null,
  currentResult: PipCashResult,
): ManualSyncSameDayTransactionSummary[] {
  const previousItems = previousResult?.spendableCashToday?.sameDayLedger.items ?? [];
  const previousKeys = new Set(previousItems.map(getSameDayLedgerItemKey));
  const currentItems = currentResult.spendableCashToday?.sameDayLedger.items ?? [];

  return currentItems
    .filter((item) => !previousKeys.has(getSameDayLedgerItemKey(item)))
    .map(toSameDayTransactionSummary);
}

function getSameDayLedgerItemKey(item: SameDayLedgerItem): string {
  return [
    item.date,
    sanitizeSensitiveText(item.label).trim().toLowerCase(),
    item.amountCents,
    item.pending ? "pending" : "posted",
    item.treatment,
  ].join("|");
}

function toSameDayTransactionSummary(
  item: SameDayLedgerItem,
): ManualSyncSameDayTransactionSummary {
  return {
    date: item.date,
    label: sanitizeSensitiveText(item.label).slice(0, 120),
    amountCents: item.amountCents,
    pending: item.pending,
    treatment: item.treatment,
  };
}

function getSameDayNewSpendCents(items: ManualSyncSameDayTransactionSummary[]): number {
  return items
    .filter((item) => item.treatment === "daily_spend")
    .reduce((sum, item) => sum + Math.max(0, -item.amountCents), 0);
}

function toCreatedReactionSummary(
  reaction: NonNullable<Awaited<ReturnType<typeof maybeCreateSyncReaction>>>,
): ManualSyncCreatedReactionSummary {
  return {
    reactionType: reaction.reactionType,
    trigger: reaction.trigger,
    currentState: reaction.currentState,
    ...(reaction.previousState ? { previousState: reaction.previousState } : {}),
    spendableDeltaCents: reaction.spendableDeltaCents,
    intensity: reaction.intensity,
    ...(reaction.summary ? { summary: sanitizeSensitiveText(reaction.summary).slice(0, 160) } : {}),
  };
}

async function syncProviderConnections(
  provider: FinancialDataProvider,
  userId: string,
  options: {
    institutionId?: string;
  } = {},
): Promise<ProviderInstitutionSyncResult[]> {
  if (provider.syncConnectedInstitutions) {
    if (options.institutionId) {
      return provider.syncConnectedInstitutions(userId, {
        institutionId: options.institutionId,
      });
    }

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

async function maybeCreateSyncReaction(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    reason: PipSyncReason;
    previousResult: PipCashResult | null;
    currentResult: PipCashResult;
    now: Date;
  },
) {
  const comparison = comparePipCashResults(input.previousResult, input.currentResult);
  const trigger = toPipReactionTrigger(input.reason);
  const preliminaryDecision = choosePipReaction({
    comparison,
    trigger,
    recentEvents: [],
    now: input.now,
  });

  if (!preliminaryDecision) {
    return null;
  }

  const recentEvents = await loadRecentPipReactionEventsForUser(supabase, {
    userId: input.userId,
    now: input.now,
  });
  const decision = choosePipReaction({
    comparison,
    trigger,
    recentEvents,
    now: input.now,
  });

  if (!decision) {
    return null;
  }

  return createPipReactionEventForUser(supabase, {
    userId: input.userId,
    decision,
  });
}

function toPipReactionTrigger(reason: PipSyncReason): PipReactionTrigger {
  switch (reason) {
    case "plaid_webhook":
      return "plaid_webhook";
    case "scheduled":
      return "scheduled_sync";
    case "app_open":
      return "app_open_refresh";
    case "repair":
      return "repair";
    case "account_selection":
      return "account_selection";
    case "settings_change":
      return "settings_change";
    case "account_change":
      return "account_change";
    case "manual":
      return "manual_refresh";
  }
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
    institutionId?: string;
  },
) {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      user_id: input.userId,
      provider: input.provider,
      institution_id: input.institutionId ?? null,
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
      .eq("user_id", input.userId)
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

async function deleteRemovedProviderTransactions(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    providerTransactionIds: string[];
  },
) {
  const providerTransactionIds = Array.from(new Set(input.providerTransactionIds));

  if (providerTransactionIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", input.userId)
    .in("provider_transaction_id", providerTransactionIds);

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
      manual_refresh_only: false,
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
    userId: string;
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
    .eq("user_id", input.userId)
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
    reason: PipSyncReason;
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
  await recordSyncFailureEvent(supabase, {
    userId: input.userId,
    reason: input.reason,
    provider: failure.provider,
    error: failure.message,
    errorCode: failure.code,
    repairRequired: failure.repairRequired,
    ...(failure.institutionId ? { institutionId: failure.institutionId } : {}),
    ...(failure.institutionName ? { institutionName: failure.institutionName } : {}),
  });

  return failure;
}

async function recordSyncCompletionEvent(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    reason: PipSyncReason;
    status: "succeeded" | "partial";
    provider: FinancialProviderName;
    accountCount: number;
    transactionCount: number;
    failedInstitutionCount: number;
    createdReactionType?: string;
    pipCashTodayCents: number;
    metricVersion: string;
    spendableCashTodayCents: number;
    baselineDailyAllowanceCents?: number;
    behaviorAdjustmentCents?: number;
    cashRealityAdjustmentCents?: number;
    state?: string;
    confidence?: string;
    shortfallCents?: number;
    currentMonthVarianceCents?: number;
  },
) {
  const commonProperties = {
    provider: input.provider,
    accountCount: input.accountCount,
    transactionCount: input.transactionCount,
    failedInstitutionCount: input.failedInstitutionCount,
    createdReactionType: input.createdReactionType,
    pipCashTodayCents: input.pipCashTodayCents,
    metricVersion: input.metricVersion,
    spendableCashTodayCents: input.spendableCashTodayCents,
    baselineDailyAllowanceCents: input.baselineDailyAllowanceCents,
    behaviorAdjustmentCents: input.behaviorAdjustmentCents,
    cashRealityAdjustmentCents: input.cashRealityAdjustmentCents,
    state: input.state,
    confidence: input.confidence,
    shortfallCents: input.shortfallCents,
    currentMonthVarianceCents: input.currentMonthVarianceCents,
  } satisfies Json;

  if (input.reason === "manual") {
    await recordProductEventSafely(
      supabase,
      input.userId,
      input.status === "partial" ? "manual_sync_partial" : "manual_sync_succeeded",
      commonProperties,
    );
    return;
  }

  await recordProductEventSafely(supabase, input.userId, "pip_sync_job_completed", {
    ...commonProperties,
    reason: input.reason,
    status: input.status,
  });
}

async function recordSyncFailureEvent(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    reason: PipSyncReason;
    provider: FinancialProviderName;
    error: string;
    errorCode: string;
    repairRequired: boolean;
    institutionId?: string;
    institutionName?: string;
  },
) {
  const commonProperties = {
    provider: input.provider,
    error: input.error,
    errorCode: input.errorCode,
    repairRequired: input.repairRequired,
    institutionId: input.institutionId,
    institutionName: input.institutionName,
  } satisfies Json;

  if (input.reason === "manual") {
    await recordProductEventSafely(supabase, input.userId, "manual_sync_failed", commonProperties);
    return;
  }

  await recordProductEventSafely(supabase, input.userId, "pip_sync_job_failed", {
    ...commonProperties,
    reason: input.reason,
  });
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
