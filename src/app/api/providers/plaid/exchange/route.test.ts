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
  it("rejects malformed exchange payloads before touching Supabase", async () => {
    const response = await POST(jsonRequest({ publicToken: "short" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid Plaid exchange request.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");

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
    });
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      admin,
      "user-1",
      "connect_session_created",
      {
        provider: "plaid",
        status: "item-exchanged",
        institutionName: "Northstar Bank",
      },
    );
  });

  it("redacts secret-shaped internal errors before returning them", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));
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
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(JSON.stringify(payload)).not.toContain("public-123");
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("FREE_CASH_SUPABASE_MODE", "");
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

function createAdminSupabase() {
  const admin = {
    from: vi.fn((tableName: string) => {
      expect(tableName).toBe("connected_institutions");

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            })),
          })),
        })),
        insert: vi.fn((payload: Record<string, unknown>) => {
          expect(payload).toMatchObject({
            user_id: "user-1",
            provider: "plaid",
            institution_name: "Northstar Bank",
            status: "connected",
          });

          return {
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "institution-1",
                  ...payload,
                },
                error: null,
              }),
            })),
          };
        }),
      };
    }),
  };

  return admin;
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
