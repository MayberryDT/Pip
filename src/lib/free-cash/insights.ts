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
  isDedupedCreditCardPayment,
} from "@/lib/free-cash/dedupe-credit-card-payments";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import type {
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
  const transactions = annotateCreditCardPaymentMatches(snapshot.transactions, snapshot.accounts);
  const recurringActivity = buildRecurringActivity(snapshot, {
    horizonDays,
  });
  const recurringLabels = new Set(
    buildRecurringActivity(snapshot).items.map((item) => normalizeText(item.label)),
  );
  const windowTransactions = transactions.filter((transaction) =>
    isWithinInclusiveWindow(transaction.date, result.window),
  );
  const nonRecurringSpendCents = windowTransactions
    .filter((transaction) => {
      const kind = classifyTransaction(transaction);

      return (
        (kind === "purchase" || kind === "rent" || kind === "fee") &&
        !recurringLabels.has(normalizeText(getTransactionLabel(transaction)))
      );
    })
    .reduce((total, transaction) => total + Math.max(0, -transaction.amountCents), 0);
  const dailyTrendCents = -Math.round(nonRecurringSpendCents / result.window.dayCount);
  const points: SpendableCashForecastPoint[] = [];
  let rollingNetCents = result.rollingNetCents;

  for (let day = 1; day <= horizonDays; day += 1) {
    const date = addDays(result.window.endDate, day);
    const exitingDate = addDays(result.window.startDate, day - 1);
    const exitingContributionCents = sumRollingNetContributions(
      transactions.filter((transaction) => transaction.date === exitingDate),
    );
    const recurringContributionCents = recurringActivity.items
      .filter((item) => item.expectedDate === date)
      .reduce((total, item) => total + getRecurringContribution(item), 0);
    const expectedActivityCents = dailyTrendCents + recurringContributionCents;

    rollingNetCents = rollingNetCents - exitingContributionCents + expectedActivityCents;

    const projectedSpendableCashCents = Math.round(rollingNetCents / result.window.dayCount);

    points.push({
      date,
      projectedSpendableCashCents,
      deltaFromTodayCents: projectedSpendableCashCents - result.freeCashTodayCents,
      expectedActivityCents,
      rollingNetCents,
    });
  }

  return {
    asOfDate: result.window.endDate,
    horizonDays,
    currentSpendableCashCents: result.freeCashTodayCents,
    projectedSpendableCashCents:
      points.at(-1)?.projectedSpendableCashCents ?? result.freeCashTodayCents,
    dailyTrendCents,
    disclaimer: "Forecast only; not guaranteed.",
    points,
    recurringItems: recurringActivity.items,
  };
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

function getRecurringContribution(item: RecurringActivityItem): number {
  if (item.kind === "income") {
    return Math.max(0, item.amountCents);
  }

  if (item.kind === "purchase" || item.kind === "rent" || item.kind === "fee") {
    return -Math.max(0, -item.amountCents);
  }

  return 0;
}

function sumRollingNetContributions(transactions: Transaction[]): number {
  return transactions.reduce((total, transaction) => total + getRollingNetContribution(transaction), 0);
}

function getRollingNetContribution(transaction: Transaction): number {
  const kind = classifyTransaction(transaction);

  if (kind === "income" || kind === "refund") {
    return Math.max(0, transaction.amountCents);
  }

  if (kind === "purchase" || kind === "rent" || kind === "fee") {
    return -Math.max(0, -transaction.amountCents);
  }

  if (kind === "credit_card_payment" && isDedupedCreditCardPayment(transaction)) {
    return 0;
  }

  return 0;
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
