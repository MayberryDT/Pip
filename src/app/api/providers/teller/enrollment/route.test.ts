import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getAppAccessFailureForUser: vi.fn(),
  getTellerConfig: vi.fn(),
  storeTellerCredential: vi.fn(),
  recordProductEventSafely: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/app-access/route-guard", () => ({
  getAppAccessFailureForUser: routeMocks.getAppAccessFailureForUser,
}));

vi.mock("@/lib/providers/teller/config", () => ({
  getTellerConfig: routeMocks.getTellerConfig,
}));

vi.mock("@/lib/providers/teller/credential-store", () => ({
  storeTellerCredential: routeMocks.storeTellerCredential,
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: routeMocks.recordProductEventSafely,
}));

import { POST } from "@/app/api/providers/teller/enrollment/route";

beforeEach(() => {
  routeMocks.getAppAccessFailureForUser.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/providers/teller/enrollment", () => {
  it("requires authentication before validating Teller enrollment payloads", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase(null));

    const response = await POST(jsonRequest({ accessToken: "short" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.storeTellerCredential).not.toHaveBeenCalled();
  });

  it("rejects malformed enrollment payloads after authentication", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));

    const response = await POST(jsonRequest({ accessToken: "short" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid Teller enrollment.",
    });
    expect(routeMocks.storeTellerCredential).not.toHaveBeenCalled();
  });

  it("requires app access before validating Teller enrollment payloads", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));
    routeMocks.getAppAccessFailureForUser.mockResolvedValue(
      Response.json({ error: "Pip subscription required." }, { status: 402 }),
    );

    const response = await POST(jsonRequest({ accessToken: "short" }));

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      error: "Pip subscription required.",
    });
    expect(routeMocks.storeTellerCredential).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest(validEnrollmentBody()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
  });

  it("requires an authenticated user before checking the Teller nonce", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase(null));

    const response = await POST(
      jsonRequest(validEnrollmentBody(), {
        cookie: "pip_teller_nonce=nonce-123",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.storeTellerCredential).not.toHaveBeenCalled();
  });

  it("rejects callbacks when the server nonce does not match the client payload", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));

    const response = await POST(
      jsonRequest(validEnrollmentBody({ nonce: "nonce-123" }), {
        cookie: "pip_teller_nonce=different",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Teller connect session expired.",
    });
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(routeMocks.storeTellerCredential).not.toHaveBeenCalled();
  });

  it("stores Teller enrollment tokens server-side and clears the nonce cookie", async () => {
    enableSupabaseEnv();
    const admin = createAdminSupabase();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.getTellerConfig.mockReturnValue({
      environment: "sandbox",
    });
    routeMocks.storeTellerCredential.mockResolvedValue(undefined);
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);

    const response = await POST(
      jsonRequest(validEnrollmentBody({ nonce: "nonce-123" }), {
        cookie: "pip_teller_nonce=nonce-123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "connected",
      institutionId: "institution-1",
      institutionName: "Northstar Bank",
    });
    expect(routeMocks.storeTellerCredential).toHaveBeenCalledWith({
      supabase: admin,
      institutionId: "institution-1",
      userId: "user-1",
      enrollmentId: "enrollment-1",
      accessToken: "teller-token-123",
      institutionName: "Northstar Bank",
      environment: "sandbox",
    });
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      admin,
      "user-1",
      "connect_session_created",
      {
        provider: "teller",
        status: "enrollment-stored",
        institutionName: "Northstar Bank",
      },
    );
    expect(response.headers.get("set-cookie")).toContain("pip_teller_nonce=");
  });

  it("scopes existing Teller institution admin updates by user id", async () => {
    enableSupabaseEnv();
    const admin = createAdminSupabase({
      existingInstitution: {
        id: "institution-1",
        user_id: "user-1",
        provider: "teller",
        institution_name: "Northstar Bank",
        status: "failed",
        error_code: "provider-token-decrypt-failed",
        error_message: "Reconnect required.",
      },
    });
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.getTellerConfig.mockReturnValue({
      environment: "sandbox",
    });
    routeMocks.storeTellerCredential.mockResolvedValue(undefined);
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);

    const response = await POST(
      jsonRequest(validEnrollmentBody({ nonce: "nonce-123" }), {
        cookie: "pip_teller_nonce=nonce-123",
      }),
    );

    expect(response.status).toBe(200);
    expect(admin.__updates).toEqual([
      expect.objectContaining({
        conditions: [
          ["user_id", "user-1"],
          ["id", "institution-1"],
        ],
      }),
    ]);
  });

  it("records a failed Teller connection event when credential storage fails", async () => {
    enableSupabaseEnv();
    const admin = createAdminSupabase();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.getTellerConfig.mockReturnValue({
      environment: "sandbox",
    });
    routeMocks.storeTellerCredential.mockRejectedValue(
      new Error("store failed access_token=teller-token sk-test-secret"),
    );
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);

    const response = await POST(
      jsonRequest(validEnrollmentBody({ nonce: "nonce-123" }), {
        cookie: "pip_teller_nonce=nonce-123",
      }),
    );

    expect(response.status).toBe(500);
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      admin,
      "user-1",
      "connect_session_failed",
      {
        provider: "teller",
        status: "enrollment-storage-failed",
        institutionName: "Northstar Bank",
        error: "store failed access_token=[redacted] [redacted]",
      },
    );
  });

  it("redacts secret-shaped internal errors before returning them", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));
    routeMocks.getTellerConfig.mockReturnValue({
      environment: "sandbox",
    });
    routeMocks.createSupabaseAdminClient.mockImplementation(() => {
      throw new Error("Teller failed with access_token=teller-token private_key=key123 Bearer abc123");
    });

    const response = await POST(
      jsonRequest(validEnrollmentBody({ nonce: "nonce-123" }), {
        cookie: "pip_teller_nonce=nonce-123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe(
      "Teller failed with access_token=[redacted] private_key=[redacted] Bearer [redacted]",
    );
    expect(JSON.stringify(payload)).not.toContain("teller-token");
    expect(JSON.stringify(payload)).not.toContain("key123");
    expect(JSON.stringify(payload)).not.toContain("abc123");
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function validEnrollmentBody(input: { nonce?: string } = {}) {
  return {
    accessToken: "teller-token-123",
    nonce: input.nonce ?? "nonce-123",
    enrollment: {
      id: "enrollment-1",
      institution: {
        name: "Northstar Bank",
      },
      user: {
        id: "teller-user-1",
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
  existingInstitution?: Record<string, unknown>;
} = {}) {
  const updates: Array<{
    payload: Record<string, unknown>;
    conditions: Array<[string, unknown]>;
  }> = [];
  const admin = {
    __updates: updates,
    from: vi.fn((tableName: string) => {
      expect(tableName).toBe("connected_institutions");

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: input.existingInstitution ?? null,
                  error: null,
                }),
              })),
            })),
          })),
        })),
        insert: vi.fn((payload: Record<string, unknown>) => {
          expect(payload).toMatchObject({
            user_id: "user-1",
            provider: "teller",
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
        update: vi.fn((payload: Record<string, unknown>) => {
          const conditions: Array<[string, unknown]> = [];
          const query = {
            eq: vi.fn((column: string, value: unknown) => {
              conditions.push([column, value]);
              return query;
            }),
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  ...(input.existingInstitution ?? {
                    id: "institution-1",
                    user_id: "user-1",
                    provider: "teller",
                    institution_name: "Northstar Bank",
                  }),
                  ...payload,
                },
                error: null,
              }),
            })),
          };
          updates.push({ payload, conditions });

          return query;
        }),
      };
    }),
  };

  return admin;
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/providers/teller/enrollment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
