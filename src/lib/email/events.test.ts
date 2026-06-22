import { describe, expect, it, vi } from "vitest";
import {
  clearWaitlistEmailReservation,
  logEmailEvent,
  markWaitlistEmailSent,
  reserveWaitlistEmailSend,
} from "@/lib/email/events";

describe("email events", () => {
  it("logs provider-neutral events", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn(() => ({ insert })),
    };

    await logEmailEvent(supabase as never, {
      normalizedEmail: "tyler@example.com",
      eventType: "waitlist_confirmation",
      provider: "resend",
      providerEventId: null,
      providerMessageId: "msg_123",
      status: "sent",
      metadata: { source: "marketing" },
    });

    expect(supabase.from).toHaveBeenCalledWith("email_events");
    expect(insert).toHaveBeenCalledWith({
      normalized_email: "tyler@example.com",
      event_type: "waitlist_confirmation",
      provider: "resend",
      provider_event_id: null,
      provider_message_id: "msg_123",
      status: "sent",
      error_message: null,
      metadata: { source: "marketing" },
    });
  });

  it("reserves a sent timestamp on the waitlist row", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        waitlist_confirmation_sent_at: "2026-06-21T00:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const builder = {
      is: vi.fn(() => builder),
      select,
    };
    const eq = vi.fn(() => builder);
    const update = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ update })),
    };

    await expect(reserveWaitlistEmailSend(supabase as never, {
      normalizedEmail: "tyler@example.com",
      column: "waitlist_confirmation_sent_at",
      reservationColumn: "waitlist_confirmation_reserved_at",
    })).resolves.toBe(true);

    expect(update).toHaveBeenCalledWith({
      waitlist_confirmation_reserved_at: expect.any(String),
    });
    expect(eq).toHaveBeenCalledWith("normalized_email", "tyler@example.com");
    expect(builder.is).toHaveBeenCalledWith("waitlist_confirmation_sent_at", null);
    expect(builder.is).toHaveBeenCalledWith("waitlist_confirmation_reserved_at", null);
    expect(select).toHaveBeenCalledWith("waitlist_confirmation_reserved_at");
  });

  it("marks a reserved send as sent after provider success", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ update })),
    };

    await markWaitlistEmailSent(supabase as never, {
      normalizedEmail: "tyler@example.com",
      column: "waitlist_confirmation_sent_at",
      reservationColumn: "waitlist_confirmation_reserved_at",
    });

    expect(update).toHaveBeenCalledWith({
      waitlist_confirmation_sent_at: expect.any(String),
      waitlist_confirmation_reserved_at: null,
    });
  });

  it("clears a reservation after provider failure", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ update })),
    };

    await clearWaitlistEmailReservation(supabase as never, {
      normalizedEmail: "tyler@example.com",
      reservationColumn: "waitlist_confirmation_reserved_at",
    });

    expect(update).toHaveBeenCalledWith({
      waitlist_confirmation_reserved_at: null,
    });
  });
});
