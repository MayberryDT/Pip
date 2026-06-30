import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type AppAccessGrant = Database["public"]["Tables"]["app_access_grants"]["Row"];

export function normalizeAppAccessEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function loadActiveAppAccessGrant(
  supabase: SupabaseClient<Database>,
  email: string,
): Promise<AppAccessGrant | null> {
  const { data, error } = await supabase
    .from("app_access_grants")
    .select("*")
    .eq("normalized_email", normalizeAppAccessEmail(email))
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || data.status !== "active") {
    return null;
  }

  return data;
}

export async function grantAppAccess(
  supabase: SupabaseClient<Database>,
  input: {
    email: string;
    source?: string;
    note?: string | null;
  },
): Promise<AppAccessGrant> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("app_access_grants")
    .upsert(
      {
        normalized_email: normalizeAppAccessEmail(input.email),
        display_email: input.email.trim(),
        status: "active",
        source: input.source ?? "operator",
        note: input.note ?? null,
        granted_at: now,
        revoked_at: null,
        updated_at: now,
      },
      { onConflict: "normalized_email" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function revokeAppAccess(
  supabase: SupabaseClient<Database>,
  email: string,
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("app_access_grants")
    .update({
      status: "revoked",
      revoked_at: now,
      updated_at: now,
    })
    .eq("normalized_email", normalizeAppAccessEmail(email));

  if (error) {
    throw error;
  }
}

export async function recordAppAccessGrantAccess(
  supabase: SupabaseClient<Database>,
  grant: AppAccessGrant,
  authUserId: string,
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("app_access_grants")
    .update({
      auth_user_id: authUserId,
      first_accessed_at: grant.first_accessed_at ?? now,
      last_accessed_at: now,
      updated_at: now,
    })
    .eq("normalized_email", grant.normalized_email);

  if (error) {
    throw error;
  }
}
