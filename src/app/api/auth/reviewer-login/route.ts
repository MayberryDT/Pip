import { z } from "zod";
import { isPlayReviewerEmail } from "@/lib/play/reviewer";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { sensitiveJson } from "@/lib/security/http-cache";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const reviewerLoginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = reviewerLoginSchema.safeParse(body);

  if (!parsed.success) {
    return sensitiveJson({ error: "Enter reviewer email and password." }, { status: 400 });
  }

  if (!isPlayReviewerEmail(parsed.data.email)) {
    return sensitiveJson({ error: "Reviewer access is not enabled for this account." }, { status: 403 });
  }

  if (!isSupabaseConfigured()) {
    return sensitiveJson(reviewerAccessUnavailableBody(), { status: 503 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email.trim().toLowerCase(),
      password: parsed.data.password,
    });

    if (error) {
      return sensitiveJson({ error: "Reviewer sign-in failed." }, { status: 401 });
    }

    return sensitiveJson({ status: "signed-in" });
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return sensitiveJson(reviewerAccessUnavailableBody(), { status: 503 });
    }

    console.error("[reviewer-login] sign-in failed", getSafeErrorMessage(error, "Reviewer sign-in failed."));
    return sensitiveJson(toErrorBody(), { status: 500 });
  }
}

function toErrorBody() {
  return {
    code: "REVIEWER_SIGN_IN_FAILED",
    error: "Reviewer sign-in failed.",
  };
}

function reviewerAccessUnavailableBody() {
  return {
    code: "REVIEWER_ACCESS_UNAVAILABLE",
    error: "Reviewer access is not configured for this build.",
  };
}
