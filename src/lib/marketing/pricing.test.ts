import { describe, expect, it } from "vitest";
import {
  pipPaidTrustLine,
  pipProductAccess,
  pipPricing,
  pipPricingPlans,
  pipSubscriptionCaveat,
} from "@/lib/marketing/pricing";

describe("marketing pricing constants", () => {
  it("defines the paid product-access pricing model", () => {
    expect(pipProductAccess).toMatchObject({
      status: "waitlist",
      primaryLabel: "Join waitlist",
    });
    expect(pipPricing.monthly.displayPrice).toBe("$7.99/month");
    expect(pipPricing).not.toHaveProperty("weekly");
    expect(pipPricingPlans.map((plan) => plan.id)).toEqual(["monthly"]);
    expect(pipPricingPlans).toHaveLength(1);
    expect(pipPaidTrustLine).toContain("money data should not be the product");
    expect(pipSubscriptionCaveat).toContain("One monthly subscription");
  });
});
