import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ProviderSyncError } from "@/lib/providers/provider-errors";
import { runManualSync } from "@/lib/data/manual-sync";
import type { Database } from "@/lib/supabase/database.types";

const mocks = vi.hoisted(() => ({
  getFinancialDataProvider: vi.fn(),
  loadCachedPipCashResultForUser: vi.fn(),
  loadFinancialSnapshotForUser: vi.fn(),
  recordProductEvent: vi.fn(),
}));

vi.mock("@/lib/providers/provider-registry", async () => {
  const errors = await vi.importActual<typeof import("@/lib/providers/provider-errors")>(
    "@/lib/providers/provider-errors",
  );

  return {
    getFinancialDataProvider: mocks.getFinancialDataProvider,
    ProviderUnavailableError: errors.ProviderUnavailableError,
  };
});

vi.mock("@/lib/data/product-events", () => ({
  recordProductEvent: mocks.recordProductEvent,
}));

vi.mock("@/lib/data/financial-repository", () => ({
  loadCachedPipCashResultForUser: mocks.loadCachedPipCashResultForUser,
  loadFinancialSnapshotForUser: mocks.loadFinancialSnapshotForUser,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadCachedPipCashResultForUser.mockResolvedValue(null);
  mocks.loadFinancialSnapshotForUser.mockResolvedValue(null);
  mocks.recordProductEvent.mockResolvedValue(undefined);
});

describe("manual sync provider failures", () => {
  it("uses stable provider IDs as idempotency keys for account and transaction writes", async () => {
    const captures = createCaptures();
    const supabase = createManualSyncClient(captures);

    mocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession: vi.fn(),
      handleConnectCallback: vi.fn().mockResolvedValue({
        provider: "plaid",
        institutionId: "institution-good",
        institutionName: "Good Bank",
        status: "connected",
      }),
      syncAccounts: vi.fn().mockResolvedValue([
        {
          id: "provider-account-1",
          name: "Everyday Checking",
          institutionName: "Good Bank",
          kind: "checking",
          balanceCents: 100000,
        },
      ]),
      syncTransactions: vi.fn().mockResolvedValue([
        {
          id: "provider-tx-1",
          accountId: "provider-account-1",
          date: "2026-06-05",
          description: "Coffee",
          amountCents: -425,
          kind: "purchase",
        },
      ]),
      syncBalances: vi.fn().mockResolvedValue([
        {
          accountId: "provider-account-1",
          name: "Everyday Checking",
          institutionName: "Good Bank",
          kind: "checking",
          balanceCents: 100000,
        },
      ]),
    });

    await runManualSync(supabase, {
      userId: "user-1",
      provider: "plaid",
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    expect(captures.upserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "accounts",
          options: {
            onConflict: "user_id,provider_account_id",
          },
          rows: [
            expect.objectContaining({
              user_id: "user-1",
              provider_account_id: "provider-account-1",
              raw_provider_data: {},
            }),
          ],
        }),
        expect.objectContaining({
          tableName: "transactions",
          options: {
            onConflict: "user_id,provider_transaction_id",
          },
          rows: [
            expect.objectContaining({
              user_id: "user-1",
              provider_transaction_id: "provider-tx-1",
              raw_provider_data: {},
            }),
          ],
        }),
      ]),
    );
  });

  it("uses the sync timestamp as the snapshot as-of date for fresh provider data", async () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    const captures = createCaptures();
    const supabase = createManualSyncClient(captures);

    mocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession: vi.fn(),
      handleConnectCallback: vi.fn().mockResolvedValue({
        provider: "plaid",
        institutionId: "institution-good",
        institutionName: "Good Bank",
        status: "connected",
      }),
      syncAccounts: vi.fn().mockResolvedValue([
        {
          id: "provider-account-1",
          name: "Everyday Checking",
          institutionName: "Good Bank",
          kind: "checking",
          balanceCents: 100000,
        },
      ]),
      syncTransactions: vi.fn().mockResolvedValue([
        {
          id: "provider-tx-1",
          accountId: "provider-account-1",
          date: "2026-03-15",
          description: "Payroll deposit",
          amountCents: 310000,
          kind: "income",
        },
      ]),
      syncBalances: vi.fn().mockResolvedValue([
        {
          accountId: "provider-account-1",
          name: "Everyday Checking",
          institutionName: "Good Bank",
          kind: "checking",
          balanceCents: 100000,
        },
      ]),
    });

    await runManualSync(supabase, {
      userId: "user-1",
      provider: "plaid",
      now,
    });

    expect(captures.pipCashSnapshotInserts[0]).toMatchObject({
      user_id: "user-1",
      as_of_date: "2026-03-15",
      source_sync_run_id: "sync-run-1",
      stale: false,
    });
  });

  it("uses Pip's app calendar day for snapshots near the UTC date boundary", async () => {
    const now = new Date("2026-06-08T03:30:00.000Z");
    const captures = createCaptures();
    const supabase = createManualSyncClient(captures);

    mocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession: vi.fn(),
      handleConnectCallback: vi.fn().mockResolvedValue({
        provider: "plaid",
        institutionId: "institution-good",
        institutionName: "Good Bank",
        status: "connected",
      }),
      syncAccounts: vi.fn().mockResolvedValue([
        {
          id: "provider-account-1",
          name: "Everyday Checking",
          institutionName: "Good Bank",
          kind: "checking",
          balanceCents: 100000,
        },
      ]),
      syncTransactions: vi.fn().mockResolvedValue([
        {
          id: "provider-tx-1",
          accountId: "provider-account-1",
          date: "2026-06-07",
          description: "Coffee",
          amountCents: -425,
          kind: "purchase",
        },
      ]),
      syncBalances: vi.fn().mockResolvedValue([
        {
          accountId: "provider-account-1",
          name: "Everyday Checking",
          institutionName: "Good Bank",
          kind: "checking",
          balanceCents: 100000,
        },
      ]),
    });

    await runManualSync(supabase, {
      userId: "user-1",
      provider: "plaid",
      now,
    });

    expect(captures.pipCashSnapshotInserts[0]).toMatchObject({
      user_id: "user-1",
      as_of_date: "2026-06-07",
    });
  });

  it("marks the institution failed when a Plaid repair error stops sync", async () => {
    const now = new Date("2026-06-05T12:00:00.000Z");
    const providerError = new ProviderSyncError({
      provider: "plaid",
      code: "item-login-required",
      message: "Plaid needs this bank connection repaired.",
      status: "failed",
      institutionId: "institution-1",
      institutionName: "Plaid Bank",
      repairRequired: true,
    });
    const captures = createCaptures();
    const supabase = createManualSyncClient(captures);

    mocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession: vi.fn(),
      handleConnectCallback: vi.fn().mockResolvedValue({
        provider: "plaid",
        institutionName: "Plaid Bank",
        status: "connected",
      }),
      syncAccounts: vi.fn().mockRejectedValue(providerError),
      syncTransactions: vi.fn().mockResolvedValue([]),
      syncBalances: vi.fn().mockResolvedValue([]),
    });

    await expect(
      runManualSync(supabase, {
        userId: "user-1",
        provider: "plaid",
        now,
      }),
    ).rejects.toBe(providerError);

    expect(captures.syncRunUpdates[0]?.payload).toMatchObject({
      status: "failed",
      institution_id: "institution-1",
      error_code: "item-login-required",
      error_message: "Plaid needs this bank connection repaired.",
    });
    expect(captures.institutionUpdates[0]).toMatchObject({
      payload: {
        status: "failed",
        stale_after: now.toISOString(),
        error_code: "item-login-required",
        error_message: "Plaid needs this bank connection repaired.",
        updated_at: now.toISOString(),
      },
      conditions: [
        ["user_id", "user-1"],
        ["provider", "plaid"],
        ["id", "institution-1"],
      ],
    });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "manual_sync_failed",
      {
        provider: "plaid",
        error: "Plaid needs this bank connection repaired.",
        errorCode: "item-login-required",
        repairRequired: true,
        institutionId: "institution-1",
        institutionName: "Plaid Bank",
      },
    );
  });

  it("preserves institution metadata and sanitizes raw provider errors when every Plaid institution fails", async () => {
    const now = new Date("2026-06-05T12:00:00.000Z");
    const rawProviderError = {
      response: {
        data: {
          error_code: "INVALID_FIELD",
          error_message: "PLAID_SECRET=provider-secret access_token=provider-token",
          request_id: "request-1",
        },
      },
    };
    const captures = createCaptures();
    const supabase = createManualSyncClient(captures);

    mocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession: vi.fn(),
      handleConnectCallback: vi.fn(),
      syncAccounts: vi.fn(),
      syncTransactions: vi.fn(),
      syncBalances: vi.fn(),
      syncConnectedInstitutions: vi.fn().mockResolvedValue([
        {
          type: "failure",
          institutionId: "institution-failed",
          institutionName: "Plaid Bank",
          error: rawProviderError,
        },
      ]),
    });

    await expect(
      runManualSync(supabase, {
        userId: "user-1",
        provider: "plaid",
        now,
      }),
    ).rejects.toMatchObject({
      name: "ProviderSyncError",
      code: "invalid-field",
      message: "PLAID_SECRET=[redacted] access_token=[redacted]",
      status: "failed",
      institutionId: "institution-failed",
      institutionName: "Plaid Bank",
      repairRequired: false,
    });

    expect(captures.syncRunUpdates[0]?.payload).toMatchObject({
      status: "failed",
      institution_id: "institution-failed",
      error_code: "invalid-field",
      error_message: "PLAID_SECRET=[redacted] access_token=[redacted]",
    });
    expect(captures.institutionUpdates[0]).toMatchObject({
      payload: {
        status: "failed",
        stale_after: now.toISOString(),
        error_code: "invalid-field",
        error_message: "PLAID_SECRET=[redacted] access_token=[redacted]",
        updated_at: now.toISOString(),
      },
      conditions: [
        ["user_id", "user-1"],
        ["provider", "plaid"],
        ["id", "institution-failed"],
      ],
    });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "manual_sync_failed",
      {
        provider: "plaid",
        error: "PLAID_SECRET=[redacted] access_token=[redacted]",
        errorCode: "invalid-field",
        repairRequired: false,
        institutionId: "institution-failed",
        institutionName: "Plaid Bank",
      },
    );
    expect(JSON.stringify(captures)).not.toContain("provider-secret");
    expect(JSON.stringify(mocks.recordProductEvent.mock.calls)).not.toContain("provider-token");
  });

  it("keeps successful institutions usable when another connected Plaid institution fails", async () => {
    const now = new Date("2026-06-05T12:00:00.000Z");
    const providerError = new ProviderSyncError({
      provider: "plaid",
      code: "item-login-required",
      message: "Plaid needs this bank connection repaired.",
      status: "failed",
      institutionId: "institution-failed",
      institutionName: "Repair Bank",
      repairRequired: true,
    });
    const commit = vi.fn().mockResolvedValue(undefined);
    const captures = createCaptures();
    const supabase = createManualSyncClient(captures);

    mocks.loadFinancialSnapshotForUser.mockResolvedValue({
      accounts: [
        {
          id: "account-db-1",
          name: "Everyday Checking",
          institutionName: "Good Bank",
          kind: "checking",
          balanceCents: 100000,
        },
      ],
      transactions: [],
      settings: {
        asOfDate: "2026-06-05",
        protectedSavingsMonthlyCents: 0,
      },
    });
    mocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession: vi.fn(),
      handleConnectCallback: vi.fn(),
      syncAccounts: vi.fn(),
      syncTransactions: vi.fn(),
      syncBalances: vi.fn(),
      syncConnectedInstitutions: vi.fn().mockResolvedValue([
        {
          type: "success",
          connection: {
            provider: "plaid",
            institutionId: "institution-good",
            institutionName: "Good Bank",
            status: "connected",
          },
          accounts: [
            {
              id: "provider-account-1",
              name: "Everyday Checking",
              institutionName: "Good Bank",
              kind: "checking",
              balanceCents: 100000,
            },
          ],
          transactions: [],
          balances: [
            {
              accountId: "provider-account-1",
              name: "Everyday Checking",
              institutionName: "Good Bank",
              kind: "checking",
              balanceCents: 100000,
            },
          ],
          commit,
        },
        {
          type: "failure",
          institutionId: "institution-failed",
          institutionName: "Repair Bank",
          error: providerError,
        },
      ]),
    });

    const result = await runManualSync(supabase, {
      userId: "user-1",
      provider: "plaid",
      now,
    });

    expect(result).toMatchObject({
      provider: "plaid",
      status: "partial",
      institutionId: "institution-good",
      institutionIds: ["institution-good"],
      accountCount: 1,
      transactionCount: 0,
      balanceCount: 1,
      failedInstitutionCount: 1,
      failures: [
        {
          code: "item-login-required",
          institutionId: "institution-failed",
          institutionName: "Repair Bank",
          repairRequired: true,
          connectionStatus: "failed",
        },
      ],
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(captures.syncRunUpdates[0]?.payload).toMatchObject({
      status: "partial",
      institution_id: "institution-good",
      account_count: 1,
      transaction_count: 0,
      balance_count: 1,
      error_code: "partial-provider-sync-failure",
    });
    expect(captures.institutionUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            status: "connected",
            error_code: null,
            error_message: null,
          }),
          conditions: expect.arrayContaining([["id", "institution-good"]]),
        }),
        expect.objectContaining({
          payload: expect.objectContaining({
            status: "failed",
            stale_after: now.toISOString(),
            error_code: "item-login-required",
          }),
          conditions: expect.arrayContaining([["id", "institution-failed"]]),
        }),
      ]),
    );
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "manual_sync_failed",
      expect.objectContaining({
        provider: "plaid",
        institutionId: "institution-failed",
        repairRequired: true,
      }),
    );
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "manual_sync_partial",
      expect.objectContaining({
        provider: "plaid",
        failedInstitutionCount: 1,
      }),
    );
  });

  it("uses a provider's coordinated institution sync path when available", async () => {
    const now = new Date("2026-06-05T12:00:00.000Z");
    const captures = createCaptures();
    const supabase = createManualSyncClient(captures);
    const syncConnectedInstitutions = vi.fn().mockResolvedValue([
      {
        type: "success",
        connection: {
          provider: "teller",
          institutionId: "institution-good",
          institutionName: "Good Bank",
          status: "connected",
        },
        accounts: [
          {
            id: "provider-account-1",
            name: "Everyday Checking",
            institutionName: "Good Bank",
            kind: "checking",
            balanceCents: 100000,
          },
        ],
        transactions: [
          {
            id: "provider-tx-1",
            accountId: "provider-account-1",
            date: "2026-06-05",
            description: "Coffee",
            amountCents: -425,
            kind: "purchase",
          },
        ],
        balances: [
          {
            accountId: "provider-account-1",
            name: "Everyday Checking",
            institutionName: "Good Bank",
            kind: "checking",
            balanceCents: 100000,
          },
        ],
      },
    ]);
    const syncAccounts = vi.fn();
    const syncTransactions = vi.fn();
    const syncBalances = vi.fn();

    mocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession: vi.fn(),
      handleConnectCallback: vi.fn(),
      syncAccounts,
      syncTransactions,
      syncBalances,
      syncConnectedInstitutions,
    });

    await runManualSync(supabase, {
      userId: "user-1",
      provider: "teller",
      now,
    });

    expect(syncConnectedInstitutions).toHaveBeenCalledWith("user-1");
    expect(syncAccounts).not.toHaveBeenCalled();
    expect(syncTransactions).not.toHaveBeenCalled();
    expect(syncBalances).not.toHaveBeenCalled();
    expect(captures.syncRunUpdates[0]?.payload).toMatchObject({
      status: "succeeded",
      account_count: 1,
      transaction_count: 1,
      balance_count: 1,
    });
  });
});

