import { NextResponse } from "next/server";
import { z } from "zod";
import {
  markPipCashSnapshotsStaleForUser,
  upsertUserSettings,
} from "@/lib/data/financial-repository";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  protectedSavingsMonthlyCents: z.number().int().min(0).max(10_000_000),
});

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error: "Supabase is not configured.",
      },
      { status: 503 },
    );
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

    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      protectedSavingsMonthlyCents: data?.protected_savings_monthly_cents ?? 20000,
      manualRefreshOnly: data?.manual_refresh_only ?? false,
      privacyConsentAt: data?.privacy_consent_at ?? null,
    });
  } catch (error) {
    if (!(error instanceof SupabaseConfigError)) {
      console.error("[settings] settings request failed", getSafeErrorMessage(error, "Settings request failed."));
    }

    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error: "Supabase is not configured.",
      },
      { status: 503 },
    );
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

    const body = await request.json().catch(() => null);
    const parsed = settingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
    }

    const settings = await upsertUserSettings(supabase, user.id, parsed.data);
    await markPipCashSnapshotsStaleForUser(supabase, user.id);
    await recordProductEventSafely(supabase, user.id, "settings_updated", {
      protectedSavingsMonthlyCents: parsed.data.protectedSavingsMonthlyCents,
    });

    return NextResponse.json(settings);
  } catch (error) {
    if (!(error instanceof SupabaseConfigError)) {
      console.error("[settings] settings request failed", getSafeErrorMessage(error, "Settings request failed."));
    }

    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      error: error.message,
    };
  }

  return {
    error: "Settings request failed.",
  };
}
