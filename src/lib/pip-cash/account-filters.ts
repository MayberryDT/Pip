import type { Account, FinancialSnapshot, Transaction } from "@/lib/types";

export function isAccountActiveInPipCash(account: Account): boolean {
  return account.active !== false;
}

export function filterPipCashAccounts(accounts: Account[]): Account[] {
  return accounts.filter(isAccountActiveInPipCash);
}

export function filterPipCashTransactions(
  transactions: Transaction[],
  accounts: Account[],
): Transaction[] {
  if (accounts.length === 0) {
    return transactions;
  }

  const includedAccountIds = new Set(filterPipCashAccounts(accounts).map((account) => account.id));

  return transactions.filter((transaction) => includedAccountIds.has(transaction.accountId));
}

export function toPipCashSnapshot(snapshot: FinancialSnapshot): FinancialSnapshot {
  if (snapshot.accounts.length === 0) {
    return snapshot;
  }

  const accounts = filterPipCashAccounts(snapshot.accounts);
  const includedAccountIds = new Set(accounts.map((account) => account.id));

  return {
    ...snapshot,
    accounts,
    transactions: snapshot.transactions.filter((transaction) =>
      includedAccountIds.has(transaction.accountId),
    ),
  };
}
