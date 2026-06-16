import { toPipCashSnapshot } from "@/lib/pip-cash/account-filters";
import { classifyTransaction } from "@/lib/pip-cash/classify";
import { addDays } from "@/lib/pip-cash/date-window";
import {
  annotateCreditCardPaymentMatches,
  isDedupedCreditCardPayment,
} from "@/lib/pip-cash/dedupe-credit-card-payments";
import { formatMoney } from "@/lib/money";
import type {
  Account,
  FinancialSnapshot,
  SpendableCashConfidence,
  Transaction,
} from "@/lib/types";

const DEFAULT_WINDOW_DAYS = 14;
const DEFAULT_MAX_OPPORTUNITIES = 3;
const DEFAULT_MIN_CURRENT_SPEND_CENTS = 2500;
const DEFAULT_MIN_ESTIMATED_SAVINGS_CENTS = 500;

export type SpendingOpportunityReasonCode =
  | "discretionary_category"
  | "recent_increase"
  | "frequent_transactions"
  | "material_spend"
  | "merchant_concentration";

export type SpendingOpportunity = {
  id: string;
  category: string;
  estimatedSavingsCents: number;
  confidence: SpendableCashConfidence;
  reasonCodes: SpendingOpportunityReasonCode[];
  merchantExamples: string[];
  transactionCount: number;
  windowDays: number;
  currentSpendCents: number;
  previousSpendCents: number;
  deltaCents: number;
  suggestedAction: string;
};

export type SpendingOpportunityOptions = {
  windowDays?: number;
  maxOpportunities?: number;
  minCurrentSpendCents?: number;
  minEstimatedSavingsCents?: number;
};

type EligibleTransaction = {
  transaction: Transaction;
  categoryKey: string;
  category: string;
  discretionary: boolean;
};

type OpportunitySummary = {
  categoryKey: string;
  category: string;
  discretionary: boolean;
  currentSpendCents: number;
  previousSpendCents: number;
  currentTransactions: Transaction[];
  previousTransactions: Transaction[];
  merchantExamples: string[];
  topMerchantSpendCents: number;
};

export function buildSpendingOpportunities(
  snapshot: FinancialSnapshot,
  options: SpendingOpportunityOptions = {},
): SpendingOpportunity[] {
  const windowDays = normalizeWindowDays(options.windowDays);
  const maxOpportunities = Math.max(
    1,
    Math.floor(options.maxOpportunities ?? DEFAULT_MAX_OPPORTUNITIES),
  );
  const minCurrentSpendCents = options.minCurrentSpendCents ?? DEFAULT_MIN_CURRENT_SPEND_CENTS;
  const minEstimatedSavingsCents =
    options.minEstimatedSavingsCents ?? DEFAULT_MIN_ESTIMATED_SAVINGS_CENTS;
  const pipCashSnapshot = toPipCashSnapshot(snapshot);
  const accountById = new Map(pipCashSnapshot.accounts.map((account) => [account.id, account]));
  const currentWindow = buildFixedWindow(snapshot.settings.asOfDate, windowDays);
  const previousWindow = buildFixedWindow(addDays(currentWindow.startDate, -1), windowDays);
  const eligibleTransactions = annotateCreditCardPaymentMatches(
    pipCashSnapshot.transactions,
    pipCashSnapshot.accounts,
  )
    .filter((transaction) => transaction.date <= snapshot.settings.asOfDate)
    .flatMap((transaction) => toEligibleTransaction(transaction, accountById));
  const summaries = summarizeOpportunities(eligibleTransactions, currentWindow, previousWindow);

  return summaries
    .map((summary) =>
      toSpendingOpportunity(summary, {
        windowDays,
        minCurrentSpendCents,
        minEstimatedSavingsCents,
      }),
    )
    .filter((opportunity): opportunity is SpendingOpportunity => opportunity !== null)
    .sort(compareOpportunities)
    .slice(0, maxOpportunities);
}

function buildFixedWindow(
  endDate: string,
  dayCount: number,
): { startDate: string; endDate: string } {
  return {
    startDate: addDays(endDate, -(dayCount - 1)),
    endDate,
  };
}

function toEligibleTransaction(
  transaction: Transaction,
  accountById: Map<string, Account>,
): EligibleTransaction[] {
  const account = accountById.get(transaction.accountId);

  if (!isEligibleSpendTransaction(transaction, account)) {
    return [];
  }

  const category = getOpportunityCategory(transaction);

  return [
    {
      transaction,
      categoryKey: category.key,
      category: category.label,
      discretionary: category.discretionary,
    },
  ];
}

