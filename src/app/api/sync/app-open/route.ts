import { NextResponse } from "next/server";
import { getAppOpenSyncDecision } from "@/lib/data/app-open-sync";
import { loadPendingPipSyncJobsForUser } from "@/lib/data/sync-jobs";
import { loadSyncStatusForUser } from "@/lib/data/sync-status";
import { runProviderSync } from "@/lib/data/manual-sync";
import { loadManualRefreshOnlyForUser } from "@/lib/data/user-settings";
import { ProviderSyncError } from "@/lib/providers/provider-errors";
import { ProviderUnavailableError } from "@/lib/providers/provider-registry";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const now = new Date();
    const isManualRefreshOnly = await loadManualRefreshOnlyForUser(supabase, user.id);

    if (isManualRefreshOnly) {
      return NextResponse.json({
        status: "skipped_manual_only",
        message: "Automatic refresh is disabled for this account.",
      });
    }

    const [syncStatus, pendingJobs] = await Promise.all([
      loadSyncStatusForUser(supabase, user.id, now),
      loadPendingPipSyncJobsForUser(supabase, user.id),
    ]);
    const decision = getAppOpenSyncDecision({
      syncStatus,
      hasPendingSyncJob: pendingJobs.some(
        (job) => job.status === "pending" || job.status === "running",
      ),
      now,
    });

    if (decision.status !== "run") {
      return NextResponse.json(decision);
    }

    try {
      const result = await runProviderSync(supabase, {
        userId: user.id,
        provider: decision.provider,
        reason: "app_open",
        now,
      });

      return NextResponse.json({
        status: "ran",
        provider: decision.provider,
        result,
      });
    } catch (error) {
      if (error instanceof ProviderSyncError && error.repairRequired) {
        return NextResponse.json({
          status: "needs_repair",
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
      return NextResponse.json(
        {
          status: "failed",
          error: error.message,
        },
        { status: 501 },
      );
    }

    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      status: "failed",
      error: error.message,
    };
  }

  if (error instanceof Error) {
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
