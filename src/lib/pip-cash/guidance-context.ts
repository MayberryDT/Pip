import type {
  PipCashResult,
  MoneyTone,
  SpendableCashConfidence,
  SpendableCashTodayState,
} from "@/lib/types";

export type GuidanceDomain =
  | "spending"
  | "savings_cushion"
  | "bills"
  | "cash_pressure"
  | "data_quality"
  | "debt_general";

export type BlockedGuidanceDomain =
  | "securities"
  | "crypto"
  | "tax"
  | "legal"
  | "bankruptcy"
  | "specific_credit_products"
  | "specific_loans"
  | "specific_lenders"
  | "insurance_products";

export type GuidanceEvidenceSource =
  | "spendable_metric"
  | "pattern"
  | "behavior"
  | "cash"
  | "data_quality"
  | "user_settings";

export type GuidanceEvidence = {
  id: string;
  label: string;
  detail: string;
  amountCents?: number;
  valueText?: string;
  tone: MoneyTone;
  source: GuidanceEvidenceSource;
};

export type FinancialGuidanceContext = {
  metricVersion: "v2";
  currentRead: {
    spendableCashTodayCents: number;
    state: SpendableCashTodayState;
    confidence: SpendableCashConfidence;
    shortfallCents: number;
  };
  pattern: {
    baselineDailyAllowanceCents: number;
    adaptiveDailyAllowanceCents: number;
    monthlyEverydayPoolCents: number;
    averageMonthlyIncomeCents: number;
    averageMonthlyRecurringObligationsCents: number;
    averageMonthlyEverydaySpendCents: number;
    protectedSavingsMonthlyCents: number;
    hiddenCushionCents: number;
    completedMonthCount: number;
  };
  behavior: {
    allowedSoFarThisMonthCents: number;
    actualEverydaySpendSoFarCents: number;
    currentMonthVarianceCents: number;
    behaviorAdjustmentCents: number;
    recoveryDays: number;
  };
  cash: {
    availableCashGuardrailCents: number;
    pendingCommittedSpendCents: number;
    cashDailyCapCents: number;
    cashRealityAdjustmentCents: number;
    cashGuardrailApplied: boolean;
    cashGuardrailShareOfBaseline: number;
  };
  shortfalls: {
    patternShortfallCents: number;
    behaviorShortfallCents: number;
    cashShortfallCents: number;
    totalShortfallCents: number;
  };
  dataQuality: {
    warningCount: number;
    dataStateCount: number;
    hasMissingCardWarning: boolean;
    warnings: Array<{
      id: string;
      label: string;
      detail: string;
    }>;
  };
  evidence: GuidanceEvidence[];
  allowedDomains: GuidanceDomain[];
  blockedDomains: BlockedGuidanceDomain[];
  possibleMoves: Array<{
    id: string;
    domain: GuidanceDomain;
    strength: "soft" | "medium" | "direct";
    reasonEvidenceIds: string[];
  }>;
};

export const allowedGuidanceDomains: GuidanceDomain[] = [
  "spending",
  "savings_cushion",
  "bills",
  "cash_pressure",
  "data_quality",
  "debt_general",
];

export const blockedGuidanceDomains: BlockedGuidanceDomain[] = [
  "securities",
  "crypto",
  "tax",
  "legal",
  "bankruptcy",
  "specific_credit_products",
  "specific_loans",
  "specific_lenders",
  "insurance_products",
];

