import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  deleteCurrentUserFinancialData: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/financial-repository", () => ({
  deleteCurrentUserFinancialData: routeMocks.deleteCurrentUserFinancialData,
}));

import { POST } from "@/app/api/delete-data/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/delete-data", () => {
  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
  });

  it("requires an authenticated user before deleting data", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.deleteCurrentUserFinancialData).not.toHaveBeenCalled();
  });

  it("delegates deletion to the authenticated database function", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.deleteCurrentUserFinancialData.mockResolvedValue(undefined);

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "deleted",
    });
    expect(routeMocks.deleteCurrentUserFinancialData).toHaveBeenCalledWith(supabase);
  });

  it("logs deletion failures without exposing secret-shaped values", async () => {
    enableSupabaseEnv();
    const error = new Error("delete failed with access_token=provider-secret sk-test-secret");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.deleteCurrentUserFinancialData.mockRejectedValue(error);

    try {
      const response = await POST();

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "Delete-data request failed.",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "[delete-data] deletion failed",
        "delete failed with access_token=[redacted] [redacted]",
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

function createSupabaseClient(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: null,
      }),
    },
  };
}
