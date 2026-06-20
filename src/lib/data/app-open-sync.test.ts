import { describe, expect, it } from "vitest";
import { getAppOpenSyncDecision } from "@/lib/data/app-open-sync";
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
        hasPendingSyncJob: false,
        now: new Date("2026-06-16T12:00:00.000Z"),
      }),
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus(),
        hasPendingSyncJob: true,
        now: new Date("2026-06-16T12:00:00.000Z"),
      }),
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus({
          institutions: [],
        }),
        hasPendingSyncJob: false,
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
        hasPendingSyncJob: false,
        now: new Date("2026-06-16T12:00:00.000Z"),
      }),
    ];

    expect(decisions.map((decision) => decision.reason)).toEqual([
      "app_open_check",
      "sync_in_flight",
      "no_refreshable_provider",
      "provider_needs_repair",
    ]);
    for (const decision of decisions) {
      expect(decision.reason).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("runs for connected data that is fresh but outside the short duplicate guard", () => {
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
    ).toEqual({
      status: "run",
      provider: "plaid",
      reason: "app_open_check",
    });
  });

  it("runs for same-day successful data when no duplicate sync just started", () => {
    expect(
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus({
          institutions: [
            createInstitution({
              lastSuccessfulSyncAt: "2026-06-16T12:05:00.000Z",
              staleAfter: "2026-06-17T12:05:00.000Z",
              isStale: false,
            }),
          ],
        }),
        hasPendingSyncJob: false,
        now: new Date("2026-06-16T12:05:10.000Z"),
      }),
    ).toEqual({
      status: "run",
      provider: "plaid",
      reason: "app_open_check",
    });
  });

  it("skips only a short duplicate provider run that just started", () => {
    expect(
      getAppOpenSyncDecision({
        syncStatus: createSyncStatus({
          latestSyncRun: {
            provider: "plaid",
            status: "started",
            startedAt: "2026-06-16T12:00:30.000Z",
            completedAt: null,
            accountCount: 0,
            transactionCount: 0,
            balanceCount: 0,
            errorMessage: null,
          },
        }),
        hasPendingSyncJob: false,
        now: new Date("2026-06-16T12:01:00.000Z"),
      }),
    ).toMatchObject({
      status: "skipped_recent",
      reason: "recent_duplicate",
      retryAfterSeconds: 30,
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
