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
      status: "available",
      primaryLabel: "Get Pip",
    });
    expect(pipPricing.weekly.displayPrice).toBe("$2.99/week");
    expect(pipPricing.monthly.displayPrice).toBe("$7.99/month");
    expect(pipPricingPlans.map((plan) => plan.id)).toEqual(["weekly", "monthly"]);
    expect(pipPaidTrustLine).toContain("money data should not be the product");
    expect(pipSubscriptionCaveat).toContain("Subscriptions are managed");
  });
});
