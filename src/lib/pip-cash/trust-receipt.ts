import { formatMoney } from "@/lib/money";
import { getDisplayedSpendableCashTodayCents } from "@/lib/pip-cash/spendable-cash-today";
import type { MoneyTone, PipCashResult } from "@/lib/types";

export type TrustReceiptSyncStatus = {
  institutions: Array<{
    id: string;
    institutionName: string;
    provider: string;
    status: string;
    lastSuccessfulSyncAt?: string | null;
    isStale?: boolean;
  }>;
  latestSyncRun?: {
    status: string;
    completedAt?: string | null;
    startedAt?: string | null;
    accountCount?: number;
    transactionCount?: number;
    balanceCount?: number;
  } | null;
  hasStaleInstitution?: boolean;
} | null;

export type SpendableTrustReceipt = {
  title: string;
  summary: string;
  asOfLabel: string;
  rows: Array<{
    id: string;
    label: string;
    value: string;
    detail: string;
    tone: MoneyTone;
  }>;
  knownLimits: Array<{
    id: string;
    label: string;
    detail: string;
  }>;
  footer: string;
};

export function buildSpendableTrustReceipt(input: {
  result: PipCashResult;
  syncStatus?: TrustReceiptSyncStatus;
  now?: Date;
}): SpendableTrustReceipt {
  const result = input.result;
  const metric = result.spendableCashToday;
  const syncStatus = input.syncStatus ?? null;
  const latestSuccessfulSyncAt = getLatestSuccessfulSyncAt(syncStatus);
  const activeAccountCount = result.trueBalances.filter((account) =>
    account.active !== false && account.includedInPipCash !== false,
  ).length;
  const connectedInstitutionCount = syncStatus?.institutions.length ?? 0;
  const hasStaleConnection = Boolean(
    syncStatus?.hasStaleInstitution ||
      syncStatus?.institutions.some((institution) =>
        institution.isStale || ["stale", "failed", "revoked"].includes(institution.status),
      ),
  );
  const pendingCommittedSpendCents = metric?.pendingCommittedSpendCents ?? 0;
  const confidence = metric?.confidence ?? (result.dataStates.length > 0 ? "medium" : "high");
  const knownLimits = [
    ...(hasStaleConnection
      ? [{
          id: "stale-connection",
          label: "Connection needs attention",
          detail: "At least one connected institution is stale, failed, revoked, or past its stale-after time.",
        }]
      : []),
    ...(metric?.dataStates ?? result.dataStates).map((state) => ({
      id: state.id,
      label: state.label,
      detail: state.detail,
    })),
    ...(metric?.warnings ?? result.warnings).map((warning) => ({
      id: warning.id,
      label: warning.label,
      detail: warning.detail,
    })),
  ];
  const asOfLabel = latestSuccessfulSyncAt
    ? `Connected data refreshed ${formatShortDateTime(latestSuccessfulSyncAt)}`
    : `Current money window ends ${formatShortDate(result.window.endDate)}`;

  return {
    title: "Trust receipt",
    summary: `${formatMoney(getDisplayedSpendableCashTodayCents(result))} is based on connected data and visible constraints through the current receipt.`,
    asOfLabel,
    rows: [
      {
        id: "freshness",
        label: "Data freshness",
        value: latestSuccessfulSyncAt ? "Refreshed" : "No sync time",
        detail: latestSuccessfulSyncAt
          ? `Last successful provider refresh: ${formatShortDateTime(latestSuccessfulSyncAt)}.`
          : "No successful provider refresh time is available in this view.",
        tone: hasStaleConnection ? "warning" : "neutral",
      },
      {
        id: "accounts",
        label: "Accounts counted",
        value: `${activeAccountCount}`,
        detail: connectedInstitutionCount > 0
          ? `${activeAccountCount} active account${activeAccountCount === 1 ? "" : "s"} across ${connectedInstitutionCount} connected institution${connectedInstitutionCount === 1 ? "" : "s"}.`
          : `${activeAccountCount} active account${activeAccountCount === 1 ? "" : "s"} in the current money snapshot.`,
        tone: activeAccountCount > 0 ? "neutral" : "warning",
      },
      {
        id: "time-horizon",
        label: "Time horizon",
        value: "Today",
        detail: `Calculated for ${formatShortDate(result.window.endDate)} using the current daily metric, not a month-end promise.`,
        tone: "neutral",
      },
      {
        id: "pending",
        label: "Pending spend",
        value: formatMoney(-pendingCommittedSpendCents),
        detail: pendingCommittedSpendCents > 0
          ? "Pending committed spend is already held against the daily number."
          : "No pending committed spend is currently held in this receipt.",
        tone: pendingCommittedSpendCents > 0 ? "warning" : "neutral",
      },
      {
        id: "confidence",
        label: "Confidence",
        value: confidence,
        detail: confidence === "low"
          ? "The calculation is more conservative because connected data is limited."
          : "Confidence comes from the available account and transaction pattern.",
        tone: confidence === "low" ? "warning" : "neutral",
      },
    ],
    knownLimits: dedupeLimits(knownLimits),
    footer:
      "This receipt explains the current estimate. Cash spending, shared accounts, missing accounts, refunds, transfers, and manually paid bills can still change the picture.",
  };
}

export function formatTrustReceiptInline(receipt: SpendableTrustReceipt): string {
  const limits = receipt.knownLimits.length > 0
    ? `${receipt.knownLimits.length} known limit${receipt.knownLimits.length === 1 ? "" : "s"}`
    : "no active warning";

  return `${receipt.asOfLabel}; ${limits}.`;
}

function getLatestSuccessfulSyncAt(syncStatus: TrustReceiptSyncStatus): string | null {
  const institutionSyncs = (syncStatus?.institutions ?? [])
    .map((institution) => institution.lastSuccessfulSyncAt)
    .filter((value): value is string => Boolean(value));
  const latestRunCompletedAt =
    syncStatus?.latestSyncRun?.status === "completed" ? syncStatus.latestSyncRun.completedAt : null;
  const candidates = [
    ...institutionSyncs,
    ...(latestRunCompletedAt ? [latestRunCompletedAt] : []),
  ];

  return candidates.sort((a, b) => b.localeCompare(a))[0] ?? null;
}

function dedupeLimits(
  limits: SpendableTrustReceipt["knownLimits"],
): SpendableTrustReceipt["knownLimits"] {
  const seen = new Set<string>();

  return limits.filter((limit) => {
    const key = `${limit.id}:${limit.label}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  }).slice(0, 6);
}

function formatShortDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
