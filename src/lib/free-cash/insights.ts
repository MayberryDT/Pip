import { classifyTransaction } from "@/lib/free-cash/classify";
import {
  addDays,
  daysInMonth,
  formatDateParts,
  isWithinInclusiveWindow,
  parseDateParts,
} from "@/lib/free-cash/date-window";
import {
  annotateCreditCardPaymentMatches,
} from "@/lib/free-cash/dedupe-credit-card-payments";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import type {
  Account,
  FinancialSnapshot,
  RollingWindow,
  Transaction,
  TransactionKind,
} from "@/lib/types";

const DEFAULT_FORECAST_HORIZON_DAYS = 14;
const MAX_FORECAST_HORIZON_DAYS = 14;
const RECURRING_LOOKBACK_DAYS = 90;
const RECURRING_CARD_HORIZON_DAYS = 45;

export type SpendingBreakdownGroup = {
  id: string;
  label: string;
  amountCents: number;
  transactionCount: number;
};

export type SpendingBreakdown = {
  window: RollingWindow;
  totals: {
    incomeCents: number;
    spendingCents: number;
    refundCents: number;
    rentCents: number;
    cardPaymentCents: number;
    protectedSavingsMonthlyCents: number;
  };
  topCategories: SpendingBreakdownGroup[];
  topMerchants: SpendingBreakdownGroup[];
  incomeSources: SpendingBreakdownGroup[];
};

export type RecurringActivityItem = {
  id: string;
  label: string;
  merchantName?: string;
  expectedDate: string;
  amountCents: number;
  kind: TransactionKind;
  cadence: "monthly";
  confidence: "high" | "medium" | "low";
  sourceTransactionCount: number;
  lastSeenDate: string;
};

export type RecurringActivity = {
  asOfDate: string;
  horizonDays: number;
  items: RecurringActivityItem[];
};

export type SpendableCashForecastPoint = {
  date: string;
  projectedSpendableCashCents: number;
  deltaFromTodayCents: number;
  expectedActivityCents: number;
  rollingNetCents: number;
};

export type SpendableCashForecast = {
  asOfDate: string;
  horizonDays: number;
  currentSpendableCashCents: number;
  projectedSpendableCashCents: number;
  dailyTrendCents: number;
  disclaimer: "Forecast only; not guaranteed.";
  points: SpendableCashForecastPoint[];
  recurringItems: RecurringActivityItem[];
};

export function buildSpendingBreakdown(snapshot: FinancialSnapshot): SpendingBreakdown {
  const result = calculateFreeCash(snapshot);
  const transactions = annotateCreditCardPaymentMatches(snapshot.transactions, snapshot.accounts);
  const windowTransactions = transactions.filter((transaction) =>
    isWithinInclusiveWindow(transaction.date, result.window),
  );
  const rentCents = windowTransactions
    .filter((transaction) => classifyTransaction(transaction) === "rent")
    .reduce((total, transaction) => total + Math.max(0, -transaction.amountCents), 0);
  const cardPaymentCents = windowTransactions
    .filter((transaction) => classifyTransaction(transaction) === "credit_card_payment")
    .reduce((total, transaction) => total + Math.max(0, -transaction.amountCents), 0);

  return {
    window: result.window,
    totals: {
      incomeCents: result.incomeTotalCents,
      spendingCents: result.spendingTotalCents,
      refundCents: result.refundTotalCents,
      rentCents,
      cardPaymentCents,
      protectedSavingsMonthlyCents: result.protectedSavingsMonthlyCents,
    },
    topCategories: aggregateSpendingGroups(windowTransactions, "category").slice(0, 5),
    topMerchants: aggregateSpendingGroups(windowTransactions, "merchant").slice(0, 5),
    incomeSources: aggregateIncomeGroups(windowTransactions).slice(0, 3),
  };
}

