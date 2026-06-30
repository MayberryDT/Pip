import { describe, expect, it } from "vitest";
import {
  canRefreshData,
  formatLastRefresh,
  getConnectionStatusMessage,
  getConnectLabel,
  getLatestSyncRunMessage,
  getPlaidConnectRequest,
  getRefreshLabel,
  getRefreshProvider,
  shouldRefreshConnectedDataForToday,
  type SyncStatusResponse,
} from "@/components/data-controls-helpers";

describe("data control helpers", () => {
  it("uses connect copy and no refresh provider when no real institution is connected", () => {
    const status = createSyncStatus({ institutions: [] });

    expect(getConnectLabel(status)).toBe("Connect data");
    expect(getRefreshProvider(status)).toBeNull();
    expect(canRefreshData(status)).toBe(false);
    expect(getRefreshLabel(status)).toBe("Connect data first");
    expect(getPlaidConnectRequest(status)).toEqual({ mode: "connect" });
    expect(getConnectionStatusMessage(status)).toBeNull();
    expect(formatLastRefresh(status)).toBe("Never");
  });

  it.each([
    ["login-required error", { isStale: false, status: "failed", errorCode: "item-login-required" }],
    ["revoked status", { isStale: false, status: "revoked" }],
  ])("switches Plaid into repair mode for a %s institution", (_name, overrides) => {
    const status = createSyncStatus({
      hasStaleInstitution: overrides.isStale,
      institutions: [
        createInstitution({
          id: "institution_plaid_1",
          provider: "plaid",
          ...overrides,
        }),
      ],
    });

    expect(getConnectLabel(status)).toBe("Repair connection");
    expect(getRefreshProvider(status)).toBe("plaid");
    expect(canRefreshData(status)).toBe(false);
    expect(getRefreshLabel(status)).toBe("Refresh after repair");
    expect(getPlaidConnectRequest(status)).toEqual({
      mode: "repair",
      institutionId: "institution_plaid_1",
    });
    expect(getConnectionStatusMessage(status)).toBe(
      "Test Bank needs repair. Use Repair connection before relying on refreshed Spendable Cash Today.",
    );
  });

  it("treats non-repair Plaid failures as refreshable", () => {
    const status = createSyncStatus({
      hasStaleInstitution: true,
      institutions: [
        createInstitution({
          id: "institution_plaid_1",
          institutionName: "Wise (US)",
          provider: "plaid",
          status: "failed",
          isStale: true,
          errorCode: "invalid-product",
          errorMessage: "client is not authorized to access the following products: [\"balance\"]",
        }),
      ],
    });

    expect(getConnectLabel(status)).toBe("Reconnect data");
    expect(getRefreshProvider(status)).toBe("plaid");
    expect(canRefreshData(status)).toBe(true);
    expect(getRefreshLabel(status)).toBe("Refresh data");
    expect(getPlaidConnectRequest(status)).toEqual({ mode: "connect" });
    expect(getConnectionStatusMessage(status)).toBe(
      "Wise (US) data is stale. Refresh before relying on Spendable Cash Today.",
    );
  });

  it("treats stale-by-time Plaid data as refreshable instead of repair-only", () => {
    const status = createSyncStatus({
      hasStaleInstitution: true,
      institutions: [
        createInstitution({
          institutionName: "Plaid Bank",
          provider: "plaid",
          status: "connected",
          isStale: true,
        }),
      ],
    });

    expect(getConnectLabel(status)).toBe("Reconnect data");
    expect(getRefreshProvider(status)).toBe("plaid");
    expect(canRefreshData(status)).toBe(true);
    expect(getRefreshLabel(status)).toBe("Refresh data");
    expect(getPlaidConnectRequest(status)).toEqual({ mode: "connect" });
    expect(getConnectionStatusMessage(status)).toBe(
      "Plaid Bank data is stale. Refresh before relying on Spendable Cash Today.",
    );
  });

  it("summarizes multiple stale connections without forcing a dashboard", () => {
    const status = createSyncStatus({
      hasStaleInstitution: true,
      institutions: [
        createInstitution({
          provider: "plaid",
          status: "connected",
          isStale: true,
        }),
        createInstitution({
          provider: "teller",
          status: "connected",
          isStale: true,
        }),
      ],
    });

    expect(getConnectionStatusMessage(status)).toBe(
      "2 connections have stale data. Refresh before relying on Spendable Cash Today.",
    );
  });

  it("does not advertise repair when the latest failed sync has no repairable Plaid institution", () => {
    const status = createSyncStatus({
      latestSyncRun: createSyncRun({ status: "failed", errorMessage: "Temporary provider outage." }),
      institutions: [
        createInstitution({
          provider: "plaid",
          status: "connected",
          isStale: false,
        }),
      ],
    });

    expect(getConnectLabel(status)).toBe("Reconnect data");
    expect(getPlaidConnectRequest(status)).toEqual({ mode: "connect" });
    expect(getLatestSyncRunMessage(status)).toBe("Last refresh failed: Temporary provider outage.");
  });

  it("uses reconnect copy for a healthy existing institution", () => {
    const status = createSyncStatus({
      institutions: [
        createInstitution({
          provider: "plaid",
          status: "connected",
          isStale: false,
        }),
      ],
    });

    expect(getConnectLabel(status)).toBe("Reconnect data");
    expect(getRefreshProvider(status)).toBe("plaid");
    expect(canRefreshData(status)).toBe(true);
    expect(getRefreshLabel(status)).toBe("Refresh data");
    expect(getPlaidConnectRequest(status)).toEqual({ mode: "connect" });
    expect(getConnectionStatusMessage(status)).toBeNull();
  });

  it("can still refresh a legacy Teller institution without exposing Teller browser tokens", () => {
    const status = createSyncStatus({
      institutions: [
        createInstitution({
          provider: "teller",
          status: "connected",
          isStale: false,
        }),
      ],
    });

    expect(getRefreshProvider(status)).toBe("teller");
    expect(canRefreshData(status)).toBe(true);
    expect(getConnectLabel(status)).toBe("Reconnect data");
    expect(getPlaidConnectRequest(status)).toEqual({ mode: "connect" });
  });

  it("keeps partial sync copy concise while showing usable-data status", () => {
    const status = createSyncStatus({
      latestSyncRun: createSyncRun({
        status: "partial",
        errorMessage: "1 connected institution could not refresh.",
      }),
    });

    expect(getLatestSyncRunMessage(status)).toBe(
      "Last refresh updated usable data, but 1 connected institution could not refresh.",
    );
  });

  it("formats the newest successful institution sync", () => {
    const status = createSyncStatus({
      institutions: [
        createInstitution({
          lastSuccessfulSyncAt: "2026-01-01T18:30:00.000Z",
        }),
        createInstitution({
          lastSuccessfulSyncAt: "2026-06-06T18:30:00.000Z",
        }),
      ],
    });

    expect(formatLastRefresh(status)).toMatch(/Jun 6/);
  });

  it("requests a new-day refresh using the user's calendar day", () => {
    const status = createSyncStatus({
      institutions: [
        createInstitution({
          provider: "plaid",
          lastSuccessfulSyncAt: "2026-06-08T03:30:00.000Z",
        }),
      ],
    });

    expect(
      shouldRefreshConnectedDataForToday(
        status,
        new Date("2026-06-08T15:00:00.000Z"),
        "America/Denver",
      ),
    ).toBe(true);
  });

  it("does not refresh again when the latest sync already happened today", () => {
    const status = createSyncStatus({
      institutions: [
        createInstitution({
          provider: "plaid",
          lastSuccessfulSyncAt: "2026-06-08T15:00:00.000Z",
        }),
      ],
    });

    expect(
      shouldRefreshConnectedDataForToday(
        status,
        new Date("2026-06-08T18:00:00.000Z"),
        "America/Denver",
      ),
    ).toBe(false);
  });
});

function createSyncStatus(overrides: Partial<SyncStatusResponse> = {}): SyncStatusResponse {
  return {
    institutions: [createInstitution()],
    latestSyncRun: null,
    hasStaleInstitution: false,
    ...overrides,
  };
}

function createInstitution(
  overrides: Partial<SyncStatusResponse["institutions"][number]> = {},
): SyncStatusResponse["institutions"][number] {
  return {
    id: "institution_1",
    institutionName: "Test Bank",
    provider: "mock",
    status: "connected",
    lastSuccessfulSyncAt: null,
    staleAfter: null,
    isStale: false,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

function createSyncRun(
  overrides: Partial<NonNullable<SyncStatusResponse["latestSyncRun"]>> = {},
): NonNullable<SyncStatusResponse["latestSyncRun"]> {
  return {
    provider: "plaid",
    status: "completed",
    startedAt: "2026-06-06T18:00:00.000Z",
    completedAt: "2026-06-06T18:01:00.000Z",
    accountCount: 1,
    transactionCount: 2,
    balanceCount: 1,
    errorMessage: null,
    ...overrides,
  };
}
