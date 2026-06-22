import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export async function hardSuppressEmail(
  supabase: SupabaseClient<Database>,
  input: {
    normalizedEmail: string;
    reason: "provider_bounce" | "provider_complaint";
  },
) {
  const { error } = await supabase
    .from("marketing_waitlist")
    .update({
      email_suppressed_at: new Date().toISOString(),
      email_suppression_reason: input.reason,
    })
    .eq("normalized_email", input.normalizedEmail);

  if (error) {
    throw error;
  }
}
