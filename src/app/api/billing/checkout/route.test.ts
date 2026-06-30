import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createStripeClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getBillingConfig: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  loadBillingCustomerForUser: vi.fn(),
  upsertBillingCustomer: vi.fn(),
}));

vi.mock("@/lib/billing/stripe-client", () => ({
  createStripeClient: routeMocks.createStripeClient,
}));

vi.mock("@/lib/billing/stripe-config", () => ({
  getBillingConfig: routeMocks.getBillingConfig,
}));

vi.mock("@/lib/billing/billing-repository", () => ({
  loadBillingCustomerForUser: routeMocks.loadBillingCustomerForUser,
  upsertBillingCustomer: routeMocks.upsertBillingCustomer,
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

import { POST } from "@/app/api/billing/checkout/route";

beforeEach(() => {
  routeMocks.isSupabaseConfigured.mockReturnValue(true);
  routeMocks.getBillingConfig.mockReturnValue(liveBillingConfig());
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/billing/checkout", () => {
  it("returns 503 when Supabase is not configured", async () => {
    routeMocks.isSupabaseConfigured.mockReturnValue(false);

    const response = await POST(jsonRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "Supabase is not configured." });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

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

  it("creates a Stripe customer and Checkout session for a signed-in user", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    const admin = { kind: "admin" };
    const stripe = createStripeMock();
    routeMocks.createSupabaseServerClient.mockResolvedValue(
      createServerSupabase({ id: "user-1", email: "Tester@Example.com" }),
    );
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.createStripeClient.mockReturnValue(stripe);
    routeMocks.loadBillingCustomerForUser.mockResolvedValue(null);
    routeMocks.upsertBillingCustomer.mockResolvedValue({
      user_id: "user-1",
      stripe_customer_id: "cus_123",
    });

    const response = await POST(jsonRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ url: "https://checkout.stripe.test/session" });
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: "Tester@Example.com",
      metadata: {
        supabase_user_id: "user-1",
      },
    });
    expect(routeMocks.upsertBillingCustomer).toHaveBeenCalledWith(admin, {
      userId: "user-1",
      email: "Tester@Example.com",
      stripeCustomerId: "cus_123",
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
      customer: "cus_123",
      mode: "subscription",
      line_items: [
        {
          price: "price_monthly",
          quantity: 1,
        },
      ],
      success_url: "http://localhost:3000/app?billing=success",
      cancel_url: "http://localhost:3000/app?billing=cancelled",
      client_reference_id: "user-1",
      subscription_data: {
        metadata: {
          supabase_user_id: "user-1",
        },
      },
      metadata: {
        supabase_user_id: "user-1",
      },
    });
  });
});

function liveBillingConfig() {
  return {
    mode: "live",
    secretKey: "stripe-secret-fixture",
    webhookSecret: "stripe-webhook-fixture",
    monthlyPriceId: "price_monthly",
  };
}

function createServerSupabase(user: { id: string; email?: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
  };
}

function createStripeMock() {
  return {
    customers: {
      create: vi.fn().mockResolvedValue({ id: "cus_123" }),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/session" }),
      },
    },
  };
}

function jsonRequest() {
  return new Request("http://localhost:3000/api/billing/checkout", {
    method: "POST",
  });
}
