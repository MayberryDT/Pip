import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { decryptProviderToken, encryptProviderToken } from "@/lib/providers/teller/token-crypto";

export type PlaidStoredCredential = {
  institutionId: string;
  userId: string;
  itemId: string;
  accessToken: string;
  institutionName: string;
  environment: string;
  transactionCursor?: string;
};

export async function storePlaidCredential(input: {
  supabase?: SupabaseClient<Database>;
  institutionId: string;
  userId: string;
  itemId: string;
  accessToken: string;
  institutionName: string;
  environment: string;
}) {
  const supabase = input.supabase ?? createSupabaseAdminClient();
  const { error } = await supabase
    .schema("private")
    .from("provider_credentials")
    .upsert(
      {
        institution_id: input.institutionId,
        user_id: input.userId,
        provider: "plaid",
        teller_enrollment_id: null,
        plaid_item_id: input.itemId,
        access_token_ciphertext: encryptProviderToken(input.accessToken),
        refresh_token_ciphertext: null,
        certificate_ref: null,
        metadata: {
          institutionName: input.institutionName,
          environment: input.environment,
        } satisfies Json,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "institution_id",
      },
    );

  if (error) {
    throw error;
  }
}

export async function loadLatestPlaidCredentialForUser(
  userId: string,
  supabase: SupabaseClient<Database> = createSupabaseAdminClient(),
): Promise<PlaidStoredCredential | null> {
  const { data, error } = await supabase
    .schema("private")
    .from("provider_credentials")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "plaid")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return mapPlaidCredentialRow(data?.[0] ?? null);
}

export async function loadPlaidCredentialsForUser(
  userId: string,
  supabase: SupabaseClient<Database> = createSupabaseAdminClient(),
): Promise<PlaidStoredCredential[]> {
  const { data, error } = await supabase
    .schema("private")
    .from("provider_credentials")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "plaid")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).flatMap((row) => {
    const credential = mapPlaidCredentialRow(row);

    return credential ? [credential] : [];
  });
}

export async function loadPlaidCredentialForInstitution(
  input: {
    userId: string;
    institutionId: string;
  },
  supabase: SupabaseClient<Database> = createSupabaseAdminClient(),
): Promise<PlaidStoredCredential | null> {
  const { data, error } = await supabase
    .schema("private")
    .from("provider_credentials")
    .select("*")
    .eq("user_id", input.userId)
    .eq("institution_id", input.institutionId)
    .eq("provider", "plaid")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return mapPlaidCredentialRow(data);
}

export async function storePlaidTransactionCursor(
  input: {
    userId: string;
    institutionId: string;
    transactionCursor: string;
  },
  supabase: SupabaseClient<Database> = createSupabaseAdminClient(),
) {
  const { data, error: readError } = await supabase
    .schema("private")
    .from("provider_credentials")
    .select("metadata")
    .eq("user_id", input.userId)
    .eq("institution_id", input.institutionId)
    .eq("provider", "plaid")
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  const metadata = getPlainMetadata(data?.metadata);
  const { error: updateError } = await supabase
    .schema("private")
    .from("provider_credentials")
    .update({
      metadata: {
        ...metadata,
        transactionCursor: input.transactionCursor,
      } satisfies Json,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId)
    .eq("institution_id", input.institutionId)
    .eq("provider", "plaid");

  if (updateError) {
    throw updateError;
  }
}

type PlaidCredentialRow = Database["private"]["Tables"]["provider_credentials"]["Row"];

function mapPlaidCredentialRow(row: PlaidCredentialRow | null): PlaidStoredCredential | null {
  if (!row?.access_token_ciphertext || !row.plaid_item_id) {
    return null;
  }

  const metadata = getMetadata(row.metadata);

  return {
    institutionId: row.institution_id,
    userId: row.user_id,
    itemId: row.plaid_item_id,
    accessToken: decryptProviderToken(row.access_token_ciphertext),
    institutionName: metadata.institutionName,
    environment: metadata.environment,
    transactionCursor: metadata.transactionCursor,
  };
}

function getMetadata(metadata: Json): {
  institutionName: string;
  environment: string;
  transactionCursor?: string;
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {
      institutionName: "Plaid institution",
      environment: "unknown",
    };
  }

  return {
    institutionName:
      typeof metadata.institutionName === "string"
        ? metadata.institutionName
        : "Plaid institution",
    environment: typeof metadata.environment === "string" ? metadata.environment : "unknown",
    transactionCursor:
      typeof metadata.transactionCursor === "string" ? metadata.transactionCursor : undefined,
  };
}

function getPlainMetadata(metadata: Json | undefined): Record<string, Json> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).filter((entry): entry is [string, Json] => entry[1] !== undefined),
  );
}
