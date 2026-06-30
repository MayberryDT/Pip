import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { decryptProviderToken, encryptProviderToken } from "@/lib/providers/teller/token-crypto";

export type TellerStoredCredential = {
  institutionId: string;
  userId: string;
  enrollmentId: string;
  accessToken: string;
  institutionName: string;
  environment: string;
};

export async function storeTellerCredential(input: {
  supabase?: SupabaseClient<Database>;
  institutionId: string;
  userId: string;
  enrollmentId: string;
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
        provider: "teller",
        teller_enrollment_id: input.enrollmentId,
        plaid_item_id: null,
        access_token_ciphertext: encryptProviderToken(input.accessToken),
        refresh_token_ciphertext: null,
        certificate_ref: "env:TELLER_CERTIFICATE_PEM",
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

export async function loadLatestTellerCredentialForUser(
  userId: string,
  supabase: SupabaseClient<Database> = createSupabaseAdminClient(),
): Promise<TellerStoredCredential | null> {
  const { data, error } = await supabase
    .schema("private")
    .from("provider_credentials")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "teller")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const row = data?.[0];

  if (!row?.access_token_ciphertext || !row.teller_enrollment_id) {
    return null;
  }

  const metadata = getMetadata(row.metadata);

  return {
    institutionId: row.institution_id,
    userId: row.user_id,
    enrollmentId: row.teller_enrollment_id,
    accessToken: decryptProviderToken(row.access_token_ciphertext),
    institutionName: metadata.institutionName,
    environment: metadata.environment,
  };
}

function getMetadata(metadata: Json): { institutionName: string; environment: string } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {
      institutionName: "Teller institution",
      environment: "unknown",
    };
  }

  return {
    institutionName:
      typeof metadata.institutionName === "string"
        ? metadata.institutionName
        : "Teller institution",
    environment: typeof metadata.environment === "string" ? metadata.environment : "unknown",
  };
}
