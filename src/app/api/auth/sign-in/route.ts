import { NextResponse } from "next/server";
import { z } from "zod";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/url/app-origin";

const signInSchema = z.object({
  email: z.string().trim().email().max(320),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signInSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const email = parsed.data.email.trim().toLowerCase();

    const supabase = await createSupabaseServerClient();

    const origin = getAppOrigin(request);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=%2Fapp`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      status: "sent",
    });
  } catch (error) {
    if (!(error instanceof SupabaseConfigError)) {
      console.error("[sign-in] sign-in failed", getSafeErrorMessage(error, "Sign-in failed."));
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
    error: "Sign-in failed.",
  };
}
