import { z } from "zod";
import { logEmailEvent } from "@/lib/email/events";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const unsubscribeSchema = z.object({
  token: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return sensitiveJson({ error: "Invalid unsubscribe request." }, { status: 400 });
  }

  const normalizedEmail = verifyUnsubscribeToken(parsed.data.token);

  if (!normalizedEmail) {
    return sensitiveJson({ error: "Invalid unsubscribe link." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("marketing_waitlist")
    .update({
      newsletter_unsubscribed_at: new Date().toISOString(),
      newsletter_unsubscribe_reason: "self_service",
    })
    .eq("normalized_email", normalizedEmail);

  if (error) {
    return sensitiveJson({ error: "Unsubscribe failed." }, { status: 500 });
  }

  await logEmailEvent(supabase, {
    normalizedEmail,
    eventType: "newsletter_unsubscribe",
    provider: "internal",
    status: "processed",
    metadata: { source: "unsubscribe_page" },
  });

  return sensitiveJson({ status: "unsubscribed" });
}
