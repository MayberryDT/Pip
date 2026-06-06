import type {
  ConnectedInstitution,
  ConnectSession,
  FinancialDataProvider,
  ProviderInstitutionSyncResult,
  ProviderInstitutionSyncSuccess,
} from "@/lib/providers/FinancialDataProvider";
import type { Account, AccountBalanceSummary, Transaction } from "@/lib/types";
import { ProviderUnavailableError } from "@/lib/providers/provider-errors";
import {
  createTellerConnectSession,
  getTellerConfig,
  type TellerConfig,
} from "@/lib/providers/teller/config";
import { NodeTellerHttpClient, type TellerHttpClient } from "@/lib/providers/teller/http";
import {
  loadLatestTellerCredentialForUser,
  type TellerStoredCredential,
} from "@/lib/providers/teller/credential-store";
import {
  normalizeTellerAccount,
  normalizeTellerBalance,
  normalizeTellerTransaction,
} from "@/lib/providers/teller/normalize";

export class TellerProvider implements FinancialDataProvider {
  private config: TellerConfig;
  private client: TellerHttpClient;
  private credentialLoader: (userId: string) => Promise<TellerStoredCredential | null>;

  constructor(input: {
    config?: TellerConfig;
    client?: TellerHttpClient;
    credentialLoader?: (userId: string) => Promise<TellerStoredCredential | null>;
  } = {}) {
    this.config = input.config ?? getTellerConfig();
    this.client = input.client ?? new NodeTellerHttpClient(this.config);
    this.credentialLoader = input.credentialLoader ?? loadLatestTellerCredentialForUser;
  }

  async createConnectSession(): Promise<ConnectSession> {
    return createTellerConnectSession(this.config);
  }

  async handleConnectCallback(input: { userId: string }): Promise<ConnectedInstitution> {
    const credential = await this.loadCredential(input.userId);

    return {
      provider: "teller",
      institutionId: credential.institutionId,
      institutionName: credential.institutionName,
      status: "connected",
    };
  }

  async syncAccounts(userId: string): Promise<Account[]> {
    const credential = await this.loadCredential(userId);
    const accounts = await this.client.listAccounts(credential.accessToken);
    const balances = await Promise.all(
      accounts.map((account) => this.client.getBalance(credential.accessToken, account.id)),
    );

    return accounts.map((account) => normalizeTellerAccount(account, balances));
  }

  async syncTransactions(userId: string): Promise<Transaction[]> {
    const credential = await this.loadCredential(userId);
    const accounts = await this.client.listAccounts(credential.accessToken);
    const transactions = await Promise.all(
      accounts.map((account) => this.client.listTransactions(credential.accessToken, account.id)),
    );

    return transactions.flat().map(normalizeTellerTransaction);
  }

  async syncBalances(userId: string): Promise<AccountBalanceSummary[]> {
    const credential = await this.loadCredential(userId);
    const accounts = await this.client.listAccounts(credential.accessToken);
    const balances = await Promise.all(
      accounts.map((account) => this.client.getBalance(credential.accessToken, account.id)),
    );

    return balances.map((balance) => {
      const account = accounts.find((item) => item.id === balance.account_id);

      if (!account) {
        throw new Error(`Teller balance returned unknown account ${balance.account_id}.`);
      }

      return normalizeTellerBalance(account, balance);
    });
  }

  async syncConnectedInstitutions(userId: string): Promise<ProviderInstitutionSyncResult[]> {
    const credential = await this.loadCredential(userId);

    try {
      return [await this.syncCredential(credential)];
    } catch (error) {
      return [
        {
          type: "failure",
          error,
          institutionId: credential.institutionId,
          institutionName: credential.institutionName,
        },
      ];
    }
  }

  private async syncCredential(
    credential: TellerStoredCredential,
  ): Promise<ProviderInstitutionSyncSuccess> {
    const accounts = await this.client.listAccounts(credential.accessToken);
    const [balances, transactionsByAccount] = await Promise.all([
      Promise.all(accounts.map((account) => this.client.getBalance(credential.accessToken, account.id))),
      Promise.all(
        accounts.map((account) => this.client.listTransactions(credential.accessToken, account.id)),
      ),
    ]);
    const balancesByAccountId = new Map(balances.map((balance) => [balance.account_id, balance]));

    return {
      type: "success",
      connection: {
        provider: "teller",
        institutionId: credential.institutionId,
        institutionName: credential.institutionName,
        status: "connected",
      },
      accounts: accounts.map((account) => normalizeTellerAccount(account, balances)),
      transactions: transactionsByAccount.flat().map(normalizeTellerTransaction),
      balances: accounts.map((account) => {
        const balance = balancesByAccountId.get(account.id);

        if (!balance) {
          throw new Error(`Teller did not return a balance for account ${account.id}.`);
        }

        return normalizeTellerBalance(account, balance);
      }),
    };
  }

  private async loadCredential(userId: string): Promise<TellerStoredCredential> {
    const credential = await this.credentialLoader(userId);

    if (!credential) {
      throw new ProviderUnavailableError(
        "teller",
        "Connect a Teller institution before syncing Teller data.",
      );
    }

    return credential;
  }
}