function isEligibleSpendTransaction(transaction: Transaction, account: Account | undefined): boolean {
  const kind = classifyTransaction(transaction);

  if (transaction.amountCents >= 0) {
    return false;
  }

  if (account?.kind === "loan" || isProtectedSavingsTransaction(transaction, account)) {
    return false;
  }

  if (
    kind === "income" ||
    kind === "transfer" ||
    kind === "refund" ||
    kind === "credit_card_payment" ||
    kind === "rent" ||
    kind === "unknown" ||
    isDedupedCreditCardPayment(transaction)
  ) {
    return false;
  }

  return !isLoanLikeTransaction(transaction);
}

function isProtectedSavingsTransaction(
  transaction: Transaction,
  account: Account | undefined,
): boolean {
  if (account?.isProtectedSavings) {
    return true;
  }

  const haystack = getTransactionHaystack(transaction);

  return (
    haystack.includes("protected savings") ||
    haystack.includes("savings transfer") ||
    haystack.includes("transfer to savings")
  );
}

function isLoanLikeTransaction(transaction: Transaction): boolean {
  const haystack = getTransactionHaystack(transaction);

  return (
    haystack.includes("student loan") ||
    haystack.includes("auto loan") ||
    haystack.includes("car loan") ||
    haystack.includes("personal loan") ||
    haystack.includes("loan payment") ||
    haystack.includes("debt payment") ||
    haystack.includes("mortgage payment") ||
    hasToken(haystack, "loan") ||
    hasToken(haystack, "mortgage") ||
    hasToken(haystack, "lender") ||
    hasToken(haystack, "lending") ||
    hasToken(haystack, "debt")
  );
}

function summarizeOpportunities(
  transactions: EligibleTransaction[],
  currentWindow: { startDate: string; endDate: string },
  previousWindow: { startDate: string; endDate: string },
): OpportunitySummary[] {
  const summaries = new Map<string, OpportunitySummary>();

  for (const item of transactions) {
    const summary = getOrCreateSummary(summaries, item);

    if (isWithinWindow(item.transaction.date, currentWindow)) {
      summary.currentSpendCents += Math.max(0, -item.transaction.amountCents);
      summary.currentTransactions.push(item.transaction);
      continue;
    }

    if (isWithinWindow(item.transaction.date, previousWindow)) {
      summary.previousSpendCents += Math.max(0, -item.transaction.amountCents);
      summary.previousTransactions.push(item.transaction);
    }
  }

  return [...summaries.values()]
    .filter((summary) => summary.currentSpendCents > 0)
    .map((summary) => {
      const merchantStats = buildMerchantStats(summary.currentTransactions);

      return {
        ...summary,
        merchantExamples: merchantStats.map((item) => item.label).slice(0, 3),
        topMerchantSpendCents: merchantStats[0]?.spendCents ?? 0,
      };
    });
}

function getOrCreateSummary(
  summaries: Map<string, OpportunitySummary>,
  item: EligibleTransaction,
): OpportunitySummary {
  const existing = summaries.get(item.categoryKey);

  if (existing) {
    return existing;
  }

  const summary: OpportunitySummary = {
    categoryKey: item.categoryKey,
    category: item.category,
    discretionary: item.discretionary,
    currentSpendCents: 0,
    previousSpendCents: 0,
    currentTransactions: [],
    previousTransactions: [],
    merchantExamples: [],
    topMerchantSpendCents: 0,
  };

  summaries.set(item.categoryKey, summary);

  return summary;
}

function toSpendingOpportunity(
  summary: OpportunitySummary,
  options: {
    windowDays: number;
    minCurrentSpendCents: number;
    minEstimatedSavingsCents: number;
  },
): SpendingOpportunity | null {
  const transactionCount = summary.currentTransactions.length;
  const previousTransactionCount = summary.previousTransactions.length;
  const deltaCents = Math.max(0, summary.currentSpendCents - summary.previousSpendCents);

  if (
    summary.currentSpendCents < options.minCurrentSpendCents ||
    transactionCount < 2 ||
    transactionCount + previousTransactionCount < 3
  ) {
    return null;
  }

  const reasonCodes = getReasonCodes(summary, deltaCents);
  const estimatedSavingsCents = estimateSavingsCents(summary, reasonCodes, deltaCents);

  if (estimatedSavingsCents < options.minEstimatedSavingsCents) {
    return null;
  }

  return {
    id: `category:${summary.categoryKey}`,
    category: summary.category,
    estimatedSavingsCents,
    confidence: getConfidence(summary, reasonCodes),
    reasonCodes,
    merchantExamples: summary.merchantExamples,
    transactionCount,
    windowDays: options.windowDays,
    currentSpendCents: summary.currentSpendCents,
    previousSpendCents: summary.previousSpendCents,
    deltaCents,
    suggestedAction: buildSuggestedAction(summary, estimatedSavingsCents, options.windowDays),
  };
}

