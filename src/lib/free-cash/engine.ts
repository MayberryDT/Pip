import type {
  Account,
  AccountBalanceSummary,
  FinancialSnapshot,
  FreeCashDriver,
  FreeCashResult,
  FreeCashWarning,
  Transaction,
} from "@/lib/types";
import { classifyTransaction } from "@/lib/free-cash/classify";
import {
  addDays,
  buildRollingCalendarWindow,
  isWithinInclusiveWindow,
} from "@/lib/free-cash/date-window";
import {
  annotateCreditCardPaymentMatches,
  findUnmatchedCreditCardPayments,
  isDedupedCreditCardPayment,
} from "@/lib/free-cash/dedupe-credit-card-payments";

const MATERIAL_PENDING_THRESHOLD_CENTS = 2000;

export function calculateFreeCash(snapshot: FinancialSnapshot): FreeCashResult {
  const window = buildRollingCalendarWindow(snapshot.settings.asOfDate);
  const transactions = annotateCreditCardPaymentMatches(snapshot.transactions, snapshot.accounts);
  const windowTransactions = transactions.filter((transaction) =>
    isWithinInclusiveWindow(transaction.date, window),
  );

  let incomeTotalCents = 0;
  let grossSpendingCents = 0;
  let refundTotalCents = 0;
  let dedupedPaymentCount = 0;

  for (const transaction of windowTransactions) {
    const kind = classifyTransaction(transaction);

    if (kind === "income") {
      incomeTotalCents += Math.max(0, transaction.amountCents);
      continue;
    }

    if (kind === "refund") {
      refundTotalCents += Math.max(0, transaction.amountCents);
      continue;
    }

    if (kind === "credit_card_payment") {
      if (isDedupedCreditCardPayment(transaction)) {
        dedupedPaymentCount += 1;
      }
      continue;
    }

    if (kind === "transfer" || kind === "unknown") {
      continue;
    }

    grossSpendingCents += Math.max(0, -transaction.amountCents);
  }

  const spendingTotalCents = Math.max(0, grossSpendingCents - refundTotalCents);
  const rollingNetCents =
    incomeTotalCents -
    spendingTotalCents -
    snapshot.settings.protectedSavingsMonthlyCents;
  const freeCashTodayCents = Math.round(rollingNetCents / window.dayCount);

  return {
    freeCashTodayCents,
    rollingNetCents,
    incomeTotalCents,
    spendingTotalCents,
    refundTotalCents,
    protectedSavingsMonthlyCents: snapshot.settings.protectedSavingsMonthlyCents,
    window,
    drivers: buildDrivers({
      incomeTotalCents,
      spendingTotalCents,
      refundTotalCents,
      protectedSavingsMonthlyCents: snapshot.settings.protectedSavingsMonthlyCents,
      dedupedPaymentCount,
      windowTransactions,
      allTransactions: transactions,
      window,
      accounts: snapshot.accounts,
    }),
    warnings: buildWarnings(windowTransactions, snapshot.settings.suppressedMissingCardIssuers),
    dataStates: buildDataStates(windowTransactions, snapshot.accounts),
    trueBalances: snapshot.accounts.map(toBalanceSummary),
  };
}

function buildDrivers(input: {
  incomeTotalCents: number;
  spendingTotalCents: number;
  refundTotalCents: number;
  protectedSavingsMonthlyCents: number;
  dedupedPaymentCount: number;
  windowTransactions: Transaction[];
  allTransactions: Transaction[];
  window: ReturnType<typeof buildRollingCalendarWindow>;
  accounts: Account[];
}): FreeCashDriver[] {
  const rentTotalCents = input.windowTransactions
    .filter((transaction) => classifyTransaction(transaction) === "rent")
    .reduce((total, transaction) => total + Math.max(0, -transaction.amountCents), 0);
  const pendingCardSpendCents = getPendingCardSpendCents(
    input.windowTransactions,
    input.accounts,
  );

  const drivers: FreeCashDriver[] = [
    {
      id: "income",
      label: "Income in window",
      detail: "Paychecks and deposits that count as income.",
      amountCents: input.incomeTotalCents,
      tone: "positive",
    },
    {
      id: "spending",
      label: "Spending in window",
      detail: "Purchases, bills, and card spend after refunds.",
      amountCents: -input.spendingTotalCents,
      tone: "negative",
    },
    {
      id: "protected-savings",
      label: "Protected savings",
      detail: "Savings held back before Spendable Cash Today is calculated.",
      amountCents: -input.protectedSavingsMonthlyCents,
      tone: "neutral",
    },
  ];

  if (rentTotalCents > 0) {
    drivers.push({
      id: "rent",
      label: "Rent is included",
      detail: "The rolling calendar-month window includes rent.",
      amountCents: -rentTotalCents,
      tone: "negative",
    });
  }

  if (input.refundTotalCents > 0) {
    drivers.push({
      id: "refunds",
      label: "Refunds offset spend",
      detail: "Refunds reduce spending instead of inflating income.",
      amountCents: input.refundTotalCents,
      tone: "positive",
    });
  }

  if (input.dedupedPaymentCount > 0) {
    drivers.push({
      id: "card-payments",
      label: "Card payment deduped",
      detail: `${input.dedupedPaymentCount} card payment is treated as settlement, not new spending.`,
      amountCents: 0,
      tone: "neutral",
    });
  }

  if (pendingCardSpendCents >= MATERIAL_PENDING_THRESHOLD_CENTS) {
    drivers.push({
      id: "pending-card-spend",
      label: "Pending card spend included",
      detail: "Pending card purchases are included so Spendable Cash Today does not look too high.",
      amountCents: -pendingCardSpendCents,
      tone: "warning",
    });
  }

  drivers.push(...buildWindowMovementDrivers(input.allTransactions, input.window));

  return drivers;
}

