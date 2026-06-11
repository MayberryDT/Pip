import { classifyTransaction } from "@/lib/pip-cash/classify";
import { addDays, daysInMonth, formatDateParts, parseDateParts } from "@/lib/pip-cash/date-window";
import {
  annotateCreditCardPaymentMatches,
  isDedupedCreditCardPayment,
} from "@/lib/pip-cash/dedupe-credit-card-payments";
import type {
  Account,
  ClassifiedSpendableTransaction,
  FinancialDataState,
  FinancialSnapshot,
  PipCashDriver,
  PipCashResult,
  PipCashWarning,
  SpendableCashConfidence,
  SpendableCashTodayResult,
  SpendableCashTodayState,
  SpendableTransactionGroup,
  Transaction,
} from "@/lib/types";

const DAYS_PER_MONTH = 30.44;
const LOOKBACK_MONTHS = 3;
const RECOVERY_DAYS = 14;
const MIN_MATERIAL_DAILY_CHANGE_CENTS = 500;
const LOW_CONFIDENCE_DAILY_CAP_CENTS = 5000;

type MonthlySpendableSummary = {
  month: string;
  incomeCents: number;
  recurringObligationsCents: number;
  everydaySpendCents: number;
  refundCents: number;
  unknownSpendCents: number;
  excludedCents: number;
  transactionCount: number;
};

export type SpendablePurchaseSimulation = {
  amountCents: number;
  beforeCents: number;
  todayRemainingCents: number;
  todayOverageCents: number;
  afterTodayCents: number;
  dailyEffectCents: number;
  shortfallCents: number;
  before: SpendableCashTodayResult;
  after: SpendableCashTodayResult;
};

