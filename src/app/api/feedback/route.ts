import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientPipPlatform } from "@/lib/platform/client-platform";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const feedbackSchema = z.object({
  message: z.string().trim().min(2).max(2000),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(feedbackUnavailableBody(), { status: 503 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({
        code: "AUTH_REQUIRED",
        error: "Sign in to send feedback.",
      }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = feedbackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        code: "INVALID_FEEDBACK",
        error: "Enter feedback before sending.",
      }, { status: 400 });
    }

    const userAgent = request.headers.get("user-agent");
    const { error } = await supabase.from("tester_feedback").insert({
      user_id: user.id,
      email: user.email ?? null,
      message: parsed.data.message,
      platform: getClientPipPlatform(),
      app_version: null,
      user_agent: userAgent?.slice(0, 500) ?? null,
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({ status: "sent" });
  } catch (error) {
    const body = toErrorBody(error);

    if (body.code === "FEEDBACK_UNAVAILABLE") {
      return NextResponse.json(body, { status: 503 });
    }

    console.error("[feedback] feedback save failed", getSafeErrorMessage(error, "Feedback save failed."));
    return NextResponse.json(body, { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return feedbackUnavailableBody();
  }

  return {
    code: "FEEDBACK_SAVE_FAILED",
    error: "I couldn’t save that feedback. You can keep using Pip.",
  };
}

function feedbackUnavailableBody() {
  return {
    code: "FEEDBACK_UNAVAILABLE",
    error: "Feedback is unavailable in this build.",
  };
}
