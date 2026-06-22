import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  sendPublicWaitlistConfirmation: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/email/transactional", () => ({
  sendPublicWaitlistConfirmation: routeMocks.sendPublicWaitlistConfirmation,
}));

import { POST as postEvent } from "@/app/api/marketing/events/route";
import { POST as postWaitlist } from "@/app/api/marketing/waitlist/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("marketing API routes", () => {
  it("rejects invalid waitlist emails without touching Supabase", async () => {
    const response = await postWaitlist(jsonRequest("/api/marketing/waitlist", { email: "nope" }));

    expect(response.status).toBe(400);
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("skips waitlist storage when Supabase is disabled locally", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await postWaitlist(
      jsonRequest("/api/marketing/waitlist", {
        email: "tester@example.com",
        sourcePage: "/",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "skipped" });
  });

  it("stores waitlist signups through the admin client when Supabase is configured", async () => {
    enableSupabaseEnv();
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    routeMocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
        insert,
      }),
    });

    const response = await postWaitlist(
      jsonRequest("/api/marketing/waitlist", {
        email: " Tester@Example.COM ",
        sourcePage: "/blog",
        referrer: "https://example.com",
        utm: {
          utm_source: "search",
          utm_medium: "organic",
          utm_campaign: "launch",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "joined",
      normalizedEmail: "tester@example.com",
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_email: "tester@example.com",
        source_page: "/blog",
        last_source_page: "/blog",
        utm_source: "search",
        last_utm_source: "search",
        newsletter_opt_in_at: expect.any(String),
        newsletter_unsubscribed_at: null,
      }),
    );
    expect(routeMocks.sendPublicWaitlistConfirmation).toHaveBeenCalledWith(
      expect.anything(),
      {
        email: "Tester@Example.COM",
        normalizedEmail: "tester@example.com",
      },
    );
  });

  it("rejects invalid marketing events", async () => {
    const response = await postEvent(
      jsonRequest("/api/marketing/events", {
        eventName: "unknown_event",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("records marketing events through a separate event table", async () => {
    enableSupabaseEnv();
    const insert = vi.fn().mockResolvedValue({ error: null });
    routeMocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    });

    const response = await postEvent(
      jsonRequest("/api/marketing/events", {
        eventName: "marketing_cta_clicked",
        properties: {
          page: "/",
          rawIp: "203.0.113.9",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      event_name: "marketing_cta_clicked",
      properties: {
        page: "/",
      },
    });
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`https://spendwithpip.com${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 100)}`,
      "user-agent": "Vitest",
    },
    body: JSON.stringify(body),
  });
}
