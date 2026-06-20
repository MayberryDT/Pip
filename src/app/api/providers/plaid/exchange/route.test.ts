import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createPlaidClient: vi.fn(),
  getPlaidConfig: vi.fn(),
  storePlaidCredential: vi.fn(),
  recordProductEventSafely: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/providers/plaid/config", () => ({
  createPlaidClient: routeMocks.createPlaidClient,
  getPlaidConfig: routeMocks.getPlaidConfig,
}));

vi.mock("@/lib/providers/plaid/credential-store", () => ({
  storePlaidCredential: routeMocks.storePlaidCredential,
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: routeMocks.recordProductEventSafely,
}));

import { POST } from "@/app/api/providers/plaid/exchange/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/providers/plaid/exchange", () => {
  it("requires authentication before validating Plaid exchange payloads", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase(null));

    const response = await POST(jsonRequest({ publicToken: "short" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.createPlaidClient).not.toHaveBeenCalled();
    expect(routeMocks.storePlaidCredential).not.toHaveBeenCalled();
  });

  it("rejects malformed exchange payloads after authentication", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));

    const response = await POST(jsonRequest({ publicToken: "short" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid Plaid exchange request.",
    });
    expect(routeMocks.createPlaidClient).not.toHaveBeenCalled();
    expect(routeMocks.storePlaidCredential).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest(validExchangeBody()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
  });

  it("requires an authenticated user before exchanging a public token", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase(null));

    const response = await POST(jsonRequest(validExchangeBody()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.createPlaidClient).not.toHaveBeenCalled();
    expect(routeMocks.storePlaidCredential).not.toHaveBeenCalled();
  });

  it("exchanges Plaid public tokens and stores access tokens server-side", async () => {
    enableSupabaseEnv();
    const admin = createAdminSupabase();
    const plaid = {
      itemPublicTokenExchange: vi.fn().mockResolvedValue({
        data: {
          item_id: "item-1",
          access_token: "access-sandbox-123",
        },
      }),
    };
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.getPlaidConfig.mockReturnValue({
      environment: "sandbox",
    });
    routeMocks.createPlaidClient.mockReturnValue(plaid);
    routeMocks.storePlaidCredential.mockResolvedValue(undefined);
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);

    const response = await POST(jsonRequest(validExchangeBody()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "connected",
      institutionId: "institution-1",
      institutionName: "Northstar Bank",
    });
    expect(plaid.itemPublicTokenExchange).toHaveBeenCalledWith({
      public_token: "public-sandbox-token-123",
    });
    expect(routeMocks.storePlaidCredential).toHaveBeenCalledWith({
      supabase: admin,
      institutionId: "institution-1",
      userId: "user-1",
      itemId: "item-1",
      accessToken: "access-sandbox-123",
      institutionName: "Northstar Bank",
      environment: "sandbox",
      providerInstitutionId: "ins_1",
    });
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      admin,
      "user-1",
      "connect_session_created",
      {
        provider: "plaid",
        status: "item-exchanged",
        institutionName: "Northstar Bank",
        providerInstitutionId: "ins_1",
      },
    );
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      admin,
      "user-1",
      "plaid_exchange_succeeded",
      {
        provider: "plaid",
        institutionName: "Northstar Bank",
        providerInstitutionId: "ins_1",
      },
    );
  });

  it("reuses a failed same-institution Plaid row when reconnect returns a new item id", async () => {
    enableSupabaseEnv();
    const admin = createAdminSupabase({
      institutions: [
        {
          id: "failed-wise",
          user_id: "user-1",
          provider: "plaid",
          institution_name: "Wise (US)",
          provider_institution_id: null,
          status: "failed",
          error_code: "provider-token-decrypt-failed",
          error_message: "Reconnect required.",
          created_at: "2026-06-15T00:00:00.000Z",
          updated_at: "2026-06-15T00:00:00.000Z",
        },
      ],
    });
    const plaid = {
      itemPublicTokenExchange: vi.fn().mockResolvedValue({
        data: {
          item_id: "new-wise-item",
          access_token: "access-production-123",
        },
      }),
    };
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.getPlaidConfig.mockReturnValue({
      environment: "production",
    });
    routeMocks.createPlaidClient.mockReturnValue(plaid);
    routeMocks.storePlaidCredential.mockResolvedValue(undefined);
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);

    const response = await POST(jsonRequest({
      publicToken: "public-production-token-123",
      metadata: {
        institution: {
          name: "Wise (US)",
          institution_id: "ins_132616",
        },
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "connected",
      institutionId: "failed-wise",
      institutionName: "Wise (US)",
    });
    expect(routeMocks.storePlaidCredential).toHaveBeenCalledWith({
      supabase: admin,
      institutionId: "failed-wise",
      userId: "user-1",
      itemId: "new-wise-item",
      accessToken: "access-production-123",
      institutionName: "Wise (US)",
      environment: "production",
      providerInstitutionId: "ins_132616",
    });
    expect(admin.__tables.connectedInstitutions).toEqual([
      expect.objectContaining({
        id: "failed-wise",
        status: "connected",
        error_code: null,
        error_message: null,
        provider_institution_id: "ins_132616",
      }),
    ]);
  });

  it("redacts secret-shaped internal errors before returning them", async () => {
    enableSupabaseEnv();
    const admin = createAdminSupabase();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.getPlaidConfig.mockReturnValue({
      environment: "sandbox",
    });
    routeMocks.createPlaidClient.mockImplementation(() => {
      throw new Error("Plaid failed with PLAID_SECRET=secret sk-proj-secret public_token=public-123");
    });

    const response = await POST(jsonRequest(validExchangeBody()));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe(
      "Plaid failed with PLAID_SECRET=[redacted] [redacted] public_token=[redacted]",
    );
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      admin,
      "user-1",
      "plaid_exchange_failed",
      {
        provider: "plaid",
        institutionName: "Plaid institution",
        error: "Plaid failed with PLAID_SECRET=[redacted] [redacted] public_token=[redacted]",
      },
    );
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(JSON.stringify(payload)).not.toContain("public-123");
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function validExchangeBody() {
  return {
    publicToken: "public-sandbox-token-123",
    metadata: {
      institution: {
        name: "Northstar Bank",
        institution_id: "ins_1",
      },
    },
  };
}

function createServerSupabase(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: null,
      }),
    },
  };
}

