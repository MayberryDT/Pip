import { describe, expect, it, vi } from "vitest";
import { hardSuppressEmail } from "@/lib/email/suppression";

describe("email suppression", () => {
  it("marks a contact hard-suppressed without removing waitlist history", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ update })),
    } as never;

    await hardSuppressEmail(supabase, {
      normalizedEmail: "tyler@example.com",
      reason: "provider_bounce",
    });

    expect(update).toHaveBeenCalledWith({
      email_suppressed_at: expect.any(String),
      email_suppression_reason: "provider_bounce",
    });
    expect(eq).toHaveBeenCalledWith("normalized_email", "tyler@example.com");
  });
});
