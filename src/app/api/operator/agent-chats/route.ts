import {
  loadLocalOperatorAgentChats,
  loadOperatorAgentChats,
} from "@/lib/data/agent-chat-turns";
import { getOperatorAuthFailure } from "@/lib/operator/auth";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const authFailure = getOperatorAuthFailure(request);

  if (authFailure) {
    return authFailure;
  }

  const filters = getAgentChatFilters(request);

  try {
    if (!isSupabaseConfigured()) {
      return sensitiveJson({
        generatedAt: new Date().toISOString(),
        source: "local-dev",
        turns: await loadLocalOperatorAgentChats(filters),
      });
    }

    const supabase = createSupabaseAdminClient();

    return sensitiveJson({
      generatedAt: new Date().toISOString(),
      source: "supabase",
      turns: await loadOperatorAgentChats(supabase, filters),
    });
  } catch (error) {
    return sensitiveJson(toErrorBody(error), { status: 500 });
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
