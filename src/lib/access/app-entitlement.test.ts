import { describe, expect, it } from "vitest";
import { summarizeAppEntitlement } from "@/lib/access/app-entitlement";

describe("app entitlement summary", () => {
  it("allows active manual grants", () => {
    const grant = {
      status: "active",
      normalized_email: "tester@example.com",
    };

    expect(summarizeAppEntitlement({ grant: grant as never, subscription: null })).toEqual({
      hasAccess: true,
      source: "manual_grant",
      billingRequired: false,
      grant,
      subscription: null,
    });
  });

  it("allows active paid subscriptions", () => {
    const subscription = { status: "active", currentPeriodEnd: null };

    expect(summarizeAppEntitlement({ grant: null, subscription })).toEqual({
      hasAccess: true,
      source: "subscription",
      billingRequired: false,
      grant: null,
      subscription,
    });
  });

  it("requires billing when there is no grant or subscription", () => {
    expect(summarizeAppEntitlement({ grant: null, subscription: null })).toEqual({
      hasAccess: false,
      source: null,
      billingRequired: true,
      grant: null,
      subscription: null,
    });
  });
});
