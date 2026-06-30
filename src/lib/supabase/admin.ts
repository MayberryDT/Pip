import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabasePublicConfig, getSupabaseServiceRoleKey } from "@/lib/supabase/env";

export function createSupabaseAdminClient(): SupabaseClient<Database> {
  const { url } = getSupabasePublicConfig();

  return createClient<Database>(url, getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
