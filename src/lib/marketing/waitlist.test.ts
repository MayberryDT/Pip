import { describe, expect, it, vi } from "vitest";
import {
  checkMarketingRateLimit,
  getMarketingRateLimitKey,
  normalizeWaitlistEmail,
  submitMarketingWaitlist,
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

  it("preserves first attribution and updates last attribution on repeated marketing signup", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        normalized_email: "tester@example.com",
        app_waitlist_requested_at: null,
        app_waitlist_request_count: 0,
      },
      error: null,
    });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe("marketing_waitlist");
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle })),
          })),
          update,
        };
      }),
    };

    const result = await submitMarketingWaitlist(supabase as never, {
      email: "Tester@Example.COM",
      sourcePage: "/pricing",
      referrer: "https://example.com/new",
      utm: {
        utm_source: "search",
        utm_medium: "organic",
        utm_campaign: "pricing",
      },
    });

    expect(result).toEqual({
      status: "joined",
      normalizedEmail: "tester@example.com",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        display_email: "Tester@Example.COM",
        last_source_page: "/pricing",
        last_referrer: "https://example.com/new",
        last_utm_source: "search",
        newsletter_opt_in_at: expect.any(String),
        newsletter_unsubscribed_at: null,
        newsletter_unsubscribe_reason: null,
        status: "joined",
      }),
    );
    expect(update.mock.calls[0][0]).not.toHaveProperty("source_page");
    expect(update.mock.calls[0][0]).not.toHaveProperty("referrer");
    expect(update.mock.calls[0][0]).not.toHaveProperty("utm_source");
    expect(update.mock.calls[0][0]).not.toHaveProperty("email_suppressed_at");
  });

  it("records app waitlist intent without overwriting first marketing attribution", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        normalized_email: "tester@example.com",
        app_waitlist_requested_at: null,
        app_waitlist_request_count: 1,
      },
      error: null,
    });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
        update,
      })),
    };

    await submitMarketingWaitlist(supabase as never, {
      email: "Tester@Example.COM",
      sourcePage: "/app",
      sourceKind: "app_oauth",
      authUserId: "user-1",
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_source_page: "/app",
        auth_user_id: "user-1",
        app_waitlist_request_count: 2,
        status: "joined",
      }),
    );
    expect(update.mock.calls[0][0]).not.toHaveProperty("newsletter_opt_in_at");
    expect(update.mock.calls[0][0]).not.toHaveProperty("newsletter_unsubscribed_at");
    expect(update.mock.calls[0][0]).not.toHaveProperty("newsletter_unsubscribe_reason");
    expect(update.mock.calls[0][0].app_waitlist_requested_at).toEqual(expect.any(String));
    expect(update.mock.calls[0][0].app_waitlist_last_requested_at).toEqual(expect.any(String));
  });

  it("retries as an update when a concurrent signup creates the row first", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          normalized_email: "tester@example.com",
          app_waitlist_requested_at: null,
          app_waitlist_request_count: 0,
        },
        error: null,
      });
    const insert = vi.fn().mockResolvedValue({
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
    });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
        insert,
        update,
      })),
    };

    await submitMarketingWaitlist(supabase as never, {
      email: "Tester@Example.COM",
      sourcePage: "/",
    });

    expect(insert).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        display_email: "Tester@Example.COM",
        last_source_page: "/",
        newsletter_opt_in_at: expect.any(String),
        newsletter_unsubscribed_at: null,
      }),
    );
    expect(update.mock.calls[0][0]).not.toHaveProperty("normalized_email");
  });
});
