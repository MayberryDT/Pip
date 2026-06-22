import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearWaitlistEmailReservation,
  logEmailEvent,
  markWaitlistEmailSent,
  reserveWaitlistEmailSend,
} from "@/lib/email/events";
import { getEmailConfig, isEmailConfigured } from "@/lib/email/env";
import { sendEmailWithProvider } from "@/lib/email/provider";
import { createConfiguredEmailProvider } from "@/lib/email/resend-provider";
import {
  buildAppWaitlistConfirmationEmail,
  buildInviteGrantedEmail,
  buildWaitlistConfirmationEmail,
} from "@/lib/email/templates";
import { createUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import type { Database } from "@/lib/supabase/database.types";

type MarketingWaitlistEmailState = Pick<
  Database["public"]["Tables"]["marketing_waitlist"]["Row"],
  | "waitlist_confirmation_sent_at"
  | "app_waitlist_confirmation_sent_at"
  | "invite_email_sent_at"
  | "email_suppressed_at"
>;

type TransactionalEventType =
  | "waitlist_confirmation"
  | "app_waitlist_confirmation"
  | "invite_granted";

type SentColumn =
  | "waitlist_confirmation_sent_at"
  | "app_waitlist_confirmation_sent_at"
  | "invite_email_sent_at";
type ReservationColumn =
  | "waitlist_confirmation_reserved_at"
  | "app_waitlist_confirmation_reserved_at"
  | "invite_email_reserved_at";

export type TransactionalEmailOutcome =
  | { status: "sent"; provider: string; providerMessageId?: string }
  | { status: "skipped"; provider: "none"; reason: "email_not_configured" | "hard_suppressed" | "already_sent" }
  | { status: "failed"; provider: string; errorMessage: string };

export async function sendPublicWaitlistConfirmation(
  supabase: SupabaseClient<Database>,
  input: { email: string; normalizedEmail: string },
): Promise<TransactionalEmailOutcome> {
  const state = await loadEmailState(supabase, input.normalizedEmail);
  const skip = getSkipOutcome(state, "waitlist_confirmation_sent_at");

  if (skip) {
    return skip;
  }

  if (!isEmailConfigured()) {
    return logEmailNotConfigured(supabase, input.normalizedEmail, "waitlist_confirmation");
  }

  const config = getEmailConfig();
  const message = buildWaitlistConfirmationEmail({
    email: input.email,
    unsubscribeUrl: buildUnsubscribeUrl(input.normalizedEmail),
    postalAddress: config.postalAddress,
  });

  return sendAndRecord(supabase, {
    email: input.email,
    normalizedEmail: input.normalizedEmail,
    eventType: "waitlist_confirmation",
    sentColumn: "waitlist_confirmation_sent_at",
    reservationColumn: "waitlist_confirmation_reserved_at",
    message,
  });
}

export async function sendAppWaitlistConfirmation(
  supabase: SupabaseClient<Database>,
  input: { email: string; normalizedEmail: string },
): Promise<TransactionalEmailOutcome> {
  const state = await loadEmailState(supabase, input.normalizedEmail);
  const skip = getSkipOutcome(state, "app_waitlist_confirmation_sent_at");

  if (skip) {
    return skip;
  }

  if (!isEmailConfigured()) {
    return logEmailNotConfigured(supabase, input.normalizedEmail, "app_waitlist_confirmation");
  }

  const config = getEmailConfig();
  const message = buildAppWaitlistConfirmationEmail({
    email: input.email,
    unsubscribeUrl: buildUnsubscribeUrl(input.normalizedEmail),
    postalAddress: config.postalAddress,
  });

  return sendAndRecord(supabase, {
    email: input.email,
    normalizedEmail: input.normalizedEmail,
    eventType: "app_waitlist_confirmation",
    sentColumn: "app_waitlist_confirmation_sent_at",
    reservationColumn: "app_waitlist_confirmation_reserved_at",
    message,
  });
}

export async function sendInviteGrantedEmail(
  supabase: SupabaseClient<Database>,
  input: { email: string; normalizedEmail: string; appUrl: string },
): Promise<TransactionalEmailOutcome> {
  await ensureInviteEmailContact(supabase, input);
  const state = await loadEmailState(supabase, input.normalizedEmail);
  const skip = getSkipOutcome(state, "invite_email_sent_at");

  if (skip) {
    return skip;
  }

  if (!isEmailConfigured()) {
    return logEmailNotConfigured(supabase, input.normalizedEmail, "invite_granted");
  }

  const config = getEmailConfig();
  const message = buildInviteGrantedEmail({
    email: input.email,
    appUrl: input.appUrl,
    unsubscribeUrl: buildUnsubscribeUrl(input.normalizedEmail),
    postalAddress: config.postalAddress,
  });

  return sendAndRecord(supabase, {
    email: input.email,
    normalizedEmail: input.normalizedEmail,
    eventType: "invite_granted",
    sentColumn: "invite_email_sent_at",
    reservationColumn: "invite_email_reserved_at",
    message,
  });
}

async function sendAndRecord(
  supabase: SupabaseClient<Database>,
  input: {
    email: string;
    normalizedEmail: string;
    eventType: TransactionalEventType;
    sentColumn: SentColumn;
    reservationColumn: ReservationColumn;
    message: { subject: string; html: string; text: string };
  },
): Promise<TransactionalEmailOutcome> {
  const provider = createConfiguredEmailProvider();

  if (!provider) {
    return logEmailNotConfigured(supabase, input.normalizedEmail, input.eventType);
  }

  const reserved = await reserveWaitlistEmailSend(supabase, {
    normalizedEmail: input.normalizedEmail,
    column: input.sentColumn,
    reservationColumn: input.reservationColumn,
  });

  if (!reserved) {
    return { status: "skipped", provider: "none", reason: "already_sent" };
  }

  try {
    const result = await sendEmailWithProvider(provider, {
      to: input.email,
      subject: input.message.subject,
      html: input.message.html,
      text: input.message.text,
      tags: [{ name: "kind", value: input.eventType }],
    });

    if (result.status === "skipped") {
      await clearWaitlistEmailReservation(supabase, {
        normalizedEmail: input.normalizedEmail,
        reservationColumn: input.reservationColumn,
      });
      await logEmailEvent(supabase, {
        normalizedEmail: input.normalizedEmail,
        eventType: input.eventType,
        provider: "none",
        status: "skipped",
        metadata: { reason: "email_not_configured" },
      });
      return { status: "skipped", provider: "none", reason: "email_not_configured" };
    }

    await logEmailEvent(supabase, {
      normalizedEmail: input.normalizedEmail,
      eventType: input.eventType,
      provider: result.provider,
      providerMessageId: result.providerMessageId ?? null,
      status: result.status,
    });

    await markWaitlistEmailSent(supabase, {
      normalizedEmail: input.normalizedEmail,
      column: input.sentColumn,
      reservationColumn: input.reservationColumn,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Email send failed.";
    await clearWaitlistEmailReservation(supabase, {
      normalizedEmail: input.normalizedEmail,
      reservationColumn: input.reservationColumn,
    });
    await logEmailEvent(supabase, {
      normalizedEmail: input.normalizedEmail,
      eventType: input.eventType,
      provider: "resend",
      status: "failed",
      errorMessage,
    });
    return { status: "failed", provider: "resend", errorMessage };
  }
}

async function ensureInviteEmailContact(
  supabase: SupabaseClient<Database>,
  input: { email: string; normalizedEmail: string },
) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("marketing_waitlist").insert({
    normalized_email: input.normalizedEmail,
    display_email: input.email.trim(),
    source_page: "/operator/access-grants",
    referrer: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    last_source_page: "/operator/access-grants",
    last_referrer: null,
    last_utm_source: null,
    last_utm_medium: null,
    last_utm_campaign: null,
    consent_text_version: "2026-06-21-operator-app-access-grant",
    status: "invited",
    last_submitted_at: now,
  });

  if (error && !isUniqueViolation(error)) {
    throw error;
  }
}

async function loadEmailState(
  supabase: SupabaseClient<Database>,
  normalizedEmail: string,
): Promise<MarketingWaitlistEmailState> {
  const { data, error } = await supabase
    .from("marketing_waitlist")
    .select("waitlist_confirmation_sent_at, app_waitlist_confirmation_sent_at, invite_email_sent_at, email_suppressed_at")
    .eq("normalized_email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? {
    waitlist_confirmation_sent_at: null,
    app_waitlist_confirmation_sent_at: null,
    invite_email_sent_at: null,
    email_suppressed_at: null,
  };
}

function getSkipOutcome(
  state: MarketingWaitlistEmailState,
  sentColumn: SentColumn,
): TransactionalEmailOutcome | null {
  if (state.email_suppressed_at) {
    return { status: "skipped", provider: "none", reason: "hard_suppressed" };
  }

  if (state[sentColumn]) {
    return { status: "skipped", provider: "none", reason: "already_sent" };
  }

  return null;
}

async function logEmailNotConfigured(
  supabase: SupabaseClient<Database>,
  normalizedEmail: string,
  eventType: TransactionalEventType,
): Promise<TransactionalEmailOutcome> {
  await logEmailEvent(supabase, {
    normalizedEmail,
    eventType,
    provider: "none",
    status: "skipped",
    metadata: { reason: "email_not_configured" },
  });

  return { status: "skipped", provider: "none", reason: "email_not_configured" };
}

function buildUnsubscribeUrl(normalizedEmail: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://spendwithpip.com";
  const token = createUnsubscribeToken(normalizedEmail);

  return new URL(`/unsubscribe?token=${encodeURIComponent(token)}`, baseUrl).toString();
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