function createAdminSupabase(input: {
  credentials?: Record<string, unknown>[];
  institutions?: Record<string, unknown>[];
} = {}) {
  const connectedInstitutions = [...(input.institutions ?? [])];
  const credentials = [...(input.credentials ?? [])];
  const admin = {
    __tables: {
      connectedInstitutions,
      credentials,
    },
    schema: vi.fn((schemaName: string) => {
      expect(schemaName).toBe("private");

      return {
        from: vi.fn((tableName: string) => {
          expect(tableName).toBe("provider_credentials");
          return createTable(credentials, {
            insertId: () => "",
          });
        }),
      };
    }),
    from: vi.fn((tableName: string) => {
      expect(tableName).toBe("connected_institutions");
      return createTable(connectedInstitutions, {
        insertId: () => "institution-1",
      });
    }),
  };

  return admin;
}

function createTable(
  rows: Record<string, unknown>[],
  options: {
    insertId: () => string;
  },
) {
  return {
    select() {
      return createSelectQuery(rows);
    },
    insert(payload: Record<string, unknown>) {
      const row = {
        id: options.insertId(),
        ...payload,
      };
      rows.push(row);

      return createMutationResult(row);
    },
    update(payload: Record<string, unknown>) {
      return createUpdateQuery(rows, payload);
    },
    delete() {
      return createDeleteQuery(rows);
    },
  };
}

function createSelectQuery(rows: Record<string, unknown>[]) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let orderColumn: string | null = null;
  let ascending = true;

  const query = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return query;
    },
    neq(column: string, value: unknown) {
      filters.push((row) => row[column] !== value);
      return query;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orderColumn = column;
      ascending = options?.ascending ?? true;
      return query;
    },
    limit(count: number) {
      return Promise.resolve({
        data: getRows().slice(0, count),
        error: null,
      });
    },
    maybeSingle() {
      return Promise.resolve({
        data: getRows()[0] ?? null,
        error: null,
      });
    },
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve({
        data: getRows(),
        error: null,
      }).then(resolve, reject);
    },
  };

  function getRows() {
    const filtered = rows.filter((row) => filters.every((filter) => filter(row)));

    if (!orderColumn) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      const leftValue = String(left[orderColumn!] ?? "");
      const rightValue = String(right[orderColumn!] ?? "");
      return ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
    });
  }

  return query;
}

function createMutationResult(row: Record<string, unknown>) {
  return {
    select() {
      return {
        single: vi.fn().mockResolvedValue({
          data: row,
          error: null,
        }),
      };
    },
  };
}

function createUpdateQuery(rows: Record<string, unknown>[], payload: Record<string, unknown>) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const query = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return query;
    },
    select() {
      return {
        single: vi.fn().mockImplementation(async () => {
          const row = rows.find((candidate) => filters.every((filter) => filter(candidate)));

          if (!row) {
            return {
              data: null,
              error: new Error("Row not found."),
            };
          }

          Object.assign(row, payload);

          return {
            data: row,
            error: null,
          };
        }),
      };
    },
  };

  return query;
}

function createDeleteQuery(rows: Record<string, unknown>[]) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const query = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return query;
    },
    in(column: string, values: unknown[]) {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index];

        if (values.includes(row[column]) && filters.every((filter) => filter(row))) {
          rows.splice(index, 1);
        }
      }

      return Promise.resolve({
        error: null,
      });
    },
  };

  return query;
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/providers/plaid/exchange", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
