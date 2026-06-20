import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  deleteCurrentUserFinancialData: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/data/financial-repository", () => ({
  deleteCurrentUserFinancialData: routeMocks.deleteCurrentUserFinancialData,
}));

import { POST } from "@/app/api/account/delete/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/account/delete", () => {
  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "ACCOUNT_DELETION_UNAVAILABLE",
      error: "Account deletion is unavailable in this build.",
    });
  });

  it("requires authentication before validating deletion confirmation", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ confirmation: "NOPE" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "AUTH_REQUIRED",
      error: "Sign in before deleting an account.",
    });
    expect(routeMocks.deleteCurrentUserFinancialData).not.toHaveBeenCalled();
  });

  it("requires the typed DELETE confirmation", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ confirmation: "delete" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Type DELETE to confirm account deletion.",
    });
    expect(routeMocks.deleteCurrentUserFinancialData).not.toHaveBeenCalled();
  });

  it("deletes app data, signs out, and deletes the Supabase auth user", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase({ id: "user-1" });
    const admin = createAdminSupabase({ error: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.deleteCurrentUserFinancialData.mockResolvedValue(undefined);

    const response = await POST(jsonRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "deleted",
    });
    expect(routeMocks.deleteCurrentUserFinancialData).toHaveBeenCalledWith(supabase);
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("treats an already-deleted auth user as success", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase({ id: "user-1" });
    const admin = createAdminSupabase({
      error: {
        status: 404,
        message: "User not found",
      },
    });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.deleteCurrentUserFinancialData.mockResolvedValue(undefined);

    const response = await POST(jsonRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "deleted",
    });
  });

  it("logs deletion failures without exposing secret-shaped values", async () => {
    enableSupabaseEnv();
    const error = new Error("delete failed with access_token=provider-secret sk-test-secret");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const supabase = createServerSupabase({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.deleteCurrentUserFinancialData.mockRejectedValue(error);

    try {
      const response = await POST(jsonRequest({ confirmation: "DELETE" }));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        code: "ACCOUNT_DELETION_FAILED",
        error: "Account deletion failed.",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "[account-delete] account deletion failed",
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

function createServerSupabase(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({
        error: null,
      }),
    },
  };
}

function createAdminSupabase(result: { error: { status?: number; message?: string } | null }) {
  return {
    auth: {
      admin: {
        deleteUser: vi.fn().mockResolvedValue(result),
      },
    },
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("https://spendwithpip.com/api/account/delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
