export type FinancialProvider = "mock" | "teller" | "plaid";

export type SyncStatusResponse = {
  institutions: Array<{
    id: string;
    institutionName: string;
    provider: string;
    status: string;
    lastSuccessfulSyncAt: string | null;
    staleAfter: string | null;
    isStale: boolean;
    errorMessage: string | null;
  }>;
  latestSyncRun: {
    provider: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    accountCount: number;
    transactionCount: number;
    balanceCount: number;
    errorMessage: string | null;
  } | null;
  hasStaleInstitution: boolean;
};

export type PlaidConnectRequest = {
  mode: "connect" | "repair";
  institutionId?: string;
};

export function canRefreshData(syncStatus: SyncStatusResponse | null): boolean {
  return Boolean(getRefreshProvider(syncStatus)) && !getRepairablePlaidInstitution(syncStatus);
}

export function getRefreshProvider(syncStatus: SyncStatusResponse | null): FinancialProvider | null {
  const connectedProvider = syncStatus?.institutions.find((institution) =>
    institution.provider === "plaid" || institution.provider === "teller",
  )?.provider;

  if (connectedProvider === "plaid" || connectedProvider === "teller") {
    return connectedProvider;
  }

  return null;
}

export function getRefreshLabel(syncStatus: SyncStatusResponse | null): string {
  if (!getRefreshProvider(syncStatus)) {
    return "Connect data first";
  }

  if (getRepairablePlaidInstitution(syncStatus)) {
    return "Refresh after repair";
  }

  return "Refresh data";
}

export function getConnectLabel(syncStatus: SyncStatusResponse | null): string {
  if (!syncStatus || syncStatus.institutions.length === 0) {
    return "Connect data";
  }

  if (getRepairablePlaidInstitution(syncStatus)) {
    return "Repair connection";
  }

  return "Reconnect data";
}

export function getPlaidConnectRequest(syncStatus: SyncStatusResponse | null): PlaidConnectRequest {
  const repairInstitution = getRepairablePlaidInstitution(syncStatus);

  if (repairInstitution) {
    return {
      mode: "repair",
      institutionId: repairInstitution.id,
    };
  }

  return {
    mode: "connect",
  };
}

export function getConnectionStatusMessage(syncStatus: SyncStatusResponse | null): string | null {
  if (!syncStatus) {
    return null;
  }

  const repairInstitution = getRepairablePlaidInstitution(syncStatus);

  if (repairInstitution) {
    return `${repairInstitution.institutionName} needs repair. Use Repair connection before relying on refreshed Spendable Cash.`;
  }

  const staleInstitutions = syncStatus.institutions.filter((institution) => institution.isStale);

  if (staleInstitutions.length === 1) {
    return `${staleInstitutions[0].institutionName} data is stale. Refresh before relying on Spendable Cash.`;
  }

  if (staleInstitutions.length > 1) {
    return `${staleInstitutions.length} connections have stale data. Refresh before relying on Spendable Cash.`;
  }

  return null;
}

export function getLatestSyncRunMessage(syncStatus: SyncStatusResponse | null): string | null {
  const latestSyncRun = syncStatus?.latestSyncRun;

  if (!latestSyncRun) {
    return null;
  }

  if (latestSyncRun.status === "failed") {
    return latestSyncRun.errorMessage
      ? `Last refresh failed: ${latestSyncRun.errorMessage}`
      : "Last refresh failed.";
  }

  if (latestSyncRun.status === "partial") {
    return latestSyncRun.errorMessage
      ? `Last refresh updated usable data, but ${latestSyncRun.errorMessage}`
      : "Last refresh updated usable data, but one connection needs attention.";
  }

  return null;
}

export function formatLastRefresh(syncStatus: SyncStatusResponse | null): string {
  const latestInstitutionSync = syncStatus?.institutions
    .map((institution) => institution.lastSuccessfulSyncAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  if (!latestInstitutionSync) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(latestInstitutionSync));
}

function getRepairablePlaidInstitution(syncStatus: SyncStatusResponse | null) {
  return syncStatus?.institutions.find((institution) => {
    if (institution.provider !== "plaid") {
      return false;
    }

    return ["failed", "stale", "revoked"].includes(institution.status);
  });
}
