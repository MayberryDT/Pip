import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingSyncJobSummary } from "@/lib/data/freshness";
import { runProviderSync, type PipSyncReason, type ProviderSyncResult } from "@/lib/data/manual-sync";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { ProviderSyncError } from "@/lib/providers/provider-errors";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import type { Database } from "@/lib/supabase/database.types";

export type PipSyncJob = Database["public"]["Tables"]["pip_sync_jobs"]["Row"];
export type PipSyncJobReason = Database["public"]["Enums"]["pip_sync_job_reason"];
export type PipSyncJobStatus = Database["public"]["Enums"]["pip_sync_job_status"];

export type EnqueuePipSyncJobResult = {
  job: PipSyncJob;
  created: boolean;
};

export type ActivePipSyncJobSummary = {
  id: string;
  provider: Database["public"]["Enums"]["financial_provider"];
  institutionId: string | null;
  reason: PipSyncJobReason;
  status: "pending" | "running";
  sourceWebhookEventId: string | null;
  availableAt: string;
  createdAt: string;
};

export type ProcessPipSyncJobResult =
  | {
      jobId: string;
      status: "succeeded";
      result: ProviderSyncResult;
    }
  | {
      jobId: string;
      status: "retrying" | "failed";
      error: string;
      availableAt?: string;
    };

export type ProcessPendingPipSyncJobsResult = {
  claimed: number;
  succeeded: number;
  retrying: number;
  failed: number;
  results: ProcessPipSyncJobResult[];
};

export async function loadPendingPipSyncJobsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PendingSyncJobSummary[]> {
  const { data, error } = await supabase
    .from("pip_sync_jobs")
    .select("status")
    .eq("user_id", userId)
    .in("status", ["pending", "running"]);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function loadActivePipSyncJobsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ActivePipSyncJobSummary[]> {
  const { data, error } = await supabase
    .from("pip_sync_jobs")
    .select("id, provider, institution_id, reason, status, source_webhook_event_id, available_at, created_at")
    .eq("user_id", userId)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).filter(isActiveSyncJobStatus).map((job) => ({
    id: job.id,
    provider: job.provider,
    institutionId: job.institution_id,
    reason: job.reason,
    status: job.status,
    sourceWebhookEventId: job.source_webhook_event_id,
    availableAt: job.available_at,
    createdAt: job.created_at,
  }));
}

function isActiveSyncJobStatus<T extends Pick<PipSyncJob, "status">>(
  job: T,
): job is T & { status: "pending" | "running" } {
  return job.status === "pending" || job.status === "running";
}

export async function enqueuePipSyncJob(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    provider: Database["public"]["Enums"]["financial_provider"];
    reason: PipSyncJobReason;
    institutionId?: string;
    sourceWebhookEventId?: string;
    priority?: number;
    dedupeKey?: string;
    availableAt?: Date;
    maxAttempts?: number;
    now?: Date;
  },
): Promise<EnqueuePipSyncJobResult> {
  const now = input.now ?? new Date();
  const insert = {
    user_id: input.userId,
    provider: input.provider,
    reason: input.reason,
    institution_id: input.institutionId ?? null,
    source_webhook_event_id: input.sourceWebhookEventId ?? null,
    priority: input.priority ?? defaultPriority(input.reason),
    dedupe_key: input.dedupeKey ?? defaultDedupeKey(input),
    available_at: (input.availableAt ?? now).toISOString(),
    max_attempts: input.maxAttempts ?? 3,
    updated_at: now.toISOString(),
  };
  const { data, error } = await supabase
    .from("pip_sync_jobs")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    if (isDuplicateKeyError(error) && insert.dedupe_key) {
      const existing = await loadActiveJobByDedupeKey(supabase, insert.dedupe_key);

      if (existing) {
        return {
          job: existing,
          created: false,
        };
      }
    }

    throw error;
  }

  await recordProductEventSafely(supabase, input.userId, "pip_sync_job_created", {
    provider: input.provider,
    reason: input.reason,
    institutionId: input.institutionId,
    sourceWebhookEventId: input.sourceWebhookEventId,
    priority: insert.priority,
    dedupeKey: insert.dedupe_key,
  });

  return {
    job: data,
    created: true,
  };
}

