import { classifyTransaction } from "@/lib/pip-cash/classify";
import {
  addDays,
  dateToUtc,
  daysInMonth,
  formatDateParts,
  isWithinInclusiveWindow,
  parseDateParts,
} from "@/lib/pip-cash/date-window";
import {
  annotateCreditCardPaymentMatches,
} from "@/lib/pip-cash/dedupe-credit-card-payments";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import {
  buildRecurringObligations,
  normalizeRecurringMerchantKey,
} from "@/lib/pip-cash/recurring-obligations";
import { toPipCashSnapshot } from "@/lib/pip-cash/account-filters";
import type {
  Account,
  FinancialSnapshot,
  RecurringObligation,
  RecurringObligationRule,
  RollingWindow,
  Transaction,
  TransactionKind,
} from "@/lib/types";

const DEFAULT_FORECAST_HORIZON_DAYS = 14;
const MAX_FORECAST_HORIZON_DAYS = 14;
const RECURRING_LOOKBACK_DAYS = 180;
const RECURRING_CARD_HORIZON_DAYS = 45;
const ACTIVE_MONTHLY_LOOKBACK_DAYS = 45;
const MONTHLY_INTERVAL_MIN_DAYS = 24;
const MONTHLY_INTERVAL_MAX_DAYS = 38;

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

type RecurringActivitySourceEntry = {
  merchantKey: string;
  item: RecurringActivityItem;
  priority: number;
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
  snapshot = toPipCashSnapshot(snapshot);
  const result = calculatePipCash(snapshot);
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
  snapshot = toPipCashSnapshot(snapshot);
  const asOfDate = snapshot.settings.asOfDate;
  const horizonDays = input.horizonDays ?? RECURRING_CARD_HORIZON_DAYS;
  const recurringModel = buildRecurringObligations({
    snapshot,
    rules: snapshot.recurringObligationRules ?? [],
  });
  const ignoredMerchantKeys = new Set(recurringModel.ignoredMerchantKeys);
  const confirmedMerchantKeys = new Set(
    recurringModel.confirmed.map((obligation) => obligation.merchantKey),
  );
  const lookbackTransactions = annotateCreditCardPaymentMatches(snapshot.transactions, snapshot.accounts)
    .filter((transaction) =>
      transaction.date <= asOfDate &&
      transaction.date >= addDays(asOfDate, -RECURRING_LOOKBACK_DAYS),
    );
  const recurringTransactions = lookbackTransactions
    .filter((transaction) => isDefaultRecurringActivityCandidate(transaction));
  const grouped = groupBy(recurringTransactions, (transaction) => recurringGroupKey(transaction));
  const sourceEntries: RecurringActivitySourceEntry[] = buildConfirmedRecurringActivityItems({
    obligations: recurringModel.confirmed,
    rules: snapshot.recurringObligationRules ?? [],
    transactions: lookbackTransactions,
    asOfDate,
    horizonDays,
  }).map((item) => ({
    merchantKey: getRecurringMerchantKey(item),
    item,
    priority: 0,
  }));

  for (const group of grouped.values()) {
    const candidate = buildRecurringCandidate(group, asOfDate);

    if (!candidate) {
      continue;
    }

    const merchantKey = getRecurringMerchantKey(candidate);

    if (
      !hasRelatedRecurringMerchantKey(ignoredMerchantKeys, merchantKey) &&
      !hasRelatedRecurringMerchantKey(confirmedMerchantKeys, merchantKey) &&
      candidate.expectedDate > asOfDate &&
      candidate.expectedDate <= addDays(asOfDate, horizonDays)
    ) {
      sourceEntries.push({
        merchantKey,
        item: candidate,
        priority: 1,
      });
    }
  }

  for (const group of grouped.values()) {
    const candidate = buildHistoricalRecurringCandidate(group, asOfDate, horizonDays);

    if (!candidate) {
      continue;
    }

    const merchantKey = getRecurringMerchantKey(candidate);

    if (
      !hasRelatedRecurringMerchantKey(ignoredMerchantKeys, merchantKey) &&
      !hasRelatedRecurringMerchantKey(confirmedMerchantKeys, merchantKey)
    ) {
      sourceEntries.push({
        merchantKey,
        item: candidate,
        priority: 2,
      });
    }
  }

  const items = dedupeRecurringItemsByMerchant(sourceEntries);

  return {
    asOfDate,
    horizonDays,
    items: items
      .sort((left, right) =>
        left.expectedDate.localeCompare(right.expectedDate) ||
        Math.abs(right.amountCents) - Math.abs(left.amountCents) ||
        left.label.localeCompare(right.label)
      )
      .slice(0, 8),
  };
}

