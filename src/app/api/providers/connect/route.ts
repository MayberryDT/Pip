import { z } from "zod";
import { getAppAccessFailureForUser } from "@/lib/app-access/route-guard";
import { recordProductEventSafely } from "@/lib/data/product-events";
import type { FinancialProviderName } from "@/lib/providers/FinancialDataProvider";
import {
  getFinancialDataProvider,
  ProviderUnavailableError,
} from "@/lib/providers/provider-registry";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { sensitiveJson } from "@/lib/security/http-cache";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  provider: z.enum(["mock", "teller", "plaid"]),
  mode: z.enum(["connect", "repair"]).default("connect"),
  institutionId: z.string().min(1).max(80).optional(),
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

    const appAccessFailure = await getAppAccessFailureForUser(user);

    if (appAccessFailure) {
      return appAccessFailure;
    }

    const body = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return sensitiveJson({ error: "Invalid provider request." }, { status: 400 });
    }

    if (parsed.data.provider === "mock") {
      return sensitiveJson(
        { error: "Mock provider is only available in explicit fake-data mode." },
        { status: 400 },
      );
    }

    const providerName = parsed.data.provider as FinancialProviderName;
    const provider = getFinancialDataProvider(providerName);
    const session = await provider.createConnectSession(user.id, {
      mode: parsed.data.mode,
      institutionId: parsed.data.institutionId,
    });

    await recordProductEventSafely(
      supabase,
      user.id,
      session.status === "ready" ? "connect_session_created" : "connect_session_failed",
      {
        provider: providerName,
        status: session.status,
        mode: parsed.data.mode,
      },
    );

    const response = sensitiveJson(session);

    if (session.connect?.kind === "teller" && session.connect.nonce) {
      response.cookies.set("pip_teller_nonce", session.connect.nonce, {
        httpOnly: true,
        maxAge: 600,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }

    return response;
  } catch (error) {
    if (error instanceof ProviderUnavailableError) {
      return sensitiveJson({ error: error.message }, { status: 501 });
    }

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
      error: getSafeErrorMessage(error, "Provider connect request failed."),
    };
  }

  return {
    error: "Provider connect request failed.",
  };
}