export function calculateSpendableCashToday(
  snapshot: FinancialSnapshot,
  input: {
    legacyRollingDailySurplusCents?: number;
    legacyRollingNetCents?: number;
    warnings?: PipCashWarning[];
    dataStates?: FinancialDataState[];
  } = {},
): SpendableCashTodayResult {
  const asOfDate = snapshot.settings.asOfDate;
  const currentMonthStartDate = startOfMonth(asOfDate);
  const currentMonthElapsedDays = parseDateParts(asOfDate).day;
  const lookbackEndDate = addDays(currentMonthStartDate, -1);
  const lookbackStartDate = addMonths(currentMonthStartDate, -LOOKBACK_MONTHS);
  const accountById = new Map(snapshot.accounts.map((account) => [account.id, account]));
  const transactions = annotateCreditCardPaymentMatches(snapshot.transactions, snapshot.accounts)
    .filter((transaction) => transaction.date <= asOfDate);
  const recurringKeys = detectRecurringObligationKeys(transactions);
  const classifiedTransactions = transactions.map((transaction) =>
    classifySpendableTransaction(transaction, accountById, recurringKeys),
  );
  const completedMonthKeys = enumerateMonthKeys(lookbackStartDate, lookbackEndDate);
  const completedSummaries = completedMonthKeys.map((month) =>
    summarizeMonth(
      month,
      classifiedTransactions.filter((item) => getMonthKey(item.transaction.date) === month),
    ),
  );
  const activeCompletedSummaries = completedSummaries.filter(
    (summary) => summary.transactionCount > 0,
  );
  const currentMonthSummary = summarizeMonth(
    getMonthKey(asOfDate),
    classifiedTransactions.filter(
      (item) =>
        item.transaction.date >= currentMonthStartDate && item.transaction.date <= asOfDate,
    ),
  );
  const baselineSummaries = activeCompletedSummaries.length > 0
    ? activeCompletedSummaries
    : [scalePartialMonthSummary(currentMonthSummary, currentMonthElapsedDays)];
  const completedMonthCount = activeCompletedSummaries.length;
  const averageMonthlyIncomeCents = robustAverage(
    baselineSummaries.map((summary) => summary.incomeCents),
    "income",
  );
  const averageMonthlyRecurringObligationsCents = Math.max(
    robustAverage(baselineSummaries.map((summary) => summary.recurringObligationsCents)),
    estimateObservedRecurringObligations(classifiedTransactions),
  );
  const averageMonthlyEverydaySpendCents = robustAverage(
    baselineSummaries.map((summary) =>
      Math.max(0, summary.everydaySpendCents + summary.unknownSpendCents - summary.refundCents),
    ),
  );
  const protectedSavingsMonthlyCents = snapshot.settings.protectedSavingsMonthlyCents;
  const hiddenCushionCents = calculateHiddenCushion(averageMonthlyIncomeCents);
  const monthlyEverydayPoolCents =
    averageMonthlyIncomeCents -
    averageMonthlyRecurringObligationsCents -
    protectedSavingsMonthlyCents -
    hiddenCushionCents;
  const patternShortfallCents = Math.max(0, -monthlyEverydayPoolCents);
  const baselineDailyAllowanceCents = Math.max(
    0,
    Math.round(monthlyEverydayPoolCents / DAYS_PER_MONTH),
  );
  const materialDailyChangeCents = getMaterialDailyChangeCents(baselineDailyAllowanceCents);
  const actualEverydaySpendSoFarCents = Math.max(
    0,
    currentMonthSummary.everydaySpendCents +
      currentMonthSummary.unknownSpendCents -
      currentMonthSummary.refundCents,
  );
  const allowedSoFarThisMonthCents = Math.round(
    baselineDailyAllowanceCents * currentMonthElapsedDays,
  );
  const currentMonthVarianceCents =
    allowedSoFarThisMonthCents - actualEverydaySpendSoFarCents;
  const rawBehaviorAdjustmentCents = baselineDailyAllowanceCents > 0
    ? Math.round(currentMonthVarianceCents / RECOVERY_DAYS)
    : 0;
  const behaviorAdjustmentCents = clamp(
    rawBehaviorAdjustmentCents,
    -Math.round(baselineDailyAllowanceCents * 0.6),
    Math.round(baselineDailyAllowanceCents * 0.5),
  );
  const adaptiveDailyAllowanceCents =
    baselineDailyAllowanceCents + behaviorAdjustmentCents;
  const availableCashBeforePendingCents = calculateAvailableCashGuardrail(snapshot.accounts);
  const pendingCommittedSpendCents = calculatePendingCommittedSpend(classifiedTransactions);
  const availableCashGuardrailCents = Math.max(
    0,
    availableCashBeforePendingCents - pendingCommittedSpendCents,
  );
  const cashDailyCapCents = Math.round(availableCashGuardrailCents / RECOVERY_DAYS);
  const uncappedPositiveAllowanceCents = Math.max(0, adaptiveDailyAllowanceCents);
  const cashRealityAdjustmentCents = Math.max(
    0,
    uncappedPositiveAllowanceCents - Math.min(uncappedPositiveAllowanceCents, cashDailyCapCents),
  );
  const cashCappedAllowanceCents = Math.max(
    0,
    Math.min(uncappedPositiveAllowanceCents, cashDailyCapCents),
  );
  const lowConfidenceDailyCapCents = completedMonthCount === 0
    ? LOW_CONFIDENCE_DAILY_CAP_CENTS
    : undefined;
  const spendableCashTodayCents = lowConfidenceDailyCapCents === undefined
    ? cashCappedAllowanceCents
    : Math.min(cashCappedAllowanceCents, lowConfidenceDailyCapCents);
  const lowConfidenceCapApplied =
    lowConfidenceDailyCapCents !== undefined && cashCappedAllowanceCents > lowConfidenceDailyCapCents;
  const cashGuardrailApplied = cashRealityAdjustmentCents >= materialDailyChangeCents;
  const cashGuardrailShareOfBaseline =
    baselineDailyAllowanceCents > 0
      ? cashRealityAdjustmentCents / baselineDailyAllowanceCents
      : 0;
  const behaviorShortfallCents = Math.max(0, -adaptiveDailyAllowanceCents);
  const cashShortfallCents =
    uncappedPositiveAllowanceCents > 0 && cashDailyCapCents <= 0
      ? uncappedPositiveAllowanceCents
      : 0;
  const shortfallCents = Math.max(
    Math.round(patternShortfallCents / DAYS_PER_MONTH),
    behaviorShortfallCents,
    cashShortfallCents,
  );
  const warnings = input.warnings ?? [];
  const dataStates = buildSpendableDataStates({
    baseDataStates: input.dataStates ?? [],
    completedMonthCount,
    transactionCount: transactions.length,
    accountCount: snapshot.accounts.length,
  });
  const confidence = determineConfidence({
    completedMonthCount,
    classifiedTransactions,
    accountCount: snapshot.accounts.length,
    transactionCount: transactions.length,
  });
  const state = determineState({
    spendableCashTodayCents,
    shortfallCents,
    behaviorAdjustmentCents,
    materialDailyChangeCents,
    confidence,
    warningCount: warnings.length,
    accountCount: snapshot.accounts.length,
    transactionCount: transactions.length,
  });

  return {
    metricVersion: "v2",
    spendableCashTodayCents,
    shortfallCents,
    patternShortfallCents,
    behaviorShortfallCents,
    cashShortfallCents,
    baselineDailyAllowanceCents,
    behaviorAdjustmentCents,
    cashRealityAdjustmentCents,
    cashGuardrailApplied,
    cashGuardrailShareOfBaseline,
    materialDailyChangeCents,
    lowConfidenceDailyCapCents,
    lowConfidenceCapApplied,
    adaptiveDailyAllowanceCents,
    monthlyEverydayPoolCents,
    averageMonthlyIncomeCents,
    averageMonthlyRecurringObligationsCents,
    averageMonthlyEverydaySpendCents,
    protectedSavingsMonthlyCents,
    hiddenCushionCents,
    allowedSoFarThisMonthCents,
    actualEverydaySpendSoFarCents,
    currentMonthVarianceCents,
    availableCashGuardrailCents,
    pendingCommittedSpendCents,
    cashDailyCapCents,
    lookbackStartDate,
    lookbackEndDate,
    completedMonthCount,
    currentMonthStartDate,
    currentMonthElapsedDays,
    recoveryDays: RECOVERY_DAYS,
    confidence,
    state,
    drivers: buildSpendableDrivers({
      baselineDailyAllowanceCents,
      behaviorAdjustmentCents,
      materialDailyChangeCents,
      averageMonthlyRecurringObligationsCents,
      protectedSavingsMonthlyCents,
      hiddenCushionCents,
      cashRealityAdjustmentCents,
      confidence,
      completedMonthCount,
      warningCount: warnings.length,
    }),
    warnings,
    dataStates,
    legacyRollingDailySurplusCents: input.legacyRollingDailySurplusCents ?? 0,
    legacyRollingNetCents: input.legacyRollingNetCents ?? 0,
  };
}

