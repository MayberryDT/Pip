import { z } from "zod";
import { markPipCashSnapshotsStaleForUser } from "@/lib/data/financial-repository";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const preferenceSchema = z.object({
  issuerName: z.string().trim().min(1).max(120),
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

    const body = await request.json().catch(() => null);
    const parsed = preferenceSchema.safeParse(body);

    if (!parsed.success) {
      return sensitiveJson({ error: "Issuer name is required." }, { status: 400 });
    }

    const issuerName = parsed.data.issuerName;
    const { data: existing, error: findError } = await supabase
      .from("missing_card_preferences")
      .select("id")
      .eq("user_id", user.id)
      .ilike("issuer_name", issuerName)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (!existing) {
      const { error: insertError } = await supabase.from("missing_card_preferences").insert({
        user_id: user.id,
        issuer_name: issuerName,
      });

      if (insertError) {
        throw insertError;
      }

      await markPipCashSnapshotsStaleForUser(supabase, user.id, createSupabaseAdminClient());
    }

    await recordProductEventSafely(supabase, user.id, "missing_card_nudge_suppressed", {
      issuerName,
    });

    return sensitiveJson({
      status: "suppressed",
      issuerName,
    });
  } catch (error) {
    if (!(error instanceof SupabaseConfigError)) {
      console.error(
        "[missing-card-preferences] suppression failed",
        getSafeErrorMessage(error, "Missing-card preference request failed."),
      );
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
    error: "Missing-card preference request failed.",
  };
}
