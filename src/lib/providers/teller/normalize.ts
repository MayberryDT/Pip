import type { Account, AccountBalanceSummary, Transaction } from "@/lib/types";
import type { TellerAccount, TellerBalance, TellerTransaction } from "@/lib/providers/teller/types";

export function normalizeTellerAccount(
  account: TellerAccount,
  balances: TellerBalance[] = [],
): Account {
  const balance = balances.find((item) => item.account_id === account.id);

  return {
    id: account.id,
    name: account.name,
    institutionName: account.institution?.name ?? "Teller institution",
    kind: mapTellerAccountKind(account),
    balanceCents: parseDollarAmountToCents(balance?.ledger ?? "0"),
    availableBalanceCents:
      balance?.available === undefined ? undefined : parseDollarAmountToCents(balance.available),
    lastFour: account.last_four,
  };
}

export function normalizeTellerBalance(
  account: TellerAccount,
  balance: TellerBalance,
): AccountBalanceSummary {
  return {
    accountId: account.id,
    name: account.name,
    institutionName: account.institution?.name ?? "Teller institution",
    kind: mapTellerAccountKind(account),
    balanceCents: parseDollarAmountToCents(balance.ledger ?? "0"),
    availableBalanceCents:
      balance.available === undefined ? undefined : parseDollarAmountToCents(balance.available),
    lastFour: account.last_four,
  };
}

export function normalizeTellerTransaction(transaction: TellerTransaction): Transaction {
  const category = transaction.details?.category;
  const amountCents = normalizeTransactionAmountCents(transaction.amount, category);

  return {
    id: transaction.id,
    accountId: transaction.account_id,
    date: transaction.date,
    description: transaction.description,
    merchantName: transaction.description,
    amountCents,
    category,
    kind: mapTellerTransactionKind(transaction),
    pending: transaction.details?.processing_status === "pending",
  };
}

export function parseDollarAmountToCents(value: string): number {
  const sign = value.trim().startsWith("-") ? -1 : 1;
  const [dollars = "0", cents = ""] = value.replace("-", "").split(".");
  const normalizedCents = `${cents}00`.slice(0, 2);

  return sign * (Number.parseInt(dollars, 10) * 100 + Number.parseInt(normalizedCents, 10));
}

function normalizeTransactionAmountCents(amount: string, category: string | undefined): number {
  const cents = parseDollarAmountToCents(amount);
  const normalizedCategory = normalizeCategory(category);

  if (normalizedCategory === "income" || normalizedCategory === "refund") {
    return Math.abs(cents);
  }

  return -Math.abs(cents);
}

function mapTellerAccountKind(account: TellerAccount): Account["kind"] {
  const subtype = (account.subtype ?? "").toLowerCase();
  const type = (account.type ?? "").toLowerCase();

  if (subtype.includes("checking")) {
    return "checking";
  }

  if (subtype.includes("savings")) {
    return "savings";
  }

  if (subtype.includes("credit") || type.includes("credit")) {
    return "credit_card";
  }

  return "other";
}

function mapTellerTransactionKind(transaction: TellerTransaction): Transaction["kind"] {
  const category = normalizeCategory(transaction.details?.category);
  const description = transaction.description.toLowerCase();

  if (category === "income") {
    return "income";
  }

  if (category === "refund") {
    return "refund";
  }

  if (category === "transfer" || description.includes("transfer")) {
    return "transfer";
  }

  if (description.includes("card payment") || description.includes("credit card")) {
    return "credit_card_payment";
  }

  if (description.includes("rent")) {
    return "rent";
  }

  return "purchase";
}

function normalizeCategory(category: string | undefined): string {
  return (category ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}