export function simulateSpendablePurchase(
  amountCents: number,
  snapshot: FinancialSnapshot,
  input: {
    before?: SpendableCashTodayResult;
    warnings?: PipCashWarning[];
    dataStates?: FinancialDataState[];
    legacyRollingDailySurplusCents?: number;
    legacyRollingNetCents?: number;
  } = {},
): SpendablePurchaseSimulation {
  const before = input.before ?? calculateSpendableCashToday(snapshot, input);
  const afterSnapshot: FinancialSnapshot = {
    ...snapshot,
    transactions: [
      ...snapshot.transactions,
      {
        id: `simulated-purchase-${amountCents}`,
        accountId: snapshot.accounts.find((account) => !account.isProtectedSavings)?.id ?? "simulated",
        date: snapshot.settings.asOfDate,
        description: "Simulated purchase",
        amountCents: -amountCents,
        category: "purchase",
        kind: "purchase",
      },
    ],
  };
  const after = calculateSpendableCashToday(afterSnapshot, input);

  return {
    amountCents,
    beforeCents: before.spendableCashTodayCents,
    todayRemainingCents: before.spendableCashTodayCents - amountCents,
    todayOverageCents: Math.max(0, amountCents - before.spendableCashTodayCents),
    afterTodayCents: after.spendableCashTodayCents,
    dailyEffectCents: after.spendableCashTodayCents - before.spendableCashTodayCents,
    shortfallCents: Math.max(0, after.shortfallCents - before.shortfallCents),
    before,
    after,
  };
}

export function getDisplayedSpendableCashTodayCents(result: PipCashResult): number {
  return result.spendableCashToday?.spendableCashTodayCents ?? Math.max(0, result.pipCashTodayCents);
}

export function getSpendableCashTodayState(result: PipCashResult): SpendableCashTodayState {
  if (result.spendableCashToday) {
    return result.spendableCashToday.state;
  }

  return result.pipCashTodayCents < 0 ? "shortfall" : "normal";
}

