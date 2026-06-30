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
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ email: "test.user@example.com" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
  });

  it("normalizes any valid email and sends the magic link to the callback route", async () => {
    enableSupabaseEnv();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    const supabase = createSupabaseClient();
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ email: " Test.User@example.COM " }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "sent",
    });
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "test.user@example.com",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fapp",
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
        { email: "test.user@example.com" },
        {
          "x-forwarded-host": "localhost:3000",
          "x-forwarded-proto": "https",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "test.user@example.com",
      options: {
        emailRedirectTo: "https://localhost:3000/auth/callback?next=%2Fapp",
        shouldCreateUser: true,
      },
    });
  });

  it("logs unexpected sign-in failures without exposing secret-shaped values", async () => {
    enableSupabaseEnv();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("otp failed access_token=provider-secret sk-test-secret");
    const supabase = createSupabaseClient();
    supabase.auth.signInWithOtp.mockResolvedValue({
      error,
    });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    try {
      const response = await POST(jsonRequest({ email: "test.user@example.com" }));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "Sign-in failed.",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "[sign-in] sign-in failed",
        "otp failed access_token=[redacted] [redacted]",
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
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
