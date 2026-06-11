import type { Transaction, TransactionKind } from "@/lib/types";

const CARD_PAYMENT_PATTERNS = [
  "american express",
  "amex",
  "capital one",
  "discover",
  "mastercard",
  "visa",
  "credit card",
  "card payment",
];

export function classifyTransaction(transaction: Transaction): TransactionKind {
  if (transaction.kind) {
    return transaction.kind;
  }

  const haystack = [
    transaction.description,
    transaction.merchantName,
    transaction.category,
    transaction.metadata?.issuerName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("refund") || haystack.includes("return")) {
    return "refund";
  }

  if (haystack.includes("transfer") || haystack.includes("zelle") || haystack.includes("venmo")) {
    return "transfer";
  }

  if (
    (haystack.includes("payment") || haystack.includes("autopay")) &&
    CARD_PAYMENT_PATTERNS.some((pattern) => haystack.includes(pattern))
  ) {
    return "credit_card_payment";
  }

  if (haystack.includes("rent")) {
    return "rent";
  }

  if (hasToken(haystack, "fee")) {
    return "fee";
  }

  if (transaction.amountCents > 0) {
    return "income";
  }

  if (transaction.amountCents < 0) {
    return "purchase";
  }

  return "unknown";
}

function hasToken(haystack: string, token: string): boolean {
  return haystack
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .includes(token);
}
