import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/providers/connect/route";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getAppAccessFailureForUser: vi.fn(),
  getFinancialDataProvider: vi.fn(),
  recordProductEventSafely: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: routeMocks.recordProductEventSafely,
}));

vi.mock("@/lib/app-access/route-guard", () => ({
  getAppAccessFailureForUser: routeMocks.getAppAccessFailureForUser,
}));

vi.mock("@/lib/providers/provider-registry", async () => {
  const errors = await vi.importActual<typeof import("@/lib/providers/provider-errors")>(
    "@/lib/providers/provider-errors",
  );

  return {
    getFinancialDataProvider: routeMocks.getFinancialDataProvider,
    ProviderUnavailableError: errors.ProviderUnavailableError,
  };
});

beforeEach(() => {
  routeMocks.getAppAccessFailureForUser.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/providers/connect", () => {
  it("requires authentication before validating provider requests", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.getFinancialDataProvider).not.toHaveBeenCalled();
  });

  it("requires authenticated callers to choose a provider explicitly", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid provider request.",
    });
    expect(routeMocks.getFinancialDataProvider).not.toHaveBeenCalled();
  });

  it("requires app access before validating provider requests", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.getAppAccessFailureForUser.mockResolvedValue(
      Response.json({ error: "Pip app access is not active for this account." }, { status: 403 }),
    );

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Pip app access is not active for this account.",
    });
    expect(routeMocks.getFinancialDataProvider).not.toHaveBeenCalled();
  });

  it("rejects invalid providers after authentication", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));

    const response = await POST(jsonRequest({ provider: "bad-provider" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid provider request.",
    });
    expect(routeMocks.getFinancialDataProvider).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ provider: "plaid" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires authentication before creating provider sessions", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    const response = await POST(jsonRequest({ provider: "plaid" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.getFinancialDataProvider).not.toHaveBeenCalled();
  });

  it("passes Plaid repair options into the provider connect session", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    const createConnectSession = vi.fn().mockResolvedValue({
      provider: "plaid",
      status: "ready",
      message: "Plaid repair is ready.",
      connect: {
        kind: "plaid",
        linkToken: "link-repair-123",
        environment: "sandbox",
        products: [],
        mode: "repair",
      },
    });

    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession,
    });

    const response = await POST(jsonRequest({
      provider: "plaid",
      mode: "repair",
      institutionId: "institution-1",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      provider: "plaid",
      status: "ready",
      connect: {
        mode: "repair",
        products: [],
      },
    });
    expect(createConnectSession).toHaveBeenCalledWith("user-1", {
      mode: "repair",
      institutionId: "institution-1",
    });
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "connect_session_created",
      {
        provider: "plaid",
        status: "ready",
        mode: "repair",
      },
    );
  });

  it("records unavailable sessions as connect failures", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession: vi.fn().mockResolvedValue({
        provider: "plaid",
        status: "unavailable",
        message: "Plaid credentials are missing.",
      }),
    });

    const response = await POST(jsonRequest({ provider: "plaid" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      provider: "plaid",
      status: "unavailable",
    });
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "connect_session_failed",
      {
        provider: "plaid",
        status: "unavailable",
        mode: "connect",
      },
    );
  });

  it("sets a server-only Teller nonce cookie when Teller Connect is ready", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession: vi.fn().mockResolvedValue({
        provider: "teller",
        status: "ready",
        message: "Teller Connect is ready.",
        connect: {
          kind: "teller",
          applicationId: "app-test",
          environment: "sandbox",
          products: ["transactions", "balance"],
          nonce: "nonce-123",
        },
      }),
    });

    const response = await POST(jsonRequest({ provider: "teller" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      provider: "teller",
      status: "ready",
      connect: {
        kind: "teller",
        nonce: "nonce-123",
      },
    });
    expect(response.headers.get("set-cookie")).toContain("pip_teller_nonce=nonce-123");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "connect_session_created",
      {
        provider: "teller",
        status: "ready",
        mode: "connect",
      },
    );
  });

  it("redacts secret-shaped provider errors before returning them", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession: vi.fn().mockRejectedValue(
        new Error("Provider failed with secret=provider-secret authorization=Bearer-secret"),
      ),
    });

    const response = await POST(jsonRequest({ provider: "plaid" }));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe(
      "Provider failed with secret=[redacted] authorization=[redacted]",
    );
    expect(JSON.stringify(payload)).not.toContain("provider-secret");
    expect(JSON.stringify(payload)).not.toContain("Bearer-secret");
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
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

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/providers/connect", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
