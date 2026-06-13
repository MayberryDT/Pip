import { describe, expect, it } from "vitest";
import { marketingEventSchema, sanitizeMarketingProperties } from "@/lib/marketing/events";

describe("marketing events", () => {
  it("allows the PRD-defined marketing event names", () => {
    expect(
      marketingEventSchema.safeParse({
        eventName: "marketing_cta_clicked",
        properties: {
          page: "/",
          cta_label: "Get Pip",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects unknown event names", () => {
    expect(
      marketingEventSchema.safeParse({
        eventName: "pip_cash_viewed",
      }).success,
    ).toBe(false);
  });

  it("drops unapproved properties before storage", () => {
    expect(
      sanitizeMarketingProperties({
        page: "/pricing",
        href: "/app",
        referrer: "https://example.com",
        intent: "get_pip",
        selected_plan: "monthly",
        price: "$7.99",
        period: "month",
        pricing_shown: true,
        rawIp: "203.0.113.8",
        secret: "nope",
      }),
    ).toEqual({
      page: "/pricing",
      href: "/app",
      referrer: "https://example.com",
      intent: "get_pip",
      selected_plan: "monthly",
      price: "$7.99",
      period: "month",
      pricing_shown: true,
    });
  });
});
