import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

import { POST } from "@/app/api/auth/reviewer-login/route";
import { SupabaseConfigError } from "@/lib/supabase/env";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/reviewer-login", () => {
  it("rejects invalid bodies before touching Supabase", async () => {
    const response = await POST(jsonRequest({ email: "not-an-email", password: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Enter reviewer email and password.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejects accounts outside the Play reviewer allowlist", async () => {
    const response = await POST(jsonRequest({ email: "user@example.com", password: "secret" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Reviewer access is not enabled for this account.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ email: "play-review@animasai.co", password: "secret" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "REVIEWER_ACCESS_UNAVAILABLE",
      error: "Reviewer access is not configured for this build.",
    });
  });

  it("normalizes reviewer email before password sign-in", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ email: " Play-Review@AnimasAI.co ", password: "secret" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "signed-in",
    });
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "play-review@animasai.co",
      password: "secret",
    });
  });

  it("does not reveal Supabase password errors", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(
      createSupabaseClient({ error: new Error("bad password") }),
    );

    const response = await POST(jsonRequest({ email: "play-review@animasai.co", password: "wrong" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Reviewer sign-in failed.",
    });
  });

  it("does not reveal Supabase configuration errors from the catch path", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockRejectedValue(
      new SupabaseConfigError("Set NEXT_PUBLIC_SUPABASE_URL."),
    );

    const response = await POST(jsonRequest({ email: "play-review@animasai.co", password: "secret" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "REVIEWER_ACCESS_UNAVAILABLE",
      error: "Reviewer access is not configured for this build.",
    });
  });

  it("logs unexpected sign-in failures without exposing secret-shaped values", async () => {
    enableSupabaseEnv();
    const error = new Error("network failed with access_token=provider-secret sk-test-secret");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    routeMocks.createSupabaseServerClient.mockRejectedValue(error);

    try {
      const response = await POST(jsonRequest({ email: "play-review@animasai.co", password: "secret" }));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        code: "REVIEWER_SIGN_IN_FAILED",
        error: "Reviewer sign-in failed.",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "[reviewer-login] sign-in failed",
        "network failed with access_token=[redacted] [redacted]",
      );
      expect(consoleError.mock.calls[0]?.[1]).not.toBe(error);
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

function createSupabaseClient(result: { error: Error | null }) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue(result),
    },
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("https://spendwithpip.com/api/auth/reviewer-login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
