import type {
  ClassifiedSpendableTransaction,
  RecurringObligation,
  SameDayLedger,
  SameDayLedgerItem,
  SameDayLedgerTreatment,
} from "@/lib/types";

export function buildSameDayLedger(input: {
  asOfDate: string;
  transactions: ClassifiedSpendableTransaction[];
  obligations: RecurringObligation[];
}): SameDayLedger {
  const sameDay = dedupePendingPosted(
    input.transactions.filter((item) => item.transaction.date === input.asOfDate),
  );
  const items = sameDay.map((item) => classifySameDayItem(item, input.obligations));

  return {
    asOfDate: input.asOfDate,
    items,
    discretionarySpendCents: sumItems(items, "daily_spend"),
    refundCents: sumItems(items, "daily_refund"),
    billVarianceCents: items.reduce((sum, item) => sum + (item.varianceCents ?? 0), 0),
    pendingSpendCents: items
      .filter((item) => item.pending && item.treatment === "daily_spend")
      .reduce((sum, item) => sum + Math.max(0, -item.amountCents), 0),
  };
}

function classifySameDayItem(
  item: ClassifiedSpendableTransaction,
  obligations: RecurringObligation[],
): SameDayLedgerItem {
  const transaction = item.transaction;
  const label = transaction.merchantName ?? transaction.description;
  const base = {
    transactionId: transaction.id,
    accountId: transaction.accountId,
    date: transaction.date,
    label,
    amountCents: transaction.amountCents,
    pending: transaction.pending === true,
    reason: item.reason,
  };

  if (item.group === "refund") {
    return {
      ...base,
      treatment: "daily_refund",
    };
  }

  if (item.group === "card_settlement") {
    return {
      ...base,
      treatment: "card_settlement",
    };
  }

  if (item.group === "transfer" || item.group === "savings_protected") {
    return {
      ...base,
      treatment: "transfer",
    };
  }

  const obligation = findMatchingObligation(
    transaction.merchantName ?? transaction.description,
    obligations,
  );

  if (obligation && transaction.amountCents < 0) {
    const actualAmountCents = Math.max(0, -transaction.amountCents);
    const varianceCents = obligation.expectedAmountCents - actualAmountCents;

    return {
      ...base,
      treatment: varianceCents === 0 ? "expected_bill" : "bill_variance",
      expectedAmountCents: obligation.expectedAmountCents,
      varianceCents,
      reason: varianceCents === 0
        ? "matched expected recurring obligation"
        : "matched recurring obligation variance",
    };
  }

  if (item.group === "recurring_obligation" && transaction.amountCents < 0) {
    const actualAmountCents = Math.max(0, -transaction.amountCents);

    return {
      ...base,
      treatment: "expected_bill",
      expectedAmountCents: actualAmountCents,
      varianceCents: 0,
      reason: "classified recurring obligation",
    };
  }

  if (
    item.group === "everyday_spending" ||
    item.group === "fee" ||
    item.group === "unknown"
  ) {
    return {
      ...base,
      treatment: "daily_spend",
    };
  }

  return {
    ...base,
    treatment: "ignored",
  };
}

function dedupePendingPosted(
  transactions: ClassifiedSpendableTransaction[],
): ClassifiedSpendableTransaction[] {
  const postedKeys = new Set(
    transactions
      .filter((item) => item.transaction.pending !== true)
      .map((item) => getDedupeKey(item)),
  );

  return transactions.filter((item) => {
    if (item.transaction.pending !== true) {
      return true;
    }

    return !postedKeys.has(getDedupeKey(item));
  });
}

function getDedupeKey(item: ClassifiedSpendableTransaction): string {
  const transaction = item.transaction;
  const label = normalizeMerchantKey(transaction.merchantName ?? transaction.description);

  return [
    transaction.accountId,
    transaction.date,
    label,
    Math.abs(transaction.amountCents),
    item.group,
  ].join("|");
}

function findMatchingObligation(
  label: string,
  obligations: RecurringObligation[],
): RecurringObligation | undefined {
  const merchantKey = normalizeMerchantKey(label);

  return obligations.find((obligation) => obligation.merchantKey === merchantKey);
}

function normalizeMerchantKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sumItems(items: SameDayLedgerItem[], treatment: SameDayLedgerTreatment) {
  return items
    .filter((item) => item.treatment === treatment)
    .reduce((sum, item) => sum + Math.max(0, Math.abs(item.amountCents)), 0);
}
