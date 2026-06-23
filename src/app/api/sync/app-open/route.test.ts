import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderSyncError } from "@/lib/providers/provider-errors";
import { getAppOpenSyncDecision } from "@/lib/data/app-open-sync";
import { POST } from "@/app/api/sync/app-open/route";
import type { ActivePipSyncJobSummary } from "@/lib/data/sync-jobs";
import type { SyncStatus } from "@/lib/data/sync-status";

const routeMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getAppAccessFailureForUser: vi.fn(),
  claimPipSyncJobById: vi.fn(),
  loadActivePipSyncJobsForUser: vi.fn(),
  loadSyncStatusForUser: vi.fn(),
  loadManualRefreshOnlyForUser: vi.fn(),
  processPipSyncJob: vi.fn(),
  recordProductEventSafely: vi.fn(),
  runProviderSync: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/app-access/route-guard", () => ({
  getAppAccessFailureForUser: routeMocks.getAppAccessFailureForUser,
}));

vi.mock("@/lib/data/sync-jobs", () => ({
  claimPipSyncJobById: routeMocks.claimPipSyncJobById,
  loadActivePipSyncJobsForUser: routeMocks.loadActivePipSyncJobsForUser,
  processPipSyncJob: routeMocks.processPipSyncJob,
}));

vi.mock("@/lib/data/sync-status", () => ({
  loadSyncStatusForUser: routeMocks.loadSyncStatusForUser,
}));

vi.mock("@/lib/data/user-settings", () => ({
  loadManualRefreshOnlyForUser: routeMocks.loadManualRefreshOnlyForUser,
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: routeMocks.recordProductEventSafely,
}));

vi.mock("@/lib/data/manual-sync", () => ({
  runProviderSync: routeMocks.runProviderSync,
}));