export function getSpendableCashTodaySubtitle(result: PipCashResult | null): string {
  if (!result) {
    return "Connect data to see today’s number.";
  }

  const metric = result.spendableCashToday;

  if (!metric) {
    return result.pipCashTodayCents < 0
      ? `You’re ${formatPlainMoney(Math.abs(result.pipCashTodayCents))} over today.`
      : "That’s your room for today after bills and savings.";
  }

  if (metric.warnings.some((warning) => warning.id === "missing-card")) {
    return "This may change if you connect the missing card.";
  }

  switch (metric.state) {
    case "healthy":
      return "You spent lightly lately, so today has more room.";
    case "normal":
      return "That’s your room for today after bills and savings.";
    case "tight":
      return "Keep it light today.";
    case "overspending":
      return "Recent spending lowered today’s room.";
    case "shortfall":
      return metric.shortfallCents > 0
        ? `You’re ${formatPlainMoney(metric.shortfallCents)} over your pattern.`
        : "No extra room today. Essentials only.";
    case "low_confidence":
      return "This is an early estimate while I learn your pattern.";
    case "missing_data":
      return "I need more data to make this reliable.";
  }
}

export function classifySpendableTransaction(
  transaction: Transaction,
  accountById: Map<string, Account>,
  recurringKeys = new Set<string>(),
): ClassifiedSpendableTransaction {
  const account = accountById.get(transaction.accountId);
  const kind = classifyTransaction(transaction);
  const recurringKey = getRecurringKey(transaction);

  if (account?.isProtectedSavings) {
    return classified(transaction, "savings_protected", "high", "protected savings account");
  }

  if (kind === "income") {
    return classified(transaction, "income", "high", "income");
  }

  if (kind === "refund") {
    return classified(transaction, "refund", "high", "refund");
  }

  if (kind === "credit_card_payment" || isDedupedCreditCardPayment(transaction)) {
    return classified(transaction, "card_settlement", "high", "credit card settlement");
  }

  if (kind === "transfer") {
    return classified(transaction, "transfer", "high", "transfer");
  }

  if (kind === "rent") {
    return classified(transaction, "recurring_obligation", "high", "rent");
  }

  if (kind === "fee") {
    return classified(transaction, "fee", "medium", "fee");
  }

  if (kind === "purchase") {
    if (isStrongRecurringObligation(transaction)) {
      return classified(transaction, "recurring_obligation", "high", "bill or subscription");
    }

    if (recurringKeys.has(recurringKey)) {
      return classified(transaction, "recurring_obligation", "medium", "recurring merchant");
    }

    return classified(
      transaction,
      "everyday_spending",
      transaction.category || transaction.merchantName ? "high" : "medium",
      "everyday spending",
    );
  }

  if (transaction.amountCents < 0) {
    return classified(transaction, "unknown", "low", "unknown spending");
  }

  return classified(transaction, "unknown", "low", "unknown");
}

function classified(
  transaction: Transaction,
  group: SpendableTransactionGroup,
  confidence: SpendableCashConfidence,
  reason: string,
): ClassifiedSpendableTransaction {
  return {
    transaction,
    group,
    confidence,
    reason,
  };
}

function summarizeMonth(
  month: string,
  items: ClassifiedSpendableTransaction[],
): MonthlySpendableSummary {
  const summary: MonthlySpendableSummary = {
    month,
    incomeCents: 0,
    recurringObligationsCents: 0,
    everydaySpendCents: 0,
    refundCents: 0,
    unknownSpendCents: 0,
    excludedCents: 0,
    transactionCount: items.length,
  };

  for (const item of items) {
    const amountCents = item.transaction.amountCents;

    if (item.group === "income") {
      summary.incomeCents += Math.max(0, amountCents);
    } else if (item.group === "recurring_obligation" || item.group === "fee") {
      summary.recurringObligationsCents += Math.max(0, -amountCents);
    } else if (item.group === "everyday_spending") {
      summary.everydaySpendCents += Math.max(0, -amountCents);
    } else if (item.group === "refund") {
      summary.refundCents += Math.max(0, amountCents);
    } else if (item.group === "unknown") {
      summary.unknownSpendCents += Math.max(0, -amountCents);
    } else {
      summary.excludedCents += Math.abs(amountCents);
    }
  }

  return summary;
}

