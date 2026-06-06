import type { PlaidError } from "plaid";
import type {
  ConnectedInstitution,
  ConnectSession,
  FinancialDataProvider,
  ProviderInstitutionSyncResult,
  ProviderInstitutionSyncSuccess,
} from "@/lib/providers/FinancialDataProvider";
import type { Account, AccountBalanceSummary, Transaction } from "@/lib/types";
import { ProviderSyncError, ProviderUnavailableError } from "@/lib/providers/provider-errors";
import {
  createPlaidClient,
  createPlaidConnectSession,
  getPlaidConfig,
  type PlaidClient,
  type PlaidConfig,
} from "@/lib/providers/plaid/config";
import {
  loadPlaidCredentialForInstitution,
  loadPlaidCredentialsForUser,
  loadLatestPlaidCredentialForUser,
  storePlaidTransactionCursor,
  type PlaidStoredCredential,
} from "@/lib/providers/plaid/credential-store";
import {
  normalizePlaidAccount,
  normalizePlaidBalance,
  normalizePlaidTransaction,
} from "@/lib/providers/plaid/normalize";

export class PlaidProvider implements FinancialDataProvider {
  private config: PlaidConfig;
  private client?: PlaidClient;
  private credentialLoader: (userId: string) => Promise<PlaidStoredCredential | null>;
  private credentialsLoader: (userId: string) => Promise<PlaidStoredCredential[]>;
  private institutionCredentialLoader: (input: {
    userId: string;
    institutionId: string;
  }) => Promise<PlaidStoredCredential | null>;
  private transactionCursorStore: (input: {
    userId: string;
    institutionId: string;
    transactionCursor: string;
  }) => Promise<void>;
  private credentialCache = new Map<string, Promise<PlaidStoredCredential>>();
  private accountCache = new Map<string, Promise<Awaited<ReturnType<PlaidClient["accountsBalanceGet"]>>["data"]["accounts"]>>();

  constructor(input: {
    config?: PlaidConfig;
    client?: PlaidClient;
    credentialLoader?: (userId: string) => Promise<PlaidStoredCredential | null>;
    credentialsLoader?: (userId: string) => Promise<PlaidStoredCredential[]>;
    institutionCredentialLoader?: (input: {
      userId: string;
      institutionId: string;
    }) => Promise<PlaidStoredCredential | null>;
    transactionCursorStore?: (input: {
      userId: string;
      institutionId: string;
      transactionCursor: string;
    }) => Promise<void>;
  } = {}) {
    this.config = input.config ?? getPlaidConfig();
    this.client = input.client;
    this.credentialLoader = input.credentialLoader ?? loadLatestPlaidCredentialForUser;
    this.credentialsLoader = input.credentialsLoader ?? loadPlaidCredentialsForUser;
    this.institutionCredentialLoader =
      input.institutionCredentialLoader ?? loadPlaidCredentialForInstitution;
    this.transactionCursorStore = input.transactionCursorStore ?? storePlaidTransactionCursor;
  }

  async createConnectSession(
    userId: string,
    options: {
      mode?: "connect" | "repair";
      institutionId?: string;
    } = {},
  ): Promise<ConnectSession> {
    if (options.mode === "repair") {
      return this.createRepairConnectSession(userId, options.institutionId);
    }

    return createPlaidConnectSession({
      userId,
      config: this.config,
      client: this.client,
    });
  }

  async createRepairConnectSession(
    userId: string,
    institutionId?: string,
  ): Promise<ConnectSession> {
    const credential = institutionId
      ? await this.institutionCredentialLoader({
          userId,
          institutionId,
        })
      : await this.credentialLoader(userId);

    if (!credential) {
      throw new ProviderUnavailableError(
        "plaid",
        "Connect a Plaid institution before repairing Plaid data.",
      );
    }

    return createPlaidConnectSession({
      userId,
      config: this.config,
      client: this.client,
      accessToken: credential.accessToken,
    });
  }

  async handleConnectCallback(input: { userId: string }): Promise<ConnectedInstitution> {
    const credential = await this.loadCredential(input.userId);

    return {
      provider: "plaid",
      institutionId: credential.institutionId,
      institutionName: credential.institutionName,
      status: "connected",
    };
  }

  async syncConnectedInstitutions(userId: string): Promise<ProviderInstitutionSyncResult[]> {
    const credentials = await this.credentialsLoader(userId);

    if (credentials.length === 0) {
      throw new ProviderUnavailableError(
        "plaid",
        "Connect a Plaid institution before syncing Plaid data.",
      );
    }

    return Promise.all(credentials.map((credential) => this.syncCredentialSafely(credential)));
  }