export function buildRecurringActivity(
  snapshot: FinancialSnapshot,
  input: { horizonDays?: number } = {},
): RecurringActivity {
  const asOfDate = snapshot.settings.asOfDate;
  const horizonDays = input.horizonDays ?? RECURRING_CARD_HORIZON_DAYS;
  const transactions = annotateCreditCardPaymentMatches(snapshot.transactions, snapshot.accounts)
    .filter((transaction) =>
      transaction.date <= asOfDate &&
      transaction.date >= addDays(asOfDate, -RECURRING_LOOKBACK_DAYS),
    )
    .filter((transaction) => isRecurringEligibleKind(classifyTransaction(transaction)));
  const grouped = groupBy(transactions, (transaction) => recurringGroupKey(transaction));
  const items: RecurringActivityItem[] = [];

  for (const group of grouped.values()) {
    const candidate = buildRecurringCandidate(group, asOfDate);

    if (!candidate) {
      continue;
    }

    if (candidate.expectedDate > asOfDate && candidate.expectedDate <= addDays(asOfDate, horizonDays)) {
      items.push(candidate);
    }
  }

  return {
    asOfDate,
    horizonDays,
    items: items
      .sort((left, right) => left.expectedDate.localeCompare(right.expectedDate) || Math.abs(right.amountCents) - Math.abs(left.amountCents))
      .slice(0, 8),
  };
}

export function buildSpendableCashForecast(
  snapshot: FinancialSnapshot,
  input: { horizonDays?: number } = {},
): SpendableCashForecast {
  const horizonDays = clampForecastHorizon(input.horizonDays);
  const result = calculateFreeCash(snapshot);
  const metric = result.spendableCashToday;
  const currentSpendableCashCents =
    metric?.spendableCashTodayCents ?? Math.max(0, result.freeCashTodayCents);
  const recurringActivity = buildRecurringActivity(snapshot, {
    horizonDays,
  });
  const expectedEverydaySpendCents = metric
    ? estimateExpectedEverydaySpendCents(metric.actualEverydaySpendSoFarCents, metric.currentMonthElapsedDays)
    : estimateLegacyEverydaySpendCents(snapshot, result.window);
  const points: SpendableCashForecastPoint[] = [];
  const projectedTransactions: Transaction[] = [];
  let projectedCashDeltaCents = 0;

  for (let day = 1; day <= horizonDays; day += 1) {
    const date = addDays(snapshot.settings.asOfDate, day);
    const dailyTransactions = buildForecastTransactionsForDate({
      date,
      day,
      expectedEverydaySpendCents,
      recurringItems: recurringActivity.items.filter((item) => item.expectedDate === date),
      accounts: snapshot.accounts,
    });
    const expectedActivityCents = dailyTransactions.reduce(
      (total, transaction) => total + transaction.amountCents,
      0,
    );

    projectedTransactions.push(...dailyTransactions);
    projectedCashDeltaCents += expectedActivityCents;

    const projectedSnapshot: FinancialSnapshot = {
      ...snapshot,
      settings: {
        ...snapshot.settings,
        asOfDate: date,
      },
      accounts: applyProjectedCashDelta(snapshot.accounts, projectedCashDeltaCents),
      transactions: [...snapshot.transactions, ...projectedTransactions],
    };
    const projectedResult = calculateFreeCash(projectedSnapshot);
    const projectedMetric = projectedResult.spendableCashToday;
    const projectedSpendableCashCents =
      projectedMetric?.spendableCashTodayCents ?? Math.max(0, projectedResult.freeCashTodayCents);

    points.push({
      date,
      projectedSpendableCashCents,
      deltaFromTodayCents: projectedSpendableCashCents - currentSpendableCashCents,
      expectedActivityCents,
      rollingNetCents: projectedMetric?.legacyRollingNetCents ?? projectedResult.rollingNetCents,
    });
  }

  const projectedSpendableCashCents =
    points.at(-1)?.projectedSpendableCashCents ?? currentSpendableCashCents;

  return {
    asOfDate: snapshot.settings.asOfDate,
    horizonDays,
    currentSpendableCashCents,
    projectedSpendableCashCents,
    dailyTrendCents:
      points.length > 0
        ? Math.round((projectedSpendableCashCents - currentSpendableCashCents) / points.length)
        : 0,
    disclaimer: "Forecast only; not guaranteed.",
    points,
    recurringItems: recurringActivity.items,
  };
}

function estimateExpectedEverydaySpendCents(
  actualEverydaySpendSoFarCents: number,
  elapsedDays: number,
): number {
  if (actualEverydaySpendSoFarCents <= 0 || elapsedDays <= 0) {
    return 0;
  }

  return Math.round(actualEverydaySpendSoFarCents / elapsedDays);
}

