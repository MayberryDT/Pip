import { NextResponse } from "next/server";
import { getTellerConfig, getTellerReadiness } from "@/lib/providers/teller/config";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
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

    const config = getTellerConfig();
    const readiness = getTellerReadiness(config);

    return NextResponse.json({
      ...readiness,
      products: config.products,
      apiBaseUrl: config.apiBaseUrl,
      message: getReadinessMessage(readiness),
    });
  } catch (error) {
    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

function getReadinessMessage(readiness: ReturnType<typeof getTellerReadiness>): string {
  if (!readiness.canCreateConnectSession) {
    return "Teller Connect needs TELLER_APPLICATION_ID.";
  }

  if (!readiness.canCallApi) {
    return "Teller API calls need certificate, private key, and token encryption env vars.";
  }

  return "Teller Connect and mTLS API configuration are present.";
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
    error: "Teller health request failed.",
  };
}