export function buildFinancialGuidanceContext(result: PipCashResult): FinancialGuidanceContext {
  const metric = result.spendableCashToday;

  if (!metric) {
    return buildLegacyFallbackContext(result);
  }

  const materialDailyChangeCents = getMaterialDailyChangeCents(metric.baselineDailyAllowanceCents);
  const warnings = metric.warnings.length > 0 ? metric.warnings : result.warnings;
  const dataStates = metric.dataStates.length > 0 ? metric.dataStates : result.dataStates;
  const hasMissingCardWarning = warnings.some((warning) => warning.id === "missing-card");
  const cashGuardrailApplied = metric.cashRealityAdjustmentCents >= materialDailyChangeCents;
  const cashGuardrailShareOfBaseline =
    metric.baselineDailyAllowanceCents > 0
      ? metric.cashRealityAdjustmentCents / metric.baselineDailyAllowanceCents
      : 0;
  const evidence = createEvidenceCollector();

  evidence.add({
    id: "spendable-today",
    label: "Today's room",
    amountCents: metric.spendableCashTodayCents,
    detail: "Spendable Cash Today after bills, savings, recent spending, and cash reality.",
    tone: metric.spendableCashTodayCents > 0 ? "positive" : "warning",
    source: "spendable_metric",
  });
  evidence.add({
    id: "state",
    label: "Current state",
    valueText: metric.state,
    detail: "The current state for today's number.",
    tone: stateTone(metric.state),
    source: "spendable_metric",
  });
  evidence.add({
    id: "confidence",
    label: "Confidence",
    valueText: metric.confidence,
    detail: "How much connected history supports the read.",
    tone: metric.confidence === "low" ? "warning" : "neutral",
    source: "data_quality",
  });
  evidence.add({
    id: "data_quality",
    label: "Data quality",
    valueText: metric.confidence,
    detail: dataQualityDetail({
      confidence: metric.confidence,
      completedMonthCount: metric.completedMonthCount,
      warningCount: warnings.length,
      dataStateCount: dataStates.length,
    }),
    tone: metric.confidence === "low" || warnings.length > 0 || dataStates.length > 0
      ? "warning"
      : "neutral",
    source: "data_quality",
  });
  evidence.add({
    id: "baseline-room",
    label: "Normal room",
    amountCents: metric.baselineDailyAllowanceCents,
    detail: "Pattern-based daily room after recurring bills, monthly savings, and the safety reserve.",
    tone: metric.baselineDailyAllowanceCents > 0 ? "positive" : "neutral",
    source: "pattern",
  });
  evidence.add({
    id: "normal-room",
    label: "Normal room",
    amountCents: metric.baselineDailyAllowanceCents,
    detail: "Pattern-based daily room after recurring bills, monthly savings, and the safety reserve.",
    tone: metric.baselineDailyAllowanceCents > 0 ? "positive" : "neutral",
    source: "pattern",
  });
  evidence.add({
    id: "bills-held-back",
    label: "Bills held back",
    amountCents: -metric.averageMonthlyRecurringObligationsCents,
    detail: "Likely recurring bills and obligations held back from the daily room.",
    tone: metric.averageMonthlyRecurringObligationsCents > 0 ? "negative" : "neutral",
    source: "pattern",
  });
  evidence.add({
    id: "recurring-obligations",
    label: "Recurring obligations",
    amountCents: -metric.averageMonthlyRecurringObligationsCents,
    detail: "Likely recurring bills and obligations held back from the daily room.",
    tone: metric.averageMonthlyRecurringObligationsCents > 0 ? "negative" : "neutral",
    source: "pattern",
  });
  evidence.add({
    id: "protected-savings",
    label: "Monthly savings",
    amountCents: -metric.protectedSavingsMonthlyCents,
    detail: "Your chosen monthly savings are kept out of today's number.",
    tone: "neutral",
    source: "user_settings",
  });
  evidence.add({
    id: "hidden-cushion",
    label: "Safety reserve",
    amountCents: -metric.hiddenCushionCents,
    detail: "A small safety reserve is held back so the number is not too aggressive.",
    tone: "neutral",
    source: "pattern",
  });

  if (metric.averageMonthlyEverydaySpendCents > 0) {
    evidence.add({
      id: "everyday-spend-context",
      label: "Everyday context",
      amountCents: -metric.averageMonthlyEverydaySpendCents,
      detail: "Typical monthly everyday spending used as context, not a category budget.",
      tone: "neutral",
      source: "pattern",
    });
  }

  if (metric.behaviorAdjustmentCents <= -materialDailyChangeCents) {
    evidence.add({
      id: "recent-spending-hot",
      label: "Recent spending",
      amountCents: metric.behaviorAdjustmentCents,
      detail: "Recent everyday spending is running ahead of pace.",
      tone: "warning",
      source: "behavior",
    });
    evidence.add({
      id: "behavior-adjustment-negative",
      label: "Daily behavior adjustment",
      amountCents: metric.behaviorAdjustmentCents,
      detail: `The recent-spending pressure is spread over ${metric.recoveryDays} days.`,
      tone: "negative",
      source: "behavior",
    });
  } else if (metric.behaviorAdjustmentCents >= materialDailyChangeCents) {
    evidence.add({
      id: "recent-spending-light",
      label: "Recent spending",
      amountCents: metric.behaviorAdjustmentCents,
      detail: "Recent everyday spending is lighter than pace.",
      tone: "positive",
      source: "behavior",
    });
    evidence.add({
      id: "behavior-adjustment-positive",
      label: "Daily behavior adjustment",
      amountCents: metric.behaviorAdjustmentCents,
      detail: `The lighter recent spending is spread over ${metric.recoveryDays} days.`,
      tone: "positive",
      source: "behavior",
    });
  }

  if (metric.currentMonthVarianceCents <= -materialDailyChangeCents) {
    evidence.add({
      id: "current-month-over-pattern",
      label: "This month pace",
      amountCents: metric.currentMonthVarianceCents,
      detail: "Everyday spending this month is ahead of the pattern pace.",
      tone: "warning",
      source: "behavior",
    });
  } else if (metric.currentMonthVarianceCents >= materialDailyChangeCents) {
    evidence.add({
      id: "current-month-under-pattern",
      label: "This month pace",
      amountCents: metric.currentMonthVarianceCents,
      detail: "Everyday spending this month is under the pattern pace.",
      tone: "positive",
      source: "behavior",
    });
  }

  if (metric.shortfallCents > 0) {
    evidence.add({
      id: "shortfall",
      label: "Shortfall",
      amountCents: -metric.shortfallCents,
      detail: "Spendable Cash Today is at $0 and the shortfall is tracked separately.",
      tone: "negative",
      source: "spendable_metric",
    });
  }

  if (metric.patternShortfallCents > 0) {
    evidence.add({
      id: "pattern-shortfall",
      label: "Pattern shortfall",
      amountCents: -metric.patternShortfallCents,
      detail: "The completed-month pattern leaves less than the held-back bills, monthly savings, and safety reserve.",
      tone: "negative",
      source: "pattern",
    });
  }

  if (metric.behaviorShortfallCents > 0) {
    evidence.add({
      id: "behavior-shortfall",
      label: "Behavior shortfall",
      amountCents: -metric.behaviorShortfallCents,
      detail: "Recent spending pressure pushed the adaptive daily room below zero.",
      tone: "negative",
      source: "behavior",
    });
  }

  if (metric.cashShortfallCents > 0) {
    evidence.add({
      id: "cash-shortfall",
      label: "Cash shortfall",
      amountCents: -metric.cashShortfallCents,
      detail: "Available cash left no daily room after committed pending spend.",
      tone: "negative",
      source: "cash",
    });
  }

  if (cashGuardrailApplied) {
    evidence.add({
      id: "cash-guardrail",
      label: "Cash guardrail",
      amountCents: -metric.cashRealityAdjustmentCents,
      detail: "Available cash capped the pattern-based number.",
      tone: "warning",
      source: "cash",
    });
  }

  if (metric.cashDailyCapCents < metric.baselineDailyAllowanceCents && metric.cashDailyCapCents <= 1500) {
    evidence.add({
      id: "cash-tight",
      label: "Cash tight",
      amountCents: metric.cashDailyCapCents,
      detail: "Available cash leaves only a small daily cap right now.",
      tone: "warning",
      source: "cash",
    });
  }

  if (metric.confidence === "low" || metric.completedMonthCount < 2) {
    evidence.add({
      id: "low-confidence",
      label: "Early estimate",
      detail: "Less than two completed months are available.",
      tone: "warning",
      source: "data_quality",
    });
  }

  if (hasMissingCardWarning) {
    evidence.add({
      id: "missing-card",
      label: "Possible missing card",
      detail: "A card payment appears, but that card may not be connected.",
      tone: "warning",
      source: "data_quality",
    });
  }

  if (metric.state === "missing_data" || dataStates.some((state) => state.id === "missing-data")) {
    evidence.add({
      id: "missing-data",
      label: "More data needed",
      detail: "Connected data is missing or incomplete enough to limit the read.",
      tone: "warning",
      source: "data_quality",
    });
  }

  const evidenceRows = evidence.values();

  return {
    metricVersion: "v2",
    currentRead: {
      spendableCashTodayCents: metric.spendableCashTodayCents,
      state: metric.state,
      confidence: metric.confidence,
      shortfallCents: metric.shortfallCents,
    },
    pattern: {
      baselineDailyAllowanceCents: metric.baselineDailyAllowanceCents,
      adaptiveDailyAllowanceCents: metric.adaptiveDailyAllowanceCents,
      monthlyEverydayPoolCents: metric.monthlyEverydayPoolCents,
      averageMonthlyIncomeCents: metric.averageMonthlyIncomeCents,
      averageMonthlyRecurringObligationsCents: metric.averageMonthlyRecurringObligationsCents,
      averageMonthlyEverydaySpendCents: metric.averageMonthlyEverydaySpendCents,
      protectedSavingsMonthlyCents: metric.protectedSavingsMonthlyCents,
      hiddenCushionCents: metric.hiddenCushionCents,
      completedMonthCount: metric.completedMonthCount,
    },
    behavior: {
      allowedSoFarThisMonthCents: metric.allowedSoFarThisMonthCents,
      actualEverydaySpendSoFarCents: metric.actualEverydaySpendSoFarCents,
      currentMonthVarianceCents: metric.currentMonthVarianceCents,
      behaviorAdjustmentCents: metric.behaviorAdjustmentCents,
      recoveryDays: metric.recoveryDays,
    },
    cash: {
      availableCashGuardrailCents: metric.availableCashGuardrailCents,
      pendingCommittedSpendCents: metric.pendingCommittedSpendCents,
      cashDailyCapCents: metric.cashDailyCapCents,
      cashRealityAdjustmentCents: metric.cashRealityAdjustmentCents,
      cashGuardrailApplied,
      cashGuardrailShareOfBaseline,
    },
    shortfalls: {
      patternShortfallCents: metric.patternShortfallCents,
      behaviorShortfallCents: metric.behaviorShortfallCents,
      cashShortfallCents: metric.cashShortfallCents,
      totalShortfallCents: metric.shortfallCents,
    },
    dataQuality: {
      warningCount: warnings.length,
      dataStateCount: dataStates.length,
      hasMissingCardWarning,
      warnings: warnings.map((warning) => ({
        id: warning.id,
        label: warning.label,
        detail: warning.detail,
      })),
    },
    evidence: evidenceRows,
    allowedDomains: allowedGuidanceDomains,
    blockedDomains: blockedGuidanceDomains,
    possibleMoves: buildPossibleMoves(evidenceRows, metric.state),
  };
}

