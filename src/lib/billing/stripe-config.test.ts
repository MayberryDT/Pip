import { describe, expect, it } from "vitest";
import {
  getBillingConfig,
  isBillingConfigured,
  StripeBillingConfigError,
} from "@/lib/billing/stripe-config";

describe("Stripe billing config", () => {
  it("is off by default", () => {
    expect(isBillingConfigured({})).toBe(false);
    expect(getBillingConfig({ PIP_BILLING_MODE: "off" })).toMatchObject({
      mode: "off",
    });
  });

  it("requires Stripe secrets and price in live mode", () => {
    expect(() => getBillingConfig({ PIP_BILLING_MODE: "live" })).toThrow(StripeBillingConfigError);
  });

  it("returns live billing config when required env is present", () => {
    expect(
      getBillingConfig({
        PIP_BILLING_MODE: "live",
        STRIPE_SECRET_KEY: "stripe-secret-fixture",
        STRIPE_WEBHOOK_SECRET: "stripe-webhook-fixture",
        STRIPE_PRICE_MONTHLY: "price_123",
      }),
    ).toEqual({
      mode: "live",
      secretKey: "stripe-secret-fixture",
      webhookSecret: "stripe-webhook-fixture",
      monthlyPriceId: "price_123",
    });
  });
});
