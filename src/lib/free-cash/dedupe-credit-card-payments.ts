import type { Account, Transaction } from "@/lib/types";
import { classifyTransaction } from "@/lib/free-cash/classify";

const GENERIC_CARD_TOKENS = new Set([
  "bank",
  "card",
  "credit",
  "everyday",
  "payment",
  "autopay",
  "online",
  "web",
]);

export function isCreditCardPayment(transaction: Transaction): boolean {
  return classifyTransaction(transaction) === "credit_card_payment";
}

export function isDedupedCreditCardPayment(transaction: Transaction): boolean {
  return isCreditCardPayment(transaction) && transaction.metadata?.matchedConnectedCard === true;
}

export function findUnmatchedCreditCardPayments(transactions: Transaction[]): Transaction[] {
  return transactions.filter((transaction) => {
    return isCreditCardPayment(transaction) && transaction.metadata?.matchedConnectedCard !== true;
  });
}

export function annotateCreditCardPaymentMatches(
  transactions: Transaction[],
  accounts: Account[],
): Transaction[] {
  const creditCardAccounts = accounts.filter((account) => account.kind === "credit_card");

  if (creditCardAccounts.length === 0) {
    return transactions;
  }

  return transactions.map((transaction) => {
    if (
      !isCreditCardPayment(transaction) ||
      typeof transaction.metadata?.matchedConnectedCard === "boolean"
    ) {
      return transaction;
    }

    const matchedAccount = findMatchingCreditCardAccount(transaction, creditCardAccounts);

    if (!matchedAccount) {
      return transaction;
    }

    return {
      ...transaction,
      metadata: {
        ...transaction.metadata,
        issuerName: transaction.metadata?.issuerName ?? matchedAccount.name,
        matchedConnectedCard: true,
      },
    };
  });
}

function findMatchingCreditCardAccount(
  transaction: Transaction,
  accounts: Account[],
): Account | undefined {
  const haystack = normalizeText(
    [
      transaction.description,
      transaction.merchantName,
      transaction.category,
      transaction.metadata?.issuerName,
    ].filter(Boolean).join(" "),
  );
  const haystackTokens = new Set(tokenize(haystack));

  return accounts.find((account) => {
    if (account.lastFour && haystack.includes(account.lastFour)) {
      return true;
    }

    const accountName = normalizeText(account.name);
    const institutionName = normalizeText(account.institutionName);

    if (accountName && haystack.includes(accountName)) {
      return true;
    }

    if (institutionName && haystack.includes(institutionName)) {
      return true;
    }

    const accountTokens = tokenize(accountName).filter((token) => !GENERIC_CARD_TOKENS.has(token));
    const institutionTokens = tokenize(institutionName).filter(
      (token) => !GENERIC_CARD_TOKENS.has(token),
    );
    const hasAccountToken = accountTokens.some((token) => haystackTokens.has(token));
    const hasInstitutionToken = institutionTokens.some((token) => haystackTokens.has(token));

    return hasAccountToken && hasInstitutionToken;
  });
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}
