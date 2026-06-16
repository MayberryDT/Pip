import { NextResponse } from "next/server";
import { z } from "zod";
import { markPipReactionSeenForUser } from "@/lib/data/pip-reactions";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  reactionId: z.string().uuid(),
});

export async function POST(request: Request) {
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

    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid reaction seen request." }, { status: 400 });
    }

    const reaction = await markPipReactionSeenForUser(supabase, {
      userId: user.id,
      reactionId: parsed.data.reactionId,
    });

    if (!reaction) {
      return NextResponse.json({ error: "Reaction not found." }, { status: 404 });
    }

    return NextResponse.json({
      status: "seen",
      reaction,
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
    error: "Reaction seen request failed.",
  };
}
