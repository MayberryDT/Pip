import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

import { GET } from "@/app/api/auth/oauth/google/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/auth/oauth/google", () => {
  it("starts Google OAuth with a canonical same-origin callback URL", async () => {
    enableSupabaseEnv();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://free-cash-mayberrydt.netlify.app");
    const supabase = createSupabaseClient("https://supabase.example/auth/v1/authorize?provider=google");
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/api/auth/oauth/google?next=/welcome"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://supabase.example/auth/v1/authorize?provider=google",
    );
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://free-cash-mayberrydt.netlify.app/auth/callback?next=%2Fwelcome",
        skipBrowserRedirect: true,
      },
    });
  });

  it("uses forwarded Netlify headers when no canonical URL is configured", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient("https://supabase.example/auth/v1/authorize?provider=google");
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET(
      new Request("http://localhost/api/auth/oauth/google", {
        headers: {
          "x-forwarded-host": "free-cash-mayberrydt.netlify.app",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(response.status).toBe(307);
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://free-cash-mayberrydt.netlify.app/auth/callback",
        skipBrowserRedirect: true,
      },
    });
  });

  it("keeps next redirects inside the app", async () => {
    enableSupabaseEnv();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://free-cash-mayberrydt.netlify.app");
    const supabase = createSupabaseClient("https://supabase.example/auth/v1/authorize?provider=google");
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    await GET(new Request("http://localhost/api/auth/oauth/google?next=https://evil.example"));

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://free-cash-mayberrydt.netlify.app/auth/callback",
        skipBrowserRedirect: true,
      },
    });
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("FREE_CASH_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createSupabaseClient(url: string) {
  return {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({
        data: {
          url,
        },
        error: null,
      }),
    },
  };
}