function estimateLegacyEverydaySpendCents(
  snapshot: FinancialSnapshot,
  window: RollingWindow,
): number {
  const transactions = annotateCreditCardPaymentMatches(snapshot.transactions, snapshot.accounts);
  const windowTransactions = transactions.filter((transaction) =>
    isWithinInclusiveWindow(transaction.date, window),
  );
  const spendCents = windowTransactions
    .filter((transaction) => {
      const kind = classifyTransaction(transaction);

      return kind === "purchase" || kind === "rent" || kind === "fee";
    })
    .reduce((total, transaction) => total + Math.max(0, -transaction.amountCents), 0);

  return Math.round(spendCents / window.dayCount);
}

function buildForecastTransactionsForDate(input: {
  date: string;
  day: number;
  expectedEverydaySpendCents: number;
  recurringItems: RecurringActivityItem[];
  accounts: Account[];
}): Transaction[] {
  const accountId = getForecastAccountId(input.accounts);
  const transactions: Transaction[] = [];

  if (input.expectedEverydaySpendCents > 0) {
    transactions.push({
      id: `forecast-everyday-${input.date}`,
      accountId,
      date: input.date,
      description: "Projected everyday spending",
      merchantName: "Projected everyday spending",
      amountCents: -input.expectedEverydaySpendCents,
      category: "projected spending",
      kind: "purchase",
    });
  }

  input.recurringItems.forEach((item, index) => {
    transactions.push({
      id: `forecast-recurring-${input.day}-${index}-${item.id}`,
      accountId,
      date: input.date,
      description: item.label,
      merchantName: item.merchantName,
      amountCents: item.amountCents,
      category: "recurring",
      kind: item.kind,
    });
  });

  return transactions;
}

function getForecastAccountId(accounts: Account[]): string {
  return (
    accounts.find((account) => !account.isProtectedSavings && account.kind === "checking")?.id ??
    accounts.find((account) =>
      !account.isProtectedSavings && (account.kind === "checking" || account.kind === "savings")
    )?.id ??
    accounts.find((account) => !account.isProtectedSavings)?.id ??
    "forecast"
  );
}

function applyProjectedCashDelta(accounts: Account[], projectedCashDeltaCents: number): Account[] {
  if (projectedCashDeltaCents === 0) {
    return accounts;
  }

  const accountId = getForecastCashAccountId(accounts);

  if (!accountId) {
    return accounts;
  }

  return accounts.map((account) => {
    if (account.id !== accountId) {
      return account;
    }

    return {
      ...account,
      balanceCents: account.balanceCents + projectedCashDeltaCents,
      availableBalanceCents:
        account.availableBalanceCents === undefined
          ? undefined
          : account.availableBalanceCents + projectedCashDeltaCents,
    };
  });
}

function getForecastCashAccountId(accounts: Account[]): string | null {
  return (
    accounts.find((account) => !account.isProtectedSavings && account.kind === "checking")?.id ??
    accounts.find((account) => !account.isProtectedSavings && account.kind === "savings")?.id ??
    null
  );
}

function aggregateSpendingGroups(
  transactions: Transaction[],
  mode: "category" | "merchant",
): SpendingBreakdownGroup[] {
  const grouped = new Map<string, SpendingBreakdownGroup>();

  for (const transaction of transactions) {
    const kind = classifyTransaction(transaction);

    if (kind !== "purchase" && kind !== "rent" && kind !== "fee") {
      continue;
    }

    const label = mode === "category"
      ? formatLabel(transaction.category ?? kind)
      : getTransactionLabel(transaction);
    const id = normalizeText(label) || "other";
    const current = grouped.get(id) ?? {
      id,
      label,
      amountCents: 0,
      transactionCount: 0,
    };

    current.amountCents -= Math.max(0, -transaction.amountCents);
    current.transactionCount += 1;
    grouped.set(id, current);
  }

  return [...grouped.values()].sort((left, right) => Math.abs(right.amountCents) - Math.abs(left.amountCents));
}

function aggregateIncomeGroups(transactions: Transaction[]): SpendingBreakdownGroup[] {
  const grouped = new Map<string, SpendingBreakdownGroup>();

  for (const transaction of transactions) {
    if (classifyTransaction(transaction) !== "income") {
      continue;
    }

    const label = getTransactionLabel(transaction);
    const id = normalizeText(label) || "income";
    const current = grouped.get(id) ?? {
      id,
      label,
      amountCents: 0,
      transactionCount: 0,
    };

    current.amountCents += Math.max(0, transaction.amountCents);
    current.transactionCount += 1;
    grouped.set(id, current);
  }

  return [...grouped.values()].sort((left, right) => right.amountCents - left.amountCents);
}

