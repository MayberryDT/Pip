import { describe, expect, it } from "vitest";
import { marketingEventSchema, sanitizeMarketingProperties } from "@/lib/marketing/events";

describe("marketing events", () => {
  it("allows the PRD-defined marketing event names", () => {
    expect(
      marketingEventSchema.safeParse({
        eventName: "waitlist_signup_succeeded",
        properties: {
          page: "/",
          cta_label: "Join beta",
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
        page: "/blog",
        href: "#join-beta",
        referrer: "https://example.com",
        rawIp: "203.0.113.8",
        secret: "nope",
      }),
    ).toEqual({
      page: "/blog",
      href: "#join-beta",
      referrer: "https://example.com",
    });
  });
});
