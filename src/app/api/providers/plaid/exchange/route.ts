import { NextResponse } from "next/server";
import { z } from "zod";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { createPlaidClient, getPlaidConfig } from "@/lib/providers/plaid/config";
import { storePlaidCredential } from "@/lib/providers/plaid/credential-store";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const exchangeSchema = z.object({
  publicToken: z.string().min(8).max(512),
  metadata: z
    .object({
      institution: z
        .object({
          name: z.string().min(1).max(160).optional(),
          institution_id: z.string().min(1).max(120).optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  let userId: string | null = null;
  let institutionName = "Plaid institution";

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    userId = user.id;
    const body = await request.json().catch(() => null);
    const parsed = exchangeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Plaid exchange request." }, { status: 400 });
    }

    const config = getPlaidConfig();
    const plaid = createPlaidClient(config);
    const exchange = await plaid.itemPublicTokenExchange({
      public_token: parsed.data.publicToken,
    });
    const admin = createSupabaseAdminClient();
    institutionName = parsed.data.metadata?.institution?.name ?? "Plaid institution";
    const providerInstitutionId = parsed.data.metadata?.institution?.institution_id;
    const institution = await upsertPlaidInstitution(admin, {
      userId: user.id,
      institutionName,
      providerInstitutionId,
      itemId: exchange.data.item_id,
    });

    await storePlaidCredential({
      supabase: admin,
      institutionId: institution.id,
      userId: user.id,
      itemId: exchange.data.item_id,
      accessToken: exchange.data.access_token,
      institutionName,
      environment: config.environment,
      providerInstitutionId,
    });
    await recordProductEventSafely(admin, user.id, "connect_session_created", {
      provider: "plaid",
      status: "item-exchanged",
      institutionName,
      providerInstitutionId,
    });
    await recordProductEventSafely(admin, user.id, "plaid_exchange_succeeded", {
      provider: "plaid",
      institutionName,
      providerInstitutionId,
    });

    return NextResponse.json({
      status: "connected",
      institutionId: institution.id,
      institutionName,
    });
  } catch (error) {
    if (userId) {
      await recordProductEventSafely(createSupabaseAdminClient(), userId, "plaid_exchange_failed", {
        provider: "plaid",
        institutionName,
        error: getSafeErrorMessage(error, "Plaid exchange request failed."),
      });
    }

    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

async function upsertPlaidInstitution(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    userId: string;
    institutionName: string;
    providerInstitutionId?: string;
    itemId: string;
  },
) {
  const { data: existingCredential, error: credentialFindError } = await supabase
    .schema("private")
    .from("provider_credentials")
    .select("institution_id")
    .eq("user_id", input.userId)
    .eq("provider", "plaid")
    .eq("plaid_item_id", input.itemId)
    .maybeSingle();

  if (credentialFindError) {
    throw credentialFindError;
  }

  const existingInstitutionId = existingCredential?.institution_id;
  const existingInstitutionResult = existingInstitutionId
    ? await supabase
        .from("connected_institutions")
        .select("*")
        .eq("user_id", input.userId)
        .eq("provider", "plaid")
        .eq("id", existingInstitutionId)
        .maybeSingle()
    : null;

  if (existingInstitutionResult?.error) {
    throw existingInstitutionResult.error;
  }

  const existing = existingInstitutionResult?.data ?? null;
  const payload = {
    institution_name: input.institutionName,
    provider_institution_id: input.providerInstitutionId ?? existing?.provider_institution_id ?? null,
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
      provider: "plaid",
      ...payload,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      error: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      error: getSafeErrorMessage(error, "Plaid exchange request failed."),
    };
  }

  return {
    error: "Plaid exchange request failed.",
  };
}
