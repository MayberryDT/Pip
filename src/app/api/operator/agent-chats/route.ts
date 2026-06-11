import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  loadLocalOperatorAgentChats,
  loadOperatorAgentChats,
} from "@/lib/data/agent-chat-turns";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const expectedToken = process.env.PIP_OPERATOR_TOKEN;

  if (!expectedToken) {
    return NextResponse.json({ error: "Operator access is not configured." }, { status: 503 });
  }

  if (!isValidOperatorRequest(request, expectedToken)) {
    return NextResponse.json({ error: "Operator authentication required." }, { status: 401 });
  }

  const filters = getAgentChatFilters(request);

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        source: "local-dev",
        turns: await loadLocalOperatorAgentChats(filters),
      });
    }

    const supabase = createSupabaseAdminClient();

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source: "supabase",
      turns: await loadOperatorAgentChats(supabase, filters),
    });
  } catch (error) {
    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

function getAgentChatFilters(request: Request): {
  limit: number;
  userId?: string;
  conversationId?: string;
} {
  const url = new URL(request.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 250)) : 100;
  const userId = url.searchParams.get("userId")?.trim() || undefined;
  const conversationId = url.searchParams.get("conversationId")?.trim() || undefined;

  return {
    limit,
    userId,
    conversationId,
  };
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
    error: "Operator agent chat request failed.",
  };
}