function scalePartialMonthSummary(
  summary: MonthlySpendableSummary,
  elapsedDays: number,
): MonthlySpendableSummary {
  const scale = elapsedDays > 0 ? DAYS_PER_MONTH / elapsedDays : 1;

  return {
    ...summary,
    incomeCents: Math.round(summary.incomeCents * scale),
    recurringObligationsCents: Math.round(summary.recurringObligationsCents * scale),
    everydaySpendCents: Math.round(summary.everydaySpendCents * scale),
    refundCents: Math.round(summary.refundCents * scale),
    unknownSpendCents: Math.round(summary.unknownSpendCents * scale),
  };
}

function robustAverage(values: number[], mode: "income" | "default" = "default"): number {
  const usable = values.filter((value) => Number.isFinite(value));

  if (usable.length === 0) {
    return 0;
  }

  if (usable.length < 3) {
    return Math.round(usable.reduce((total, value) => total + value, 0) / usable.length);
  }

  const sorted = [...usable].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  const trimmed =
    mode === "income" && sorted.at(-1)! > median * 1.75 && sorted.at(-1)! > median + 50000
      ? sorted.slice(0, -1)
      : sorted;

  return Math.round(trimmed.reduce((total, value) => total + value, 0) / trimmed.length);
}

function estimateObservedRecurringObligations(
  items: ClassifiedSpendableTransaction[],
): number {
  const grouped = new Map<string, number[]>();

  for (const item of items) {
    if (item.group !== "recurring_obligation" && item.group !== "fee") {
      continue;
    }

    const key = getRecurringKey(item.transaction);
    const amounts = grouped.get(key) ?? [];
    amounts.push(Math.max(0, -item.transaction.amountCents));
    grouped.set(key, amounts);
  }

  return [...grouped.values()].reduce((total, amounts) => total + median(amounts), 0);
}

function detectRecurringObligationKeys(transactions: Transaction[]): Set<string> {
  const grouped = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    const kind = classifyTransaction(transaction);

    if (kind !== "purchase" && kind !== "rent" && kind !== "fee") {
      continue;
    }

    if (kind === "purchase" && !isStrongRecurringObligation(transaction)) {
      continue;
    }

    const key = getRecurringKey(transaction);
    const group = grouped.get(key) ?? [];
    group.push(transaction);
    grouped.set(key, group);
  }

  const recurringKeys = new Set<string>();

  for (const [key, group] of grouped) {
    const monthCount = new Set(group.map((transaction) => getMonthKey(transaction.date))).size;

    if (monthCount >= 2 && hasSimilarAmounts(group)) {
      recurringKeys.add(key);
    }
  }

  return recurringKeys;
}

function hasSimilarAmounts(transactions: Transaction[]): boolean {
  const amounts = transactions
    .map((transaction) => Math.max(0, -transaction.amountCents))
    .filter((amount) => amount > 0);

  if (amounts.length < 2) {
    return false;
  }

  const center = median(amounts);

  return amounts.some((amount) => Math.abs(amount - center) <= Math.max(500, center * 0.15));
}

function calculateHiddenCushion(averageMonthlyIncomeCents: number): number {
  if (averageMonthlyIncomeCents <= 0) {
    return 0;
  }

  return clamp(Math.round(averageMonthlyIncomeCents * 0.03), 5000, 25000);
}

function calculateAvailableCashGuardrail(accounts: Account[]): number {
  return accounts
    .filter((account) =>
      !account.isProtectedSavings && (account.kind === "checking" || account.kind === "savings")
    )
    .reduce(
      (total, account) => total + Math.max(0, account.availableBalanceCents ?? account.balanceCents),
      0,
    );
}

function calculatePendingCommittedSpend(items: ClassifiedSpendableTransaction[]): number {
  return items
    .filter((item) => {
      if (!item.transaction.pending) {
        return false;
      }

      return (
        item.group === "everyday_spending" ||
        item.group === "recurring_obligation" ||
        item.group === "fee" ||
        item.group === "unknown"
      );
    })
    .reduce((total, item) => total + Math.max(0, -item.transaction.amountCents), 0);
}

