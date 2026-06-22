import { describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  verifyUnsubscribeToken: vi.fn((token: string) => (token === "valid" ? "tyler@example.com" : null)),
  insert: vi.fn().mockResolvedValue({ error: null }),
  updateEq: vi.fn().mockResolvedValue({ error: null }),
  update: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/email/unsubscribe-token", () => ({
  verifyUnsubscribeToken: routeMocks.verifyUnsubscribeToken,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

import { POST } from "@/app/api/email/unsubscribe/route";

describe("POST /api/email/unsubscribe", () => {
  it("rejects invalid tokens", async () => {
    const response = await POST(unsubscribeRequest({ token: "bad" }));

    expect(response.status).toBe(400);
  });

  it("unsubscribes valid tokens", async () => {
    routeMocks.update.mockReturnValue({ eq: routeMocks.updateEq });
    routeMocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "email_events") {
          return { insert: routeMocks.insert };
        }

        return { update: routeMocks.update };
      }),
    });

    const response = await POST(unsubscribeRequest({ token: "valid" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "unsubscribed" });
    expect(routeMocks.update).toHaveBeenCalledWith({
      newsletter_unsubscribed_at: expect.any(String),
      newsletter_unsubscribe_reason: "self_service",
    });
    expect(routeMocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "newsletter_unsubscribe",
      normalized_email: "tyler@example.com",
      status: "processed",
    }));
  });
});

function unsubscribeRequest(body: unknown) {
  return new Request("https://spendwithpip.com/api/email/unsubscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
