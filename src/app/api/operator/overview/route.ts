import { timingSafeEqual } from "node:crypto";
import { loadOperatorOverview } from "@/lib/operator/overview";
import { sensitiveJson } from "@/lib/security/http-cache";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const expectedToken = process.env.PIP_OPERATOR_TOKEN;

  if (!expectedToken) {
    return sensitiveJson({ error: "Operator access is not configured." }, { status: 503 });
  }

  if (!isValidOperatorRequest(request, expectedToken)) {
    return sensitiveJson({ error: "Operator authentication required." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return sensitiveJson({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    return sensitiveJson(await loadOperatorOverview(supabase));
  } catch (error) {
    return sensitiveJson(toErrorBody(error), { status: 500 });
  }
}

function isValidOperatorRequest(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!actualToken) {
    return false;
  }

  const expected = Buffer.from(expectedToken);
  const actual = Buffer.from(actualToken);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
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
    error: "Operator overview request failed.",
  };
}
