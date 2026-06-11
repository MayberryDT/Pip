import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderSyncError } from "@/lib/providers/provider-errors";
import { ProviderUnavailableError } from "@/lib/providers/provider-registry";
import { POST } from "@/app/api/sync/manual/route";

const routeMocks = vi.hoisted(() => {
  class MockManualSyncRateLimitError extends Error {
    retryAfterSeconds: number;

    constructor(retryAfterSeconds: number) {
      super("Manual sync was requested too recently.");
      this.name = "ManualSyncRateLimitError";
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }

  return {
    createSupabaseServerClient: vi.fn(),
    loadSyncStatusForUser: vi.fn(),
    runManualSync: vi.fn(),
    ManualSyncRateLimitError: MockManualSyncRateLimitError,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/manual-sync", () => ({
  runManualSync: routeMocks.runManualSync,
  ManualSyncRateLimitError: routeMocks.ManualSyncRateLimitError,
}));

vi.mock("@/lib/data/sync-status", () => ({
  loadSyncStatusForUser: routeMocks.loadSyncStatusForUser,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/sync/manual", () => {
  it("requires authentication before validating sync requests", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.runManualSync).not.toHaveBeenCalled();
  });

  it("requires authenticated callers to choose a provider explicitly", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid sync request.",
    });
    expect(routeMocks.runManualSync).not.toHaveBeenCalled();
  });

  it("rejects invalid providers with a structured 400 response after authentication", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));

    const response = await POST(jsonRequest({ provider: "bad-provider" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid sync request.",
    });
    expect(routeMocks.runManualSync).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ provider: "mock" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
  });

  it("requires an authenticated user before syncing", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    const response = await POST(jsonRequest({ provider: "mock" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.runManualSync).not.toHaveBeenCalled();
  });

  it("passes the authenticated user and provider to the manual sync service", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.runManualSync.mockResolvedValue({
      syncRunId: "sync-1",
      provider: "mock",
      institutionId: "institution-1",
      accountCount: 3,
      transactionCount: 22,
      balanceCount: 3,
      pipCashTodayCents: 4300,
    });

    const response = await POST(jsonRequest({ provider: "mock" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      syncRunId: "sync-1",
      pipCashTodayCents: 4300,
    });
    expect(routeMocks.runManualSync).toHaveBeenCalledWith(supabase, {
      userId: "user-1",
      provider: "mock",
    });
    expect(routeMocks.loadSyncStatusForUser).not.toHaveBeenCalled();
  });

  it("bypasses rate limiting only for server-confirmed repair syncs", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.loadSyncStatusForUser.mockResolvedValue({
      institutions: [
        {
          id: "institution-1",
          provider: "plaid",
          status: "failed",
          isStale: true,
        },
      ],
      latestSyncRun: null,
      hasStaleInstitution: true,
    });
    routeMocks.runManualSync.mockResolvedValue({
      syncRunId: "sync-1",
      provider: "plaid",
      institutionId: "institution-1",
      accountCount: 3,
      transactionCount: 22,
      balanceCount: 3,
      pipCashTodayCents: 4300,
    });

    const response = await POST(jsonRequest({
      provider: "plaid",
      reason: "repair",
    }));

    expect(response.status).toBe(200);
    expect(routeMocks.loadSyncStatusForUser).toHaveBeenCalledWith(supabase, "user-1");
    expect(routeMocks.runManualSync).toHaveBeenCalledWith(supabase, {
      userId: "user-1",
      provider: "plaid",
      bypassRateLimit: true,
    });
  });

  it("keeps rate limiting when repair is requested without a stale provider", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.loadSyncStatusForUser.mockResolvedValue({
      institutions: [
        {
          id: "institution-1",
          provider: "plaid",
          status: "connected",
          isStale: false,
        },
      ],
      latestSyncRun: null,
      hasStaleInstitution: false,
    });
    routeMocks.runManualSync.mockResolvedValue({
      syncRunId: "sync-1",
      provider: "plaid",
      institutionId: "institution-1",
      accountCount: 3,
      transactionCount: 22,
      balanceCount: 3,
      pipCashTodayCents: 4300,
    });

    const response = await POST(jsonRequest({
      provider: "plaid",
      reason: "repair",
    }));

    expect(response.status).toBe(200);
    expect(routeMocks.runManualSync).toHaveBeenCalledWith(supabase, {
      userId: "user-1",
      provider: "plaid",
    });
  });

  it("maps rate limits to 429 with retry metadata", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.runManualSync.mockRejectedValue(new routeMocks.ManualSyncRateLimitError(45));

    const response = await POST(jsonRequest({ provider: "mock" }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Manual sync was requested too recently.",
      retryAfterSeconds: 45,
    });
  });

  it("maps unavailable future providers to 501 instead of a generic server error", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.runManualSync.mockRejectedValue(new ProviderUnavailableError("plaid"));

    const response = await POST(jsonRequest({ provider: "plaid" }));

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      error: "plaid provider is not implemented yet.",
    });
  });

  it("maps provider repair failures to 409 with repair metadata", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.runManualSync.mockRejectedValue(
      new ProviderSyncError({
        provider: "plaid",
        code: "item-login-required",
        message: "Plaid needs this bank connection repaired.",
        status: "failed",
        institutionId: "institution-1",
        institutionName: "Plaid Bank",
        repairRequired: true,
      }),
    );

    const response = await POST(jsonRequest({ provider: "plaid" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Plaid needs this bank connection repaired.",
      code: "item-login-required",
      repairRequired: true,
      connectionStatus: "failed",
      institutionId: "institution-1",
      institutionName: "Plaid Bank",
    });
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

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/sync/manual", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
