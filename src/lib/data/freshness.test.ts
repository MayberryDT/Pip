import { describe, expect, it } from "vitest";
import { getDataFreshnessState } from "@/lib/data/freshness";
import type { SyncStatus } from "@/lib/data/sync-status";

describe("getDataFreshnessState", () => {
  it("prioritizes repair-required institutions", () => {
    expect(
      getDataFreshnessState({
        syncStatus: status({
          institution: {
            status: "failed",
            errorCode: "item-login-required",
            isStale: true,
          },
        }),
        pendingJobs: [{ status: "running" }],
      }),
    ).toBe("needs_repair");
  });

  it("reports syncing when a pending or running job exists", () => {
    expect(
      getDataFreshnessState({
        syncStatus: status(),
        pendingJobs: [{ status: "pending" }],
      }),
    ).toBe("syncing");
  });

  it("maps latest failed, partial, stale, and clean states", () => {
    expect(
      getDataFreshnessState({
        syncStatus: status({
          latestStatus: "failed",
        }),
      }),
    ).toBe("failed");
    expect(
      getDataFreshnessState({
        syncStatus: status({
          latestStatus: "partial",
        }),
      }),
    ).toBe("partial");
    expect(
      getDataFreshnessState({
        syncStatus: status({
          institution: {
            isStale: true,
          },
        }),
      }),
    ).toBe("stale");
    expect(getDataFreshnessState({ syncStatus: status() })).toBe("fresh");
  });
});

function status(input: {
  latestStatus?: NonNullable<SyncStatus["latestSyncRun"]>["status"];
  institution?: Partial<SyncStatus["institutions"][number]>;
} = {}): SyncStatus {
  const institution = {
    id: "institution-1",
    institutionName: "Plaid Bank",
    provider: "plaid" as const,
    status: "connected" as const,
    lastSuccessfulSyncAt: "2026-06-11T10:00:00.000Z",
    staleAfter: "2026-06-12T10:00:00.000Z",
    isStale: false,
    errorCode: null,
    errorMessage: null,
    ...input.institution,
  };

  return {
    institutions: [institution],
    latestSyncRun: {
      provider: "plaid",
      status: input.latestStatus ?? "succeeded",
      startedAt: "2026-06-11T10:00:00.000Z",
      completedAt: "2026-06-11T10:00:05.000Z",
      accountCount: 1,
      transactionCount: 1,
      balanceCount: 1,
      errorMessage: null,
    },
    hasStaleInstitution: institution.isStale,
  };
}
