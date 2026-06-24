import { z } from "zod";
import { getAdminAccessState } from "@/lib/admin/auth";
import { grantAppAccess, normalizeAppAccessEmail } from "@/lib/data/app-access-grants";
import { sendInviteGrantedEmail } from "@/lib/email/transactional";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupabaseConfigError } from "@/lib/supabase/env";

const adminGrantRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  if (!isTrustedAdminOrigin(request)) {
    return sensitiveJson({ error: "Admin request origin rejected." }, { status: 403 });
  }

  const adminState = await getAdminAccessState();

  if (adminState.status === "signed-out") {
    return sensitiveJson({ error: "Admin sign-in required." }, { status: 401 });
  }

  if (adminState.status === "forbidden") {
    return sensitiveJson({ error: "Admin access required." }, { status: 403 });
  }

  if (adminState.status === "unavailable") {
    return sensitiveJson({ error: "Admin access is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminGrantRequestSchema.safeParse(body);

  if (!parsed.success) {
    return sensitiveJson({ error: "Invalid admin grant request." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const normalizedEmail = normalizeAppAccessEmail(parsed.data.email);

    await grantAppAccess(supabase, {
      email: parsed.data.email,
      source: "admin",
      note: buildAdminGrantNote(adminState.user.normalizedEmail, parsed.data.note ?? null),
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
    return { error: error.message };
  }

  if (error instanceof Error) {
    return { error: error.message };
  }

  return { error: "Admin app access grant request failed." };
}

function isTrustedAdminOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  return origin === new URL(request.url).origin;
}

function buildAdminGrantNote(adminEmail: string, note: string | null): string {
  return note ? `Admin ${adminEmail}: ${note}` : `Admin ${adminEmail}: Granted from /admin`;
}