beforeEach(() => {
  routeMocks.getAppAccessFailureForUser.mockResolvedValue(null);
  routeMocks.loadActivePipSyncJobsForUser.mockResolvedValue([]);
  routeMocks.loadManualRefreshOnlyForUser.mockResolvedValue(false);
  routeMocks.createSupabaseAdminClient.mockReturnValue(createSupabaseAdminClient());
});

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

  it("skips app-open refresh for manual-refresh-only reviewer accounts", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "reviewer-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.loadManualRefreshOnlyForUser.mockResolvedValue(true);

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "skipped_manual_only",
      reason: "manual_refresh_only",
      message: "Automatic refresh is disabled for this account.",
    });
    expect(routeMocks.loadManualRefreshOnlyForUser).toHaveBeenCalledWith(supabase, "reviewer-1");
    expect(routeMocks.loadSyncStatusForUser).not.toHaveBeenCalled();
    expect(routeMocks.loadActivePipSyncJobsForUser).not.toHaveBeenCalled();
    expect(routeMocks.runProviderSync).not.toHaveBeenCalled();
  });

  it("requires app access before checking app-open freshness", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.getAppAccessFailureForUser.mockResolvedValue(
      Response.json({ error: "Pip app access is not active for this account." }, { status: 403 }),
    );

    const response = await POST();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Pip app access is not active for this account.",
    });
    expect(routeMocks.loadManualRefreshOnlyForUser).not.toHaveBeenCalled();
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
      previousSpendableCashTodayCents: 9100,
      currentSpendableCashTodayCents: 8300,
      spendableDeltaCents: -800,
      sameDayNewSpendCents: 525,
      sameDayNewTransactions: [
        {
          date: "2026-06-16",
          label: "Coffee Shop",
          amountCents: -525,
          pending: false,
          treatment: "daily_spend",
        },
      ],
      createdReactionSummary: {
        reactionType: "small_drop",
        intensity: 1,
        summary: "Recent spending lowered today's room.",
      },
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
        previousSpendableCashTodayCents: 9100,
        currentSpendableCashTodayCents: 8300,
        spendableDeltaCents: -800,
        sameDayNewSpendCents: 525,
        sameDayNewTransactions: [
          {
            date: "2026-06-16",
            label: "Coffee Shop",
            amountCents: -525,
            pending: false,
            treatment: "daily_spend",
          },
        ],
        createdReactionSummary: {
          reactionType: "small_drop",
          intensity: 1,
          summary: "Recent spending lowered today's room.",
        },
      },
    });
    expect(routeMocks.runProviderSync).toHaveBeenCalledWith(supabase, {
      userId: "user-1",
      provider: "plaid",
      reason: "app_open",
      now: expect.any(Date),
      writeSupabase: expect.objectContaining({
        kind: "admin",
      }),
    });
  });

  it("skips when a provider sync job is already pending", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.loadSyncStatusForUser.mockResolvedValue(createSyncStatus());
    routeMocks.loadActivePipSyncJobsForUser.mockResolvedValue([
      createActiveJob({
        status: "pending",
        reason: "scheduled",
      }),
    ]);

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "skipped_pending",
      reason: "sync_in_flight",
    });
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "app_open_sync_decision",
      expect.objectContaining({
        status: "skipped_pending",
        reason: "sync_in_flight",
        hasPendingSyncJob: true,
      }),
    );
    expect(routeMocks.runProviderSync).not.toHaveBeenCalled();
  });

  it("claims and processes a due Plaid webhook job on app open", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    const adminSupabase = createSupabaseAdminClient();
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(adminSupabase);
    routeMocks.loadSyncStatusForUser.mockResolvedValue(createSyncStatus());
    routeMocks.loadActivePipSyncJobsForUser.mockResolvedValue([
      createActiveJob({
        id: "job-1",
        reason: "plaid_webhook",
        status: "pending",
        sourceWebhookEventId: "webhook-1",
        availableAt: "2026-06-16T12:00:00.000Z",
      }),
    ]);
    routeMocks.claimPipSyncJobById.mockResolvedValue({
      id: "job-1",
      provider: "plaid",
      user_id: "user-1",
    });
    routeMocks.processPipSyncJob.mockResolvedValue({
      jobId: "job-1",
      status: "succeeded",
      result: {
        syncRunId: "sync-1",
        provider: "plaid",
        institutionId: "institution-1",
        institutionIds: ["institution-1"],
        status: "succeeded",
        accountCount: 2,
        transactionCount: 1,
        balanceCount: 2,
        pipCashTodayCents: 8300,
        sameDayNewSpendCents: 525,
        sameDayNewTransactions: [
          {
            date: "2026-06-16",
            label: "Coffee Shop",
            amountCents: -525,
            pending: false,
            treatment: "daily_spend",
          },
        ],
        failedInstitutionCount: 0,
        failures: [],
      },
    });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ran",
      provider: "plaid",
      reason: "plaid_webhook",
      result: {
        syncRunId: "sync-1",
        sameDayNewSpendCents: 525,
      },
    });
    expect(routeMocks.claimPipSyncJobById).toHaveBeenCalledWith(adminSupabase, "job-1", {
      now: expect.any(Date),
    });
    expect(routeMocks.processPipSyncJob).toHaveBeenCalledWith(
      adminSupabase,
      expect.objectContaining({
        id: "job-1",
      }),
      {
        now: expect.any(Date),
      },
    );
    expect(routeMocks.runProviderSync).not.toHaveBeenCalled();
  });

  it("skips a webhook job when another worker claims it first", async () => {
    enableSupabaseEnv();
    const adminSupabase = createSupabaseAdminClient();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.createSupabaseAdminClient.mockReturnValue(adminSupabase);
    routeMocks.loadSyncStatusForUser.mockResolvedValue(createSyncStatus());
    routeMocks.loadActivePipSyncJobsForUser.mockResolvedValue([
      createActiveJob({
        id: "job-1",
        reason: "plaid_webhook",
        status: "pending",
        sourceWebhookEventId: "webhook-1",
        availableAt: "2026-06-16T12:00:00.000Z",
      }),
    ]);
    routeMocks.claimPipSyncJobById.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "skipped_pending",
      reason: "sync_in_flight",
    });
    expect(routeMocks.claimPipSyncJobById).toHaveBeenCalledWith(adminSupabase, "job-1", {
      now: expect.any(Date),
    });
    expect(routeMocks.processPipSyncJob).not.toHaveBeenCalled();
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

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "needs_repair",
      reason: "provider_needs_repair",
      provider: "plaid",
      institutionId: "institution-1",
      errorCode: "provider-token-decrypt-failed",
    });
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "app_open_sync_decision",
      expect.objectContaining({
        status: "needs_repair",
        reason: "provider_needs_repair",
        provider: "plaid",
        institutionId: "institution-1",
        errorCode: "provider-token-decrypt-failed",
        hasPendingSyncJob: false,
      }),
    );
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
      reason: "provider_needs_repair",
      provider: "plaid",
      institutionId: "institution-1",
      errorCode: "item-login-required",
    });
  });

  it("logs unexpected app-open failures without exposing secret-shaped values", async () => {
    enableSupabaseEnv();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("app-open failed access_token=provider-secret sk-test-secret");
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.loadSyncStatusForUser.mockRejectedValue(error);

    try {
      const response = await POST();

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        status: "failed",
        error: "App-open sync failed.",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "[sync/app-open] sync failed",
        "app-open failed access_token=[redacted] [redacted]",
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("getAppOpenSyncDecision", () => {
  it("skips fresh data inside the stale-check window", () => {
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
        activeSyncJobs: [],
        now: new Date("2026-06-16T12:05:00.000Z"),
      }),
    ).toEqual({
      status: "skipped_recent",
      reason: "recent_enough",
      message: "Recent data is fresh enough for app open.",
      lastSuccessfulSyncAt: "2026-06-16T12:00:00.000Z",
    });
  });

  it("runs a stale check when the last successful sync is outside the stale-check window", () => {
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
        activeSyncJobs: [],
        now: new Date("2026-06-16T16:01:00.000Z"),
      }),
    ).toEqual({
      status: "run",
      provider: "plaid",
      reason: "stale_check",
    });
  });

  it("runs the available webhook job before a delayed older webhook retry", () => {
    expect(
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus(),
        activeSyncJobs: [
          createActiveJob({
            id: "retry-delayed",
            reason: "plaid_webhook",
            availableAt: "2026-06-16T12:05:00.000Z",
            createdAt: "2026-06-16T11:55:00.000Z",
          }),
          createActiveJob({
            id: "ready-webhook",
            reason: "plaid_webhook",
            availableAt: "2026-06-16T12:00:00.000Z",
            createdAt: "2026-06-16T11:56:00.000Z",
          }),
        ],
        now: new Date("2026-06-16T12:00:00.000Z"),
      }),
    ).toEqual({
      status: "run_webhook_job",
      provider: "plaid",
      jobId: "ready-webhook",
      reason: "plaid_webhook_pending",
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
    kind: "session",
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

function createSupabaseAdminClient() {
  return {
    kind: "admin",
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

function createActiveJob(
  overrides: Partial<ActivePipSyncJobSummary> = {},
): ActivePipSyncJobSummary {
  return {
    id: "job-1",
    provider: "plaid",
    institutionId: "institution-1",
    reason: "plaid_webhook",
    status: "pending",
    sourceWebhookEventId: "webhook-1",
    availableAt: "2026-06-16T12:00:00.000Z",
    createdAt: "2026-06-16T11:59:00.000Z",
    ...overrides,
  };
}
