import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticationRequiredError,
  getCurrentFinancialSnapshot,
  getCurrentPipCashState,
  getCurrentPipCashResult,
  NoFinancialDataError,
} from "@/lib/data/current-snapshot";
import { SupabaseConfigError } from "@/lib/supabase/env";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";

const mocks = vi.hoisted(() => {
  class MockSupabaseConfigError extends Error {
    constructor(message = "Supabase is not configured.") {
      super(message);
      this.name = "SupabaseConfigError";
    }
  }

  return {
    isSupabaseConfigured: vi.fn(),
    isFakeDataMode: vi.fn(),
    SupabaseConfigError: MockSupabaseConfigError,
    createSupabaseServerClient: vi.fn(),
    loadCachedPipCashResultForUser: vi.fn(),
    loadFinancialSnapshotForUser: vi.fn(),
    loadLatestUnseenPipReactionForUser: vi.fn(),
    loadPendingPipSyncJobsForUser: vi.fn(),
    loadSyncStatusForUser: vi.fn(),
    recordProductEventSafely: vi.fn(),
  };
});

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
  isFakeDataMode: mocks.isFakeDataMode,
  SupabaseConfigError: mocks.SupabaseConfigError,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/financial-repository", () => ({
  loadCachedPipCashResultForUser: mocks.loadCachedPipCashResultForUser,
  loadFinancialSnapshotForUser: mocks.loadFinancialSnapshotForUser,
}));

vi.mock("@/lib/data/pip-reactions", () => ({
  loadLatestUnseenPipReactionForUser: mocks.loadLatestUnseenPipReactionForUser,
}));

vi.mock("@/lib/data/sync-jobs", () => ({
  loadPendingPipSyncJobsForUser: mocks.loadPendingPipSyncJobsForUser,
}));

vi.mock("@/lib/data/sync-status", () => ({
  loadSyncStatusForUser: mocks.loadSyncStatusForUser,
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: mocks.recordProductEventSafely,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentPipCashResult", () => {
  it("uses fake data only when fake-data mode is explicit", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);
    mocks.isFakeDataMode.mockReturnValue(true);

    await expect(getCurrentPipCashResult({})).resolves.toMatchObject({
      pipCashTodayCents: 4300,
    });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.loadCachedPipCashResultForUser).not.toHaveBeenCalled();
    expect(mocks.loadFinancialSnapshotForUser).not.toHaveBeenCalled();
  });

  it("fails closed instead of returning fake data when Supabase env is missing", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);
    mocks.isFakeDataMode.mockReturnValue(false);

    await expect(getCurrentPipCashResult({ scenario: "negative" })).rejects.toBeInstanceOf(
      SupabaseConfigError,
    );
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.loadCachedPipCashResultForUser).not.toHaveBeenCalled();
    expect(mocks.loadFinancialSnapshotForUser).not.toHaveBeenCalled();
  });

  it("requires authentication instead of returning fake data when Supabase is configured", async () => {
    const supabase = createSupabaseClient(null);

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);

    await expect(getCurrentPipCashResult({ scenario: "negative" })).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(mocks.loadCachedPipCashResultForUser).not.toHaveBeenCalled();
    expect(mocks.loadFinancialSnapshotForUser).not.toHaveBeenCalled();
  });

  it("returns the latest cached result for authenticated users without loading full rows", async () => {
    const supabase = createSupabaseClient({ id: "user-1" });
    const cachedResult = {
      ...calculatePipCash(fakeSnapshot),
      pipCashTodayCents: 1234,
    };

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.loadCachedPipCashResultForUser.mockResolvedValue(cachedResult);

    await expect(getCurrentPipCashResult({})).resolves.toMatchObject({
      pipCashTodayCents: 1234,
    });
    expect(mocks.loadCachedPipCashResultForUser).toHaveBeenCalledWith(supabase, "user-1");
    expect(mocks.loadFinancialSnapshotForUser).not.toHaveBeenCalled();
  });

  it("recomputes from normalized rows when no cached result exists", async () => {
    const supabase = createSupabaseClient({ id: "user-1" });

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.loadCachedPipCashResultForUser.mockResolvedValue(null);
    mocks.loadFinancialSnapshotForUser.mockResolvedValue(fakeSnapshot);

    await expect(getCurrentPipCashResult({})).resolves.toMatchObject({
      pipCashTodayCents: 4300,
    });
    expect(mocks.loadFinancialSnapshotForUser).toHaveBeenCalledWith(supabase, "user-1");
  });

  it("recomputes when the repository rejects an old-policy cached result", async () => {
    const supabase = createSupabaseClient({ id: "user-1" });

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.loadCachedPipCashResultForUser.mockResolvedValue(null);
    mocks.loadFinancialSnapshotForUser.mockResolvedValue(fakeSnapshot);

    await expect(getCurrentPipCashResult({})).resolves.toMatchObject({
      monthlySavingsPolicyVersion: "unified_monthly_savings_v1",
      pipCashTodayCents: 4300,
    });
    expect(mocks.loadCachedPipCashResultForUser).toHaveBeenCalledWith(supabase, "user-1");
    expect(mocks.loadFinancialSnapshotForUser).toHaveBeenCalledWith(supabase, "user-1");
  });

  it("does not fall back to fake Pip Cash for authenticated users without financial rows", async () => {
    const supabase = createSupabaseClient({ id: "user-1" });

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.loadCachedPipCashResultForUser.mockResolvedValue(null);
    mocks.loadFinancialSnapshotForUser.mockResolvedValue(null);

    await expect(getCurrentPipCashResult({})).rejects.toBeInstanceOf(NoFinancialDataError);
  });
});

