import type { SupabaseClient } from "@supabase/supabase-js";
import { productEventNames, type ProductEventName } from "@/lib/data/product-events";
import type { Database } from "@/lib/supabase/database.types";

type ConnectedInstitutionRow = Pick<
  Database["public"]["Tables"]["connected_institutions"]["Row"],
  | "id"
  | "user_id"
  | "provider"
  | "institution_name"
  | "status"
  | "last_successful_sync_at"
  | "stale_after"
  | "error_code"
  | "error_message"
  | "updated_at"
>;

type SyncRunRow = Pick<
  Database["public"]["Tables"]["sync_runs"]["Row"],
  | "id"
  | "user_id"
  | "provider"
  | "status"
  | "started_at"
  | "completed_at"
  | "duration_ms"
  | "account_count"
  | "transaction_count"
  | "balance_count"
  | "error_code"
  | "error_message"
>;

type ProductEventRow = Pick<
  Database["public"]["Tables"]["product_events"]["Row"],
  "user_id" | "event_name" | "created_at"
>;

export type OperatorOverview = {
  generatedAt: string;
  periodStart: string;
  activeUserCount: number;
  staleConnectionCount: number;
  failedConnectionCount: number;
  partialSyncCount: number;
  failedSyncCount: number;
  eventCounts: Record<ProductEventName, number>;
  staleConnections: OperatorConnectionIssue[];
  latestPartialSyncs: OperatorFailedSync[];
  latestFailedSyncs: OperatorFailedSync[];
};

export type OperatorConnectionIssue = {
  institutionId: string;
  userId: string;
  provider: string;
  institutionName: string;
  status: string;
  lastSuccessfulSyncAt: string | null;
  staleAfter: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type OperatorFailedSync = {
  syncRunId: string;
  userId: string;
  provider: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  accountCount: number;
  transactionCount: number;
  balanceCount: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export async function loadOperatorOverview(
  supabase: SupabaseClient<Database>,
  now = new Date(),
): Promise<OperatorOverview> {
  const periodStart = getOperatorPeriodStartIso(now);
  const [institutionsResult, syncRunsResult, eventsResult] = await Promise.all([
    supabase
      .from("connected_institutions")
      .select(
        "id, user_id, provider, institution_name, status, last_successful_sync_at, stale_after, error_code, error_message, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(1000),
    supabase
      .from("sync_runs")
      .select(
        "id, user_id, provider, status, started_at, completed_at, duration_ms, account_count, transaction_count, balance_count, error_code, error_message",
      )
      .gte("started_at", periodStart)
      .order("started_at", { ascending: false })
      .limit(1000),
    supabase
      .from("product_events")
      .select("user_id, event_name, created_at")
      .gte("created_at", periodStart)
      .limit(5000),
  ]);

  if (institutionsResult.error) {
    throw institutionsResult.error;
  }

  if (syncRunsResult.error) {
    throw syncRunsResult.error;
  }

  if (eventsResult.error) {
    throw eventsResult.error;
  }

  return summarizeOperatorOverview({
    now,
    periodStart,
    institutions: institutionsResult.data ?? [],
    syncRuns: syncRunsResult.data ?? [],
    events: eventsResult.data ?? [],
  });
}

export function summarizeOperatorOverview(input: {
  now: Date;
  periodStart: string;
  institutions: ConnectedInstitutionRow[];
  syncRuns: SyncRunRow[];
  events: ProductEventRow[];
}): OperatorOverview {
  const nowTime = input.now.getTime();
  const staleConnections = input.institutions.filter((institution) =>
    isConnectionIssue(institution, nowTime),
  );
  const eventCounts = productEventNames.reduce(
    (counts, eventName) => ({
      ...counts,
      [eventName]: countEvents(input.events, eventName),
    }),
    {} as Record<ProductEventName, number>,
  );
  const activeUserIds = new Set<string>();

  input.events.forEach((event) => activeUserIds.add(event.user_id));
  input.syncRuns.forEach((run) => activeUserIds.add(run.user_id));

  return {
    generatedAt: input.now.toISOString(),
    periodStart: input.periodStart,
    activeUserCount: activeUserIds.size,
    staleConnectionCount: staleConnections.length,
    failedConnectionCount: input.institutions.filter((institution) =>
      ["failed", "revoked"].includes(institution.status),
    ).length,
    partialSyncCount: input.syncRuns.filter((run) => run.status === "partial").length,
    failedSyncCount: input.syncRuns.filter((run) => run.status === "failed").length,
    eventCounts,
    staleConnections: staleConnections.slice(0, 50).map((institution) => ({
      institutionId: institution.id,
      userId: institution.user_id,
      provider: institution.provider,
      institutionName: institution.institution_name,
      status: institution.status,
      lastSuccessfulSyncAt: institution.last_successful_sync_at,
      staleAfter: institution.stale_after,
      errorCode: institution.error_code,
      errorMessage: institution.error_message,
    })),
    latestPartialSyncs: mapProblemSyncs(input.syncRuns, "partial"),
    latestFailedSyncs: mapProblemSyncs(input.syncRuns, "failed"),
  };
}

function mapProblemSyncs(syncRuns: SyncRunRow[], status: "failed" | "partial"): OperatorFailedSync[] {
  return syncRuns
    .filter((run) => run.status === status)
    .slice(0, 50)
    .map((run) => ({
      syncRunId: run.id,
      userId: run.user_id,
      provider: run.provider,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      durationMs: run.duration_ms,
      accountCount: run.account_count,
      transactionCount: run.transaction_count,
      balanceCount: run.balance_count,
      errorCode: run.error_code,
      errorMessage: run.error_message,
    }));
}

export function getOperatorPeriodStartIso(now: Date, days = 30): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isConnectionIssue(institution: ConnectedInstitutionRow, nowTime: number): boolean {
  if (["failed", "revoked", "stale"].includes(institution.status)) {
    return true;
  }

  if (!institution.stale_after) {
    return false;
  }

  return new Date(institution.stale_after).getTime() <= nowTime;
}

function countEvents(events: ProductEventRow[], eventName: ProductEventName): number {
  return events.filter((event) => event.event_name === eventName).length;
}
