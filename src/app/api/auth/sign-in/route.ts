import { NextResponse } from "next/server";
import { z } from "zod";
import { assertInvitedEmail, InviteRequiredError, normalizeEmail } from "@/lib/auth/beta-invites";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    const email = normalizeEmail(parsed.data.email);
    await assertInvitedEmail(email);

    const supabase = await createSupabaseServerClient();

    const origin = new URL(request.url).origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
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
    if (error instanceof InviteRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
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

  if (error instanceof Error) {
    return {
      error: error.message,
    };
  }

  return {
    error: "Sign-in failed.",
  };
}