describe("getCurrentPipCashState", () => {
  it("returns freshness and records a freshness viewed event for authenticated users", async () => {
    const supabase = createSupabaseClient({ id: "user-1" });
    const cachedResult = {
      ...calculatePipCash(fakeSnapshot),
      pipCashTodayCents: 1234,
    };

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.loadCachedPipCashResultForUser.mockResolvedValue(cachedResult);
    mocks.loadSyncStatusForUser.mockResolvedValue({
      institutions: [
        {
          lastSuccessfulSyncAt: "2026-06-05T11:00:00.000Z",
        },
      ],
      latestSyncRun: {
        status: "succeeded",
      },
      hasStaleInstitution: false,
    });
    mocks.loadPendingPipSyncJobsForUser.mockResolvedValue([{ status: "pending" }]);
    mocks.loadLatestUnseenPipReactionForUser.mockResolvedValue({
      id: "reaction-1",
      reactionType: "small_lift",
      intensity: 1,
    });

    await expect(getCurrentPipCashState({ recordFreshnessViewed: true })).resolves.toMatchObject({
      pipCashTodayCents: 1234,
      freshness: {
        state: "syncing",
        lastSuccessfulSyncAt: "2026-06-05T11:00:00.000Z",
        latestSyncRunStatus: "succeeded",
        hasPendingSyncJob: true,
        hasStaleInstitution: false,
      },
      reaction: {
        id: "reaction-1",
      },
    });
    expect(mocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "pip_freshness_viewed",
      {
        state: "syncing",
        lastSuccessfulSyncAt: "2026-06-05T11:00:00.000Z",
        latestSyncRunStatus: "succeeded",
        hasPendingSyncJob: true,
        hasStaleInstitution: false,
      },
    );
  });

  it("does not record freshness telemetry unless explicitly requested", async () => {
    const supabase = createSupabaseClient({ id: "user-1" });
    const cachedResult = {
      ...calculatePipCash(fakeSnapshot),
      pipCashTodayCents: 1234,
    };

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.loadCachedPipCashResultForUser.mockResolvedValue(cachedResult);
    mocks.loadSyncStatusForUser.mockResolvedValue({
      institutions: [],
      latestSyncRun: null,
      hasStaleInstitution: false,
    });
    mocks.loadPendingPipSyncJobsForUser.mockResolvedValue([]);
    mocks.loadLatestUnseenPipReactionForUser.mockResolvedValue(null);

    await expect(getCurrentPipCashState({ recordFreshnessViewed: false })).resolves.toMatchObject({
      pipCashTodayCents: 1234,
      freshness: {
        state: "fresh",
        hasPendingSyncJob: false,
        hasStaleInstitution: false,
      },
    });
    expect(mocks.recordProductEventSafely).not.toHaveBeenCalled();
  });
});

describe("getCurrentFinancialSnapshot", () => {
  it("uses fake transactions only when fake-data mode is explicit", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);
    mocks.isFakeDataMode.mockReturnValue(true);

    await expect(getCurrentFinancialSnapshot({ scenario: "negative" })).resolves.toMatchObject({
      settings: expect.objectContaining({
        asOfDate: expect.any(String),
      }),
    });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.loadFinancialSnapshotForUser).not.toHaveBeenCalled();
  });

  it("fails closed instead of returning fake transactions when Supabase env is missing", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);
    mocks.isFakeDataMode.mockReturnValue(false);

    await expect(getCurrentFinancialSnapshot({ scenario: "negative" })).rejects.toBeInstanceOf(
      SupabaseConfigError,
    );
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.loadFinancialSnapshotForUser).not.toHaveBeenCalled();
  });

  it("requires authentication instead of returning fake transactions when Supabase is configured", async () => {
    const supabase = createSupabaseClient(null);

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);

    await expect(getCurrentFinancialSnapshot({ scenario: "negative" })).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(mocks.loadFinancialSnapshotForUser).not.toHaveBeenCalled();
  });

  it("does not fall back to fake transactions for authenticated users without financial rows", async () => {
    const supabase = createSupabaseClient({ id: "user-1" });

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.loadFinancialSnapshotForUser.mockResolvedValue(null);

    await expect(getCurrentFinancialSnapshot({})).rejects.toBeInstanceOf(NoFinancialDataError);
  });
});

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
