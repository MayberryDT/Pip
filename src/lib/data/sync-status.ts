import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ConnectedInstitutionRow = Database["public"]["Tables"]["connected_institutions"]["Row"];
type SyncRunRow = Database["public"]["Tables"]["sync_runs"]["Row"];

export type InstitutionSyncStatus = {
  id: string;
  institutionName: string;
  provider: ConnectedInstitutionRow["provider"];
  status: ConnectedInstitutionRow["status"];
  lastSuccessfulSyncAt: string | null;
  staleAfter: string | null;
  isStale: boolean;
  errorMessage: string | null;
};

export type LatestSyncRunStatus = {
  provider: SyncRunRow["provider"];
  status: SyncRunRow["status"];
  startedAt: string;
  completedAt: string | null;
  accountCount: number;
  transactionCount: number;
  balanceCount: number;
  errorMessage: string | null;
};

export type SyncStatus = {
  institutions: InstitutionSyncStatus[];
  latestSyncRun: LatestSyncRunStatus | null;
  hasStaleInstitution: boolean;
};

export async function loadSyncStatusForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  now = new Date(),
): Promise<SyncStatus> {
  const [institutionsResult, syncRunsResult] = await Promise.all([
    supabase
      .from("connected_institutions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("sync_runs")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1),
  ]);

  if (institutionsResult.error) {
    throw institutionsResult.error;
  }

  if (syncRunsResult.error) {
    throw syncRunsResult.error;
  }

  const institutions = (institutionsResult.data ?? []).map((row) => ({
    id: row.id,
    institutionName: row.institution_name,
    provider: row.provider,
    status: row.status,
    lastSuccessfulSyncAt: row.last_successful_sync_at,
    staleAfter: row.stale_after,
    isStale: isInstitutionStale(row, now),
    errorMessage: row.error_message,
  }));
  const latestSyncRun = syncRunsResult.data?.[0] ? mapLatestSyncRun(syncRunsResult.data[0]) : null;

  return {
    institutions,
    latestSyncRun,
    hasStaleInstitution: institutions.some((institution) => institution.isStale),
  };
}

export function isInstitutionStale(
  row: Pick<ConnectedInstitutionRow, "status" | "stale_after">,
  now = new Date(),
): boolean {
  if (row.status === "failed" || row.status === "stale" || row.status === "revoked") {
    return true;
  }

  if (!row.stale_after) {
    return false;
  }

  return new Date(row.stale_after).getTime() <= now.getTime();
}

function mapLatestSyncRun(row: SyncRunRow): LatestSyncRunStatus {
  return {
    provider: row.provider,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    accountCount: row.account_count,
    transactionCount: row.transaction_count,
    balanceCount: row.balance_count,
    errorMessage: row.error_message,
  };
}
