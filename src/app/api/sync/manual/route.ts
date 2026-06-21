import { z } from "zod";
import {
  assertManualSyncAllowed,
  runManualSync,
  runProviderSync,
  ManualSyncRateLimitError,
} from "@/lib/data/manual-sync";
import { loadSyncStatusForUser } from "@/lib/data/sync-status";
import { loadManualRefreshOnlyForUser } from "@/lib/data/user-settings";
import type { FinancialProviderName } from "@/lib/providers/FinancialDataProvider";
import { ProviderSyncError } from "@/lib/providers/provider-errors";
import { ProviderUnavailableError } from "@/lib/providers/provider-registry";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { sensitiveJson } from "@/lib/security/http-cache";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  provider: z.enum(["mock", "teller", "plaid"]),
  reason: z.enum(["manual", "repair", "account_selection", "app_open"]).default("manual"),
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

    const body = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return sensitiveJson({ error: "Invalid sync request." }, { status: 400 });
    }

    const isManualRefreshOnly = await loadManualRefreshOnlyForUser(supabase, user.id);

    if (isManualRefreshOnly) {
      return sensitiveJson({
        status: "skipped_manual_only",
        message: "Automatic refresh is disabled for this account.",
      });
    }

    const provider = parsed.data.provider as FinancialProviderName;
    const writeSupabase = createSupabaseAdminClient();
    const bypassRateLimit = await shouldBypassRateLimitForRepair(supabase, {
      userId: user.id,
      provider,
      reason: parsed.data.reason,
    });
    const result =
      parsed.data.reason === "manual"
        ? await runManualSync(supabase, {
            userId: user.id,
            provider,
            writeSupabase,
            ...(bypassRateLimit ? { bypassRateLimit: true } : {}),
          })
        : await runNonManualSync(supabase, {
            userId: user.id,
            provider,
            reason: parsed.data.reason,
            bypassRateLimit,
            writeSupabase,
          });

    return sensitiveJson(result);
  } catch (error) {
    if (error instanceof ManualSyncRateLimitError) {
      return sensitiveJson(
        {
          error: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    if (error instanceof ProviderUnavailableError) {
      return sensitiveJson({ error: error.message }, { status: 501 });
    }

    if (error instanceof ProviderSyncError) {
      return sensitiveJson(
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

    if (!(error instanceof SupabaseConfigError)) {
      console.error("[sync/manual] sync failed", getSafeErrorMessage(error, "Manual sync failed."));
    }

    return sensitiveJson(toErrorBody(error), { status: 500 });
  }
}

async function shouldBypassRateLimitForRepair(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: {
    userId: string;
    provider: FinancialProviderName;
    reason: "manual" | "repair" | "account_selection" | "app_open";
  },
): Promise<boolean> {
  if (input.reason !== "repair" && input.reason !== "account_selection") {
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

async function runNonManualSync(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: {
    userId: string;
    provider: FinancialProviderName;
    reason: "repair" | "account_selection" | "app_open";
    bypassRateLimit: boolean;
    writeSupabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  },
) {
  if (!input.bypassRateLimit) {
    await assertManualSyncAllowed(supabase, {
      userId: input.userId,
      provider: input.provider,
      now: new Date(),
    });
  }

  return runProviderSync(supabase, {
    userId: input.userId,
    provider: input.provider,
    reason: input.reason,
    writeSupabase: input.writeSupabase,
  });
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      error: error.message,
    };
  }

  return {
    error: "Manual sync failed.",
  };
}
