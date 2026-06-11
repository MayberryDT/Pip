import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  loadUsageCountersForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/usage-counters", () => ({
  loadUsageCountersForUser: routeMocks.loadUsageCountersForUser,
}));

import { GET } from "@/app/api/usage/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/usage", () => {
  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires authentication before loading usage counters", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.loadUsageCountersForUser).not.toHaveBeenCalled();
  });

  it("returns authenticated monthly usage counters including partial syncs", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.loadUsageCountersForUser.mockResolvedValue({
      periodStart: "2026-06-01T00:00:00.000Z",
      pipCashViewCount: 5,
      promptChipSelectionCount: 2,
      aiQuestionCount: 2,
      agentFollowUpCount: 1,
      estimatedModelCallCount: 4,
      purchaseSimulationCount: 1,
      trueBalanceRevealCount: 1,
      missingCardNudgeShownCount: 1,
      missingCardSuppressionCount: 0,
      negativePipCashFollowUpCount: 1,
      providerSyncCount: 3,
      partialProviderSyncCount: 1,
      failedProviderSyncCount: 1,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pipCashViewCount: 5,
      promptChipSelectionCount: 2,
      aiQuestionCount: 2,
      agentFollowUpCount: 1,
      missingCardNudgeShownCount: 1,
      negativePipCashFollowUpCount: 1,
      partialProviderSyncCount: 1,
      failedProviderSyncCount: 1,
    });
    expect(routeMocks.loadUsageCountersForUser).toHaveBeenCalledWith(supabase, "user-1");
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