function getReasonCodes(
  summary: OpportunitySummary,
  deltaCents: number,
): SpendingOpportunityReasonCode[] {
  const reasonCodes: SpendingOpportunityReasonCode[] = [];

  if (summary.discretionary) {
    reasonCodes.push("discretionary_category");
  }

  if (isRecentIncrease(deltaCents, summary.previousSpendCents)) {
    reasonCodes.push("recent_increase");
  }

  if (summary.currentTransactions.length >= 3) {
    reasonCodes.push("frequent_transactions");
  }

  if (summary.currentSpendCents >= 5000) {
    reasonCodes.push("material_spend");
  }

  if (
    summary.topMerchantSpendCents > 0 &&
    summary.topMerchantSpendCents / summary.currentSpendCents >= 0.45
  ) {
    reasonCodes.push("merchant_concentration");
  }

  return reasonCodes;
}

function estimateSavingsCents(
  summary: OpportunitySummary,
  reasonCodes: SpendingOpportunityReasonCode[],
  deltaCents: number,
): number {
  const maxSavingsCents = Math.round(
    summary.currentSpendCents * (summary.discretionary ? 0.35 : 0.15),
  );
  const trendSavingsCents = deltaCents > 0 ? Math.min(deltaCents, maxSavingsCents) : 0;
  const steadySavingsRate = summary.discretionary ? 0.2 : 0.1;
  const steadySavingsCents =
    reasonCodes.includes("frequent_transactions") || reasonCodes.includes("material_spend")
      ? Math.round(summary.currentSpendCents * steadySavingsRate)
      : 0;

  return roundDownToDollar(Math.max(trendSavingsCents, steadySavingsCents));
}

function getConfidence(
  summary: OpportunitySummary,
  reasonCodes: SpendingOpportunityReasonCode[],
): SpendableCashConfidence {
  if (
    summary.currentTransactions.length >= 4 &&
    summary.currentSpendCents >= 7500 &&
    reasonCodes.includes("recent_increase")
  ) {
    return "high";
  }

  if (summary.currentTransactions.length >= 2 && summary.currentSpendCents >= 2500) {
    return "medium";
  }

  return "low";
}

function compareOpportunities(a: SpendingOpportunity, b: SpendingOpportunity): number {
  const scoreDelta = getOpportunityScore(b) - getOpportunityScore(a);

  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  if (b.currentSpendCents !== a.currentSpendCents) {
    return b.currentSpendCents - a.currentSpendCents;
  }

  return a.category.localeCompare(b.category);
}

function getOpportunityScore(opportunity: SpendingOpportunity): number {
  let score =
    opportunity.currentSpendCents * 0.35 +
    opportunity.deltaCents * 0.9 +
    Math.min(opportunity.transactionCount, 8) * 400 +
    opportunity.estimatedSavingsCents;

  if (opportunity.reasonCodes.includes("discretionary_category")) {
    score += Math.min(opportunity.currentSpendCents * 0.35, 6000);
  }

  if (opportunity.reasonCodes.includes("frequent_transactions")) {
    score += 1000;
  }

  if (opportunity.reasonCodes.includes("material_spend")) {
    score += 1500;
  }

  if (opportunity.reasonCodes.includes("merchant_concentration")) {
    score += 500;
  }

  if (opportunity.confidence === "high") {
    score += 1000;
  } else if (opportunity.confidence === "medium") {
    score += 500;
  }

  return Math.round(score);
}

function buildSuggestedAction(
  summary: OpportunitySummary,
  estimatedSavingsCents: number,
  windowDays: number,
): string {
  const targetCents = Math.max(0, summary.currentSpendCents - estimatedSavingsCents);
  const weeklyTargetCents = roundDownToDollar(Math.round(targetCents / (windowDays / 7)));
  const category = summary.category.toLowerCase();
  const firstMerchant = summary.merchantExamples[0];

  if (category === "dining") {
    return `Try a ${formatMoney(weeklyTargetCents)}/week dining cap for the next ${windowDays} days.`;
  }

  if (firstMerchant) {
    return `Hold ${category} near ${formatMoney(targetCents)} over the next ${windowDays} days, starting with ${firstMerchant}.`;
  }

  return `Hold ${category} near ${formatMoney(targetCents)} over the next ${windowDays} days.`;
}

