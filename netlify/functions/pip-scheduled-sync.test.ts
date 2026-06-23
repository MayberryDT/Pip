import { beforeEach, describe, expect, it, vi } from "vitest";
import pipScheduledSync from "./pip-scheduled-sync";

const scheduledSyncMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  enqueueScheduledPipSyncJobs: vi.fn(),
  getPipSyncFeatureFlags: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  processPendingPipSyncJobs: vi.fn(),
}));

vi.mock("../../src/lib/data/feature-flags", () => ({
  getPipSyncFeatureFlags: scheduledSyncMocks.getPipSyncFeatureFlags,
}));

vi.mock("../../src/lib/data/sync-jobs", () => ({
  enqueueScheduledPipSyncJobs: scheduledSyncMocks.enqueueScheduledPipSyncJobs,
  processPendingPipSyncJobs: scheduledSyncMocks.processPendingPipSyncJobs,
}));

vi.mock("../../src/lib/supabase/admin", () => ({
  createSupabaseAdminClient: scheduledSyncMocks.createSupabaseAdminClient,
}));

vi.mock("../../src/lib/supabase/env", () => ({
  isSupabaseConfigured: scheduledSyncMocks.isSupabaseConfigured,
}));

beforeEach(() => {
  vi.clearAllMocks();
  scheduledSyncMocks.createSupabaseAdminClient.mockReturnValue({
    kind: "admin",
  });
  scheduledSyncMocks.getPipSyncFeatureFlags.mockReturnValue({
    syncJobsEnabled: true,
    scheduledSyncEnabled: true,
    scheduledSyncBatchSize: 25,
    scheduledSyncMaxJobs: 50,
    scheduledSyncMinIntervalMinutes: 240,
  });
  scheduledSyncMocks.isSupabaseConfigured.mockReturnValue(true);
  scheduledSyncMocks.enqueueScheduledPipSyncJobs.mockResolvedValue({
    scanned: 2,
    enqueued: 1,
    deduped: 0,
  });
  scheduledSyncMocks.processPendingPipSyncJobs.mockResolvedValue({
    claimed: 1,
    succeeded: 1,
    retrying: 0,
    failed: 0,
  });
});

describe("pip-scheduled-sync", () => {
  it("skips all work when sync jobs are disabled", async () => {
    scheduledSyncMocks.getPipSyncFeatureFlags.mockReturnValue({
      syncJobsEnabled: false,
      scheduledSyncEnabled: true,
      scheduledSyncBatchSize: 25,
      scheduledSyncMaxJobs: 50,
      scheduledSyncMinIntervalMinutes: 240,
    });

    const response = await pipScheduledSync();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "skipped",
      reason: "sync-jobs-disabled",
    });
    expect(scheduledSyncMocks.enqueueScheduledPipSyncJobs).not.toHaveBeenCalled();
    expect(scheduledSyncMocks.processPendingPipSyncJobs).not.toHaveBeenCalled();
  });

  it("processes pending webhook jobs when scheduled enqueueing is disabled", async () => {
    scheduledSyncMocks.getPipSyncFeatureFlags.mockReturnValue({
      syncJobsEnabled: true,
      scheduledSyncEnabled: false,
      scheduledSyncBatchSize: 25,
      scheduledSyncMaxJobs: 50,
      scheduledSyncMinIntervalMinutes: 240,
    });

    const response = await pipScheduledSync();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "processed",
      enqueue: {
        scanned: 0,
        enqueued: 0,
        deduped: 0,
      },
      processed: {
        claimed: 1,
        succeeded: 1,
        retrying: 0,
        failed: 0,
      },
    });
    expect(scheduledSyncMocks.enqueueScheduledPipSyncJobs).not.toHaveBeenCalled();
    expect(scheduledSyncMocks.processPendingPipSyncJobs).toHaveBeenCalledWith(
      {
        kind: "admin",
      },
      {
        limit: 50,
        now: expect.any(Date),
      },
    );
  });
});
