import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createStripeClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getBillingConfig: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  loadBillingCustomerForUser: vi.fn(),
}));

vi.mock("@/lib/billing/stripe-client", () => ({
  createStripeClient: routeMocks.createStripeClient,
}));

vi.mock("@/lib/billing/stripe-config", () => ({
  getBillingConfig: routeMocks.getBillingConfig,
}));

vi.mock("@/lib/billing/billing-repository", () => ({
  loadBillingCustomerForUser: routeMocks.loadBillingCustomerForUser,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: routeMocks.isSupabaseConfigured,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

import { POST } from "@/app/api/billing/portal/route";

beforeEach(() => {
  routeMocks.isSupabaseConfigured.mockReturnValue(true);
  routeMocks.getBillingConfig.mockReturnValue({
    mode: "live",
    secretKey: "stripe-secret-fixture",
    webhookSecret: "stripe-webhook-fixture",
    monthlyPriceId: "price_monthly",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/billing/portal", () => {
  it("returns 503 when billing is off", async () => {
    routeMocks.getBillingConfig.mockReturnValue({ mode: "off" });

    const response = await POST(jsonRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Billing is not enabled." });
  });

  it("requires an authenticated user", async () => {
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase(null));

    const response = await POST(jsonRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required." });
  });

  it("returns 404 when the signed-in user has no Stripe customer", async () => {
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));
    routeMocks.createSupabaseAdminClient.mockReturnValue({ kind: "admin" });
    routeMocks.loadBillingCustomerForUser.mockResolvedValue(null);

    const response = await POST(jsonRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No billing customer exists for this account." });
  });

  it("creates a Stripe Customer Portal session", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    const stripe = {
      billingPortal: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.test/session" }),
        },
      },
    };
    routeMocks.createSupabaseServerClient.mockResolvedValue(createServerSupabase({ id: "user-1" }));
    routeMocks.createSupabaseAdminClient.mockReturnValue({ kind: "admin" });
    routeMocks.createStripeClient.mockReturnValue(stripe);
    routeMocks.loadBillingCustomerForUser.mockResolvedValue({
      user_id: "user-1",
      stripe_customer_id: "cus_123",
    });

    const response = await POST(jsonRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ url: "https://billing.stripe.test/session" });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "http://localhost:3000/app?billing=portal-return",
    });
  });
});

function createServerSupabase(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
  };
}

function jsonRequest() {
  return new Request("http://localhost:3000/api/billing/portal", {
    method: "POST",
  });
}
