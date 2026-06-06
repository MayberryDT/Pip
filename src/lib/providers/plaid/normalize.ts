import type { AccountBase, Transaction as PlaidTransaction } from "plaid";
import type { Account, AccountBalanceSummary, AccountKind, Transaction } from "@/lib/types";

export function normalizePlaidAccount(
  account: AccountBase,
  institutionName: string,
): Account {
  const kind = mapPlaidAccountKind(account);

  return {
    id: account.account_id,
    name: account.name,
    institutionName,
    kind,
    balanceCents: normalizePlaidBalanceCents(account, "current") ?? 0,
    availableBalanceCents: normalizePlaidBalanceCents(account, "available"),
    lastFour: account.mask ?? undefined,
    isProtectedSavings: kind === "savings",
  };
}

export function normalizePlaidBalance(
  account: AccountBase,
  institutionName: string,
): AccountBalanceSummary {
  const normalizedAccount = normalizePlaidAccount(account, institutionName);

  return {
    accountId: normalizedAccount.id,
    name: normalizedAccount.name,
    institutionName: normalizedAccount.institutionName,
    kind: normalizedAccount.kind,
    balanceCents: normalizedAccount.balanceCents,
    availableBalanceCents: normalizedAccount.availableBalanceCents,
    lastFour: normalizedAccount.lastFour,
  };
}

export function normalizePlaidTransaction(transaction: PlaidTransaction): Transaction {
  const amountCents = Math.round(transaction.amount * -100);
  const category = getPlaidCategory(transaction);

  return {
    id: transaction.transaction_id,
    accountId: transaction.account_id,
    date: transaction.authorized_date ?? transaction.date,
    description: transaction.original_description ?? transaction.name,
    merchantName: transaction.merchant_name ?? undefined,
    amountCents,
    category,
    pending: transaction.pending,
  };
}

function mapPlaidAccountKind(account: AccountBase): AccountKind {
  if (account.type === "credit") {
    return "credit_card";
  }

  if (account.type === "loan") {
    return "loan";
  }

  if (account.subtype === "savings") {
    return "savings";
  }

  if (account.subtype === "checking") {
    return "checking";
  }

  return "other";
}

function normalizePlaidBalanceCents(
  account: AccountBase,
  field: "available" | "current",
): number | undefined {
  const amount = account.balances[field];

  if (amount === null || amount === undefined) {
    return undefined;
  }

  const cents = Math.round(amount * 100);

  return account.type === "credit" && field === "current" ? -cents : cents;
}

function getPlaidCategory(transaction: PlaidTransaction): string | undefined {
  const personalFinanceCategory = transaction.personal_finance_category;

  if (personalFinanceCategory) {
    return [personalFinanceCategory.primary, personalFinanceCategory.detailed]
      .filter(Boolean)
      .join(":")
      .toLowerCase();
  }

  return transaction.category?.join(":").toLowerCase();
}
