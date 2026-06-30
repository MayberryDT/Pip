import type { PipCashFreshness } from "@/lib/data/current-snapshot";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import {
  buildRecurringActivity,
  buildSpendingBreakdown,
  type RecurringActivity,
  type SpendingBreakdown,
} from "@/lib/pip-cash/insights";
import {
  buildFinancialGuidanceContext,
  type FinancialGuidanceContext,
} from "@/lib/pip-cash/guidance-context";
import {
  buildSpendingOpportunities,
  type SpendingOpportunity,
} from "@/lib/pip-cash/spending-opportunities";
import type {
  FinancialSnapshot,
  FinancialDataState,
  MoneyTone,
  PipCashResult,
  PipCashWarning,
  SpendableCashTodayResult,
} from "@/lib/types";

export type FinancialReadDataQualityFinding = {
  id:
    | "freshness"
    | "low-confidence"
    | "missing-card"
    | "missing-cash-account"
    | "missing-credit-card"
    | "missing-data"
    | "pending-transactions"
    | "sparse-history";
  label: string;
  detail: string;
  tone: MoneyTone;
  severity: "info" | "warning" | "blocker";
};

export type FinancialReadDataQuality = {
  accountCount: number;
  transactionCount: number;
  warningCount: number;
  dataStateCount: number;
  hasMissingCardWarning: boolean;
  hasLowConfidence: boolean;
  freshnessState?: PipCashFreshness["state"];
  findings: FinancialReadDataQualityFinding[];
};

export type FinancialReadSurfaceRecommendation = {
  responseMode: "chat_only" | "show_card" | "guidance";
  cardType?: "insight_card" | "guidance_card" | "recurring_activity" | "spending_breakdown";
  reason: string;
};

export type FinancialRead = {
  asOfDate: string;
  freshness?: PipCashFreshness;
  result: PipCashResult;
  spendableCashToday: SpendableCashTodayResult | null;
  guidance: FinancialGuidanceContext;
  spendingBreakdown: SpendingBreakdown;
  recurringActivity: RecurringActivity;
  spendingOpportunities: SpendingOpportunity[];
  dataQuality: FinancialReadDataQuality;
  recommendedSurface: FinancialReadSurfaceRecommendation;
};

export function buildFinancialRead(input: {
  snapshot: FinancialSnapshot;
  freshness?: PipCashFreshness;
}): FinancialRead {
  const result = calculatePipCash(input.snapshot);
  const spendableCashToday = result.spendableCashToday ?? null;
  const guidance = buildFinancialGuidanceContext(result);
  const spendingBreakdown = buildSpendingBreakdown(input.snapshot);
  const recurringActivity = buildRecurringActivity(input.snapshot);
  const spendingOpportunities = buildSpendingOpportunities(input.snapshot);
  const dataQuality = buildFinancialReadDataQuality({
    snapshot: input.snapshot,
    result,
    freshness: input.freshness,
  });

  return {
    asOfDate: input.snapshot.settings.asOfDate,
    ...(input.freshness ? { freshness: input.freshness } : {}),
    result,
    spendableCashToday,
    guidance,
    spendingBreakdown,
    recurringActivity,
    spendingOpportunities,
    dataQuality,
    recommendedSurface: recommendSurface({
      dataQuality,
      recurringActivity,
      spendingBreakdown,
      spendingOpportunities,
    }),
  };
}

function buildFinancialReadDataQuality(input: {
  snapshot: FinancialSnapshot;
  result: PipCashResult;
  freshness?: PipCashFreshness;
}): FinancialReadDataQuality {
  const metric = input.result.spendableCashToday;
  const warnings = metric?.warnings.length ? metric.warnings : input.result.warnings;
  const dataStates = metric?.dataStates.length ? metric.dataStates : input.result.dataStates;
  const findings: FinancialReadDataQualityFinding[] = [
    ...warnings.map(warningToFinding),
    ...dataStates.map(dataStateToFinding),
  ];
  const hasCashAccount = input.snapshot.accounts.some((account) =>
    (account.kind === "checking" || account.kind === "savings") &&
    account.active !== false &&
    account.isProtectedSavings !== true,
  );
  const hasCreditCardAccount = input.snapshot.accounts.some((account) =>
    account.kind === "credit_card" && account.active !== false,
  );

  if (input.freshness && input.freshness.state !== "fresh") {
    findings.push(freshnessToFinding(input.freshness));
  }

  if (!hasCashAccount) {
    findings.push({
      id: "missing-cash-account",
      label: "Missing cash account",
      detail: "I need an active checking or usable cash account for a stronger read.",
      tone: "warning",
      severity: "blocker",
    });
  }

  if (!hasCreditCardAccount) {
    findings.push({
      id: "missing-credit-card",
      label: "No credit card connected",
      detail: "Card spending may be incomplete if the user spends on a card that is not connected.",
      tone: "warning",
      severity: "warning",
    });
  }

  if (input.snapshot.transactions.length < 8) {
    findings.push({
      id: "sparse-history",
      label: "Sparse history",
      detail: "There are not many transactions yet, so spending patterns may be thin.",
      tone: "warning",
      severity: "warning",
    });
  }

  return {
    accountCount: input.snapshot.accounts.length,
    transactionCount: input.snapshot.transactions.length,
    warningCount: warnings.length,
    dataStateCount: dataStates.length,
    hasMissingCardWarning: warnings.some((warning) => warning.id === "missing-card"),
    hasLowConfidence:
      metric?.confidence === "low" ||
      dataStates.some((state) => state.id === "low-confidence"),
    freshnessState: input.freshness?.state,
    findings: uniqueFindings(findings),
  };
}

