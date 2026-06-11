import { describe, expect, it, vi } from "vitest";
import type { AccountBase, Transaction as PlaidTransaction } from "plaid";
import { PlaidProvider } from "@/lib/providers/plaid/PlaidProvider";
import { getPlaidConfig, type PlaidClient } from "@/lib/providers/plaid/config";
import { ProviderSyncError } from "@/lib/providers/provider-errors";

describe("PlaidProvider contract", () => {
  const accounts = [
    {
      account_id: "acct_checking",
      balances: {
        current: 123.45,
        available: 120,
        iso_currency_code: "USD",
        unofficial_currency_code: null,
        limit: null,
      },
      mask: "1234",
      name: "Everyday Checking",
      official_name: null,
      type: "depository",
      subtype: "checking",
    } as AccountBase,
  ];
  const transactions = [
    {
      transaction_id: "tx_1",
      account_id: "acct_checking",
      amount: 4.25,
      date: "2026-06-05",
      authorized_date: null,
      name: "Coffee Shop",
      merchant_name: "Copper Cup",
      pending: false,
    } as PlaidTransaction,
  ];
  const accountsBalanceGet = vi.fn();
  const client = {
    linkTokenCreate: vi.fn().mockResolvedValue({
      data: {
        link_token: "link-sandbox-123",
      },
    }),
    itemPublicTokenExchange: vi.fn(),
    accountsBalanceGet,
    accountsGet: vi.fn().mockResolvedValue({
      data: {
        accounts,
      },
    }),
    transactionsSync: vi.fn().mockResolvedValue({
      data: {
        accounts,
        added: transactions,
        modified: [],
        removed: [],
        next_cursor: "cursor-1",
        has_more: false,
        request_id: "request-1",
      },
    }),
  } as unknown as PlaidClient;
  const provider = new PlaidProvider({
    client,
    config: getPlaidConfig({
      PLAID_CLIENT_ID: "client-id",
      PLAID_SECRET: "secret",
    }),
    credentialLoader: async () => ({
      institutionId: "institution_1",
      userId: "user_1",
      itemId: "item_1",
      accessToken: "access-token",
      institutionName: "Plaid Bank",
      environment: "sandbox",
    }),
  });

  it("creates Plaid Link sessions", async () => {
    await expect(provider.createConnectSession("user_1")).resolves.toMatchObject({
      provider: "plaid",
      status: "ready",
      connect: {
        kind: "plaid",
        linkToken: "link-sandbox-123",
      },
    });
  });

  it("returns connected institution metadata from stored Plaid credentials", async () => {
    await expect(provider.handleConnectCallback({ userId: "user_1" })).resolves.toMatchObject({
      provider: "plaid",
      institutionId: "institution_1",
      institutionName: "Plaid Bank",
      status: "connected",
    });
  });

  it("creates Plaid update-mode sessions for connection repair", async () => {
    const linkTokenCreate = vi.fn().mockResolvedValue({
      data: {
        link_token: "link-repair-123",
      },
    });
    const repairProvider = new PlaidProvider({
      client: {
        linkTokenCreate,
        itemPublicTokenExchange: vi.fn(),
        accountsGet: vi.fn(),
        transactionsSync: vi.fn(),
      } as unknown as PlaidClient,
      config: getPlaidConfig({
        PLAID_CLIENT_ID: "client-id",
        PLAID_SECRET: "secret",
      }),
      institutionCredentialLoader: async () => ({
        institutionId: "institution_1",
        userId: "user_1",
        itemId: "item_1",
        accessToken: "access-token",
        institutionName: "Plaid Bank",
        environment: "sandbox",
      }),
    });

    await expect(
      repairProvider.createConnectSession("user_1", {
        mode: "repair",
        institutionId: "institution_1",
      }),
    ).resolves.toMatchObject({
      provider: "plaid",
      status: "ready",
      connect: {
        kind: "plaid",
        linkToken: "link-repair-123",
        mode: "repair",
        products: [],
      },
    });
    expect(linkTokenCreate).toHaveBeenCalledWith(expect.objectContaining({
      access_token: "access-token",
    }));
  });

  it("creates Plaid update-mode sessions with account selection enabled", async () => {
    const linkTokenCreate = vi.fn().mockResolvedValue({
      data: {
        link_token: "link-selection-123",
      },
    });
    const selectionProvider = new PlaidProvider({
      client: {
        linkTokenCreate,
        itemPublicTokenExchange: vi.fn(),
        accountsGet: vi.fn(),
        transactionsSync: vi.fn(),
      } as unknown as PlaidClient,
      config: getPlaidConfig({
        PLAID_CLIENT_ID: "client-id",
        PLAID_SECRET: "secret",
      }),
      institutionCredentialLoader: async () => ({
        institutionId: "institution_1",
        userId: "user_1",
        itemId: "item_1",
        accessToken: "access-token",
        institutionName: "Plaid Bank",
        environment: "sandbox",
      }),
    });

    await expect(
      selectionProvider.createConnectSession("user_1", {
        mode: "account_selection",
        institutionId: "institution_1",
      }),
    ).resolves.toMatchObject({
      provider: "plaid",
      status: "ready",
      connect: {
        kind: "plaid",
        linkToken: "link-selection-123",
        mode: "account_selection",
        products: [],
        institutionId: "institution_1",
      },
    });
    expect(linkTokenCreate).toHaveBeenCalledWith(expect.objectContaining({
      access_token: "access-token",
      update: {
        account_selection_enabled: true,
      },
    }));
  });

  it("normalizes Plaid accounts, balances, and transactions into the app contract", async () => {
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
    expect(accountsBalanceGet).not.toHaveBeenCalled();
  });

  it("syncs every stored Plaid item and isolates a failed institution", async () => {
    const transactionCursorStore = vi.fn().mockResolvedValue(undefined);
    const multiProvider = new PlaidProvider({
      client: {
        linkTokenCreate: vi.fn(),
        itemPublicTokenExchange: vi.fn(),
        accountsGet: vi.fn(async (request: { access_token: string }) => {
          if (request.access_token === "access-token-failed") {
            throw {
              response: {
                data: {
                  error_code: "ITEM_LOGIN_REQUIRED",
                  error_message: "the login details changed",
                  display_message: null,
                },
              },
            };
          }

          return {
            data: {
              accounts,
            },
          };
        }),
        transactionsSync: vi.fn(async (request: { access_token: string; cursor?: string }) => ({
          data: {
            accounts,
            added: request.access_token === "access-token-good" ? transactions : [],
            modified: [],
            removed: [],
            next_cursor: "cursor-next",
            has_more: false,
            request_id: "request-1",
          },
        })),
      } as unknown as PlaidClient,
      config: getPlaidConfig({
        PLAID_CLIENT_ID: "client-id",
        PLAID_SECRET: "secret",
      }),
      credentialsLoader: async () => [
        {
          institutionId: "institution-good",
          userId: "user_1",
          itemId: "item-good",
          accessToken: "access-token-good",
          institutionName: "Good Bank",
          environment: "sandbox",
          transactionCursor: "cursor-existing",
        },
        {
          institutionId: "institution-failed",
          userId: "user_1",
          itemId: "item-failed",
          accessToken: "access-token-failed",
          institutionName: "Needs Repair Bank",
          environment: "sandbox",
        },
      ],
      transactionCursorStore,
    });

    const results = await multiProvider.syncConnectedInstitutions("user_1");
    const success = results.find((result) => result.type === "success");
    const failure = results.find((result) => result.type === "failure");

    expect(success).toMatchObject({
      type: "success",
      connection: {
        provider: "plaid",
        institutionId: "institution-good",
        institutionName: "Good Bank",
      },
      accounts: [
        expect.objectContaining({
          id: "acct_checking",
        }),
      ],
      transactions: [
        expect.objectContaining({
          id: "tx_1",
        }),
      ],
    });
    await expect(success?.type === "success" ? success.commit?.() : undefined).resolves.toBeUndefined();
    expect(transactionCursorStore).toHaveBeenCalledWith({
      userId: "user_1",
      institutionId: "institution-good",
      transactionCursor: "cursor-next",
    });
    expect(failure).toMatchObject({
      type: "failure",
      institutionId: "institution-failed",
      institutionName: "Needs Repair Bank",
      error: {
        name: "ProviderSyncError",
        code: "item-login-required",
        repairRequired: true,
      },
    });
  });

  it("returns token decrypt failures as institution-tied repair failures", async () => {
    const accountsGet = vi.fn();
    const loadError = new ProviderSyncError({
      provider: "plaid",
      code: "provider-token-decrypt-failed",
      message: "This Plaid connection needs to be reconnected before Pip can refresh it.",
      status: "failed",
      institutionId: "institution-wise",
      institutionName: "Wise (US)",
      repairRequired: true,
    });
    const providerWithBadCredential = new PlaidProvider({
      client: {
        linkTokenCreate: vi.fn(),
        itemPublicTokenExchange: vi.fn(),
        accountsGet,
        transactionsSync: vi.fn(),
      } as unknown as PlaidClient,
      config: getPlaidConfig({
        PLAID_CLIENT_ID: "client-id",
        PLAID_SECRET: "secret",
      }),
      credentialsLoader: async () => [
        {
          institutionId: "institution-wise",
          userId: "user_1",
          itemId: "item-wise",
          accessToken: "",
          institutionName: "Wise (US)",
          environment: "sandbox",
          loadError,
        },
      ],
    });

    await expect(providerWithBadCredential.syncConnectedInstitutions("user_1")).resolves.toEqual([
      {
        type: "failure",
        institutionId: "institution-wise",
        institutionName: "Wise (US)",
        error: loadError,
      },
    ]);
    expect(accountsGet).not.toHaveBeenCalled();
  });

  it("maps Plaid item repair errors to provider sync errors", async () => {
    const failingProvider = new PlaidProvider({
      client: {
        linkTokenCreate: vi.fn(),
        itemPublicTokenExchange: vi.fn(),
        accountsGet: vi.fn().mockRejectedValue({
          response: {
            data: {
              error_code: "ITEM_LOGIN_REQUIRED",
              error_message: "the login details changed",
              display_message: null,
            },
          },
        }),
        transactionsSync: vi.fn(),
      } as unknown as PlaidClient,
      config: getPlaidConfig({
        PLAID_CLIENT_ID: "client-id",
        PLAID_SECRET: "secret",
      }),
      credentialLoader: async () => ({
        institutionId: "institution_1",
        userId: "user_1",
        itemId: "item_1",
        accessToken: "access-token",
        institutionName: "Plaid Bank",
        environment: "sandbox",
      }),
    });

    await expect(failingProvider.syncAccounts("user_1")).rejects.toMatchObject({
      name: "ProviderSyncError",
      provider: "plaid",
      code: "item-login-required",
      status: "failed",
      institutionId: "institution_1",
      institutionName: "Plaid Bank",
      repairRequired: true,
    } satisfies Partial<ProviderSyncError>);
  });
});
