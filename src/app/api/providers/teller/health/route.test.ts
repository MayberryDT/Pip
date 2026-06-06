import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

import { GET } from "@/app/api/providers/teller/health/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/providers/teller/health", () => {
  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires an authenticated beta user before reporting provider readiness", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
  });

  it("reports Teller readiness without exposing server credentials", async () => {
    enableSupabaseEnv();
    vi.stubEnv("TELLER_APPLICATION_ID", "app_test");
    vi.stubEnv("TELLER_ENVIRONMENT", "development");
    vi.stubEnv("TELLER_PRODUCTS", "transactions,balance");
    vi.stubEnv("TELLER_CERTIFICATE_PEM", "secret-cert");
    vi.stubEnv("TELLER_PRIVATE_KEY_PEM", "secret-key");
    vi.stubEnv("FREE_CASH_PROVIDER_TOKEN_KEY_BASE64", Buffer.alloc(32, 1).toString("base64"));
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      environment: "development",
      applicationIdConfigured: true,
      certificateConfigured: true,
      privateKeyConfigured: true,
      tokenEncryptionConfigured: true,
      canCreateConnectSession: true,
      canCallApi: true,
      products: ["transactions", "balance"],
      apiBaseUrl: "https://api.teller.io",
      message: "Teller Connect and mTLS API configuration are present.",
    });
    expect(JSON.stringify(payload)).not.toContain("secret-cert");
    expect(JSON.stringify(payload)).not.toContain("secret-key");
  });

  it("separates Teller Connect readiness from mTLS API readiness", async () => {
    enableSupabaseEnv();
    vi.stubEnv("TELLER_APPLICATION_ID", "app_test");
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      canCreateConnectSession: true,
      canCallApi: false,
      message: "Teller API calls need certificate, private key, and token encryption env vars.",
    });
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("FREE_CASH_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createSupabaseClient(user: { id: string } | null) {
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
