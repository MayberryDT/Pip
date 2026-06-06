import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  loadSyncStatusForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/sync-status", () => ({
  loadSyncStatusForUser: routeMocks.loadSyncStatusForUser,
}));

import { GET } from "@/app/api/sync/status/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/sync/status", () => {
  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires authentication before loading sync status", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.loadSyncStatusForUser).not.toHaveBeenCalled();
  });

  it("returns authenticated stale connection and latest partial sync state", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.loadSyncStatusForUser.mockResolvedValue({
      institutions: [
        {
          id: "institution-1",
          institutionName: "Plaid Bank",
          provider: "plaid",
          status: "failed",
          lastSuccessfulSyncAt: "2026-06-05T00:00:00.000Z",
          staleAfter: "2026-06-06T00:00:00.000Z",
          isStale: true,
          errorMessage: "Repair required.",
        },
      ],
      latestSyncRun: {
        provider: "plaid",
        status: "partial",
        startedAt: "2026-06-06T00:00:00.000Z",
        completedAt: "2026-06-06T00:00:05.000Z",
        accountCount: 2,
        transactionCount: 8,
        balanceCount: 2,
        errorMessage: "1 connected institution could not refresh.",
      },
      hasStaleInstitution: true,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      hasStaleInstitution: true,
      institutions: [
        {
          id: "institution-1",
          status: "failed",
          isStale: true,
        },
      ],
      latestSyncRun: {
        status: "partial",
        errorMessage: "1 connected institution could not refresh.",
      },
    });
    expect(routeMocks.loadSyncStatusForUser).toHaveBeenCalledWith(supabase, "user-1");
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("FREE_CASH_SUPABASE_MODE", "");
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
