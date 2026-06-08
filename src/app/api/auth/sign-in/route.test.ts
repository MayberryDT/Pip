import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  return {
    createSupabaseServerClient: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

import { POST } from "@/app/api/auth/sign-in/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/sign-in", () => {
  it("rejects invalid email bodies without touching Supabase", async () => {
    const response = await POST(jsonRequest({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Enter a valid email.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ email: "mayberrydt@gmail.com" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
  });

  it("normalizes any valid email and sends the magic link to the callback route", async () => {
    enableSupabaseEnv();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://free-cash-mayberrydt.netlify.app");
    const supabase = createSupabaseClient();
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ email: " MayberryDT@gmail.COM " }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "sent",
    });
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "mayberrydt@gmail.com",
      options: {
        emailRedirectTo: "https://free-cash-mayberrydt.netlify.app/auth/callback",
        shouldCreateUser: true,
      },
    });
  });

  it("uses forwarded host headers when no canonical site URL is configured", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient();
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(
      jsonRequest(
        { email: "mayberrydt@gmail.com" },
        {
          "x-forwarded-host": "free-cash-mayberrydt.netlify.app",
          "x-forwarded-proto": "https",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "mayberrydt@gmail.com",
      options: {
        emailRedirectTo: "https://free-cash-mayberrydt.netlify.app/auth/callback",
        shouldCreateUser: true,
      },
    });
  });

  it("uses forwarded production headers before a Netlify deploy-prime URL", async () => {
    enableSupabaseEnv();
    vi.stubEnv("DEPLOY_PRIME_URL", "https://main--free-cash-mayberrydt.netlify.app");
    const supabase = createSupabaseClient();
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(
      jsonRequest(
        { email: "mayberrydt@gmail.com" },
        {
          "x-forwarded-host": "free-cash-mayberrydt.netlify.app",
          "x-forwarded-proto": "https",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "mayberrydt@gmail.com",
      options: {
        emailRedirectTo: "https://free-cash-mayberrydt.netlify.app/auth/callback",
        shouldCreateUser: true,
      },
    });
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("FREE_CASH_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createSupabaseClient() {
  return {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({
        error: null,
      }),
    },
  };
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/auth/sign-in", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
