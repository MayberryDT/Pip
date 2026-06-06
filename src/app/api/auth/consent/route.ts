import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const consentSchema = z.object({
  protectedSavingsMonthlyCents: z.number().int().min(0).max(10_000_000).default(20000),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = consentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid consent settings." }, { status: 400 });
  }

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

    const { error } = await supabase.from("user_settings").upsert({
      user_id: user.id,
      protected_savings_monthly_cents: parsed.data.protectedSavingsMonthlyCents,
      privacy_consent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      status: "accepted",
    });
  } catch (error) {
    return NextResponse.json(toErrorBody(error), { status: 500 });
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
    error: "Consent request failed.",
  };
}
