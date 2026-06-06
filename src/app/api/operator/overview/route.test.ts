import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  loadOperatorOverview: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/operator/overview", () => ({
  loadOperatorOverview: routeMocks.loadOperatorOverview,
}));

import { GET } from "@/app/api/operator/overview/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/operator/overview", () => {
  it("stays closed when operator access is not configured", async () => {
    enableSupabaseEnv();

    const response = await GET(jsonRequest("anything"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Operator access is not configured.",
    });
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("requires the configured operator bearer token", async () => {
    enableSupabaseEnv();
    vi.stubEnv("FREE_CASH_OPERATOR_TOKEN", "operator-secret");

    const response = await GET(jsonRequest("wrong-token"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Operator authentication required.",
    });
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("loads the overview through the server-side admin client", async () => {
    enableSupabaseEnv();
    vi.stubEnv("FREE_CASH_OPERATOR_TOKEN", "operator-secret");
    const admin = { kind: "admin" };
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.loadOperatorOverview.mockResolvedValue({
      generatedAt: "2026-06-06T12:00:00.000Z",
      periodStart: "2026-05-07T12:00:00.000Z",
      activeUserCount: 1,
      staleConnectionCount: 0,
      failedConnectionCount: 0,
      partialSyncCount: 0,
      failedSyncCount: 0,
      eventCounts: {},
      staleConnections: [],
      latestPartialSyncs: [],
      latestFailedSyncs: [],
    });

    const response = await GET(jsonRequest("operator-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      activeUserCount: 1,
      staleConnections: [],
    });
    expect(routeMocks.createSupabaseAdminClient).toHaveBeenCalled();
    expect(routeMocks.loadOperatorOverview).toHaveBeenCalledWith(admin);
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("FREE_CASH_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function jsonRequest(token: string) {
  return new Request("http://localhost/api/operator/overview", {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}
