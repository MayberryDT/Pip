import { NextResponse } from "next/server";
import { z } from "zod";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { getTellerConfig } from "@/lib/providers/teller/config";
import { storeTellerCredential } from "@/lib/providers/teller/credential-store";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const enrollmentSchema = z.object({
  accessToken: z.string().min(8).max(500),
  nonce: z.string().min(8).max(120),
  enrollment: z.object({
    id: z.string().min(1).max(200),
    institution: z
      .object({
        name: z.string().min(1).max(160).optional(),
      })
      .optional(),
    user: z
      .object({
        id: z.string().min(1).max(200).optional(),
      })
      .optional(),
  }),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = enrollmentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Teller enrollment." }, { status: 400 });
  }

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

    const cookieNonce = getCookie(request, "free_cash_teller_nonce");

    if (!cookieNonce || cookieNonce !== parsed.data.nonce) {
      return NextResponse.json({ error: "Teller connect session expired." }, { status: 403 });
    }

    const config = getTellerConfig();
    const admin = createSupabaseAdminClient();
    const institutionName = parsed.data.enrollment.institution?.name ?? "Teller institution";
    const institution = await upsertTellerInstitution(admin, {
      userId: user.id,
      institutionName,
    });

    await storeTellerCredential({
      supabase: admin,
      institutionId: institution.id,
      userId: user.id,
      enrollmentId: parsed.data.enrollment.id,
      accessToken: parsed.data.accessToken,
      institutionName,
      environment: config.environment,
    });
    await recordProductEventSafely(admin, user.id, "connect_session_created", {
      provider: "teller",
      status: "enrollment-stored",
      institutionName,
    });

    const response = NextResponse.json({
      status: "connected",
      institutionId: institution.id,
      institutionName,
    });
    response.cookies.delete("free_cash_teller_nonce");

    return response;
  } catch (error) {
    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

async function upsertTellerInstitution(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    userId: string;
    institutionName: string;
  },
) {
  const { data: existing, error: findError } = await supabase
    .from("connected_institutions")
    .select("*")
    .eq("user_id", input.userId)
    .eq("provider", "teller")
    .eq("institution_name", input.institutionName)
    .maybeSingle();

  if (findError) {
    throw findError;
  }

  const payload = {
    status: "connected" as const,
    error_code: null,
    error_message: null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("connected_institutions")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await supabase
    .from("connected_institutions")
    .insert({
      user_id: input.userId,
      provider: "teller",
      institution_name: input.institutionName,
      ...payload,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");

  if (!cookie) {
    return null;
  }

  return (
    cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  );
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      error: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      error: getSafeErrorMessage(error, "Teller enrollment request failed."),
    };
  }

  return {
    error: "Teller enrollment request failed.",
  };
}
