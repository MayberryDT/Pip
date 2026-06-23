import { getAppAccessFailureForUser } from "@/lib/app-access/route-guard";
import { getAppOpenSyncDecision, type AppOpenSyncDecision } from "@/lib/data/app-open-sync";
import { recordProductEventSafely } from "@/lib/data/product-events";
import {
  claimPipSyncJobById,
  loadActivePipSyncJobsForUser,
  processPipSyncJob,
} from "@/lib/data/sync-jobs";
import { loadSyncStatusForUser } from "@/lib/data/sync-status";
import { runProviderSync } from "@/lib/data/manual-sync";
import { loadManualRefreshOnlyForUser } from "@/lib/data/user-settings";
import { ProviderSyncError } from "@/lib/providers/provider-errors";
import { ProviderUnavailableError } from "@/lib/providers/provider-registry";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { sensitiveJson } from "@/lib/security/http-cache";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return sensitiveJson({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return sensitiveJson({ error: "Authentication required." }, { status: 401 });
    }

    const appAccessFailure = await getAppAccessFailureForUser(user);

    if (appAccessFailure) {
      return appAccessFailure;
    }

    const now = new Date();
    const isManualRefreshOnly = await loadManualRefreshOnlyForUser(supabase, user.id);

    if (isManualRefreshOnly) {
      return sensitiveJson({
        status: "skipped_manual_only",
        reason: "manual_refresh_only",
        message: "Automatic refresh is disabled for this account.",
      });
    }

    const [syncStatus, activeSyncJobs] = await Promise.all([
      loadSyncStatusForUser(supabase, user.id, now),
      loadActivePipSyncJobsForUser(supabase, user.id),
    ]);
    const decision = getAppOpenSyncDecision({
      syncStatus,
      activeSyncJobs,
      now,
    });
    const hasPendingSyncJob = activeSyncJobs.some(
      (job) => job.status === "pending" || job.status === "running",
    );

    if (decision.status !== "run" && decision.status !== "run_webhook_job") {
      await recordProductEventSafely(supabase, user.id, "app_open_sync_decision", {
        ...toAppOpenDecisionEventProperties(decision),
        hasPendingSyncJob,
      });

      return sensitiveJson(decision);
    }

    if (decision.status === "run_webhook_job") {
      const writeSupabase = createSupabaseAdminClient();
      const job = await claimPipSyncJobById(writeSupabase, decision.jobId, {
        now,
      });

      if (!job) {
        return sensitiveJson({
          status: "skipped_pending",
          reason: "sync_in_flight",
          message: "A sync is already running.",
        });
      }

      const processed = await processPipSyncJob(writeSupabase, job, {
        now,
      });

      if (processed.status === "succeeded") {
        return sensitiveJson({
          status: "ran",
          provider: decision.provider,
          reason: "plaid_webhook",
          result: processed.result,
        });
      }

      return sensitiveJson({
        status: processed.status,
        provider: decision.provider,
        reason: "plaid_webhook",
        error: processed.error,
        ...("availableAt" in processed ? { availableAt: processed.availableAt } : {}),
      });
    }

    try {
      const writeSupabase = createSupabaseAdminClient();
      const result = await runProviderSync(supabase, {
        userId: user.id,
        provider: decision.provider,
        reason: "app_open",
        now,
        writeSupabase,
      });

      return sensitiveJson({
        status: "ran",
        provider: decision.provider,
        reason: decision.reason,
        result,
      });
    } catch (error) {
      if (error instanceof ProviderSyncError && error.repairRequired) {
        return sensitiveJson({
          status: "needs_repair",
          reason: "provider_needs_repair",
          provider: error.provider,
          institutionId: error.institutionId ?? null,
          institutionName: error.institutionName ?? null,
          errorCode: error.code,
          message: error.message,
        });
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof ProviderUnavailableError) {
      return sensitiveJson(
        {
          status: "failed",
          error: error.message,
        },
        { status: 501 },
      );
    }

    if (!(error instanceof SupabaseConfigError)) {
      console.error("[sync/app-open] sync failed", getSafeErrorMessage(error, "App-open sync failed."));
    }

    return sensitiveJson(toErrorBody(error), { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      status: "failed",
      error: error.message,
    };
  }

  return {
    status: "failed",
    error: "App-open sync failed.",
  };
}

function toAppOpenDecisionEventProperties(
  decision: Exclude<AppOpenSyncDecision, { status: "run" } | { status: "run_webhook_job" }>,
) {
  return {
    status: decision.status,
    reason: decision.reason,
    ...("provider" in decision ? { provider: decision.provider } : {}),
    ...("institutionId" in decision ? { institutionId: decision.institutionId } : {}),
    ...("errorCode" in decision ? { errorCode: decision.errorCode } : {}),
    ...("lastSuccessfulSyncAt" in decision ? { lastSuccessfulSyncAt: decision.lastSuccessfulSyncAt } : {}),
  };
}
