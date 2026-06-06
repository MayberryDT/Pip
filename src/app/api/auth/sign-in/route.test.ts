import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  class MockInviteRequiredError extends Error {
    constructor() {
      super("This private beta is invite-only.");
      this.name = "InviteRequiredError";
    }
  }

  return {
    assertInvitedEmail: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    InviteRequiredError: MockInviteRequiredError,
  };
});

vi.mock("@/lib/auth/beta-invites", () => ({
  assertInvitedEmail: routeMocks.assertInvitedEmail,
  InviteRequiredError: routeMocks.InviteRequiredError,
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}));

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

  it("keeps sign-in invite-gated before sending an OTP", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient();
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.assertInvitedEmail.mockRejectedValue(new routeMocks.InviteRequiredError());

    const response = await POST(jsonRequest({ email: "outsider@example.com" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This private beta is invite-only.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("normalizes invited emails and sends the magic link to the callback route", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient();
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.assertInvitedEmail.mockResolvedValue(undefined);

    const response = await POST(jsonRequest({ email: " MayberryDT@gmail.COM " }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "sent",
    });
    expect(routeMocks.assertInvitedEmail).toHaveBeenCalledWith("mayberrydt@gmail.com");
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "mayberrydt@gmail.com",
      options: {
        emailRedirectTo: "http://localhost/auth/callback",
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

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/sign-in", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
