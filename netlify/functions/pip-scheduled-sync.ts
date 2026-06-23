import { getPipSyncFeatureFlags } from "../../src/lib/data/feature-flags";
import {
  enqueueScheduledPipSyncJobs,
  processPendingPipSyncJobs,
} from "../../src/lib/data/sync-jobs";
import { createSupabaseAdminClient } from "../../src/lib/supabase/admin";
import { isSupabaseConfigured } from "../../src/lib/supabase/env";

type ScheduledFunctionConfig = {
  schedule: string;
};

type NetlifyRuntime = {
  env: {
    get(name: string): string | undefined;
  };
};

declare const Netlify: NetlifyRuntime | undefined;

const envKeys = [
  "CONTEXT",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "PIP_SCHEDULED_SYNC_BATCH_SIZE",
  "PIP_SCHEDULED_SYNC_ENABLED",
  "PIP_SCHEDULED_SYNC_MAX_JOBS",
  "PIP_SCHEDULED_SYNC_MIN_INTERVAL_MINUTES",
  "PIP_SUPABASE_MODE",
  "PIP_SYNC_JOBS_ENABLED",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export default async function pipScheduledSync() {
  const env = getRuntimeEnv();
  hydrateProcessEnv(env);
  const flags = getPipSyncFeatureFlags(env);

  if (!flags.syncJobsEnabled) {
    return jsonResponse({
      status: "skipped",
      reason: "sync-jobs-disabled",
    });
  }

  if (!isSupabaseConfigured()) {
    return jsonResponse(
      {
        status: "skipped",
        reason: "supabase-not-configured",
      },
      503,
    );
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const enqueue = flags.scheduledSyncEnabled
    ? await enqueueScheduledPipSyncJobs(supabase, {
        limit: flags.scheduledSyncBatchSize,
        minIntervalMinutes: flags.scheduledSyncMinIntervalMinutes,
        now,
      })
    : {
        scanned: 0,
        enqueued: 0,
        deduped: 0,
      };
  const processed = await processPendingPipSyncJobs(supabase, {
    limit: flags.scheduledSyncMaxJobs,
    now,
  });

  return jsonResponse({
    status: "processed",
    enqueue: {
      scanned: enqueue.scanned,
      enqueued: enqueue.enqueued,
      deduped: enqueue.deduped,
    },
    processed: {
      claimed: processed.claimed,
      succeeded: processed.succeeded,
      retrying: processed.retrying,
      failed: processed.failed,
    },
  });
}

export const config = {
  schedule: "@hourly",
} satisfies ScheduledFunctionConfig;

function getRuntimeEnv(): Record<string, string | undefined> {
  const netlifyEnv = typeof Netlify === "undefined" ? null : Netlify.env;

  return Object.fromEntries(
    envKeys.map((key) => [key, netlifyEnv?.get(key) ?? process.env[key]]),
  );
}

function hydrateProcessEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
