import type {
  ConnectedInstitution,
  ConnectSession,
  FinancialDataProvider,
} from "@/lib/providers/FinancialDataProvider";
import type { Account, AccountBalanceSummary, Transaction } from "@/lib/types";
import { fakeSnapshot } from "@/lib/fake-data";

export class MockProvider implements FinancialDataProvider {
  async createConnectSession(): Promise<ConnectSession> {
    return {
      provider: "mock",
      status: "ready",
      message: "Mock data is already connected.",
    };
  }

  async handleConnectCallback(): Promise<ConnectedInstitution> {
    return {
      provider: "mock",
      institutionName: "Northstar Bank",
      status: "mocked",
    };
  }

  async syncAccounts(): Promise<Account[]> {
    return fakeSnapshot.accounts;
  }

  async syncTransactions(): Promise<Transaction[]> {
    return fakeSnapshot.transactions;
  }

  async syncBalances(): Promise<AccountBalanceSummary[]> {
    return fakeSnapshot.accounts.map((account) => ({
      accountId: account.id,
      name: account.name,
      institutionName: account.institutionName,
      kind: account.kind,
      balanceCents: account.balanceCents,
      availableBalanceCents: account.availableBalanceCents,
      lastFour: account.lastFour,
    }));
  }
}

export function getMockSnapshot() {
  return fakeSnapshot;
}