function determineConfidence(input: {
  completedMonthCount: number;
  classifiedTransactions: ClassifiedSpendableTransaction[];
  accountCount: number;
  transactionCount: number;
}): SpendableCashConfidence {
  if (input.accountCount === 0 || input.transactionCount === 0) {
    return "low";
  }

  const spendItems = input.classifiedTransactions.filter((item) => item.transaction.amountCents < 0);
  const spendCents = spendItems.reduce(
    (total, item) => total + Math.max(0, -item.transaction.amountCents),
    0,
  );
  const lowConfidenceCents = spendItems
    .filter((item) => item.confidence === "low")
    .reduce((total, item) => total + Math.max(0, -item.transaction.amountCents), 0);
  const lowConfidenceShare = spendCents > 0 ? lowConfidenceCents / spendCents : 0;

  if (input.completedMonthCount >= 3 && lowConfidenceShare <= 0.15) {
    return "high";
  }

  if (input.completedMonthCount >= 2 && lowConfidenceShare <= 0.3) {
    return "medium";
  }

  return "low";
}

function determineState(input: {
  spendableCashTodayCents: number;
  shortfallCents: number;
  behaviorAdjustmentCents: number;
  materialDailyChangeCents: number;
  confidence: SpendableCashConfidence;
  warningCount: number;
  accountCount: number;
  transactionCount: number;
}): SpendableCashTodayState {
  if (input.accountCount === 0 || input.transactionCount === 0) {
    return "missing_data";
  }

  if (input.shortfallCents > 0 || input.spendableCashTodayCents === 0) {
    return "shortfall";
  }

  if (input.warningCount > 0) {
    return "missing_data";
  }

  if (input.confidence === "low") {
    return "low_confidence";
  }

  if (input.spendableCashTodayCents < 1500) {
    return "tight";
  }

  if (input.behaviorAdjustmentCents <= -input.materialDailyChangeCents) {
    return "overspending";
  }

  if (input.behaviorAdjustmentCents >= input.materialDailyChangeCents) {
    return "healthy";
  }

  return "normal";
}

function buildSpendableDataStates(input: {
  baseDataStates: FinancialDataState[];
  completedMonthCount: number;
  transactionCount: number;
  accountCount: number;
}): FinancialDataState[] {
  const dataStates = [...input.baseDataStates];

  if (input.accountCount === 0 || input.transactionCount === 0) {
    dataStates.push({
      id: "missing-data",
      label: "More data needed",
      detail: "Connect account data before relying on Spendable Cash Today.",
      amountCents: 0,
      tone: "warning",
    });
  } else if (input.completedMonthCount < 2) {
    dataStates.push({
      id: "low-confidence",
      label: "Early estimate",
      detail: "I have less than two completed months, so this is still conservative.",
      amountCents: 0,
      tone: "warning",
    });
  }

  return dedupeDataStates(dataStates);
}

