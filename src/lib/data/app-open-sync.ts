import type { ActivePipSyncJobSummary } from "@/lib/data/sync-jobs";
import type { SyncStatus } from "@/lib/data/sync-status";
import type { FinancialProviderName } from "@/lib/providers/FinancialDataProvider";

const APP_OPEN_STALE_CHECK_AFTER_MS = 4 * 60 * 60 * 1000;
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
      reason: "initial_sync" | "stale_check";
    }
  | {
      status: "run_webhook_job";
      provider: FinancialProviderName;
      jobId: string;
      reason: "plaid_webhook_pending";
    }
  | {
      status: "no_provider" | "skipped_pending" | "skipped_recent";
      reason:
        | "no_refreshable_provider"
        | "sync_in_flight"
        | "sync_waiting_for_retry"
        | "recent_enough";
      message: string;
      lastSuccessfulSyncAt?: string;
    }
  | {
      status: "needs_repair";
      provider: FinancialProviderName;
      institutionId: string;
      institutionName: string;
      errorCode: string | null;
      reason: "provider_needs_repair";
      message: string;
    };

export function getAppOpenSyncDecision(input: {
  syncStatus: SyncStatus;
  activeSyncJobs: ActivePipSyncJobSummary[];
  now: Date;
  staleCheckAfterMs?: number;
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
        reason: "provider_needs_repair",
        message: `${repairInstitution.institutionName} needs to reconnect before Pip can refresh.`,
      };
    }

    return {
      status: "no_provider",
      reason: "no_refreshable_provider",
      message: "No connected financial provider can refresh yet.",
    };
  }

  const activeProviderJobs = input.activeSyncJobs.filter((job) => job.provider === provider);
  const webhookJobs = activeProviderJobs.filter(
    (job) => job.reason === "plaid_webhook" && job.sourceWebhookEventId,
  );
  const availableWebhookJob = webhookJobs.find(
    (job) => job.status === "pending" && isJobAvailable(job, input.now),
  );

  if (availableWebhookJob) {
    return {
      status: "run_webhook_job",
      provider,
      jobId: availableWebhookJob.id,
      reason: "plaid_webhook_pending",
    };
  }

  if (activeProviderJobs.some((job) => job.status === "running")) {
    return {
      status: "skipped_pending",
      reason: "sync_in_flight",
      message: "A sync is already running.",
    };
  }

  if (webhookJobs.some((job) => job.status === "pending")) {
    return {
      status: "skipped_pending",
      reason: "sync_waiting_for_retry",
      message: "A webhook sync is waiting for its retry window.",
    };
  }

  if (activeProviderJobs.some((job) => job.status === "pending")) {
    return {
      status: "skipped_pending",
      reason: "sync_in_flight",
      message: "A sync is already queued.",
    };
  }

  const lastSuccessfulSyncAt = getLastSuccessfulSyncAt(input.syncStatus, provider);
  const lastSuccessfulSyncDate = parseDate(lastSuccessfulSyncAt);

  if (!lastSuccessfulSyncDate) {
    return {
      status: "run",
      provider,
      reason: "initial_sync",
    };
  }

  const providerInstitutions = refreshableInstitutions.filter((institution) => institution.provider === provider);
  const staleCheckAfterMs = input.staleCheckAfterMs ?? APP_OPEN_STALE_CHECK_AFTER_MS;
  const shouldRunStaleCheck =
    providerInstitutions.some((institution) => institution.isStale) ||
    input.now.getTime() - lastSuccessfulSyncDate.getTime() >= staleCheckAfterMs;

  if (shouldRunStaleCheck) {
    return {
      status: "run",
      provider,
      reason: "stale_check",
    };
  }

  return {
    status: "skipped_recent",
    reason: "recent_enough",
    message: "Recent data is fresh enough for app open.",
    ...(lastSuccessfulSyncAt ? { lastSuccessfulSyncAt } : {}),
  };
}

function isJobAvailable(job: ActivePipSyncJobSummary, now: Date): boolean {
  const availableAt = parseDate(job.availableAt);

  if (!availableAt) {
    return false;
  }

  return availableAt.getTime() <= now.getTime();
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

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

type RefreshableInstitution = SyncStatus["institutions"][number] & {
  provider: FinancialProviderName;
};
