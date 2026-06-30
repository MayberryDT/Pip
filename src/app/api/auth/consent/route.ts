import { z } from "zod";
import { getAppAccessFailureForUser } from "@/lib/app-access/route-guard";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { sensitiveJson } from "@/lib/security/http-cache";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const consentSchema = z.object({
  protectedSavingsMonthlyCents: z.number().int().min(0).max(10_000_000).default(20000),
});

export async function POST(request: Request) {
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

    const body = await request.json().catch(() => ({}));
    const parsed = consentSchema.safeParse(body);

    if (!parsed.success) {
      return sensitiveJson({ error: "Invalid consent settings." }, { status: 400 });
    }

    const { error } = await supabase.from("user_settings").upsert({
      user_id: user.id,
      protected_savings_monthly_cents: parsed.data.protectedSavingsMonthlyCents,
      manual_refresh_only: false,
      privacy_consent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }

    await recordProductEventSafely(supabase, user.id, "settings_updated", {
      protectedSavingsMonthlyCents: parsed.data.protectedSavingsMonthlyCents,
    });

    return sensitiveJson({
      status: "accepted",
    });
  } catch (error) {
    if (!(error instanceof SupabaseConfigError)) {
      console.error("[consent] consent save failed", getSafeErrorMessage(error, "Consent request failed."));
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
    error: "Consent request failed.",
  };
}
