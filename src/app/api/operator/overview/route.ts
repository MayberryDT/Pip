import { loadOperatorOverview } from "@/lib/operator/overview";
import { getOperatorAuthFailure } from "@/lib/operator/auth";
import { sensitiveJson } from "@/lib/security/http-cache";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const authFailure = getOperatorAuthFailure(request);

  if (authFailure) {
    return authFailure;
  }

  if (!isSupabaseConfigured()) {
    return sensitiveJson({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    return sensitiveJson(await loadOperatorOverview(supabase));
  } catch (error) {
    return sensitiveJson(toErrorBody(error), { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      error: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
    };
  }

  return {
    error: "Operator overview request failed.",
  };
}
