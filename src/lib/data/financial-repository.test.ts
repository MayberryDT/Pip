import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCurrentAppDate,
  loadFinancialSnapshotForUser,
  loadCachedPipCashResultForUser,
  markPipCashSnapshotsStaleForUser,
  mapAccountRow,
  mapTransactionRow,
  mapUserSettingsRow,
} from "@/lib/data/financial-repository";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";
import type { Database } from "@/lib/supabase/database.types";
import type {
  AccountPreferenceRow,
  AccountRow,
  RecurringObligationRuleRow,
  TransactionRow,
  UserSettingsRow,
} from "@/lib/supabase/database.types";

describe("financial repository row mapping", () => {
  it("maps Supabase settings rows into engine settings", () => {
    const row: UserSettingsRow = {
      user_id: "user-1",
      protected_savings_monthly_cents: 25000,
      manual_refresh_only: true,
      invite_accepted_at: null,
      privacy_consent_at: null,
      created_at: "2026-06-05T00:00:00.000Z",
      updated_at: "2026-06-05T00:00:00.000Z",
    };

    expect(mapUserSettingsRow(row)).toMatchObject({
      protectedSavingsMonthlyCents: 25000,
    });
  });

  it("maps account rows into engine accounts without provider secrets", () => {
    const row: AccountRow = {
      id: "account-1",
      user_id: "user-1",
      institution_id: "institution-1",
      provider_account_id: "provider-account-1",
      name: "Everyday Checking",
      institution_name: "Northstar Bank",
      kind: "checking",
      balance_cents: 12345,
      available_balance_cents: 12000,
      last_four: "1042",
      is_protected_savings: false,
      active: true,
      raw_provider_data: {},
      created_at: "2026-06-05T00:00:00.000Z",
      updated_at: "2026-06-05T00:00:00.000Z",
    };

    expect(mapAccountRow(row)).toEqual({
      id: "account-1",
      name: "Everyday Checking",
      institutionName: "Northstar Bank",
      kind: "checking",
      balanceCents: 12345,
      availableBalanceCents: 12000,
      lastFour: "1042",
      isProtectedSavings: false,
      active: true,
      includedInPipCash: true,
      hiddenReason: undefined,
      userLabel: undefined,
    });
  });

  it("resolves account preferences over synced account defaults", () => {
    const row: AccountRow = {
      id: "account-1",
      user_id: "user-1",
      institution_id: "institution-1",
      provider_account_id: "provider-account-1",
      name: "Savings",
      institution_name: "Northstar Bank",
      kind: "savings",
      balance_cents: 50000,
      available_balance_cents: null,
      last_four: null,
      is_protected_savings: true,
      active: true,
      raw_provider_data: {},
      created_at: "2026-06-05T00:00:00.000Z",
      updated_at: "2026-06-05T00:00:00.000Z",
    };
    const preference: AccountPreferenceRow = {
      id: "preference-1",
      user_id: "user-1",
      account_id: "account-1",
      include_in_pip_cash: false,
      is_protected_savings_override: false,
      user_label: "Vacation",
      hidden_reason: "user_excluded",
      created_at: "2026-06-05T00:00:00.000Z",
      updated_at: "2026-06-05T00:00:00.000Z",
    };

    expect(mapAccountRow(row, preference)).toMatchObject({
      id: "account-1",
      includedInPipCash: false,
      isProtectedSavings: false,
      userLabel: "Vacation",
      hiddenReason: "user_excluded",
    });
  });

  it("maps transaction metadata used by missing-card detection", () => {
    const row: TransactionRow = {
      id: "transaction-1",
      user_id: "user-1",
      account_id: "account-1",
      provider_transaction_id: "provider-transaction-1",
      date: "2026-06-05",
      description: "Capital One card payment",
      merchant_name: "Capital One",
      amount_cents: -12400,
      category: "credit card payment",
      kind: "credit_card_payment",
      pending: false,
      metadata: {
        issuerName: "Capital One",
        matchedConnectedCard: false,
        linkedTransactionId: "tx-linked",
      },
      raw_provider_data: {},
      created_at: "2026-06-05T00:00:00.000Z",
      updated_at: "2026-06-05T00:00:00.000Z",
    };

    expect(mapTransactionRow(row)).toMatchObject({
      id: "transaction-1",
      accountId: "account-1",
      metadata: {
        issuerName: "Capital One",
        matchedConnectedCard: false,
        linkedTransactionId: "tx-linked",
      },
    });
  });

  it("loads the latest non-stale cached Pip Cash result", async () => {
    const conditions: Array<[string, unknown]> = [];
    const cachedResult = calculatePipCash(fakeSnapshot);
    const supabase = createPipCashSnapshotsClient({
      resultRows: [
        {
          result: cachedResult,
        },
      ],
      conditions,
    });

    await expect(loadCachedPipCashResultForUser(supabase, "user-1")).resolves.toMatchObject({
      pipCashTodayCents: 4300,
    });
    expect(conditions).toEqual([
      ["user_id", "user-1"],
      ["as_of_date", getCurrentAppDate()],
      ["stale", false],
    ]);
  });

  it("can load a cached Pip Cash result for a specific app date", async () => {
    const conditions: Array<[string, unknown]> = [];
    const cachedResult = calculatePipCash(fakeSnapshot);
    const supabase = createPipCashSnapshotsClient({
      resultRows: [
        {
          result: cachedResult,
        },
      ],
      conditions,
    });

    await expect(loadCachedPipCashResultForUser(supabase, "user-1", "2026-06-08")).resolves.toMatchObject({
      pipCashTodayCents: 4300,
    });
    expect(conditions).toEqual([
      ["user_id", "user-1"],
      ["as_of_date", "2026-06-08"],
      ["stale", false],
    ]);
  });

  it("returns null when a cached Pip Cash result is malformed", async () => {
    const supabase = createPipCashSnapshotsClient({
      resultRows: [
        {
          result: {
            pipCashTodayCents: 4300,
          },
        },
      ],
    });

    await expect(loadCachedPipCashResultForUser(supabase, "user-1")).resolves.toBeNull();
  });

  it("marks active cached Pip Cash snapshots stale after preference changes", async () => {
    const conditions: Array<[string, unknown]> = [];
    const updates: Record<string, unknown>[] = [];
    const supabase = createPipCashSnapshotsClient({
      conditions,
      updates,
    });

    await markPipCashSnapshotsStaleForUser(supabase, "user-1");

    expect(updates).toEqual([
      {
        stale: true,
      },
    ]);
    expect(conditions).toEqual([
      ["user_id", "user-1"],
      ["stale", false],
    ]);
  });

  it("loads recurring obligation rules into production financial snapshots", async () => {
    const calls: unknown[][] = [];
    const supabase = createFinancialSnapshotClient({
      calls,
      settings: settingsRow(),
      accounts: [accountRow()],
      transactions: [transactionRow()],
      recurringObligationRules: [recurringRuleRow()],
    });

    await expect(loadFinancialSnapshotForUser(supabase, "user-1")).resolves.toMatchObject({
      recurringObligationRules: [
        {
          merchantKey: "city-power",
          label: "City Power",
          expectedAmountCents: 8400,
          status: "active",
        },
      ],
    });
    expect(calls).toContainEqual(["from", "recurring_obligation_rules"]);
    expect(calls).toContainEqual(["eq", "user_id", "user-1"]);
  });
});

