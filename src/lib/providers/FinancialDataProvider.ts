import type { Account, AccountBalanceSummary, Transaction } from "@/lib/types";

export type PlaidLinkMode = "connect" | "repair" | "account_selection";

export type ConnectSession = {
  provider: "mock" | "teller" | "plaid";
  status: "ready" | "unavailable";
  message: string;
  connect?: TellerConnectSession | PlaidConnectSession;
};

export type TellerConnectSession = {
  kind: "teller";
  applicationId: string;
  environment: "sandbox" | "development" | "production";
  products: string[];
  nonce?: string;
  enrollmentId?: string;
};

export type PlaidConnectSession = {
  kind: "plaid";
  linkToken: string;
  environment: "sandbox" | "production";
  products: string[];
  mode: PlaidLinkMode;
  institutionId?: string;
};

export type ConnectedInstitution = {
  provider: "mock" | "teller" | "plaid";
  institutionId?: string;
  providerInstitutionId?: string;
  institutionName: string;
  status: "connected" | "mocked";
};

export type FinancialProviderName = ConnectSession["provider"];

export type ProviderSyncOptions = {
  institutionId?: string;
};

export type ProviderInstitutionSyncSuccess = {
  type: "success";
  connection: ConnectedInstitution;
  accounts: Account[];
  transactions: Transaction[];
  balances: AccountBalanceSummary[];
  removedTransactionProviderIds?: string[];
  commit?: () => Promise<void>;
};

export type ProviderInstitutionSyncFailure = {
  type: "failure";
  error: unknown;
  institutionId?: string;
  institutionName?: string;
};

export type ProviderInstitutionSyncResult =
  | ProviderInstitutionSyncSuccess
  | ProviderInstitutionSyncFailure;

export interface FinancialDataProvider {
  createConnectSession(
    userId: string,
    options?: {
      mode?: PlaidLinkMode;
      institutionId?: string;
    },
  ): Promise<ConnectSession>;
  handleConnectCallback(input: unknown): Promise<ConnectedInstitution>;
  syncAccounts(userId: string): Promise<Account[]>;
  syncTransactions(userId: string): Promise<Transaction[]>;
  syncBalances(userId: string): Promise<AccountBalanceSummary[]>;
  syncConnectedInstitutions?(
    userId: string,
    options?: ProviderSyncOptions,
  ): Promise<ProviderInstitutionSyncResult[]>;
}
