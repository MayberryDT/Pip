import type { SyncStatus } from "@/lib/data/sync-status";
import type { FinancialProviderName } from "@/lib/providers/FinancialDataProvider";

const APP_OPEN_SYNC_DUPLICATE_GUARD_MS = 60 * 1000;
const refreshableProviders = new Set<FinancialProviderName>(["plaid", "teller"]);
const reconnectRequiredErrorCodes = new Set(["provider-token-decrypt-failed"]);
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

export type AppOpenSyncDecision =
  | {
      status: "run";
      provider: FinancialProviderName;
    }
  | {
      status: "no_provider" | "skipped_pending" | "skipped_fresh" | "skipped_recent";
      message: string;
      retryAfterSeconds?: number;
      lastSuccessfulSyncAt?: string;
    }
  | {
      status: "needs_repair";
      provider: FinancialProviderName;
      institutionId: string;
      institutionName: string;
      errorCode: string | null;
      message: string;
    };

export function getAppOpenSyncDecision(input: {
  syncStatus: SyncStatus;
  hasPendingSyncJob: boolean;
  now: Date;
}): AppOpenSyncDecision {
  const repairInstitution = input.syncStatus.institutions.find(isRepairOnlyInstitution);
  const refreshableInstitutions = getRefreshableInstitutions(input.syncStatus);
  const provider = refreshableInstitutions[0]?.provider ?? null;

  if (!provider) {
    if (repairInstitution) {
      return {
        status: "needs_repair",
        provider: repairInstitution.provider,
        institutionId: repairInstitution.id,
        institutionName: repairInstitution.institutionName,
        errorCode: repairInstitution.errorCode,
        message: `${repairInstitution.institutionName} needs to reconnect before Pip can refresh.`,
      };
    }

    return {
      status: "no_provider",
      message: "No connected financial provider can refresh yet.",
    };
  }

  const latestSyncRun =
    input.syncStatus.latestSyncRun?.provider === provider ? input.syncStatus.latestSyncRun : null;

  if (input.hasPendingSyncJob || isSyncRunPending(latestSyncRun?.status)) {
    return {
      status: "skipped_pending",
      message: "A refresh is already queued or running.",
    };
  }

  const latestStartedAt = latestSyncRun?.startedAt ? new Date(latestSyncRun.startedAt) : null;
  const lastSuccessfulSyncAt = getLastSuccessfulSyncAt(input.syncStatus, provider);
  const retryAfterSeconds = getCooldownRetryAfterSeconds(latestStartedAt, input.now);

  if (retryAfterSeconds > 0) {
    return {
      status: "skipped_recent",
      message: "A refresh ran recently.",
      retryAfterSeconds,
      ...(lastSuccessfulSyncAt ? { lastSuccessfulSyncAt } : {}),
    };
  }

  return {
    status: "run",
    provider,
  };
}

type RefreshableInstitution = SyncStatus["institutions"][number] & {
  provider: FinancialProviderName;
};

function getRefreshableInstitutions(syncStatus: SyncStatus): RefreshableInstitution[] {
  return syncStatus.institutions.filter((item): item is RefreshableInstitution => {
    if (!refreshableProviders.has(item.provider)) {
      return false;
    }

    return !isRepairOnlyInstitution(item);
  });
}

function isRepairOnlyInstitution(institution: SyncStatus["institutions"][number]): boolean {
  if (!refreshableProviders.has(institution.provider)) {
    return false;
  }

  if (institution.status === "revoked") {
    return true;
  }

  const errorCode = (institution.errorCode ?? "").toLowerCase();

  if (reconnectRequiredErrorCodes.has(errorCode)) {
    return true;
  }

  return institution.provider === "plaid" && repairablePlaidErrorCodes.has(errorCode);
}

function isSyncRunPending(status: string | undefined): boolean {
  return status === "pending" || status === "running";
}

function getLastSuccessfulSyncAt(
  syncStatus: SyncStatus,
  provider: FinancialProviderName,
): string | null {
  return (
    syncStatus.institutions
      .filter((institution) => institution.provider === provider)
      .map((institution) => institution.lastSuccessfulSyncAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

function getCooldownRetryAfterSeconds(latestStartedAt: Date | null, now: Date): number {
  if (!latestStartedAt) {
    return 0;
  }

  const elapsedMs = now.getTime() - latestStartedAt.getTime();

  if (elapsedMs >= APP_OPEN_SYNC_DUPLICATE_GUARD_MS) {
    return 0;
  }

  return Math.ceil((APP_OPEN_SYNC_DUPLICATE_GUARD_MS - elapsedMs) / 1000);
}