function buildWindowMovementDrivers(
  transactions: Transaction[],
  window: ReturnType<typeof buildRollingCalendarWindow>,
): FreeCashDriver[] {
  const enteredContributionCents = sumRollingNetContributions(
    transactions.filter((transaction) => transaction.date === window.endDate),
  );
  const exitedDate = addDays(window.startDate, -1);
  const exitedDeltaCents =
    -sumRollingNetContributions(
      transactions.filter((transaction) => transaction.date === exitedDate),
    );
  const drivers: FreeCashDriver[] = [];

  if (enteredContributionCents !== 0) {
    drivers.push({
      id: "entered-window",
      label: "Entered the window",
      detail: `Transactions dated ${window.endDate} are now inside the rolling month.`,
      amountCents: enteredContributionCents,
      tone: toneForAmount(enteredContributionCents),
    });
  }

  if (exitedDeltaCents !== 0) {
    drivers.push({
      id: "exited-window",
      label: "Left the window",
      detail: `Transactions dated ${exitedDate} no longer count in Spendable Cash Today.`,
      amountCents: exitedDeltaCents,
      tone: toneForAmount(exitedDeltaCents),
    });
  }

  return drivers;
}

function buildWarnings(
  windowTransactions: Transaction[],
  suppressedMissingCardIssuers: string[] = [],
): FreeCashWarning[] {
  const unmatchedPayments = findUnmatchedCreditCardPayments(windowTransactions);

  if (unmatchedPayments.length === 0) {
    return [];
  }

  const suppressedIssuerSet = new Set(
    suppressedMissingCardIssuers.map((issuer) => normalizeIssuerName(issuer)),
  );
  const issuers = Array.from(
    new Set(unmatchedPayments.map((transaction) => transaction.metadata?.issuerName ?? "a card issuer")),
  ).filter((issuer) => !suppressedIssuerSet.has(normalizeIssuerName(issuer)));

  if (issuers.length === 0) {
    return [];
  }

  return [
    {
      id: "missing-card",
      label: "Possible missing card",
      detail: formatMissingCardDetail(issuers),
      tone: "warning",
      issuerName: issuers.join(", "),
    },
  ];
}

function formatMissingCardDetail(issuers: string[]): string {
  const issuerText = issuers.join(", ");

  if (issuers.length > 1) {
    return `I see payments to ${issuerText}, but those cards are not connected.`;
  }

  return `I see a payment to ${issuerText}, but that card is not connected.`;
}

function normalizeIssuerName(issuerName: string): string {
  return issuerName.trim().toLowerCase();
}

function buildDataStates(
  windowTransactions: Transaction[],
  accounts: Account[],
) {
  const pendingCardSpendCents = getPendingCardSpendCents(windowTransactions, accounts);

  if (pendingCardSpendCents < MATERIAL_PENDING_THRESHOLD_CENTS) {
    return [];
  }

  return [
    {
      id: "pending-transactions" as const,
      label: "Pending transactions included",
      detail: "Pending card purchases are already counted in Spendable Cash Today and may settle differently.",
      amountCents: -pendingCardSpendCents,
      tone: "warning" as const,
    },
  ];
}

function getPendingCardSpendCents(transactions: Transaction[], accounts: Account[]): number {
  const accountKinds = new Map(accounts.map((account) => [account.id, account.kind]));

  return transactions
    .filter((transaction) => {
      const kind = classifyTransaction(transaction);
      return (
        transaction.pending === true &&
        accountKinds.get(transaction.accountId) === "credit_card" &&
        (kind === "purchase" || kind === "rent" || kind === "fee")
      );
    })
    .reduce((total, transaction) => total + Math.max(0, -transaction.amountCents), 0);
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

  return 0;
}

function toneForAmount(amountCents: number): FreeCashDriver["tone"] {
  if (amountCents > 0) {
    return "positive";
  }

  if (amountCents < 0) {
    return "negative";
  }

  return "neutral";
}

function toBalanceSummary(account: Account): AccountBalanceSummary {
  return {
    accountId: account.id,
    name: account.name,
    institutionName: account.institutionName,
    kind: account.kind,
    balanceCents: account.balanceCents,
    availableBalanceCents: account.availableBalanceCents,
    lastFour: account.lastFour,
  };
}
