import { describe, expect, it, vi } from "vitest";
import {
  isSubscriptionActive,
  normalizeBillingEmail,
  toStripeTimestamp,
} from "@/lib/billing/billing-repository";

describe("billing repository helpers", () => {
  it("normalizes billing email addresses", () => {
    expect(normalizeBillingEmail(" Tyler@Example.COM ")).toBe("tyler@example.com");
  });

  it("treats active and trialing subscriptions as app access", () => {
    expect(isSubscriptionActive({ status: "active", currentPeriodEnd: null })).toBe(true);
    expect(isSubscriptionActive({ status: "trialing", currentPeriodEnd: null })).toBe(true);
    expect(isSubscriptionActive({ status: "past_due", currentPeriodEnd: null })).toBe(false);
    expect(isSubscriptionActive({ status: "canceled", currentPeriodEnd: null })).toBe(false);
  });

  it("converts Stripe unix seconds to ISO timestamps", () => {
    vi.setSystemTime(new Date("2026-06-29T00:00:00.000Z"));

    try {
      expect(toStripeTimestamp(1782691200)).toBe("2026-06-29T00:00:00.000Z");
      expect(toStripeTimestamp(null)).toBeNull();
      expect(toStripeTimestamp(undefined)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
