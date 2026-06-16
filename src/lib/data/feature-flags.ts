type FeatureFlagEnv = Record<string, string | undefined>;

export type PipSyncFeatureFlags = {
  syncJobsEnabled: boolean;
  scheduledSyncEnabled: boolean;
  scheduledSyncBatchSize: number;
  scheduledSyncMaxJobs: number;
  scheduledSyncMinIntervalMinutes: number;
  plaidWebhookVerify: boolean;
};

export function getPipSyncFeatureFlags(
  env: FeatureFlagEnv = process.env,
): PipSyncFeatureFlags {
  return {
    syncJobsEnabled: parseBoolean(env.PIP_SYNC_JOBS_ENABLED, false),
    scheduledSyncEnabled: parseBoolean(env.PIP_SCHEDULED_SYNC_ENABLED, false),
    scheduledSyncBatchSize: parseInteger(env.PIP_SCHEDULED_SYNC_BATCH_SIZE, 10, {
      min: 1,
      max: 50,
    }),
    scheduledSyncMaxJobs: parseInteger(env.PIP_SCHEDULED_SYNC_MAX_JOBS, 10, {
      min: 1,
      max: 100,
    }),
    scheduledSyncMinIntervalMinutes: parseInteger(
      env.PIP_SCHEDULED_SYNC_MIN_INTERVAL_MINUTES,
      240,
      {
        min: 15,
        max: 24 * 60,
      },
    ),
    plaidWebhookVerify: parseBoolean(env.PLAID_WEBHOOK_VERIFY, true),
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  bounds: {
    min: number;
    max: number;
  },
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed)));
}
