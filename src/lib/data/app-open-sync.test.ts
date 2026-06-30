import { describe, expect, it } from "vitest";
import { getAppOpenSyncDecision } from "@/lib/data/app-open-sync";
import type { ActivePipSyncJobSummary } from "@/lib/data/sync-jobs";
import type { SyncStatus } from "@/lib/data/sync-status";

describe("getAppOpenSyncDecision", () => {
  it("returns normalized reasons for run and skip decisions", () => {
    const decisions = [
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus({
          institutions: [
            createInstitution({
              lastSuccessfulSyncAt: null,
              staleAfter: null,
              isStale: false,
            }),
          ],
        }),
        activeSyncJobs: [],
        now: new Date("2026-06-16T12:00:00.000Z"),
      }),
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus(),
        activeSyncJobs: [
          createActiveJob({
            reason: "scheduled",
          }),
        ],
        now: new Date("2026-06-16T12:00:00.000Z"),
      }),
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus({
          institutions: [],
        }),
        activeSyncJobs: [],
        now: new Date("2026-06-16T12:00:00.000Z"),
      }),
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus({
          institutions: [
            createInstitution({
              status: "failed",
              isStale: true,
              errorCode: "provider-token-decrypt-failed",
            }),
          ],
          hasStaleInstitution: true,
        }),
        activeSyncJobs: [],
        now: new Date("2026-06-16T12:00:00.000Z"),
      }),
    ];

    expect(decisions.map((decision) => decision.reason)).toEqual([
      "initial_sync",
      "sync_in_flight",
      "no_refreshable_provider",
      "provider_needs_repair",
    ]);
    for (const decision of decisions) {
      expect(decision.reason).toMatch(/^[a-z0-9_]+$/);
    }
  });

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

  it("runs a stale check when the latest successful sync is old enough", () => {
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

  it("skips a webhook sync waiting for its retry window", () => {
    expect(
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus(),
        activeSyncJobs: [
          createActiveJob({
            availableAt: "2026-06-16T12:05:00.000Z",
          }),
        ],
        now: new Date("2026-06-16T12:01:00.000Z"),
      }),
    ).toMatchObject({
      status: "skipped_pending",
      reason: "sync_waiting_for_retry",
    });
  });
});

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

function createActiveJob(overrides: Partial<ActivePipSyncJobSummary> = {}): ActivePipSyncJobSummary {
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
