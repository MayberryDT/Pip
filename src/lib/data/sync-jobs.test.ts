import { afterEach, describe, expect, it, vi } from "vitest";

const syncJobMocks = vi.hoisted(() => ({
  runProviderSync: vi.fn(),
  recordProductEventSafely: vi.fn(),
}));

vi.mock("@/lib/data/manual-sync", () => ({
  runProviderSync: syncJobMocks.runProviderSync,
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: syncJobMocks.recordProductEventSafely,
}));

import {
  claimPendingPipSyncJobs,
  enqueuePipSyncJob,
  enqueueScheduledPipSyncJobs,
  processPipSyncJob,
} from "@/lib/data/sync-jobs";
import { ProviderSyncError } from "@/lib/providers/provider-errors";

afterEach(() => {
  vi.clearAllMocks();
});

describe("Pip sync jobs", () => {
  it("enqueues a deduped sync job and records creation analytics", async () => {
    const supabase = createSyncJobsClient();

    await expect(
      enqueuePipSyncJob(supabase.client, {
        userId: "user-1",
        provider: "plaid",
        reason: "plaid_webhook",
        institutionId: "institution-1",
        sourceWebhookEventId: "webhook-1",
        now: new Date("2026-06-05T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      created: true,
      job: {
        id: "job-1",
        dedupe_key: "plaid_webhook:plaid:institution-1",
      },
    });
    expect(supabase.inserts[0]).toMatchObject({
      user_id: "user-1",
      provider: "plaid",
      reason: "plaid_webhook",
      institution_id: "institution-1",
      priority: 50,
      dedupe_key: "plaid_webhook:plaid:institution-1",
    });
    expect(syncJobMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase.client,
      "user-1",
      "pip_sync_job_created",
      expect.objectContaining({
        reason: "plaid_webhook",
      }),
    );
  });

  it("returns an active job when enqueue hits the dedupe index", async () => {
    const supabase = createSyncJobsClient({
      insertError: {
        code: "23505",
        message: "duplicate key",
      },
      existingJob: {
        id: "existing-job",
        user_id: "user-1",
        provider: "plaid",
        institution_id: "institution-1",
        reason: "plaid_webhook",
        status: "pending",
        dedupe_key: "plaid_webhook:plaid:institution-1",
      },
    });

    await expect(
      enqueuePipSyncJob(supabase.client, {
        userId: "user-1",
        provider: "plaid",
        reason: "plaid_webhook",
        institutionId: "institution-1",
      }),
    ).resolves.toMatchObject({
      created: false,
      job: {
        id: "existing-job",
      },
    });
    expect(syncJobMocks.recordProductEventSafely).not.toHaveBeenCalled();
  });

  it("claims pending jobs with an incremented attempt count", async () => {
    const supabase = createSyncJobsClient({
      pendingJobs: [
        {
          id: "job-1",
          attempts: 0,
          status: "pending",
        },
      ],
    });

    await expect(
      claimPendingPipSyncJobs(supabase.client, {
        limit: 10,
        now: new Date("2026-06-05T12:00:00.000Z"),
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "job-1",
        attempts: 1,
        status: "running",
      }),
    ]);
    expect(supabase.updates[0]).toMatchObject({
      status: "running",
      attempts: 1,
      started_at: "2026-06-05T12:00:00.000Z",
    });
  });

  it("marks a job succeeded after provider sync completes", async () => {
    const supabase = createSyncJobsClient();
    syncJobMocks.runProviderSync.mockResolvedValue({
      syncRunId: "sync-run-1",
      provider: "plaid",
      institutionId: "institution-1",
      institutionIds: ["institution-1"],
      status: "succeeded",
      accountCount: 2,
      transactionCount: 14,
      balanceCount: 2,
      pipCashTodayCents: 12000,
      failedInstitutionCount: 0,
      failures: [],
      createdReactionType: "small_lift",
    });

    await expect(
      processPipSyncJob(supabase.client, baseJob(), {
        now: new Date("2026-06-05T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      status: "succeeded",
      jobId: "job-1",
    });
    expect(syncJobMocks.runProviderSync).toHaveBeenCalledWith(supabase.client, {
      userId: "user-1",
      provider: "plaid",
      reason: "plaid_webhook",
      institutionId: "institution-1",
      now: new Date("2026-06-05T12:00:00.000Z"),
    });
    expect(supabase.updates[0]).toMatchObject({
      status: "succeeded",
      completed_at: "2026-06-05T12:00:00.000Z",
      account_count: 2,
      transaction_count: 14,
      balance_count: 2,
      created_reaction_type: "small_lift",
    });
  });

  it("retries failed jobs with exponential backoff until max attempts", async () => {
    const supabase = createSyncJobsClient();
    syncJobMocks.runProviderSync.mockRejectedValue(new Error("access_token=secret failed"));

    await expect(
      processPipSyncJob(
        supabase.client,
        {
          ...baseJob(),
          attempts: 1,
          max_attempts: 3,
        },
        {
          now: new Date("2026-06-05T12:00:00.000Z"),
        },
      ),
    ).resolves.toEqual({
      jobId: "job-1",
      status: "retrying",
      error: "access_token=[redacted] failed",
      availableAt: "2026-06-05T12:05:00.000Z",
    });
    expect(supabase.updates[0]).toMatchObject({
      status: "pending",
      available_at: "2026-06-05T12:05:00.000Z",
      last_error: "access_token=[redacted] failed",
    });
  });

  it("does not retry provider failures that require user repair", async () => {
    const supabase = createSyncJobsClient();
    syncJobMocks.runProviderSync.mockRejectedValue(
      new ProviderSyncError({
        provider: "plaid",
        code: "item-login-required",
        message: "This connection needs repair.",
        status: "failed",
        repairRequired: true,
      }),
    );

    await expect(
      processPipSyncJob(
        supabase.client,
        {
          ...baseJob(),
          attempts: 1,
          max_attempts: 3,
        },
        {
          now: new Date("2026-06-05T12:00:00.000Z"),
        },
      ),
    ).resolves.toEqual({
      jobId: "job-1",
      status: "failed",
      error: "This connection needs repair.",
    });
    expect(supabase.updates[0]).toMatchObject({
      status: "failed",
      completed_at: "2026-06-05T12:00:00.000Z",
      last_error: "This connection needs repair.",
    });
  });

  it("skips scheduled jobs for users still set to manual-refresh-only", async () => {
    const supabase = createScheduledSyncClient();

    await expect(
      enqueueScheduledPipSyncJobs(supabase.client, {
        limit: 10,
        minIntervalMinutes: 240,
        now: new Date("2026-06-05T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      scanned: 2,
      enqueued: 1,
      deduped: 0,
    });
    expect(supabase.inserts).toEqual([
      expect.objectContaining({
        user_id: "user-background",
        institution_id: "institution-background",
        reason: "scheduled",
      }),
    ]);
  });
});

function createSyncJobsClient(
  input: {
    insertError?: Record<string, unknown>;
    existingJob?: Record<string, unknown>;
    pendingJobs?: Record<string, unknown>[];
  } = {},
) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];

  const client = {
    from(tableName: string) {
      expect(tableName).toBe("pip_sync_jobs");

      return {
        insert(row: Record<string, unknown>) {
          inserts.push(row);

          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: input.insertError
                      ? null
                      : {
                          id: "job-1",
                          status: "pending",
                          attempts: 0,
                          max_attempts: 3,
                          ...row,
                        },
                    error: input.insertError ?? null,
                  });
                },
              };
            },
          };
        },
        select() {
          return query;
        },
        update(row: Record<string, unknown>) {
          updates.push(row);

          return query;
        },
      };
    },
  };

  const query = {
    eq() {
      return query;
    },
    in() {
      return query;
    },
    lte() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      if (input.pendingJobs) {
        return Promise.resolve({
          data: input.pendingJobs,
          error: null,
        });
      }

      return query;
    },
    select() {
      return query;
    },
    maybeSingle() {
      const latestUpdate = updates.at(-1);

      return Promise.resolve({
        data: latestUpdate?.status === "running"
          ? {
              ...baseJob(),
              ...input.pendingJobs?.[0],
              ...latestUpdate,
            }
          : input.existingJob ?? null,
        error: null,
      });
    },
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(resolve({ error: null })).catch(reject);
    },
  };

  return {
    client: client as never,
    inserts,
    updates,
  };
}