function buildRecurringCandidate(
  transactions: Transaction[],
  asOfDate: string,
): RecurringActivityItem | null {
  const sorted = [...transactions].sort((left, right) => left.date.localeCompare(right.date));
  const latest = sorted.at(-1);

  if (!latest) {
    return null;
  }

  const label = getTransactionLabel(latest);
  const kind = classifyTransaction(latest);
  const expectedDate = nextMonthlyDateAfter(latest.date, asOfDate);
  const amountCents = Math.round(
    sorted.reduce((total, transaction) => total + transaction.amountCents, 0) / sorted.length,
  );

  if (sorted.length >= 2) {
    return {
      id: `recurring-${normalizeText(label)}`,
      label,
      merchantName: latest.merchantName,
      expectedDate,
      amountCents,
      kind,
      cadence: "monthly",
      confidence: getRecurringConfidence(sorted),
      sourceTransactionCount: sorted.length,
      lastSeenDate: latest.date,
    };
  }

  if (!isLikelySingleTransactionRecurring(latest)) {
    return null;
  }

  return {
    id: `recurring-${normalizeText(label)}`,
    label,
    merchantName: latest.merchantName,
    expectedDate,
    amountCents: latest.amountCents,
    kind,
    cadence: "monthly",
    confidence: "low",
    sourceTransactionCount: 1,
    lastSeenDate: latest.date,
  };
}

function getRecurringConfidence(transactions: Transaction[]): RecurringActivityItem["confidence"] {
  const days = transactions.map((transaction) => parseDateParts(transaction.date).day);
  const amounts = transactions.map((transaction) => Math.abs(transaction.amountCents));
  const daySpread = Math.max(...days) - Math.min(...days);
  const amountSpread = Math.max(...amounts) - Math.min(...amounts);
  const averageAmount = amounts.reduce((total, amount) => total + amount, 0) / amounts.length;

  if (transactions.length >= 3 && daySpread <= 3 && amountSpread <= averageAmount * 0.15) {
    return "high";
  }

  if (daySpread <= 5 || amountSpread <= averageAmount * 0.2) {
    return "medium";
  }

  return "low";
}

function nextMonthlyDateAfter(lastSeenDate: string, asOfDate: string): string {
  let next = addOneCalendarMonth(lastSeenDate);

  while (next <= asOfDate) {
    next = addOneCalendarMonth(next);
  }

  return next;
}

function addOneCalendarMonth(date: string): string {
  const parts = parseDateParts(date);
  let targetYear = parts.year;
  let targetMonth = parts.month + 1;

  if (targetMonth === 13) {
    targetMonth = 1;
    targetYear += 1;
  }

  return formatDateParts({
    year: targetYear,
    month: targetMonth,
    day: Math.min(parts.day, daysInMonth(targetYear, targetMonth)),
  });
}

function isLikelySingleTransactionRecurring(transaction: Transaction): boolean {
  const haystack = [
    transaction.description,
    transaction.merchantName,
    transaction.category,
  ].filter(Boolean).join(" ").toLowerCase();

  return (
    classifyTransaction(transaction) === "rent" ||
    classifyTransaction(transaction) === "income" ||
    /\b(subscription|premium|membership|rent|payroll|salary|utility|utilities|mobile|phone|insurance|gym)\b/.test(haystack)
  );
}

function isRecurringEligibleKind(kind: TransactionKind): boolean {
  return (
    kind === "income" ||
    kind === "purchase" ||
    kind === "rent" ||
    kind === "fee" ||
    kind === "credit_card_payment"
  );
}

function recurringGroupKey(transaction: Transaction): string {
  return [
    normalizeText(getTransactionLabel(transaction)),
    classifyTransaction(transaction),
  ].join(":");
}

function clampForecastHorizon(horizonDays: number | undefined): number {
  if (!horizonDays) {
    return DEFAULT_FORECAST_HORIZON_DAYS;
  }

  return Math.min(Math.max(Math.round(horizonDays), 1), MAX_FORECAST_HORIZON_DAYS);
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const current = grouped.get(key) ?? [];

    current.push(item);
    grouped.set(key, current);
  }

  return grouped;
}

function getTransactionLabel(transaction: Transaction): string {
  return formatLabel(transaction.merchantName ?? transaction.description);
}

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
