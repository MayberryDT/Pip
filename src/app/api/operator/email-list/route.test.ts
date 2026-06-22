import { describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getOperatorAuthFailure: vi.fn(() => null),
  isSupabaseConfigured: vi.fn(() => true),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/operator/auth", () => ({
  getOperatorAuthFailure: routeMocks.getOperatorAuthFailure,
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: routeMocks.isSupabaseConfigured,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

import { GET } from "@/app/api/operator/email-list/route";

describe("GET /api/operator/email-list", () => {
  it("exports active newsletter contacts", async () => {
    const builder = {
      is: vi.fn(() => builder),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            display_email: "Tyler@Example.com",
            normalized_email: "tyler@example.com",
            newsletter_opt_in_at: "2026-06-21T00:00:00.000Z",
            source_page: "/",
            last_source_page: "/pricing",
          },
        ],
        error: null,
      }),
    };
    const not = vi.fn(() => builder);
    const select = vi.fn(() => ({ not }));
    routeMocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ select })),
    });

    const response = await GET(new Request("https://spendwithpip.com/api/operator/email-list"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contacts: [
        {
          email: "Tyler@Example.com",
          normalizedEmail: "tyler@example.com",
          sourcePage: "/",
          lastSourcePage: "/pricing",
          newsletterOptInAt: "2026-06-21T00:00:00.000Z",
        },
      ],
    });
    expect(not).toHaveBeenCalledWith("newsletter_opt_in_at", "is", null);
    expect(builder.is).toHaveBeenCalledWith("newsletter_unsubscribed_at", null);
    expect(builder.is).toHaveBeenCalledWith("email_suppressed_at", null);
  });
});