type Capture = {
  payload: Record<string, unknown>;
  conditions: Array<[string, unknown]>;
};

function createCaptures() {
  return {
    syncRunUpdates: [] as Capture[],
    institutionUpdates: [] as Capture[],
    pipCashSnapshotInserts: [] as Record<string, unknown>[],
    reactionEventInserts: [] as Record<string, unknown>[],
    upserts: [] as Array<{
      tableName: string;
      rows: Record<string, unknown>[];
      options?: Record<string, unknown>;
    }>,
  };
}

function createManualSyncClient(captures: ReturnType<typeof createCaptures>): SupabaseClient<Database> {
  return {
    from(tableName: string) {
      return createQuery(tableName, captures);
    },
  } as unknown as SupabaseClient<Database>;
}

function createQuery(tableName: string, captures: ReturnType<typeof createCaptures>) {
  const conditions: Array<[string, unknown]> = [];
  let operation: "insert" | "select" | "update" | "upsert" | null = null;
  let selectedColumns = "";
  let payload: Record<string, unknown> | Record<string, unknown>[] = {};

  const query: any = {
    select(columns = "") {
      operation = operation ?? "select";
      selectedColumns = columns;
      return query;
    },
    eq(column: string, value: unknown) {
      conditions.push([column, value]);
      return query;
    },
    gte(column: string, value: unknown) {
      conditions.push([column, value]);
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    insert(row: Record<string, unknown>) {
      operation = "insert";
      payload = row;

      if (tableName === "pip_cash_snapshots") {
        captures.pipCashSnapshotInserts.push(row);
      }

      if (tableName === "pip_reaction_events") {
        captures.reactionEventInserts.push(row);
      }

      return query;
    },
    update(row: Record<string, unknown>) {
      operation = "update";
      payload = row;

      if (tableName === "sync_runs") {
        captures.syncRunUpdates.push({
          payload,
          conditions,
        });
      }

      if (tableName === "connected_institutions") {
        captures.institutionUpdates.push({
          payload,
          conditions,
        });
      }

      return query;
    },
    upsert(rows: Record<string, unknown>[], options?: Record<string, unknown>) {
      operation = "upsert";
      payload = rows;
      captures.upserts.push({
        tableName,
        rows,
        options,
      });
      return query;
    },
    maybeSingle() {
      return Promise.resolve(resolveMaybeSingle(tableName, conditions));
    },
    single() {
      if (tableName === "sync_runs" && operation === "insert") {
        return Promise.resolve({
          data: {
            id: "sync-run-1",
            ...payload,
          },
          error: null,
        });
      }

      if (tableName === "connected_institutions" && operation === "update") {
        const id = conditions.find(([column]) => column === "id")?.[1];

        return Promise.resolve({
          data: {
            id: id ?? "institution-1",
            ...(Array.isArray(payload) ? {} : payload),
          },
          error: null,
        });
      }

      if (tableName === "pip_reaction_events" && operation === "insert") {
        return Promise.resolve({
          data: {
            id: "reaction-1",
            user_id: "user-1",
            previous_snapshot_id: null,
            current_snapshot_id: null,
            previous_state: null,
            current_state: "shortfall",
            spendable_delta_cents: 0,
            behavior_adjustment_delta_cents: 0,
            shortfall_delta_cents: 0,
            cash_reality_adjustment_delta_cents: 0,
            confidence_change: null,
            trigger: "manual_refresh",
            reaction_type: "shortfall",
            intensity: 2,
            summary: "No extra room today. Essentials first.",
            seen_at: null,
            created_at: "2026-06-05T12:00:00.000Z",
            ...(Array.isArray(payload) ? {} : payload),
          },
          error: null,
        });
      }

      return Promise.resolve({
        data: null,
        error: null,
      });
    },
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(resolve(resolveQuery(tableName, operation, selectedColumns))).catch(reject);
    },
  };

  return query;
}

