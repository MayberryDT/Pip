import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createStripeClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getBillingConfig: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  recordStripeWebhookEvent: vi.fn(),
  toStripeTimestamp: vi.fn(),
  upsertBillingCustomer: vi.fn(),
  upsertBillingSubscription: vi.fn(),
}));

vi.mock("@/lib/billing/stripe-client", () => ({
  createStripeClient: routeMocks.createStripeClient,
}));

vi.mock("@/lib/billing/stripe-config", () => ({
  getBillingConfig: routeMocks.getBillingConfig,
}));

vi.mock("@/lib/billing/billing-repository", () => ({
  recordStripeWebhookEvent: routeMocks.recordStripeWebhookEvent,
  toStripeTimestamp: routeMocks.toStripeTimestamp,
  upsertBillingCustomer: routeMocks.upsertBillingCustomer,
  upsertBillingSubscription: routeMocks.upsertBillingSubscription,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: routeMocks.isSupabaseConfigured,
}));

import { POST } from "@/app/api/billing/stripe-webhook/route";

beforeEach(() => {
  routeMocks.isSupabaseConfigured.mockReturnValue(true);
  routeMocks.getBillingConfig.mockReturnValue({
    mode: "live",
    secretKey: "stripe-secret-fixture",
    webhookSecret: "stripe-webhook-fixture",
    monthlyPriceId: "price_monthly",
  });
  routeMocks.createSupabaseAdminClient.mockReturnValue({ kind: "admin" });
  routeMocks.recordStripeWebhookEvent.mockResolvedValue("created");
  routeMocks.toStripeTimestamp.mockImplementation((value: number | null | undefined) =>
    typeof value === "number" ? new Date(value * 1000).toISOString() : null,
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/billing/stripe-webhook", () => {
  it("returns 503 when billing is off", async () => {
    routeMocks.getBillingConfig.mockReturnValue({ mode: "off" });

    const response = await POST(stripeRequest("{}", "sig_123"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Billing is not enabled." });
  });

  it("requires a Stripe signature", async () => {
    const response = await POST(stripeRequest("{}"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing Stripe signature." });
  });

  it("rejects invalid Stripe webhook signatures", async () => {
    routeMocks.createStripeClient.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error("bad signature");
        }),
      },
    });

    const response = await POST(stripeRequest("{}", "sig_bad"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Stripe webhook signature verification failed.",
    });
  });

  it("dedupes already processed Stripe events", async () => {
    const event = stripeEvent("checkout.session.completed", checkoutSession());
    routeMocks.createStripeClient.mockReturnValue(stripeWithEvent(event));
    routeMocks.recordStripeWebhookEvent.mockResolvedValue("duplicate");

    const response = await POST(stripeRequest("{}", "sig_123"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "duplicate" });
    expect(routeMocks.upsertBillingCustomer).not.toHaveBeenCalled();
    expect(routeMocks.upsertBillingSubscription).not.toHaveBeenCalled();
  });

  it("stores customer mapping from completed Checkout sessions", async () => {
    const admin = { kind: "admin" };
    const event = stripeEvent("checkout.session.completed", checkoutSession());
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.createStripeClient.mockReturnValue(stripeWithEvent(event));

    const response = await POST(stripeRequest("{}", "sig_123"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ status: "processed" });
    expect(routeMocks.recordStripeWebhookEvent).toHaveBeenCalledWith(admin, {
      stripeEventId: "evt_123",
      eventType: "checkout.session.completed",
    });
    expect(routeMocks.upsertBillingCustomer).toHaveBeenCalledWith(admin, {
      userId: "user-1",
      email: "tester@example.com",
      stripeCustomerId: "cus_123",
    });
  });

  it("stores subscription state from subscription webhooks", async () => {
    const admin = { kind: "admin" };
    const event = stripeEvent("customer.subscription.updated", {
      id: "sub_123",
      customer: "cus_123",
      status: "active",
      current_period_end: 1782691200,
      cancel_at_period_end: false,
      trial_end: null,
      metadata: {
        supabase_user_id: "user-1",
      },
      items: {
        data: [
          {
            price: {
              id: "price_monthly",
            },
          },
        ],
      },
    });
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.createStripeClient.mockReturnValue(stripeWithEvent(event));

    const response = await POST(stripeRequest("{}", "sig_123"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "processed" });
    expect(routeMocks.upsertBillingSubscription).toHaveBeenCalledWith(admin, {
      userId: "user-1",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripePriceId: "price_monthly",
      status: "active",
      currentPeriodEnd: "2026-06-29T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      trialEnd: null,
    });
  });
});

function stripeRequest(body: string, signature?: string) {
  return new Request("http://localhost:3000/api/billing/stripe-webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : undefined,
    body,
  });
}

function stripeWithEvent(event: unknown) {
  return {
    webhooks: {
      constructEvent: vi.fn().mockReturnValue(event),
    },
  };
}

function stripeEvent(type: string, object: unknown) {
  return {
    id: "evt_123",
    type,
    data: {
      object,
    },
  };
}

function checkoutSession() {
  return {
    client_reference_id: "user-1",
    customer: "cus_123",
    customer_details: {
      email: "tester@example.com",
    },
    metadata: {
      supabase_user_id: "user-1",
    },
  };
}