export function buildSpendableCashForecast(
  snapshot: FinancialSnapshot,
  input: { horizonDays?: number } = {},
): SpendableCashForecast {
  snapshot = toPipCashSnapshot(snapshot);
  const horizonDays = clampForecastHorizon(input.horizonDays);
  const result = calculatePipCash(snapshot);
  const metric = result.spendableCashToday;
  const currentSpendableCashCents =
    metric?.spendableCashTodayCents ?? Math.max(0, result.pipCashTodayCents);
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
    const projectedResult = calculatePipCash(projectedSnapshot);
    const projectedMetric = projectedResult.spendableCashToday;
    const projectedSpendableCashCents =
      projectedMetric?.spendableCashTodayCents ?? Math.max(0, projectedResult.pipCashTodayCents);

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
  snapshot = toPipCashSnapshot(snapshot);
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

function buildConfirmedRecurringActivityItems(input: {
  obligations: RecurringObligation[];
  rules: RecurringObligationRule[];
  transactions: Transaction[];
  asOfDate: string;
  horizonDays: number;
}): RecurringActivityItem[] {
  const rulesByMerchantKey = new Map(
    input.rules
      .filter((rule) => rule.status === "active" && rule.source === "user_confirmed")
      .map((rule) => [rule.merchantKey, rule]),
  );
  const items: RecurringActivityItem[] = [];

  for (const obligation of input.obligations) {
    const matchingTransactions = input.transactions
      .filter((transaction) =>
        transaction.amountCents < 0 &&
        transactionMatchesMerchantKey(transaction, obligation.merchantKey),
      )
      .sort((left, right) => left.date.localeCompare(right.date));
    const latest = matchingTransactions.at(-1);
    const expectedDate = obligation.expectedDay
      ? nextMonthlyDayAfter(obligation.expectedDay, input.asOfDate)
      : latest
        ? nextMonthlyDateAfter(latest.date, input.asOfDate)
        : null;

    if (!expectedDate || !isWithinRecurringHorizon(expectedDate, input.asOfDate, input.horizonDays)) {
      continue;
    }

    const rule = rulesByMerchantKey.get(obligation.merchantKey);

    items.push({
      id: `confirmed-${obligation.merchantKey}`,
      label: formatLabel(obligation.label),
      merchantName: latest?.merchantName ?? formatLabel(obligation.label),
      expectedDate,
      amountCents: -Math.abs(obligation.expectedAmountCents),
      kind: latest ? classifyTransaction(latest) : "purchase",
      cadence: "monthly",
      confidence: "high",
      sourceTransactionCount: matchingTransactions.length,
      lastSeenDate: latest?.date ?? getRuleActivityDate(rule) ?? input.asOfDate,
    });
  }

  return items;
}

function buildRecurringCandidate(
  transactions: Transaction[],
  asOfDate: string,
): RecurringActivityItem | null {
  const sorted = [...transactions].sort((left, right) => left.date.localeCompare(right.date));
  const monthlyOccurrences = getMonthlyRecurringOccurrences(sorted);
  const latest = monthlyOccurrences.at(-1);

  if (!latest) {
    return null;
  }

  if (latest.date < addDays(asOfDate, -ACTIVE_MONTHLY_LOOKBACK_DAYS)) {
    return null;
  }

  const label = getTransactionLabel(latest);
  const kind = classifyTransaction(latest);
  const expectedDate = nextMonthlyDateAfter(latest.date, asOfDate);
  const amountCents = Math.round(
    monthlyOccurrences.reduce((total, transaction) => total + transaction.amountCents, 0) /
      monthlyOccurrences.length,
  );

  return {
    id: `recurring-${normalizeText(label)}`,
    label,
    merchantName: latest.merchantName,
    expectedDate,
    amountCents,
    kind,
    cadence: "monthly",
    confidence: getRecurringConfidence(monthlyOccurrences),
    sourceTransactionCount: monthlyOccurrences.length,
    lastSeenDate: latest.date,
  };
}

function buildHistoricalRecurringCandidate(
  transactions: Transaction[],
  asOfDate: string,
  horizonDays: number,
): RecurringActivityItem | null {
  const sorted = [...transactions].sort((left, right) => left.date.localeCompare(right.date));
  const monthlyOccurrences = getMonthlyRecurringOccurrences(sorted);
  const latest = monthlyOccurrences.at(-1);

  if (!latest || monthlyOccurrences.length < 3) {
    return null;
  }

  if (latest.date >= addDays(asOfDate, -ACTIVE_MONTHLY_LOOKBACK_DAYS)) {
    return null;
  }

  if (!isDefaultRecurringActivityCandidate(latest)) {
    return null;
  }

  const expectedDate = nextMonthlyDateAfter(latest.date, asOfDate);

  if (!isWithinRecurringHorizon(expectedDate, asOfDate, horizonDays)) {
    return null;
  }

  const label = getTransactionLabel(latest);
  const amountCents = Math.round(
    monthlyOccurrences.reduce((total, transaction) => total + transaction.amountCents, 0) /
      monthlyOccurrences.length,
  );

  return {
    id: `historical-${normalizeRecurringMerchantKey(label)}`,
    label,
    merchantName: latest.merchantName,
    expectedDate,
    amountCents,
    kind: classifyTransaction(latest),
    cadence: "monthly",
    confidence: "low",
    sourceTransactionCount: monthlyOccurrences.length,
    lastSeenDate: latest.date,
  };
}

function getMonthlyRecurringOccurrences(transactions: Transaction[]): Transaction[] {
  const monthlyGroups = groupBy(transactions, (transaction) => transaction.date.slice(0, 7));
  const occurrences = [...monthlyGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, monthTransactions]) =>
      [...monthTransactions].sort((left, right) => left.date.localeCompare(right.date))[0],
    )
    .filter((transaction): transaction is Transaction => Boolean(transaction));

  if (occurrences.length < 2) {
    return [];
  }

  const intervals = occurrences.slice(1).map((transaction, index) =>
    daysBetweenDates(occurrences[index].date, transaction.date),
  );

  if (!intervals.every(isMonthlyInterval)) {
    return [];
  }

  return occurrences;
}