export async function claimPendingPipSyncJobs(
  supabase: SupabaseClient<Database>,
  input: {
    limit: number;
    now?: Date;
  },
): Promise<PipSyncJob[]> {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(100, Math.round(input.limit)));
  const { data, error } = await supabase
    .from("pip_sync_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("available_at", now.toISOString())
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  const jobs = data ?? [];
  const claimed: PipSyncJob[] = [];

  for (const job of jobs) {
    const attempts = job.attempts + 1;
    const { data: updated, error: updateError } = await supabase
      .from("pip_sync_jobs")
      .update({
        status: "running",
        attempts,
        started_at: now.toISOString(),
        updated_at: now.toISOString(),
        last_error: null,
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .lte("available_at", now.toISOString())
      .select("*")
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (updated) {
      claimed.push(updated);
    }
  }

  return claimed;
}

export async function claimPipSyncJobById(
  supabase: SupabaseClient<Database>,
  jobId: string,
  input: {
    now?: Date;
  } = {},
): Promise<PipSyncJob | null> {
  const now = input.now ?? new Date();
  const { data: job, error } = await supabase
    .from("pip_sync_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("status", "pending")
    .lte("available_at", now.toISOString())
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!job) {
    return null;
  }

  const attempts = job.attempts + 1;
  const { data: updated, error: updateError } = await supabase
    .from("pip_sync_jobs")
    .update({
      status: "running",
      attempts,
      started_at: now.toISOString(),
      updated_at: now.toISOString(),
      last_error: null,
    })
    .eq("id", job.id)
    .eq("status", "pending")
    .lte("available_at", now.toISOString())
    .select("*")
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  return updated ?? null;
}

export async function processPipSyncJob(
  supabase: SupabaseClient<Database>,
  job: PipSyncJob,
  input: {
    now?: Date;
  } = {},
): Promise<ProcessPipSyncJobResult> {
  const now = input.now ?? new Date();

  try {
    const result = await runProviderSync(supabase, {
      userId: job.user_id,
      provider: job.provider,
      reason: toPipSyncReason(job.reason),
      ...(job.institution_id ? { institutionId: job.institution_id } : {}),
      now,
    });

    const { error } = await supabase
      .from("pip_sync_jobs")
      .update({
        status: "succeeded",
        completed_at: now.toISOString(),
        account_count: result.accountCount,
        transaction_count: result.transactionCount,
        balance_count: result.balanceCount,
        created_reaction_type: result.createdReactionType ?? null,
        last_error: null,
        updated_at: now.toISOString(),
      })
      .eq("id", job.id);

    if (error) {
      throw error;
    }

    await markSourceWebhookEventProcessed(supabase, job, now);

    return {
      jobId: job.id,
      status: "succeeded",
      result,
    };
  } catch (error) {
    const message = getSafeErrorMessage(error, "Pip sync job failed.");
    const canRetry = shouldRetryJob(error, job);
    const availableAt = canRetry ? getRetryAvailableAt(now, job.attempts).toISOString() : undefined;
    const { error: updateError } = await supabase
      .from("pip_sync_jobs")
      .update({
        status: canRetry ? "pending" : "failed",
        ...(canRetry ? { available_at: availableAt } : { completed_at: now.toISOString() }),
        last_error: message,
        updated_at: now.toISOString(),
      })
      .eq("id", job.id);

    if (updateError) {
      throw updateError;
    }

    if (!canRetry) {
      await markSourceWebhookEventProcessed(supabase, job, now);
    }

    return canRetry
      ? {
          jobId: job.id,
          status: "retrying",
          error: message,
          availableAt,
        }
      : {
          jobId: job.id,
          status: "failed",
          error: message,
        };
  }
}

export async function processPendingPipSyncJobs(
  supabase: SupabaseClient<Database>,
  input: {
    limit: number;
    now?: Date;
  },
): Promise<ProcessPendingPipSyncJobsResult> {
  const now = input.now ?? new Date();
  const jobs = await claimPendingPipSyncJobs(supabase, {
    limit: input.limit,
    now,
  });
  const results: ProcessPipSyncJobResult[] = [];

  for (const job of jobs) {
    results.push(
      await processPipSyncJob(supabase, job, {
        now,
      }),
    );
  }

  return {
    claimed: jobs.length,
    succeeded: results.filter((result) => result.status === "succeeded").length,
    retrying: results.filter((result) => result.status === "retrying").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}

export async function enqueueScheduledPipSyncJobs(
  supabase: SupabaseClient<Database>,
  input: {
    limit: number;
    minIntervalMinutes: number;
    now?: Date;
  },
): Promise<{
  scanned: number;
  enqueued: number;
  deduped: number;
  jobs: EnqueuePipSyncJobResult[];
}> {
  const now = input.now ?? new Date();
  const dueBefore = new Date(now.getTime() - input.minIntervalMinutes * 60_000).toISOString();
  const limit = Math.max(1, Math.min(100, Math.round(input.limit)));
  const { data, error } = await supabase
    .from("connected_institutions")
    .select("id, user_id, provider, last_successful_sync_at")
    .eq("status", "connected")
    .in("provider", ["plaid", "teller"])
    .or(`last_successful_sync_at.is.null,last_successful_sync_at.lte.${dueBefore}`)
    .order("last_successful_sync_at", {
      ascending: true,
      nullsFirst: true,
    })
    .limit(limit);

  if (error) {
    throw error;
  }

  const institutions = data ?? [];
  const backgroundEnabledUserIds = await loadBackgroundEnabledUserIds(
    supabase,
    institutions.map((institution) => institution.user_id),
  );
  const eligibleInstitutions = institutions.filter((institution) =>
    backgroundEnabledUserIds.has(institution.user_id),
  );
  const jobs: EnqueuePipSyncJobResult[] = [];

  for (const institution of eligibleInstitutions) {
    jobs.push(
      await enqueuePipSyncJob(supabase, {
        userId: institution.user_id,
        provider: institution.provider,
        reason: "scheduled",
        institutionId: institution.id,
        priority: defaultPriority("scheduled"),
        dedupeKey: `scheduled:${institution.provider}:${institution.id}`,
        now,
      }),
    );
  }

  return {
    scanned: institutions.length,
    enqueued: jobs.filter((job) => job.created).length,
    deduped: jobs.filter((job) => !job.created).length,
    jobs,
  };
}

async function loadBackgroundEnabledUserIds(
  supabase: SupabaseClient<Database>,
  userIds: string[],
): Promise<Set<string>> {
  const uniqueUserIds = Array.from(new Set(userIds));

  if (uniqueUserIds.length === 0) {
    return new Set();
  }

  const { data, error } = await supabase
    .from("user_settings")
    .select("user_id, manual_refresh_only")
    .in("user_id", uniqueUserIds);

  if (error) {
    throw error;
  }

  return new Set(
    (data ?? [])
      .filter((settings) => !settings.manual_refresh_only)
      .map((settings) => settings.user_id),
    );
}

async function markSourceWebhookEventProcessed(
  supabase: SupabaseClient<Database>,
  job: PipSyncJob,
  now: Date,
): Promise<void> {
  if (!job.source_webhook_event_id) {
    return;
  }

  try {
    const { error } = await supabase
      .from("plaid_webhook_events")
      .update({
        processed_at: now.toISOString(),
      })
      .eq("id", job.source_webhook_event_id);

    if (error) {
      return;
    }
  } catch {
    return;
  }
}

async function loadActiveJobByDedupeKey(
  supabase: SupabaseClient<Database>,
  dedupeKey: string,
): Promise<PipSyncJob | null> {
  const { data, error } = await supabase
    .from("pip_sync_jobs")
    .select("*")
    .eq("dedupe_key", dedupeKey)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

function defaultPriority(reason: PipSyncJobReason): number {
  switch (reason) {
    case "repair":
    case "account_selection":
    case "settings_change":
    case "account_change":
      return 25;
    case "plaid_webhook":
    case "app_open":
      return 50;
    case "manual":
      return 75;
    case "scheduled":
      return 200;
  }
}

function defaultDedupeKey(input: {
  provider: Database["public"]["Enums"]["financial_provider"];
  reason: PipSyncJobReason;
  institutionId?: string;
  userId: string;
}): string {
  if (input.institutionId) {
    return `${input.reason}:${input.provider}:${input.institutionId}`;
  }

  return `${input.reason}:${input.provider}:${input.userId}`;
}

function getRetryAvailableAt(now: Date, attempts: number): Date {
  const backoffMinutes = Math.min(120, 5 * 2 ** Math.max(0, attempts - 1));

  return new Date(now.getTime() + backoffMinutes * 60_000);
}

function toPipSyncReason(reason: PipSyncJobReason): PipSyncReason {
  return reason;
}

function shouldRetryJob(error: unknown, job: PipSyncJob): boolean {
  if (error instanceof ProviderSyncError && error.repairRequired) {
    return false;
  }

  return job.attempts < job.max_attempts;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  );
}
