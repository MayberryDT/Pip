import { loadSyncStatusForUser } from "@/lib/data/sync-status";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { sensitiveJson } from "@/lib/security/http-cache";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
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

    return sensitiveJson(await loadSyncStatusForUser(supabase, user.id));
  } catch (error) {
    if (!(error instanceof SupabaseConfigError)) {
      console.error("[sync/status] status failed", getSafeErrorMessage(error, "Sync status request failed."));
    }

    return sensitiveJson(toErrorBody(error), { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      error: error.message,
    };
  }

  return {
    error: "Sync status request failed.",
  };
}
