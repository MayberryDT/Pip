import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

import { POST } from "@/app/api/auth/sign-out/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/sign-out", () => {
  it("returns signed out without touching Supabase when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "signed-out",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("delegates sign-out to Supabase when configured", async () => {
    enableSupabaseEnv();
    const supabase = {
      auth: {
        signOut: vi.fn().mockResolvedValue({
          error: null,
        }),
      },
    };
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "signed-out",
    });
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it("returns a no-store error when Supabase sign-out fails", async () => {
    enableSupabaseEnv();
    const supabase = {
      auth: {
        signOut: vi.fn().mockResolvedValue({
          error: new Error("sign-out failed"),
        }),
      },
    };
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST();

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Sign-out failed.",
    });
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}