function getOpportunityCategory(transaction: Transaction): {
  key: string;
  label: string;
  discretionary: boolean;
} {
  const haystack = getTransactionHaystack(transaction);
  const mapped = mapKnownCategory(haystack);

  if (mapped) {
    return mapped;
  }

  const rawCategory = transaction.category?.trim();

  if (rawCategory) {
    const label = titleCase(
      rawCategory
        .split(/[>/]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .pop() ?? rawCategory,
    );

    return {
      key: slugify(label),
      label,
      discretionary: isDiscretionaryHaystack(haystack),
    };
  }

  const merchant = getMerchantLabel(transaction);
  const label = merchant ? titleCase(merchant) : "Uncategorized spending";

  return {
    key: merchant ? `merchant:${slugify(merchant)}` : "uncategorized-spending",
    label,
    discretionary: isDiscretionaryHaystack(haystack),
  };
}

function mapKnownCategory(
  haystack: string,
): { key: string; label: string; discretionary: boolean } | null {
  if (
    hasAnyToken(haystack, [
      "dining",
      "restaurant",
      "restaurants",
      "coffee",
      "cafe",
      "bar",
      "takeout",
      "doordash",
      "ubereats",
    ])
  ) {
    return { key: "dining", label: "Dining", discretionary: true };
  }

  if (hasAnyToken(haystack, ["entertainment", "movies", "concert", "gaming", "games"])) {
    return { key: "entertainment", label: "Entertainment", discretionary: true };
  }

  if (hasAnyToken(haystack, ["shopping", "retail", "clothing", "apparel", "electronics"])) {
    return { key: "shopping", label: "Shopping", discretionary: true };
  }

  if (hasAnyToken(haystack, ["subscription", "streaming", "membership"])) {
    return { key: "subscriptions", label: "Subscriptions", discretionary: true };
  }

  if (hasAnyToken(haystack, ["travel", "hotel", "airline", "rideshare", "uber", "lyft", "taxi"])) {
    return { key: "travel", label: "Travel", discretionary: true };
  }

  if (hasAnyToken(haystack, ["grocery", "groceries", "supermarket"])) {
    return { key: "groceries", label: "Groceries", discretionary: false };
  }

  if (hasAnyToken(haystack, ["gas", "fuel", "station"])) {
    return { key: "gas", label: "Gas", discretionary: false };
  }

  if (hasAnyToken(haystack, ["fee", "fees"])) {
    return { key: "fees", label: "Fees", discretionary: false };
  }

  return null;
}

function isDiscretionaryHaystack(haystack: string): boolean {
  return hasAnyToken(haystack, [
    "dining",
    "restaurant",
    "restaurants",
    "coffee",
    "cafe",
    "bar",
    "entertainment",
    "shopping",
    "retail",
    "travel",
    "subscription",
    "streaming",
  ]);
}

function buildMerchantStats(transactions: Transaction[]): Array<{
  label: string;
  spendCents: number;
  count: number;
}> {
  const stats = new Map<string, { label: string; spendCents: number; count: number }>();

  for (const transaction of transactions) {
    const label = getMerchantLabel(transaction);

    if (!label) {
      continue;
    }

    const key = slugify(label);
    const existing = stats.get(key);

    if (existing) {
      existing.spendCents += Math.max(0, -transaction.amountCents);
      existing.count += 1;
      continue;
    }

    stats.set(key, {
      label,
      spendCents: Math.max(0, -transaction.amountCents),
      count: 1,
    });
  }

  return [...stats.values()].sort((a, b) => {
    if (b.spendCents !== a.spendCents) {
      return b.spendCents - a.spendCents;
    }

    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return a.label.localeCompare(b.label);
  });
}

function getMerchantLabel(transaction: Transaction): string | null {
  const merchantName = transaction.merchantName?.trim();

  if (merchantName) {
    return merchantName;
  }

  const description = transaction.description.trim().replace(/\s+/g, " ");

  return description || null;
}

function isRecentIncrease(deltaCents: number, previousSpendCents: number): boolean {
  return deltaCents >= Math.max(1500, Math.round(previousSpendCents * 0.25));
}

function isWithinWindow(date: string, window: { startDate: string; endDate: string }): boolean {
  return date >= window.startDate && date <= window.endDate;
}

function normalizeWindowDays(windowDays: number | undefined): number {
  return Math.max(1, Math.floor(windowDays ?? DEFAULT_WINDOW_DAYS));
}

function roundDownToDollar(cents: number): number {
  return Math.max(0, Math.floor(cents / 100) * 100);
}

function getTransactionHaystack(transaction: Transaction): string {
  return normalizeText(
    [
      transaction.description,
      transaction.merchantName,
      transaction.category,
      transaction.metadata?.issuerName,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hasAnyToken(haystack: string, tokens: string[]): boolean {
  return tokens.some((token) => hasToken(haystack, token));
}

function hasToken(haystack: string, token: string): boolean {
  return haystack
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .includes(token);
}

function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-") || "unknown";
}

function titleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
