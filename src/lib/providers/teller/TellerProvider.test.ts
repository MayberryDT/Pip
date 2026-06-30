import { describe, expect, it, vi } from "vitest";
import { TellerProvider } from "@/lib/providers/teller/TellerProvider";
import type { TellerHttpClient } from "@/lib/providers/teller/http";

describe("TellerProvider contract", () => {
  const client: TellerHttpClient = {
    async listAccounts() {
      return [
        {
          id: "acct_checking",
          name: "Everyday Checking",
          type: "depository",
          subtype: "checking",
          institution: {
            name: "Example Bank",
          },
        },
      ];
    },
    async getBalance() {
      return {
        account_id: "acct_checking",
        ledger: "123.45",
        available: "100.00",
      };
    },
    async listTransactions() {
      return [
        {
          id: "tx_1",
          account_id: "acct_checking",
          date: "2026-06-05",
          description: "Coffee Shop",
          amount: "4.25",
          details: {
            category: "food",
          },
        },
      ];
    },
  };
  const credentialLoader = async () => ({
    institutionId: "institution_1",
    userId: "user_1",
    enrollmentId: "enr_1",
    accessToken: "token_1",
    institutionName: "Example Bank",
    environment: "development",
  });
  const provider = new TellerProvider({
    client,
    credentialLoader,
  });

  it("returns connected institution metadata from stored Teller credentials", async () => {
    await expect(provider.handleConnectCallback({ userId: "user_1" })).resolves.toEqual({
      provider: "teller",
      institutionId: "institution_1",
      institutionName: "Example Bank",
      status: "connected",
    });
  });

  it("normalizes accounts, balances, and transactions into the app contract", async () => {
    await expect(provider.syncAccounts("user_1")).resolves.toEqual([
      expect.objectContaining({
        id: "acct_checking",
        kind: "checking",
        balanceCents: 12345,
      }),
    ]);
    await expect(provider.syncBalances("user_1")).resolves.toEqual([
      expect.objectContaining({
        accountId: "acct_checking",
        balanceCents: 12345,
      }),
    ]);
    await expect(provider.syncTransactions("user_1")).resolves.toEqual([
      expect.objectContaining({
        id: "tx_1",
        amountCents: -425,
      }),
    ]);
  });

  it("syncs the stored Teller enrollment with one account listing and one balance call per account", async () => {
    const listAccounts = vi.fn(async () => [
      {
        id: "acct_checking",
        name: "Everyday Checking",
        type: "depository",
        subtype: "checking",
        institution: {
          name: "Example Bank",
        },
      },
      {
        id: "acct_card",
        name: "Everyday Card",
        type: "credit",
        subtype: "credit_card",
        institution: {
          name: "Example Bank",
        },
      },
    ]);
    const getBalance = vi.fn(async (_accessToken: string, accountId: string) => ({
      account_id: accountId,
      ledger: accountId === "acct_card" ? "-42.00" : "123.45",
      available: accountId === "acct_card" ? undefined : "100.00",
    }));
    const listTransactions = vi.fn(async (_accessToken: string, accountId: string) => [
      {
        id: `tx_${accountId}`,
        account_id: accountId,
        date: "2026-06-05",
        description: accountId === "acct_card" ? "Card Coffee" : "Payroll",
        amount: accountId === "acct_card" ? "4.25" : "200.00",
        details: {
          category: accountId === "acct_card" ? "food" : "income",
        },
      },
    ]);
    const provider = new TellerProvider({
      client: {
        listAccounts,
        getBalance,
        listTransactions,
      },
      credentialLoader,
    });

    const results = await provider.syncConnectedInstitutions("user_1");

    expect(results).toEqual([
      expect.objectContaining({
        type: "success",
        connection: {
          provider: "teller",
          institutionId: "institution_1",
          institutionName: "Example Bank",
          status: "connected",
        },
        accounts: [
          expect.objectContaining({
            id: "acct_checking",
            balanceCents: 12345,
          }),
          expect.objectContaining({
            id: "acct_card",
            kind: "credit_card",
            balanceCents: -4200,
          }),
        ],
        balances: [
          expect.objectContaining({
            accountId: "acct_checking",
            balanceCents: 12345,
          }),
          expect.objectContaining({
            accountId: "acct_card",
            balanceCents: -4200,
          }),
        ],
        transactions: [
          expect.objectContaining({
            id: "tx_acct_checking",
            amountCents: 20000,
          }),
          expect.objectContaining({
            id: "tx_acct_card",
            amountCents: -425,
          }),
        ],
      }),
    ]);
    expect(listAccounts).toHaveBeenCalledTimes(1);
    expect(getBalance).toHaveBeenCalledTimes(2);
    expect(listTransactions).toHaveBeenCalledTimes(2);
  });

  it("returns a provider-scoped institution failure when coordinated Teller sync fails", async () => {
    const provider = new TellerProvider({
      client: {
        listAccounts: vi.fn().mockRejectedValue(new Error("Teller unavailable.")),
        getBalance: vi.fn(),
        listTransactions: vi.fn(),
      },
      credentialLoader,
    });

    await expect(provider.syncConnectedInstitutions("user_1")).resolves.toEqual([
      expect.objectContaining({
        type: "failure",
        institutionId: "institution_1",
        institutionName: "Example Bank",
        error: expect.any(Error),
      }),
    ]);
  });
});
