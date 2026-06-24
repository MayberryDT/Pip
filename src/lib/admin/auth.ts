import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminAccessState =
  | { status: "unavailable" }
  | { status: "signed-out" }
  | { status: "forbidden"; email?: string }
  | {
      status: "authorized";
      user: {
        id: string;
        email: string;
        normalizedEmail: string;
      };
    };

export function parseAdminEmails(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isConfiguredAdminEmail(email: string | undefined | null): boolean {
  if (!email) {
    return false;
  }

  return parseAdminEmails(process.env.PIP_ADMIN_EMAILS).includes(email.trim().toLowerCase());
}

export async function getAdminAccessState(): Promise<AdminAccessState> {
  if (!isSupabaseConfigured()) {
    return { status: "unavailable" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { status: "signed-out" };
  }

  if (!user.email || !isConfiguredAdminEmail(user.email)) {
    return { status: "forbidden", email: user.email ?? undefined };
  }

  const email = user.email;

  return {
    status: "authorized",
    user: {
      id: user.id,
      email,
      normalizedEmail: email.trim().toLowerCase(),
    },
  };
}
