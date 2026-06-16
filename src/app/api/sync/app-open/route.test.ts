import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderSyncError } from "@/lib/providers/provider-errors";
import { getAppOpenSyncDecision } from "@/lib/data/app-open-sync";
import { POST } from "@/app/api/sync/app-open/route";
import type { SyncStatus } from "@/lib/data/sync-status";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  loadPendingPipSyncJobsForUser: vi.fn(),
  loadSyncStatusForUser: vi.fn(),
  runProviderSync: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/sync-jobs", () => ({
  loadPendingPipSyncJobsForUser: routeMocks.loadPendingPipSyncJobsForUser,
}));

vi.mock("@/lib/data/sync-status", () => ({
  loadSyncStatusForUser: routeMocks.loadSyncStatusForUser,
}));

vi.mock("@/lib/data/manual-sync", () => ({
  runProviderSync: routeMocks.runProviderSync,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/sync/app-open", () => {
  it("requires authentication before checking app-open freshness", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.runProviderSync).not.toHaveBeenCalled();
  });

  it("runs a shared app-open sync when connected data has never synced", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.loadSyncStatusForUser.mockResolvedValue(createSyncStatus({
      institutions: [
        createInstitution({
          lastSuccessfulSyncAt: null,
          staleAfter: null,
          isStale: false,
        }),
      ],
    }));
    routeMocks.loadPendingPipSyncJobsForUser.mockResolvedValue([]);
    routeMocks.runProviderSync.mockResolvedValue({
      syncRunId: "sync-1",
      provider: "plaid",
      institutionId: "institution-1",
      institutionIds: ["institution-1"],
      status: "succeeded",
      accountCount: 2,
      transactionCount: 40,
      balanceCount: 2,
      pipCashTodayCents: 8300,
      failedInstitutionCount: 0,
      failures: [],
    });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ran",
      provider: "plaid",
      result: {
        syncRunId: "sync-1",
        pipCashTodayCents: 8300,
      },
    });
    expect(routeMocks.runProviderSync).toHaveBeenCalledWith(supabase, {
      userId: "user-1",
      provider: "plaid",
      reason: "app_open",
      now: expect.any(Date),
    });
  });

  it("skips when a provider sync job is already pending", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.loadSyncStatusForUser.mockResolvedValue(createSyncStatus());
    routeMocks.loadPendingPipSyncJobsForUser.mockResolvedValue([{ status: "pending" }]);

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "skipped_pending",
    });
    expect(routeMocks.runProviderSync).not.toHaveBeenCalled();
  });

  it("returns repair metadata instead of syncing an undecryptable Plaid token", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.loadSyncStatusForUser.mockResolvedValue(createSyncStatus({
      institutions: [
        createInstitution({
          status: "failed",
          isStale: true,
          errorCode: "provider-token-decrypt-failed",
          errorMessage: "This Plaid connection needs to be reconnected before Pip can refresh it.",
        }),
      ],
      hasStaleInstitution: true,
    }));
    routeMocks.loadPendingPipSyncJobsForUser.mockResolvedValue([]);

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "needs_repair",
      provider: "plaid",
      institutionId: "institution-1",
      errorCode: "provider-token-decrypt-failed",
    });
    expect(routeMocks.runProviderSync).not.toHaveBeenCalled();
  });

  it("maps repair-required provider failures to a non-throwing app-open response", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.loadSyncStatusForUser.mockResolvedValue(createSyncStatus({
      institutions: [
        createInstitution({
          lastSuccessfulSyncAt: "2020-01-01T10:00:00.000Z",
          staleAfter: "2020-01-01T11:00:00.000Z",
          isStale: true,
        }),
      ],
      latestSyncRun: {
        provider: "plaid",
        status: "succeeded",
        startedAt: "2020-01-01T10:00:00.000Z",
        completedAt: "2020-01-01T10:00:01.000Z",
        accountCount: 2,
        transactionCount: 5,
        balanceCount: 2,
        errorMessage: null,
      },
      hasStaleInstitution: true,
    }));
    routeMocks.loadPendingPipSyncJobsForUser.mockResolvedValue([]);
    routeMocks.runProviderSync.mockRejectedValue(
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

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "needs_repair",
      provider: "plaid",
      institutionId: "institution-1",
      errorCode: "item-login-required",
    });
  });
});

describe("getAppOpenSyncDecision", () => {
  it("skips fresh data inside the app-open cooldown", () => {
    expect(
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus({
          institutions: [
            createInstitution({
              lastSuccessfulSyncAt: "2026-06-16T12:00:00.000Z",
              staleAfter: "2026-06-17T12:00:00.000Z",
              isStale: false,
            }),
          ],
          latestSyncRun: {
            provider: "plaid",
            status: "succeeded",
            startedAt: "2026-06-16T12:00:00.000Z",
            completedAt: "2026-06-16T12:00:02.000Z",
            accountCount: 2,
            transactionCount: 10,
            balanceCount: 2,
            errorMessage: null,
          },
        }),
        hasPendingSyncJob: false,
        now: new Date("2026-06-16T12:05:00.000Z"),
      }),
    ).toMatchObject({
      status: "skipped_recent",
      retryAfterSeconds: 300,
    });
  });

  it("runs when the last successful sync is outside the app-open cooldown", () => {
    expect(
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus({
          institutions: [
            createInstitution({
              lastSuccessfulSyncAt: "2026-06-16T12:00:00.000Z",
              staleAfter: "2026-06-17T12:00:00.000Z",
              isStale: false,
            }),
          ],
          latestSyncRun: {
            provider: "plaid",
            status: "succeeded",
            startedAt: "2026-06-16T12:00:00.000Z",
            completedAt: "2026-06-16T12:00:02.000Z",
            accountCount: 2,
            transactionCount: 10,
            balanceCount: 2,
            errorMessage: null,
          },
        }),
        hasPendingSyncJob: false,
        now: new Date("2026-06-16T12:11:00.000Z"),
      }),
    ).toEqual({
      status: "run",
      provider: "plaid",
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

function createSyncStatus(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    institutions: [createInstitution()],
    latestSyncRun: null,
    hasStaleInstitution: false,
    ...overrides,
  };
}

function createInstitution(
  overrides: Partial<SyncStatus["institutions"][number]> = {},
): SyncStatus["institutions"][number] {
  return {
    id: "institution-1",
    institutionName: "Plaid Bank",
    provider: "plaid",
    status: "connected",
    lastSuccessfulSyncAt: "2026-06-16T12:00:00.000Z",
    staleAfter: "2026-06-17T12:00:00.000Z",
    isStale: false,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}
