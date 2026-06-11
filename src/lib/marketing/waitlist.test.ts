import { describe, expect, it } from "vitest";
import {
  checkMarketingRateLimit,
  getMarketingRateLimitKey,
  normalizeWaitlistEmail,
} from "@/lib/marketing/waitlist";

describe("marketing waitlist service", () => {
  it("normalizes waitlist email addresses", () => {
    expect(normalizeWaitlistEmail(" Test.User@Example.COM ")).toBe("test.user@example.com");
  });

  it("uses a hashed rate-limit key instead of raw request data", () => {
    const key = getMarketingRateLimitKey(
      new Request("https://spendwithpip.com/api/marketing/waitlist", {
        headers: {
          "x-forwarded-for": "203.0.113.8",
          "user-agent": "Vitest",
        },
      }),
    );

    expect(key).toHaveLength(64);
    expect(key).not.toContain("203.0.113.8");
    expect(key).not.toContain("Vitest");
  });

  it("rate limits repeated submissions in the same window", () => {
    const key = `test-key-${crypto.randomUUID()}`;
    const now = Date.now();

    for (let index = 0; index < 6; index += 1) {
      expect(checkMarketingRateLimit(key, now + index).allowed).toBe(true);
    }

    expect(checkMarketingRateLimit(key, now + 7)).toMatchObject({
      allowed: false,
    });
    expect(checkMarketingRateLimit(key, now + 61_000)).toEqual({
      allowed: true,
    });
  });
});
