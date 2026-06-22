import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  verify: vi.fn(),
  insert: vi.fn().mockResolvedValue({ error: null }),
  eq: vi.fn().mockResolvedValue({ error: null }),
  update: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    webhooks: { verify: routeMocks.verify },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

import { POST } from "@/app/api/email/resend-webhook/route";

describe("POST /api/email/resend-webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    routeMocks.insert.mockResolvedValue({ error: null });
    routeMocks.eq.mockResolvedValue({ error: null });
    routeMocks.update.mockReturnValue({ eq: routeMocks.eq });
    routeMocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => (table === "email_events" ? { insert: routeMocks.insert } : { update: routeMocks.update })),
    });
  });

  it("rejects unsigned events", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_123");
    routeMocks.verify.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const response = await POST(webhookRequest({ type: "email.delivered" }));

    expect(response.status).toBe(400);
  });

  it("logs delivery events", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_123");
    routeMocks.verify.mockReturnValue({
      type: "email.delivered",
      data: {
        email_id: "msg_123",
        to: ["Tyler@Example.com"],
      },
    });

    const response = await POST(webhookRequest({ type: "email.delivered" }));

    expect(response.status).toBe(200);
    expect(routeMocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "provider_delivery",
      provider_event_id: "evt_123",
      provider_message_id: "msg_123",
      normalized_email: "tyler@example.com",
      status: "delivered",
    }));
  });

  it("hard-suppresses bounced emails", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_123");
    routeMocks.verify.mockReturnValue({
      type: "email.bounced",
      data: {
        email_id: "msg_123",
        to: ["Tyler@Example.com"],
        bounce: { type: "Permanent", message: "Hard bounce" },
      },
    });

    const response = await POST(webhookRequest({ type: "email.bounced" }));

    expect(response.status).toBe(200);
    expect(routeMocks.update).toHaveBeenCalledWith({
      email_suppressed_at: expect.any(String),
      email_suppression_reason: "provider_bounce",
    });
  });

  it("hard-suppresses complained emails", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_123");
    routeMocks.verify.mockReturnValue({
      type: "email.complained",
      data: {
        email_id: "msg_123",
        to: ["Tyler@Example.com"],
      },
    });

    const response = await POST(webhookRequest({ type: "email.complained" }));

    expect(response.status).toBe(200);
    expect(routeMocks.update).toHaveBeenCalledWith({
      email_suppressed_at: expect.any(String),
      email_suppression_reason: "provider_complaint",
    });
  });


  it("treats duplicate provider event IDs as successful no-ops", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_123");
    routeMocks.verify.mockReturnValue({
      type: "email.delivered",
      data: { email_id: "msg_123", to: ["tyler@example.com"] },
    });
    routeMocks.insert.mockResolvedValueOnce({ error: { code: "23505" } });

    const response = await POST(webhookRequest({ type: "email.delivered" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "duplicate" });
  });

  it("still suppresses duplicate bounced retries before returning duplicate", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_123");
    routeMocks.verify.mockReturnValue({
      type: "email.bounced",
      data: {
        email_id: "msg_123",
        to: ["tyler@example.com"],
      },
    });
    routeMocks.insert.mockResolvedValueOnce({ error: { code: "23505" } });

    const response = await POST(webhookRequest({ type: "email.bounced" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "duplicate" });
    expect(routeMocks.update).toHaveBeenCalledWith({
      email_suppressed_at: expect.any(String),
      email_suppression_reason: "provider_bounce",
    });
  });
});

function webhookRequest(payload: unknown) {
  return new Request("https://spendwithpip.com/api/email/resend-webhook", {
    method: "POST",
    headers: {
      "svix-id": "evt_123",
      "svix-timestamp": "1782080000",
      "svix-signature": "v1,test",
    },
    body: JSON.stringify(payload),
  });
}