function createPipCashSnapshotsClient(input: {
  resultRows?: Array<{ result: unknown }>;
  conditions?: Array<[string, unknown]>;
  updates?: Record<string, unknown>[];
}): SupabaseClient<Database> {
  return {
    from(tableName: string) {
      expect(tableName).toBe("pip_cash_snapshots");

      const query = {
        select() {
          return query;
        },
        update(payload: Record<string, unknown>) {
          input.updates?.push(payload);
          return query;
        },
        eq(column: string, value: unknown) {
          input.conditions?.push([column, value]);
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return Promise.resolve({
            data: input.resultRows ?? [],
            error: null,
          });
        },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve(
            resolve({
              data: null,
              error: null,
            }),
          ).catch(reject);
        },
      };

      return query;
    },
  } as unknown as SupabaseClient<Database>;
}

function createFinancialSnapshotClient(input: {
  calls: unknown[][];
  settings: UserSettingsRow | null;
  accounts: AccountRow[];
  accountPreferences?: AccountPreferenceRow[];
  transactions: TransactionRow[];
  recurringObligationRules: RecurringObligationRuleRow[];
}): SupabaseClient<Database> {
  return {
    from(tableName: string) {
      input.calls.push(["from", tableName]);

      const query = {
        select(columns?: string) {
          input.calls.push(["select", columns ?? "*"]);
          return query;
        },
        eq(column: string, value: unknown) {
          input.calls.push(["eq", column, value]);
          return query;
        },
        order(column: string, options: Record<string, unknown>) {
          input.calls.push(["order", column, options]);
          return query;
        },
        maybeSingle() {
          return Promise.resolve({
            data: input.settings,
            error: null,
          });
        },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve(resolve({ data: rowsForTable(tableName, input), error: null })).catch(reject);
        },
      };

      return query;
    },
  } as unknown as SupabaseClient<Database>;
}

