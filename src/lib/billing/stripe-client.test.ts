import { describe, expect, it } from "vitest";
import { createStripeClient } from "@/lib/billing/stripe-client";

describe("Stripe client", () => {
  it("throws when billing is off", () => {
    expect(() => createStripeClient({ mode: "off" })).toThrow("Stripe billing is off.");
  });

  it("creates a Stripe client for enabled billing", () => {
    const client = createStripeClient({
      mode: "test",
      secretKey: "stripe-secret-fixture",
      webhookSecret: "stripe-webhook-fixture",
      monthlyPriceId: "price_123",
    });

    expect(client.checkout.sessions.create).toEqual(expect.any(Function));
    expect(client.billingPortal.sessions.create).toEqual(expect.any(Function));
    expect(client.webhooks.constructEvent).toEqual(expect.any(Function));
  });
});
