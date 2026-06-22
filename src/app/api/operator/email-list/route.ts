import { getOperatorAuthFailure } from "@/lib/operator/auth";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const authFailure = getOperatorAuthFailure(request);

  if (authFailure) {
    return authFailure;
  }

  if (!isSupabaseConfigured()) {
    return sensitiveJson({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("marketing_waitlist")
    .select("display_email, normalized_email, newsletter_opt_in_at, source_page, last_source_page")
    .not("newsletter_opt_in_at", "is", null)
    .is("newsletter_unsubscribed_at", null)
    .is("email_suppressed_at", null)
    .order("newsletter_opt_in_at", { ascending: false });

  if (error) {
    return sensitiveJson({ error: "Email list export failed." }, { status: 500 });
  }

  return sensitiveJson({
    contacts: (data ?? []).map((row) => ({
      email: row.display_email,
      normalizedEmail: row.normalized_email,
      sourcePage: row.source_page,
      lastSourcePage: row.last_source_page,
      newsletterOptInAt: row.newsletter_opt_in_at,
    })),
  });
}