function resolveQuery(tableName: string, operation: string | null, selectedColumns: string) {
  if (tableName === "sync_runs" && operation === "select" && selectedColumns === "started_at") {
    return {
      data: [],
      error: null,
    };
  }

  if (tableName === "accounts" && operation === "upsert") {
    return {
      data: [
        {
          id: "account-db-1",
          provider_account_id: "provider-account-1",
        },
      ],
      error: null,
    };
  }

  if (tableName === "pip_reaction_events" && operation === "select") {
    return {
      data: [],
      error: null,
    };
  }

  return {
    data: null,
    error: null,
  };
}

function resolveMaybeSingle(tableName: string, conditions: Array<[string, unknown]>) {
  if (tableName === "connected_institutions") {
    const id = conditions.find(([column]) => column === "id")?.[1];

    return {
      data: id
        ? {
            id,
            user_id: "user-1",
            provider: "plaid",
            institution_name: id === "institution-good" ? "Good Bank" : "Repair Bank",
            status: "connected",
            last_successful_sync_at: null,
            stale_after: null,
            error_code: null,
            error_message: null,
            created_at: "2026-06-05T00:00:00.000Z",
            updated_at: "2026-06-05T00:00:00.000Z",
          }
        : null,
      error: null,
    };
  }

  if (tableName === "user_settings") {
    return {
      data: {
        user_id: "user-1",
        protected_savings_monthly_cents: 0,
        manual_refresh_only: true,
        invite_accepted_at: null,
        privacy_consent_at: "2026-06-05T00:00:00.000Z",
        created_at: "2026-06-05T00:00:00.000Z",
        updated_at: "2026-06-05T00:00:00.000Z",
      },
      error: null,
    };
  }

  return {
    data: null,
    error: null,
  };
}
