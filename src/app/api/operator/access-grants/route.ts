import { z } from "zod";
import {
  grantAppAccess,
  normalizeAppAccessEmail,
  revokeAppAccess,
} from "@/lib/data/app-access-grants";
import { sendInviteGrantedEmail } from "@/lib/email/transactional";
import { getOperatorAuthFailure } from "@/lib/operator/auth";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";

const accessGrantRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  action: z.enum(["grant", "revoke"]),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  const authFailure = getOperatorAuthFailure(request);

  if (authFailure) {
    return authFailure;
  }

  const body = await request.json().catch(() => null);
  const parsed = accessGrantRequestSchema.safeParse(body);

  if (!parsed.success) {
    return sensitiveJson({ error: "Invalid app access grant request." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return sensitiveJson({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const normalizedEmail = normalizeAppAccessEmail(parsed.data.email);

    if (parsed.data.action === "revoke") {
      await revokeAppAccess(supabase, parsed.data.email);

      return sensitiveJson({
        status: "revoked",
        normalizedEmail,
      });
    }

    await grantAppAccess(supabase, {
      email: parsed.data.email,
      source: "operator",
      note: parsed.data.note ?? null,
    });
    const appUrl = new URL("/app", process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin).toString();
    const inviteEmail = await sendInviteGrantedEmail(supabase, {
      email: parsed.data.email,
      normalizedEmail,
      appUrl,
    });

    return sensitiveJson({
      status: "granted",
      normalizedEmail,
      appUrl,
      inviteEmailStatus: inviteEmail.status,
    });
  } catch (error) {
    return sensitiveJson(toErrorBody(error), { status: 500 });
  }
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
    error: "Operator app access grant request failed.",
  };
}