function buildLegacyFallbackContext(result: PipCashResult): FinancialGuidanceContext {
  const spendableCashTodayCents = Math.max(0, result.pipCashTodayCents);
  const shortfallCents = Math.max(0, -result.pipCashTodayCents);
  const state: SpendableCashTodayState = shortfallCents > 0 ? "shortfall" : "low_confidence";
  const evidence = createEvidenceCollector();

  evidence.add({
    id: "spendable-today",
    label: "Today's room",
    amountCents: spendableCashTodayCents,
    detail: "Fallback Spendable Cash Today because the current metric is not available.",
    tone: spendableCashTodayCents > 0 ? "positive" : "warning",
    source: "spendable_metric",
  });
  evidence.add({
    id: "state",
    label: "Current state",
    valueText: state,
    detail: "The current metric is missing, so this read is limited.",
    tone: "warning",
    source: "data_quality",
  });
  evidence.add({
    id: "confidence",
    label: "Confidence",
    valueText: "low",
    detail: "The current metric is missing.",
    tone: "warning",
    source: "data_quality",
  });
  evidence.add({
    id: "data_quality",
    label: "Data quality",
    valueText: "low",
    detail: "The current metric is missing, so the read should stay cautious.",
    tone: "warning",
    source: "data_quality",
  });
  evidence.add({
    id: "low-confidence",
    label: "Limited read",
    detail: "The current read should stay cautious because current facts are missing.",
    tone: "warning",
    source: "data_quality",
  });
  if (shortfallCents > 0) {
    evidence.add({
      id: "shortfall",
      label: "Shortfall",
      amountCents: -shortfallCents,
      detail: "The fallback number is below zero before display flooring.",
      tone: "negative",
      source: "spendable_metric",
    });
  }

  const evidenceRows = evidence.values();

  return {
    metricVersion: "v2",
    currentRead: {
      spendableCashTodayCents,
      state,
      confidence: "low",
      shortfallCents,
    },
    pattern: {
      baselineDailyAllowanceCents: 0,
      adaptiveDailyAllowanceCents: 0,
      monthlyEverydayPoolCents: 0,
      averageMonthlyIncomeCents: result.incomeTotalCents,
      averageMonthlyRecurringObligationsCents: 0,
      averageMonthlyEverydaySpendCents: result.spendingTotalCents,
      protectedSavingsMonthlyCents: result.protectedSavingsMonthlyCents,
      hiddenCushionCents: 0,
      completedMonthCount: 0,
    },
    behavior: {
      allowedSoFarThisMonthCents: 0,
      actualEverydaySpendSoFarCents: result.spendingTotalCents,
      currentMonthVarianceCents: result.rollingNetCents,
      behaviorAdjustmentCents: 0,
      recoveryDays: result.window.dayCount,
    },
    cash: {
      availableCashGuardrailCents: 0,
      pendingCommittedSpendCents: 0,
      cashDailyCapCents: 0,
      cashRealityAdjustmentCents: 0,
      cashGuardrailApplied: false,
      cashGuardrailShareOfBaseline: 0,
    },
    shortfalls: {
      patternShortfallCents: 0,
      behaviorShortfallCents: 0,
      cashShortfallCents: 0,
      totalShortfallCents: shortfallCents,
    },
    dataQuality: {
      warningCount: result.warnings.length,
      dataStateCount: result.dataStates.length,
      hasMissingCardWarning: result.warnings.some((warning) => warning.id === "missing-card"),
      warnings: result.warnings.map((warning) => ({
        id: warning.id,
        label: warning.label,
        detail: warning.detail,
      })),
    },
    evidence: evidenceRows,
    allowedDomains: allowedGuidanceDomains,
    blockedDomains: blockedGuidanceDomains,
    possibleMoves: buildPossibleMoves(evidenceRows, state),
  };
}

