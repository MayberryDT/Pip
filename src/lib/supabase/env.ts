export class SupabaseConfigError extends Error {
  constructor(message = "Supabase is not configured.") {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

export function isSupabaseConfigured(): boolean {
  if (process.env.PIP_SUPABASE_MODE === "off") {
    return false;
  }

  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isLocalFakeAppMode(): boolean {
  return process.env.PIP_LOCAL_FAKE_APP_MODE === "1";
}

export function getSupabasePublicConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new SupabaseConfigError(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable Supabase.",
    );
  }

  return {
    url,
    anonKey,
  };
}

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new SupabaseConfigError("Set SUPABASE_SERVICE_ROLE_KEY for server-only admin operations.");
  }

  return key;
}
