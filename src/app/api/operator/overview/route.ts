import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { loadOperatorOverview } from "@/lib/operator/overview";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const expectedToken = process.env.PIP_OPERATOR_TOKEN;

  if (!expectedToken) {
    return NextResponse.json({ error: "Operator access is not configured." }, { status: 503 });
  }

  if (!isValidOperatorRequest(request, expectedToken)) {
    return NextResponse.json({ error: "Operator authentication required." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    return NextResponse.json(await loadOperatorOverview(supabase));
  } catch (error) {
    return NextResponse.json(toErrorBody(error), { status: 500 });
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