function createEvidenceCollector() {
  const byId = new Map<string, GuidanceEvidence>();

  return {
    add(evidence: GuidanceEvidence) {
      byId.set(evidence.id, evidence);
    },
    values() {
      return [...byId.values()];
    },
  };
}

function buildPossibleMoves(
  evidence: GuidanceEvidence[],
  state: SpendableCashTodayState,
): FinancialGuidanceContext["possibleMoves"] {
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const moves: FinancialGuidanceContext["possibleMoves"] = [];
  const addMove = (
    move: FinancialGuidanceContext["possibleMoves"][number],
  ) => {
    const reasonEvidenceIds = move.reasonEvidenceIds.filter((id) => evidenceIds.has(id));

    if (reasonEvidenceIds.length === 0) {
      return;
    }

    moves.push({
      ...move,
      reasonEvidenceIds,
    });
  };

  addMove({
    id: "keep-optional-under-today",
    domain: "spending",
    strength: state === "shortfall" ? "direct" : "medium",
    reasonEvidenceIds: ["spendable-today", "recent-spending-hot", "behavior-adjustment-negative"],
  });
  addMove({
    id: "essentials-first",
    domain: "spending",
    strength: "direct",
    reasonEvidenceIds: ["shortfall", "cash-shortfall"],
  });
  addMove({
    id: "wait-for-cash-room",
    domain: "cash_pressure",
    strength: "medium",
    reasonEvidenceIds: ["cash-guardrail", "cash-tight"],
  });
  addMove({
    id: "keep-monthly-savings-for-now",
    domain: "savings_cushion",
    strength: "soft",
    reasonEvidenceIds: ["protected-savings", "baseline-room", "recent-spending-hot"],
  });
  addMove({
    id: "fix-data-before-trusting-read",
    domain: "data_quality",
    strength: "medium",
    reasonEvidenceIds: ["data_quality", "missing-card", "missing-data", "low-confidence"],
  });
  addMove({
    id: "stay-the-course",
    domain: "spending",
    strength: "soft",
    reasonEvidenceIds: ["spendable-today", "baseline-room", "recent-spending-light"],
  });

  return moves;
}

function dataQualityDetail(input: {
  confidence: SpendableCashConfidence;
  completedMonthCount: number;
  warningCount: number;
  dataStateCount: number;
}): string {
  if (input.confidence === "low" || input.completedMonthCount < 2) {
    return "The read is cautious because there is limited connected history.";
  }

  if (input.warningCount > 0 || input.dataStateCount > 0) {
    return "The read includes data warnings or incomplete connected data.";
  }

  return "Connected data supports the current read.";
}

function stateTone(state: SpendableCashTodayState): MoneyTone {
  if (state === "healthy" || state === "normal") {
    return "positive";
  }

  if (state === "shortfall" || state === "overspending") {
    return "negative";
  }

  return "warning";
}

function getMaterialDailyChangeCents(baselineDailyAllowanceCents: number): number {
  return Math.max(500, Math.round(Math.abs(baselineDailyAllowanceCents) * 0.1));
}
