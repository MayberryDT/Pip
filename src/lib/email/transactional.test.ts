import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendAppWaitlistConfirmation,
  sendInviteGrantedEmail,
  sendPublicWaitlistConfirmation,
} from "@/lib/email/transactional";

const emailMocks = vi.hoisted(() => ({
  providerSend: vi.fn(),
}));

vi.mock("@/lib/email/resend-provider", () => ({
  createConfiguredEmailProvider: vi.fn(() => ({
    name: "resend",
    send: emailMocks.providerSend,
  })),
}));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("RESEND_API_KEY", "resend-key");
  vi.stubEnv("PIP_EMAIL_FROM", "Pip <hello@spendwithpip.com>");
  vi.stubEnv("PIP_EMAIL_POSTAL_ADDRESS", "123 Pip St, Denver, CO");
  vi.stubEnv("PIP_EMAIL_UNSUBSCRIBE_SECRET", "unsubscribe-secret");
  emailMocks.providerSend.mockReset();
  emailMocks.providerSend.mockResolvedValue({
    status: "sent",
    provider: "resend",
    providerMessageId: "msg_123",
  });
});

describe("transactional email sends", () => {
  it("sends public waitlist confirmation once", async () => {
    const supabase = createSupabase({
      waitlist_confirmation_sent_at: null,
      email_suppressed_at: null,
    });

    const result = await sendPublicWaitlistConfirmation(supabase as never, {
      email: "Tyler@Example.com",
      normalizedEmail: "tyler@example.com",
    });

    expect(result.status).toBe("sent");
    expect(supabase.update).toHaveBeenCalledWith({
      waitlist_confirmation_reserved_at: expect.any(String),
    });
    expect(supabase.update).toHaveBeenCalledWith({
      waitlist_confirmation_sent_at: expect.any(String),
      waitlist_confirmation_reserved_at: null,
    });
    expect(supabase.emailEventInsert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "waitlist_confirmation",
      status: "sent",
    }));
  });

  it("skips when another caller reserved the same confirmation before send", async () => {
    const supabase = createSupabase(
      {
        waitlist_confirmation_sent_at: null,
        email_suppressed_at: null,
      },
      { reservationData: null },
    );

    const result = await sendPublicWaitlistConfirmation(supabase as never, {
      email: "tyler@example.com",
      normalizedEmail: "tyler@example.com",
    });

    expect(result).toEqual({ status: "skipped", provider: "none", reason: "already_sent" });
    expect(emailMocks.providerSend).not.toHaveBeenCalled();
    expect(supabase.emailEventInsert).not.toHaveBeenCalled();
  });

  it("skips already sent public waitlist confirmation", async () => {
    const supabase = createSupabase({
      waitlist_confirmation_sent_at: "2026-06-21T00:00:00.000Z",
      email_suppressed_at: null,
    });

    const result = await sendPublicWaitlistConfirmation(supabase as never, {
      email: "tyler@example.com",
      normalizedEmail: "tyler@example.com",
    });

    expect(result).toEqual({ status: "skipped", provider: "none", reason: "already_sent" });
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("skips hard-suppressed contacts", async () => {
    const supabase = createSupabase({
      waitlist_confirmation_sent_at: null,
      email_suppressed_at: "2026-06-21T00:00:00.000Z",
    });

    const result = await sendPublicWaitlistConfirmation(supabase as never, {
      email: "tyler@example.com",
      normalizedEmail: "tyler@example.com",
    });

    expect(result).toEqual({ status: "skipped", provider: "none", reason: "hard_suppressed" });
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("sends app waitlist confirmation once", async () => {
    const supabase = createSupabase({
      app_waitlist_confirmation_sent_at: null,
      email_suppressed_at: null,
    });

    await sendAppWaitlistConfirmation(supabase as never, {
      email: "tyler@example.com",
      normalizedEmail: "tyler@example.com",
    });

    expect(supabase.update).toHaveBeenCalledWith({
      app_waitlist_confirmation_sent_at: expect.any(String),
      app_waitlist_confirmation_reserved_at: null,
    });
  });

  it("sends invite granted email once", async () => {
    const supabase = createSupabase({
      invite_email_sent_at: null,
      email_suppressed_at: null,
    });

    await sendInviteGrantedEmail(supabase as never, {
      email: "tyler@example.com",
      normalizedEmail: "tyler@example.com",
      appUrl: "https://spendwithpip.com/app",
    });

    expect(supabase.update).toHaveBeenCalledWith({
      invite_email_sent_at: expect.any(String),
      invite_email_reserved_at: null,
    });
  });

  it("clears the reservation when provider send fails so a later retry can send", async () => {
    emailMocks.providerSend.mockRejectedValueOnce(new Error("domain not verified"));
    const supabase = createSupabase({
      waitlist_confirmation_sent_at: null,
      email_suppressed_at: null,
    });

    const result = await sendPublicWaitlistConfirmation(supabase as never, {
      email: "tyler@example.com",
      normalizedEmail: "tyler@example.com",
    });

    expect(result).toEqual({
      status: "failed",
      provider: "resend",
      errorMessage: "domain not verified",
    });
    expect(supabase.update).toHaveBeenCalledWith({
      waitlist_confirmation_reserved_at: null,
    });
  });

  it("creates a non-newsletter contact row before sending direct operator invites", async () => {
    const supabase = createSupabase({
      invite_email_sent_at: null,
      email_suppressed_at: null,
    });

    await sendInviteGrantedEmail(supabase as never, {
      email: "Direct@Example.com",
      normalizedEmail: "direct@example.com",
      appUrl: "https://spendwithpip.com/app",
    });

    expect(supabase.marketingInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_email: "direct@example.com",
        display_email: "Direct@Example.com",
        source_page: "/operator/access-grants",
        last_source_page: "/operator/access-grants",
      }),
    );
    expect(supabase.marketingInsert.mock.calls[0][0]).not.toHaveProperty("newsletter_opt_in_at");
  });
});

function createSupabase(
  row: Record<string, string | null>,
  options: { reservationData?: Record<string, string> | null } = {},
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
  const reserveMaybeSingle = vi.fn().mockResolvedValue({
    data: options.reservationData === undefined ? { waitlist_confirmation_reserved_at: "2026-06-21T00:00:00.000Z" } : options.reservationData,
    error: null,
  });
  const reserveSelect = vi.fn(() => ({ maybeSingle: reserveMaybeSingle }));
  const reserveChain = {
    is: vi.fn(() => reserveChain),
    select: reserveSelect,
  };
  const eq = vi.fn(() => reserveChain);
  const update = vi.fn(() => ({ eq }));
  const marketingInsert = vi.fn().mockResolvedValue({ error: null });
  const emailEventInsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => {
    if (table === "marketing_waitlist") {
      return { insert: marketingInsert, select, update };
    }

    return { insert: emailEventInsert };
  });

  return { emailEventInsert, from, marketingInsert, select, update } as never as {
    emailEventInsert: typeof emailEventInsert;
    from: typeof from;
    marketingInsert: typeof marketingInsert;
    select: typeof select;
    update: typeof update;
  };
}