function rowsForTable(
  tableName: string,
  input: {
    accounts: AccountRow[];
    accountPreferences?: AccountPreferenceRow[];
    transactions: TransactionRow[];
    recurringObligationRules: RecurringObligationRuleRow[];
  },
) {
  if (tableName === "accounts") {
    return input.accounts;
  }
  if (tableName === "account_preferences") {
    return input.accountPreferences ?? [];
  }
  if (tableName === "transactions") {
    return input.transactions;
  }
  if (tableName === "missing_card_preferences") {
    return [];
  }
  if (tableName === "recurring_obligation_rules") {
    return input.recurringObligationRules;
  }
  if (tableName === "savings_goals") {
    return [];
  }

  return [];
}

function settingsRow(): UserSettingsRow {
  return {
    user_id: "user-1",
    protected_savings_monthly_cents: 0,
    manual_refresh_only: false,
    invite_accepted_at: null,
    privacy_consent_at: "2026-06-01T00:00:00.000Z",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  };
}

function accountRow(): AccountRow {
  return {
    id: "account-1",
    user_id: "user-1",
    institution_id: "institution-1",
    provider_account_id: "provider-account-1",
    name: "Everyday Checking",
    institution_name: "Northstar Bank",
    kind: "checking",
    balance_cents: 120000,
    available_balance_cents: 120000,
    last_four: "1042",
    is_protected_savings: false,
    active: true,
    raw_provider_data: {},
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  };
}

function transactionRow(): TransactionRow {
  return {
    id: "transaction-1",
    user_id: "user-1",
    account_id: "account-1",
    provider_transaction_id: "provider-transaction-1",
    date: "2026-06-20",
    description: "City Power",
    merchant_name: "City Power",
    amount_cents: -8400,
    category: "utilities",
    kind: "purchase",
    pending: false,
    metadata: {},
    raw_provider_data: {},
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
  };
}

function recurringRuleRow(): RecurringObligationRuleRow {
  return {
    id: "rule-1",
    user_id: "user-1",
    merchant_key: "city-power",
    label: "City Power",
    expected_amount_cents: 8400,
    expected_day: 20,
    cadence: "monthly",
    source: "user_confirmed",
    status: "active",
    last_confirmed_at: "2026-06-20T00:00:00.000Z",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
  };
}
