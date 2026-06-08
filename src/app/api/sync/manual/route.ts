import { NextResponse } from "next/server";
import { z } from "zod";
import { runManualSync, ManualSyncRateLimitError } from "@/lib/data/manual-sync";
import { loadSyncStatusForUser } from "@/lib/data/sync-status";
import type { FinancialProviderName } from "@/lib/providers/FinancialDataProvider";
import { ProviderSyncError } from "@/lib/providers/provider-errors";
import { ProviderUnavailableError } from "@/lib/providers/provider-registry";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  provider: z.enum(["mock", "teller", "plaid"]),
  reason: z.enum(["manual", "repair"]).default("manual"),
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

    const body = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid sync request." }, { status: 400 });
    }

    const provider = parsed.data.provider as FinancialProviderName;
    const bypassRateLimit = await shouldBypassRateLimitForRepair(supabase, {
      userId: user.id,
      provider,
      reason: parsed.data.reason,
    });
    const result = await runManualSync(supabase, {
      userId: user.id,
      provider,
      ...(bypassRateLimit ? { bypassRateLimit: true } : {}),
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ManualSyncRateLimitError) {
      return NextResponse.json(
        {
          error: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    if (error instanceof ProviderUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 501 });
    }

    if (error instanceof ProviderSyncError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          repairRequired: error.repairRequired,
          connectionStatus: error.status,
          ...(error.institutionId ? { institutionId: error.institutionId } : {}),
          ...(error.institutionName ? { institutionName: error.institutionName } : {}),
        },
        { status: 409 },
      );
    }

    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

async function shouldBypassRateLimitForRepair(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: {
    userId: string;
    provider: FinancialProviderName;
    reason: "manual" | "repair";
  },
): Promise<boolean> {
  if (input.reason !== "repair") {
    return false;
  }

  const status = await loadSyncStatusForUser(supabase, input.userId);

  return status.institutions.some((institution) => {
    if (institution.provider !== input.provider) {
      return false;
    }

    return institution.isStale || ["failed", "stale", "revoked"].includes(institution.status);
  });
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
    error: "Manual sync failed.",
  };
}