function warningToFinding(warning: PipCashWarning): FinancialReadDataQualityFinding {
  return {
    id: warning.id === "missing-card" ? "missing-card" : "missing-data",
    label: warning.label,
    detail: warning.detail,
    tone: warning.tone,
    severity: warning.id === "missing-card" ? "warning" : "info",
  };
}

function dataStateToFinding(state: FinancialDataState): FinancialReadDataQualityFinding {
  return {
    id: state.id,
    label: state.label,
    detail: state.detail,
    tone: state.tone,
    severity: state.id === "missing-data" ? "blocker" : "warning",
  };
}

function freshnessToFinding(freshness: PipCashFreshness): FinancialReadDataQualityFinding {
  const severity = freshness.state === "needs_repair" || freshness.state === "failed"
    ? "blocker"
    : "warning";

  return {
    id: "freshness",
    label: formatFreshnessLabel(freshness.state),
    detail: formatFreshnessDetail(freshness),
    tone: "warning",
    severity,
  };
}

function formatFreshnessLabel(state: PipCashFreshness["state"]): string {
  switch (state) {
    case "syncing":
      return "Refreshing data";
    case "needs_repair":
      return "Connection needs repair";
    case "failed":
      return "Refresh failed";
    case "partial":
      return "Partial refresh";
    case "stale":
      return "Stale data";
    case "fresh":
      return "Fresh data";
  }
}

function formatFreshnessDetail(freshness: PipCashFreshness): string {
  if (freshness.state === "syncing") {
    return "Connected data is refreshing now.";
  }

  if (freshness.state === "needs_repair") {
    return "A connected institution needs repair before Pip can refresh it.";
  }

  if (freshness.state === "failed") {
    return "The last refresh failed, so this read may use older data.";
  }

  if (freshness.state === "partial") {
    return "The last refresh updated usable data, but at least one connection needs attention.";
  }

  if (freshness.lastSuccessfulSyncAt) {
    return `The last successful refresh was ${freshness.lastSuccessfulSyncAt}.`;
  }

  return "Connected data may be older than the current app session.";
}

function recommendSurface(input: {
  dataQuality: FinancialReadDataQuality;
  recurringActivity: RecurringActivity;
  spendingBreakdown: SpendingBreakdown;
  spendingOpportunities: SpendingOpportunity[];
}): FinancialReadSurfaceRecommendation {
  if (input.dataQuality.findings.some((finding) => finding.severity === "blocker")) {
    return {
      responseMode: "show_card",
      cardType: "guidance_card",
      reason: "data_quality_blocker",
    };
  }

  if (input.spendingOpportunities.length > 0) {
    return {
      responseMode: "show_card",
      cardType: "insight_card",
      reason: "spending_opportunity_available",
    };
  }

  if (input.recurringActivity.items.length > 0) {
    return {
      responseMode: "show_card",
      cardType: "recurring_activity",
      reason: "recurring_activity_available",
    };
  }

  if (input.spendingBreakdown.topCategories.length > 0) {
    return {
      responseMode: "show_card",
      cardType: "spending_breakdown",
      reason: "spending_breakdown_available",
    };
  }

  return {
    responseMode: "chat_only",
    reason: "limited_data",
  };
}

function uniqueFindings(
  findings: FinancialReadDataQualityFinding[],
): FinancialReadDataQualityFinding[] {
  const seen = new Set<string>();

  return findings.filter((finding) => {
    if (seen.has(finding.id)) {
      return false;
    }

    seen.add(finding.id);
    return true;
  });
}