  async syncAccounts(userId: string): Promise<Account[]> {
    const credential = await this.loadCredential(userId);
    const accounts = await this.loadBalanceAccounts(userId);

    return accounts.map((account) => normalizePlaidAccount(account, credential.institutionName));
  }

  async syncTransactions(userId: string): Promise<Transaction[]> {
    const credential = await this.loadCredential(userId);
    const client = this.getClient();
    const transactions = [];
    let cursor: string | undefined;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < 10) {
      const response = await this.requestWithPlaidError(credential, () =>
        client.transactionsSync({
          access_token: credential.accessToken,
          cursor,
          count: 500,
          options: {
            include_original_description: true,
          },
        }),
      );

      transactions.push(...response.data.added, ...response.data.modified);
      cursor = response.data.next_cursor || cursor;
      hasMore = response.data.has_more;
      pageCount += 1;
    }

    return transactions.map(normalizePlaidTransaction);
  }

  async syncBalances(userId: string): Promise<AccountBalanceSummary[]> {
    const credential = await this.loadCredential(userId);
    const accounts = await this.loadBalanceAccounts(userId);

    return accounts.map((account) => normalizePlaidBalance(account, credential.institutionName));
  }

  private async syncCredentialSafely(
    credential: PlaidStoredCredential,
  ): Promise<ProviderInstitutionSyncResult> {
    try {
      return await this.syncCredential(credential);
    } catch (error) {
      return {
        type: "failure",
        error,
        institutionId: credential.institutionId,
        institutionName: credential.institutionName,
      };
    }
  }

  private async syncCredential(
    credential: PlaidStoredCredential,
  ): Promise<ProviderInstitutionSyncSuccess> {
    const [balanceAccounts, transactionSync] = await Promise.all([
      this.requestWithPlaidError(credential, () =>
        this.getClient().accountsBalanceGet({
          access_token: credential.accessToken,
        }),
      ).then((response) => response.data.accounts),
      this.syncTransactionsForCredential(credential),
    ]);
    const accounts = balanceAccounts.map((account) =>
      normalizePlaidAccount(account, credential.institutionName),
    );
    const balances = balanceAccounts.map((account) =>
      normalizePlaidBalance(account, credential.institutionName),
    );
    const nextCursor = transactionSync.nextCursor;

    return {
      type: "success",
      connection: {
        provider: "plaid",
        institutionId: credential.institutionId,
        institutionName: credential.institutionName,
        status: "connected",
      },
      accounts,
      transactions: transactionSync.transactions,
      balances,
      ...(nextCursor
        ? {
            commit: () =>
              this.transactionCursorStore({
                userId: credential.userId,
                institutionId: credential.institutionId,
                transactionCursor: nextCursor,
              }),
          }
        : {}),
    };
  }

  private async syncTransactionsForCredential(
    credential: PlaidStoredCredential,
  ): Promise<{ transactions: Transaction[]; nextCursor?: string }> {
    const client = this.getClient();
    const transactions = [];
    let cursor = credential.transactionCursor;
    let nextCursor = credential.transactionCursor;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < 10) {
      const response = await this.requestWithPlaidError(credential, () =>
        client.transactionsSync({
          access_token: credential.accessToken,
          cursor,
          count: 500,
          options: {
            include_original_description: true,
          },
        }),
      );

      transactions.push(...response.data.added, ...response.data.modified);
      nextCursor = response.data.next_cursor || nextCursor;
      cursor = nextCursor;
      hasMore = response.data.has_more;
      pageCount += 1;
    }

    return {
      transactions: transactions.map(normalizePlaidTransaction),
      nextCursor,
    };
  }

  private async loadBalanceAccounts(userId: string) {
    const cached = this.accountCache.get(userId);

    if (cached) {
      return cached;
    }

    const promise = this.loadCredential(userId).then((credential) =>
      this.requestWithPlaidError(credential, () =>
        this.getClient().accountsBalanceGet({
          access_token: credential.accessToken,
        }),
      ).then((response) => response.data.accounts),
    );

    this.accountCache.set(userId, promise);

    return promise;
  }

  private async loadCredential(userId: string): Promise<PlaidStoredCredential> {
    const cached = this.credentialCache.get(userId);

    if (cached) {
      return cached;
    }

    const promise = this.credentialLoader(userId).then((credential) => {
      if (!credential) {
        throw new ProviderUnavailableError(
          "plaid",
          "Connect a Plaid institution before syncing Plaid data.",
        );
      }

      return credential;
    });

    this.credentialCache.set(userId, promise);

    return promise;
  }

  private getClient(): PlaidClient {
    if (!this.client) {
      this.client = createPlaidClient(this.config);
    }

    return this.client;
  }

  private async requestWithPlaidError<T>(
    credential: PlaidStoredCredential,
    request: () => Promise<T>,
  ): Promise<T> {
    try {
      return await request();
    } catch (error) {
      throw mapPlaidError(error, credential);
    }
  }
}

