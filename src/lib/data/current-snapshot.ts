import { getFakeSnapshot } from "@/lib/fake-data";
import type { FakeDataScenario } from "@/lib/fake-data";
import type { FinancialSnapshot, PipCashResult } from "@/lib/types";
import {
  loadCachedPipCashResultForUser,
  loadFinancialSnapshotForUser,
} from "@/lib/data/financial-repository";
import { getDataFreshnessState, type DataFreshnessState } from "@/lib/data/freshness";
import { loadLatestUnseenPipReactionForUser, type PipReactionApiEvent } from "@/lib/data/pip-reactions";
import { loadPendingPipSyncJobsForUser } from "@/lib/data/sync-jobs";
import { loadSyncStatusForUser } from "@/lib/data/sync-status";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isFakeDataMode, isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";

export class NoFinancialDataError extends Error {
  constructor(message = "Connect financial data before using live Spendable Cash Today.") {
    super(message);
    this.name = "NoFinancialDataError";
  }
}

export class AuthenticationRequiredError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export type PipCashFreshness = {
  state: DataFreshnessState;
  lastSuccessfulSyncAt?: string;
  latestSyncRunStatus?: string;
  hasPendingSyncJob?: boolean;
  hasStaleInstitution?: boolean;
};

export type PipCashApiState = PipCashResult & {
  freshness?: PipCashFreshness;
  reaction?: PipReactionApiEvent;
};

export async function getCurrentFinancialSnapshot(input: {
  scenario?: FakeDataScenario;
}): Promise<FinancialSnapshot> {
  if (!isSupabaseConfigured()) {
    return getFakeSnapshotForExplicitFakeMode(input.scenario);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthenticationRequiredError();
  }

  const realSnapshot = await loadFinancialSnapshotForUser(supabase, user.id);

  if (!realSnapshot) {
    throw new NoFinancialDataError();
  }

  return realSnapshot;
}

export async function getCurrentPipCashResult(input: {
  scenario?: FakeDataScenario;
}): Promise<PipCashResult> {
  if (!isSupabaseConfigured()) {
    return calculatePipCash(getFakeSnapshotForExplicitFakeMode(input.scenario));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthenticationRequiredError();
  }

  return loadCurrentPipCashResultForUser(supabase, user.id);
}

export async function getCurrentPipCashState(input: {
  scenario?: FakeDataScenario;
  recordFreshnessViewed?: boolean;
}): Promise<PipCashApiState> {
  if (!isSupabaseConfigured()) {
    return calculatePipCash(getFakeSnapshotForExplicitFakeMode(input.scenario));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthenticationRequiredError();
  }

  const [result, syncStatus, pendingJobs, reaction] = await Promise.all([
    loadCurrentPipCashResultForUser(supabase, user.id),
    loadSyncStatusForUser(supabase, user.id),
    loadPendingPipSyncJobsForUser(supabase, user.id),
    loadLatestUnseenPipReactionForUser(supabase, user.id),
  ]);
  const freshnessState = getDataFreshnessState({
    syncStatus,
    pendingJobs,
  });
  const lastSuccessfulSyncAt = getLastSuccessfulSyncAt(syncStatus);
  const freshness = {
    state: freshnessState,
    ...(lastSuccessfulSyncAt ? { lastSuccessfulSyncAt } : {}),
    ...(syncStatus.latestSyncRun?.status
      ? { latestSyncRunStatus: syncStatus.latestSyncRun.status }
      : {}),
    hasPendingSyncJob: pendingJobs.length > 0,
    hasStaleInstitution: syncStatus.hasStaleInstitution,
  } satisfies PipCashFreshness;

  if (input.recordFreshnessViewed) {
    await recordProductEventSafely(supabase, user.id, "pip_freshness_viewed", {
      state: freshness.state,
      lastSuccessfulSyncAt: freshness.lastSuccessfulSyncAt,
      latestSyncRunStatus: freshness.latestSyncRunStatus,
      hasPendingSyncJob: freshness.hasPendingSyncJob,
      hasStaleInstitution: freshness.hasStaleInstitution,
    });
  }

  return {
    ...result,
    freshness,
    ...(reaction ? { reaction } : {}),
  };
}

function getFakeSnapshotForExplicitFakeMode(scenario?: FakeDataScenario): FinancialSnapshot {
  if (isFakeDataMode()) {
    return getFakeSnapshot(scenario);
  }

  throw new SupabaseConfigError(
    "Set Supabase env or PIP_SUPABASE_MODE=off before using fake Pip Cash data.",
  );
}

async function loadCurrentPipCashResultForUser(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<PipCashResult> {
  const cachedResult = await loadCachedPipCashResultForUser(supabase, userId);

  if (cachedResult?.spendableCashToday) {
    return cachedResult;
  }

  const realSnapshot = await loadFinancialSnapshotForUser(supabase, userId);

  if (!realSnapshot) {
    throw new NoFinancialDataError();
  }

  return calculatePipCash(realSnapshot);
}

function getLastSuccessfulSyncAt(syncStatus: Awaited<ReturnType<typeof loadSyncStatusForUser>>): string | undefined {
  return syncStatus.institutions
    .map((institution) => institution.lastSuccessfulSyncAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}