function baseJob() {
  return {
    id: "job-1",
    user_id: "user-1",
    provider: "plaid",
    institution_id: "institution-1",
    reason: "plaid_webhook",
    status: "running",
    source_webhook_event_id: "webhook-1",
    attempts: 1,
    max_attempts: 3,
    priority: 50,
    dedupe_key: "plaid_webhook:plaid:institution-1",
    available_at: "2026-06-05T12:00:00.000Z",
    started_at: "2026-06-05T12:00:00.000Z",
    completed_at: null,
    account_count: 0,
    transaction_count: 0,
    balance_count: 0,
    created_reaction_type: null,
    last_error: null,
    created_at: "2026-06-05T12:00:00.000Z",
    updated_at: "2026-06-05T12:00:00.000Z",
  } as const;
}

function createScheduledSyncClient() {
  const inserts: Record<string, unknown>[] = [];
  const client = {
    from(tableName: string) {
      if (tableName === "connected_institutions") {
        const query = {
          select() {
            return query;
          },
          eq() {
            return query;
          },
          in() {
            return query;
          },
          or() {
            return query;
          },
          order() {
            return query;
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  id: "institution-manual",
                  user_id: "user-manual",
                  provider: "plaid",
                  last_successful_sync_at: "2026-06-04T12:00:00.000Z",
                },
                {
                  id: "institution-background",
                  user_id: "user-background",
                  provider: "plaid",
                  last_successful_sync_at: "2026-06-04T12:00:00.000Z",
                },
              ],
              error: null,
            });
          },
        };

        return query;
      }

      if (tableName === "user_settings") {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({
                  data: [
                    {
                      user_id: "user-manual",
                      manual_refresh_only: true,
                    },
                    {
                      user_id: "user-background",
                      manual_refresh_only: false,
                    },
                  ],
                  error: null,
                });
              },
            };
          },
        };
      }

      expect(tableName).toBe("pip_sync_jobs");

      return {
        insert(row: Record<string, unknown>) {
          inserts.push(row);

          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: {
                      id: "job-1",
                      ...row,
                    },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    client: client as never,
    inserts,
  };
}