function buildSpendableDrivers(input: {
  baselineDailyAllowanceCents: number;
  behaviorAdjustmentCents: number;
  materialDailyChangeCents: number;
  averageMonthlyRecurringObligationsCents: number;
  protectedSavingsMonthlyCents: number;
  hiddenCushionCents: number;
  cashRealityAdjustmentCents: number;
  confidence: SpendableCashConfidence;
  completedMonthCount: number;
  warningCount: number;
}): PipCashDriver[] {
  const drivers: PipCashDriver[] = [
    {
      id: "baseline-room",
      label: "Normal room",
      detail: "Pattern-based daily room after recurring obligations and protected savings.",
      amountCents: input.baselineDailyAllowanceCents,
      tone: input.baselineDailyAllowanceCents > 0 ? "positive" : "neutral",
    },
  ];

  if (Math.abs(input.behaviorAdjustmentCents) >= input.materialDailyChangeCents) {
    drivers.push({
      id: "recent-spending-adjustment",
      label: "Recent spending adjustment",
      detail:
        input.behaviorAdjustmentCents < 0
          ? "Recent everyday spending is running ahead of pace."
          : "Recent everyday spending is lighter than pace.",
      amountCents: input.behaviorAdjustmentCents,
      tone: input.behaviorAdjustmentCents < 0 ? "negative" : "positive",
    });
  }

  drivers.push(
    {
      id: "recurring-obligations",
      label: "Bills held back",
      detail: "Likely rent, utilities, subscriptions, fees, and other recurring obligations.",
      amountCents: -input.averageMonthlyRecurringObligationsCents,
      tone: input.averageMonthlyRecurringObligationsCents > 0 ? "negative" : "neutral",
    },
    {
      id: "protected-savings",
      label: "Protected savings",
      detail: "Savings held back before Spendable Cash Today is calculated.",
      amountCents: -input.protectedSavingsMonthlyCents,
      tone: "neutral",
    },
    {
      id: "hidden-cushion",
      label: "Small cushion",
      detail: "A small cushion is held back so the number is not too aggressive.",
      amountCents: -input.hiddenCushionCents,
      tone: "neutral",
    },
  );

  if (input.cashRealityAdjustmentCents >= input.materialDailyChangeCents) {
    drivers.push({
      id: "cash-guardrail",
      label: "Cash guardrail",
      detail: "Available cash capped today's pattern-based number.",
      amountCents: -input.cashRealityAdjustmentCents,
      tone: "warning",
    });
  }

  if (input.confidence === "low") {
    drivers.push({
      id: "low-confidence",
      label: "Early estimate",
      detail: `Only ${input.completedMonthCount} completed month${input.completedMonthCount === 1 ? "" : "s"} are available.`,
      amountCents: 0,
      tone: "warning",
    });
  }

  if (input.warningCount > 0) {
    drivers.push({
      id: "missing-data",
      label: "Missing data may change this",
      detail: "One or more data warnings could affect the number.",
      amountCents: 0,
      tone: "warning",
    });
  }

  return drivers;
}

function isStrongRecurringObligation(transaction: Transaction): boolean {
  const haystack = normalizeText(
    [transaction.category, transaction.merchantName, transaction.description].filter(Boolean).join(" "),
  );

  if (/\bgas\b/.test(haystack) && /\b(fuel|station|shell|chevron|exxon)\b/.test(haystack)) {
    return false;
  }

  return [
    "rent",
    "mortgage",
    "utility",
    "utilities",
    "electric",
    "power",
    "water",
    "internet",
    "phone",
    "mobile",
    "subscription",
    "insurance",
    "loan",
    "membership",
    "gym",
  ].some((token) => hasToken(haystack, token));
}

function getRecurringKey(transaction: Transaction): string {
  const merchant = normalizeText(transaction.merchantName ?? transaction.description);
  const category = normalizeText(transaction.category ?? "");

  return merchant || category || "unknown";
}

function startOfMonth(date: string): string {
  const parts = parseDateParts(date);

  return formatDateParts({
    year: parts.year,
    month: parts.month,
    day: 1,
  });
}

function addMonths(monthStartDate: string, monthDelta: number): string {
  const parts = parseDateParts(monthStartDate);
  const monthIndex = parts.year * 12 + (parts.month - 1) + monthDelta;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;

  return formatDateParts({
    year,
    month,
    day: Math.min(parts.day, daysInMonth(year, month)),
  });
}

function enumerateMonthKeys(startDate: string, endDate: string): string[] {
  if (endDate < startDate) {
    return [];
  }

  const keys: string[] = [];
  let cursor = startOfMonth(startDate);

  while (cursor <= endDate) {
    keys.push(getMonthKey(cursor));
    cursor = addMonths(cursor, 1);
  }

  return keys;
}

function getMonthKey(date: string): string {
  return date.slice(0, 7);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }

  return Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getMaterialDailyChangeCents(baselineDailyAllowanceCents: number): number {
  return Math.max(
    MIN_MATERIAL_DAILY_CHANGE_CENTS,
    Math.round(Math.abs(baselineDailyAllowanceCents) * 0.1),
  );
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hasToken(haystack: string, token: string): boolean {
  return haystack.split(/\s+/).filter(Boolean).includes(token);
}

function dedupeDataStates(dataStates: FinancialDataState[]): FinancialDataState[] {
  const seen = new Set<string>();

  return dataStates.filter((state) => {
    if (seen.has(state.id)) {
      return false;
    }

    seen.add(state.id);
    return true;
  });
}

function formatPlainMoney(amountCents: number): string {
  const roundedDollars = Math.round(amountCents / 100);

  return `$${roundedDollars.toLocaleString("en-US")}`;
}
