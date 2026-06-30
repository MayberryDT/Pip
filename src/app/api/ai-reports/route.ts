import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientPipPlatform } from "@/lib/platform/client-platform";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const aiReportSchema = z.object({
  conversationId: z.string().trim().min(1).max(160),
  messageId: z.string().trim().min(1).max(160),
  reason: z.enum([
    "inaccurate_financial_explanation",
    "unsafe_or_offensive",
    "privacy_concern",
    "confusing_or_misleading",
    "other",
  ]),
  details: z.string().trim().max(1000).optional(),
  responseExcerpt: z.string().trim().max(1200).optional(),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(reportingUnavailableBody(), { status: 503 });
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
        error: "Sign in to report an assistant response.",
      }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = aiReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        code: "INVALID_REPORT",
        error: "Choose a report reason before sending.",
      }, { status: 400 });
    }

    const userAgent = request.headers.get("user-agent");
    const { error } = await supabase.from("ai_response_reports").insert({
      user_id: user.id,
      conversation_id: parsed.data.conversationId,
      message_id: parsed.data.messageId,
      reason: parsed.data.reason,
      details: parsed.data.details || null,
      response_excerpt: parsed.data.responseExcerpt || null,
      platform: getClientPipPlatform(),
      app_version: null,
      user_agent: userAgent?.slice(0, 500) ?? null,
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({ status: "reported" });
  } catch (error) {
    const body = toErrorBody(error);

    if (body.code === "REPORTING_UNAVAILABLE") {
      return NextResponse.json(body, { status: 503 });
    }

    console.error("[ai-reports] report save failed", getSafeErrorMessage(error, "Report save failed."));
    return NextResponse.json(body, { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return reportingUnavailableBody();
  }

  return {
    code: "REPORT_SAVE_FAILED",
    error: "I couldn’t save that report. You can keep using Pip.",
  };
}

function reportingUnavailableBody() {
  return {
    code: "REPORTING_UNAVAILABLE",
    error: "Reporting is unavailable in this build.",
  };
}
