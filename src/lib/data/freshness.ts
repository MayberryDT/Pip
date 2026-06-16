import type { SyncStatus } from "@/lib/data/sync-status";

export type DataFreshnessState =
  | "fresh"
  | "stale"
  | "syncing"
  | "failed"
  | "needs_repair"
  | "partial";

export type PendingSyncJobSummary = {
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
};

const repairablePlaidErrorCodes = new Set([
  "item-login-required",
  "invalid-credentials",
  "invalid-mfa",
  "item-locked",
  "mfa-not-supported",
  "user-setup-required",
  "invalid-access-token",
  "item-not-found",
  "user-permission-revoked",
  "user-account-revoked",
  "access-not-granted",
  "no-accounts",
]);
const reconnectRequiredErrorCodes = new Set(["provider-token-decrypt-failed"]);

export function getDataFreshnessState(input: {
  syncStatus: SyncStatus | null;
  pendingJobs?: PendingSyncJobSummary[];
}): DataFreshnessState {
  const syncStatus = input.syncStatus;

  if (!syncStatus) {
    return "stale";
  }

  if (syncStatus.institutions.some(isRepairableInstitution)) {
    return "needs_repair";
  }

  if ((input.pendingJobs ?? []).some((job) => job.status === "pending" || job.status === "running")) {
    return "syncing";
  }

  if (syncStatus.latestSyncRun?.status === "failed") {
    return "failed";
  }

  if (syncStatus.latestSyncRun?.status === "partial") {
    return "partial";
  }

  if (syncStatus.hasStaleInstitution) {
    return "stale";
  }

  return "fresh";
}

function isRepairableInstitution(institution: SyncStatus["institutions"][number]): boolean {
  if (institution.status === "revoked") {
    return true;
  }

  const errorCode = normalizeProviderErrorCode(institution.errorCode);

  if (reconnectRequiredErrorCodes.has(errorCode)) {
    return true;
  }

  return institution.provider === "plaid" && repairablePlaidErrorCodes.has(errorCode);
}

function normalizeProviderErrorCode(errorCode: string | null | undefined): string {
  return (errorCode ?? "").trim().toLowerCase().replace(/_/g, "-");
}
