import { describe, expect, it } from "vitest";
import type { AccountBase, Transaction as PlaidTransaction } from "plaid";
import type { FinancialDataProvider } from "@/lib/providers/FinancialDataProvider";
import { MockProvider } from "@/lib/providers/MockProvider";
import { PlaidProvider } from "@/lib/providers/plaid/PlaidProvider";
import { getPlaidConfig, type PlaidClient } from "@/lib/providers/plaid/config";
import { TellerProvider } from "@/lib/providers/teller/TellerProvider";
import type { TellerHttpClient } from "@/lib/providers/teller/http";
import type { Account, AccountBalanceSummary, Transaction } from "@/lib/types";

describe("FinancialDataProvider contract", () => {
  it.each(getProviderCases())("%s normalizes into the shared app-level data shape", async (_name, provider) => {
    const [connection, accounts, balances, transactions] = await Promise.all([
      provider.handleConnectCallback({ userId: "user_1" }),
      provider.syncAccounts("user_1"),
      provider.syncBalances("user_1"),
      provider.syncTransactions("user_1"),
    ]);

    expect(connection).toMatchObject({
      provider: expect.stringMatching(/mock|teller|plaid/),
      institutionName: expect.any(String),
      status: expect.stringMatching(/connected|mocked/),
    });
    expect(accounts.length).toBeGreaterThan(0);
    expect(balances.length).toBeGreaterThan(0);
    expect(transactions.length).toBeGreaterThan(0);

    for (const account of accounts) {
      expectAccountShape(account);
    }

    for (const balance of balances) {
      expectBalanceShape(balance);
    }

    for (const transaction of transactions) {
      expectTransactionShape(transaction);
    }
  });
});

function getProviderCases(): Array<[string, FinancialDataProvider]> {
  return [
    ["MockProvider", new MockProvider()],
    ["TellerProvider", createTellerProvider()],
    ["PlaidProvider", createPlaidProvider()],
  ];
}

function createTellerProvider(): TellerProvider {
  const client: TellerHttpClient = {
    async listAccounts() {
      return [
        {
          id: "teller_checking",
          name: "Everyday Checking",
          type: "depository",
          subtype: "checking",
          institution: {
            name: "Contract Bank",
          },
          last_four: "1234",
        },
      ];
    },
    async getBalance() {
      return {
        account_id: "teller_checking",
        ledger: "123.45",
        available: "120.00",
      };
    },
    async listTransactions() {
      return [
        {
          id: "teller_tx_1",
          account_id: "teller_checking",
          date: "2026-06-05",
          description: "Coffee Shop",
          details: {
            category: "food",
          },
          amount: "4.25",
        },
      ];
    },
  };

  return new TellerProvider({
    client,
    credentialLoader: async () => ({
      institutionId: "teller_institution_1",
      userId: "user_1",
      enrollmentId: "enrollment_1",
      accessToken: "teller-token",
      institutionName: "Contract Bank",
      environment: "development",
    }),
  });
}

function createPlaidProvider(): PlaidProvider {
  const accounts = [
    {
      account_id: "plaid_checking",
      balances: {
        current: 123.45,
        available: 120,
        iso_currency_code: "USD",
        unofficial_currency_code: null,
        limit: null,
      },
      mask: "4321",
      name: "Everyday Checking",
      official_name: null,
      type: "depository",
      subtype: "checking",
    } as AccountBase,
  ];
  const transactions = [
    {
      transaction_id: "plaid_tx_1",
      account_id: "plaid_checking",
      amount: 4.25,
      date: "2026-06-05",
      authorized_date: null,
      name: "Coffee Shop",
      merchant_name: "Copper Cup",
      pending: false,
    } as PlaidTransaction,
  ];
  const client = {
    linkTokenCreate: async () => ({
      data: {
        link_token: "link-token",
      },
    }),
    itemPublicTokenExchange: async () => ({
      data: {
        access_token: "access-token",
        item_id: "item_1",
      },
    }),
    accountsBalanceGet: async () => ({
      data: {
        accounts,
      },
    }),
    transactionsSync: async () => ({
      data: {
        accounts,
        added: transactions,
        modified: [],
        removed: [],
        next_cursor: "cursor_1",
        has_more: false,
        request_id: "request_1",
      },
    }),
  } as unknown as PlaidClient;

  return new PlaidProvider({
    client,
    config: getPlaidConfig({
      PLAID_CLIENT_ID: "client-id",
      PLAID_SECRET: "secret",
    }),
    credentialLoader: async () => ({
      institutionId: "plaid_institution_1",
      userId: "user_1",
      itemId: "item_1",
      accessToken: "access-token",
      institutionName: "Contract Bank",
      environment: "sandbox",
    }),
  });
}

function expectAccountShape(account: Account) {
  expect(account).toMatchObject({
    id: expect.any(String),
    name: expect.any(String),
    institutionName: expect.any(String),
    kind: expect.stringMatching(/checking|savings|credit_card|loan|other/),
    balanceCents: expect.any(Number),
  });
}

function expectBalanceShape(balance: AccountBalanceSummary) {
  expect(balance).toMatchObject({
    accountId: expect.any(String),
    name: expect.any(String),
    institutionName: expect.any(String),
    kind: expect.stringMatching(/checking|savings|credit_card|loan|other/),
    balanceCents: expect.any(Number),
  });
}

function expectTransactionShape(transaction: Transaction) {
  expect(transaction).toMatchObject({
    id: expect.any(String),
    accountId: expect.any(String),
    date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    description: expect.any(String),
    amountCents: expect.any(Number),
  });
  expect(Number.isInteger(transaction.amountCents)).toBe(true);
}