function dedupeRecurringItemsByMerchant(entries: RecurringActivitySourceEntry[]): RecurringActivityItem[] {
  const bestByMerchant = new Map<string, { item: RecurringActivityItem; priority: number }>();

  for (const entry of entries) {
    const current = bestByMerchant.get(entry.merchantKey);

    if (!current || entry.priority < current.priority) {
      bestByMerchant.set(entry.merchantKey, {
        item: entry.item,
        priority: entry.priority,
      });
    }
  }

  return [...bestByMerchant.values()].map((entry) => entry.item);
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

function nextMonthlyDayAfter(expectedDay: number, asOfDate: string): string {
  const asOf = parseDateParts(asOfDate);
  const thisMonth = formatDateParts({
    year: asOf.year,
    month: asOf.month,
    day: Math.min(expectedDay, daysInMonth(asOf.year, asOf.month)),
  });

  if (thisMonth > asOfDate) {
    return thisMonth;
  }

  const nextYear = asOf.month === 12 ? asOf.year + 1 : asOf.year;
  const nextMonth = asOf.month === 12 ? 1 : asOf.month + 1;

  return formatDateParts({
    year: nextYear,
    month: nextMonth,
    day: Math.min(expectedDay, daysInMonth(nextYear, nextMonth)),
  });
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

function isDefaultRecurringActivityCandidate(transaction: Transaction): boolean {
  const kind = classifyTransaction(transaction);

  if (transaction.amountCents >= 0) {
    return false;
  }

  if (kind === "rent" || kind === "fee") {
    return true;
  }

  if (kind !== "purchase") {
    return false;
  }

  return isLikelyBillOrSubscription(transaction);
}

function isLikelyBillOrSubscription(transaction: Transaction): boolean {
  const haystack = [
    transaction.description,
    transaction.merchantName,
    transaction.category,
  ].filter(Boolean).join(" ").toLowerCase();

  return (
    /\b(subscription|subscriptions|premium|membership|streaming|utility|utilities|electric|electricity|power|water|sewer|internet|broadband|mobile|phone|cellular|wireless|insurance|gym|rent|mortgage)\b/.test(haystack) ||
    /\b(natural gas|gas bill)\b/.test(haystack)
  );
}

function isMonthlyInterval(dayCount: number): boolean {
  return dayCount >= MONTHLY_INTERVAL_MIN_DAYS && dayCount <= MONTHLY_INTERVAL_MAX_DAYS;
}

function isWithinRecurringHorizon(expectedDate: string, asOfDate: string, horizonDays: number): boolean {
  return expectedDate > asOfDate && expectedDate <= addDays(asOfDate, horizonDays);
}

function daysBetweenDates(startDate: string, endDate: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.round((dateToUtc(endDate) - dateToUtc(startDate)) / millisecondsPerDay);
}

function recurringGroupKey(transaction: Transaction): string {
  return [
    normalizeText(getTransactionLabel(transaction)),
    classifyTransaction(transaction),
  ].join(":");
}

function getRecurringMerchantKey(item: RecurringActivityItem): string {
  const idMatch = /^(?:confirmed|historical)-(.+)$/.exec(item.id);

  if (idMatch?.[1]) {
    return idMatch[1];
  }

  return normalizeRecurringMerchantKey(item.merchantName ?? item.label);
}

function transactionMatchesMerchantKey(transaction: Transaction, merchantKey: string): boolean {
  return getTransactionMerchantKeys(transaction).some((transactionKey) =>
    areRelatedRecurringMerchantKeys(transactionKey, merchantKey)
  );
}

function hasRelatedRecurringMerchantKey(keys: Set<string>, merchantKey: string): boolean {
  for (const key of keys) {
    if (areRelatedRecurringMerchantKeys(key, merchantKey)) {
      return true;
    }
  }

  return false;
}

function areRelatedRecurringMerchantKeys(left: string, right: string): boolean {
  return left === right ||
    left.startsWith(`${right}-`) ||
    right.startsWith(`${left}-`);
}

function getTransactionMerchantKeys(transaction: Transaction): string[] {
  return [
    transaction.merchantName,
    transaction.description,
    getTransactionLabel(transaction),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeRecurringMerchantKey(value));
}

function getRuleActivityDate(rule: RecurringObligationRule | undefined): string | null {
  return (
    normalizeDateString(rule?.lastConfirmedAt) ??
    normalizeDateString(rule?.updatedAt) ??
    null
  );
}

function normalizeDateString(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
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
