import { describe, expect, it } from "vitest";
import { getDataFreshnessState } from "@/lib/data/freshness";
import type { SyncStatus } from "@/lib/data/sync-status";

const repairablePlaidErrorCodes = [
  "item-login-required",
  "invalid-credentials",
  "invalid-mfa",
  "item-locked",
  "mfa-not-supported",
  "user-setup-required",
  "invalid-access-token",
  "item-not-found",
  "user-permission-revoked",
  "user-account-revoked",
  "access-not-granted",
  "no-accounts",
];

describe("getDataFreshnessState", () => {
  it("reports fresh when sync status is clean", () => {
    expect(getDataFreshnessState({ syncStatus: status() })).toBe("fresh");
  });

  it("reports stale when sync status is missing", () => {
    expect(getDataFreshnessState({ syncStatus: null })).toBe("stale");
  });

  it("reports stale when an institution is stale", () => {
    expect(
      getDataFreshnessState({
        syncStatus: status({
          institution: {
            isStale: true,
          },
        }),
      }),
    ).toBe("stale");
  });

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

  it.each(repairablePlaidErrorCodes)(
    "maps repairable Plaid code %s to needs_repair",
    (errorCode) => {
      expect(
        getDataFreshnessState({
          syncStatus: status({
            institution: {
              provider: "plaid",
              status: "failed",
              errorCode,
            },
          }),
        }),
      ).toBe("needs_repair");
    },
  );

  it("normalizes uppercase underscore Plaid error codes before repair checks", () => {
    expect(
      getDataFreshnessState({
        syncStatus: status({
          institution: {
            provider: "plaid",
            status: "failed",
            errorCode: "ITEM_LOGIN_REQUIRED",
          },
        }),
      }),
    ).toBe("needs_repair");
  });

  it("maps reconnect-required provider failures to needs_repair", () => {
    expect(
      getDataFreshnessState({
        syncStatus: status({
          institution: {
            status: "failed",
            errorCode: "provider-token-decrypt-failed",
          },
        }),
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

  it("reports failed when the latest sync failed", () => {
    expect(
      getDataFreshnessState({
        syncStatus: status({
          latestStatus: "failed",
        }),
      }),
    ).toBe("failed");
  });

  it("reports partial when the latest sync partially completed", () => {
    expect(
      getDataFreshnessState({
        syncStatus: status({
          latestStatus: "partial",
        }),
      }),
    ).toBe("partial");
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