function mapPlaidError(error: unknown, credential: PlaidStoredCredential): ProviderSyncError {
  const plaidError = extractPlaidError(error);

  if (!plaidError?.error_code) {
    return new ProviderSyncError({
      provider: "plaid",
      code: "plaid-request-failed",
      message: "Plaid sync failed. Try again, or reconnect the bank if this keeps happening.",
      institutionId: credential.institutionId,
      institutionName: credential.institutionName,
      status: "failed",
    });
  }

  const code = toProviderErrorCode(plaidError.error_code);
  const mapping = getPlaidErrorMapping(plaidError.error_code);

  return new ProviderSyncError({
    provider: "plaid",
    code,
    message: mapping.message ?? getPlaidErrorMessage(plaidError),
    institutionId: credential.institutionId,
    institutionName: credential.institutionName,
    status: mapping.status,
    repairRequired: mapping.repairRequired,
  });
}

function getPlaidErrorMapping(errorCode: string): {
  status: "stale" | "failed" | "revoked";
  message?: string;
  repairRequired: boolean;
} {
  switch (errorCode.toUpperCase()) {
    case "ITEM_LOGIN_REQUIRED":
    case "INVALID_CREDENTIALS":
    case "INVALID_MFA":
    case "ITEM_LOCKED":
    case "MFA_NOT_SUPPORTED":
    case "USER_SETUP_REQUIRED":
      return {
        status: "failed",
        message: "Plaid needs this bank connection repaired. Reconnect the bank to refresh access.",
        repairRequired: true,
      };
    case "INVALID_ACCESS_TOKEN":
    case "ITEM_NOT_FOUND":
    case "USER_PERMISSION_REVOKED":
    case "USER_ACCOUNT_REVOKED":
    case "ACCESS_NOT_GRANTED":
      return {
        status: "revoked",
        message: "Plaid access for this bank was revoked. Reconnect the bank to continue syncing.",
        repairRequired: true,
      };
    case "NO_ACCOUNTS":
      return {
        status: "failed",
        message: "Plaid did not return an eligible account. Reconnect and select the accounts Spendable should use.",
        repairRequired: true,
      };
    case "PRODUCT_NOT_READY":
      return {
        status: "stale",
        message: "Plaid is still preparing this bank's transaction data. Try syncing again in a few minutes.",
        repairRequired: false,
      };
    case "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION":
      return {
        status: "stale",
        message: "Plaid transaction data changed during sync. Try syncing again.",
        repairRequired: false,
      };
    default:
      return {
        status: "failed",
        repairRequired: false,
      };
  }
}

function extractPlaidError(error: unknown): Pick<PlaidError, "error_code" | "error_message" | "display_message"> | null {
  const direct = asRecord(error);

  if (hasPlaidErrorCode(direct)) {
    return direct;
  }

  const response = asRecord(direct?.response);
  const data = asRecord(response?.data);

  if (hasPlaidErrorCode(data)) {
    return data;
  }

  return null;
}

function hasPlaidErrorCode(
  value: Record<string, unknown> | null,
): value is Pick<PlaidError, "error_code" | "error_message" | "display_message"> {
  return Boolean(value && typeof value.error_code === "string");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getPlaidErrorMessage(
  plaidError: Pick<PlaidError, "error_code" | "error_message" | "display_message">,
): string {
  if (typeof plaidError.display_message === "string" && plaidError.display_message.trim()) {
    return plaidError.display_message.trim();
  }

  if (typeof plaidError.error_message === "string" && plaidError.error_message.trim()) {
    return plaidError.error_message.trim();
  }

  return `Plaid sync failed with ${plaidError.error_code}.`;
}

function toProviderErrorCode(errorCode: string): string {
  return errorCode.trim().toLowerCase().replace(/_/g, "-");
}
