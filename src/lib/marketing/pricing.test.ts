import { describe, expect, it } from "vitest";
import {
  pipLaunch,
  pipPaidTrustLine,
  pipPricing,
  pipPricingPlans,
  pipSubscriptionCaveat,
} from "@/lib/marketing/pricing";

describe("marketing pricing constants", () => {
  it("defines the paid prelaunch pricing model", () => {
    expect(pipLaunch).toMatchObject({
      status: "prelaunchPaid",
      primaryCta: "Get launch access",
    });
    expect(pipPricing.weekly.displayPrice).toBe("$2.99/week");
    expect(pipPricing.monthly.displayPrice).toBe("$7.99/month");
    expect(pipPricingPlans.map((plan) => plan.id)).toEqual(["weekly", "monthly"]);
    expect(pipPaidTrustLine).toContain("money data should not be the product");
    expect(pipSubscriptionCaveat).toContain("when Pip launches");
  });
});
