import { z } from "zod";
import { markPipReactionSeenForUser } from "@/lib/data/pip-reactions";
import { sensitiveJson } from "@/lib/security/http-cache";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  reactionId: z.string().uuid(),
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
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return sensitiveJson({ error: "Invalid reaction seen request." }, { status: 400 });
    }

    const reaction = await markPipReactionSeenForUser(supabase, {
      userId: user.id,
      reactionId: parsed.data.reactionId,
    });

    if (!reaction) {
      return sensitiveJson({ error: "Reaction not found." }, { status: 404 });
    }

    return sensitiveJson({
      status: "seen",
      reaction,
    });
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
    error: "Reaction seen request failed.",
  };
}
