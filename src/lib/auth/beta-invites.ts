import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type InviteUser = {
  id: string;
  email?: string | null;
};

export async function assertInvitedEmail(email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("beta_invites")
    .select("email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new InviteRequiredError();
  }
}

export async function acceptCurrentUserInvite(user: InviteUser): Promise<void> {
  if (!user.email) {
    throw new InviteRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("beta_invites")
    .update({
      accepted_by_user_id: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("email", normalizeEmail(user.email))
    .select("email")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new InviteRequiredError();
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class InviteRequiredError extends Error {
  constructor() {
    super("This private beta is invite-only.");
    this.name = "InviteRequiredError";
  }
}
