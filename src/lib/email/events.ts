import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type EmailEventInsert = Database["public"]["Tables"]["email_events"]["Insert"];
type WaitlistUpdate = Database["public"]["Tables"]["marketing_waitlist"]["Update"];
type SentColumn =
  | "waitlist_confirmation_sent_at"
  | "app_waitlist_confirmation_sent_at"
  | "invite_email_sent_at";
type ReservationColumn =
  | "waitlist_confirmation_reserved_at"
  | "app_waitlist_confirmation_reserved_at"
  | "invite_email_reserved_at";

export async function logEmailEvent(
  supabase: SupabaseClient<Database>,
  input: {
    normalizedEmail: string;
    eventType: EmailEventInsert["event_type"];
    provider: string;
    providerEventId?: string | null;
    providerMessageId?: string | null;
    status: EmailEventInsert["status"];
    errorMessage?: string | null;
    metadata?: Json;
  },
) {
  const { error } = await supabase.from("email_events").insert({
    normalized_email: input.normalizedEmail,
    event_type: input.eventType,
    provider: input.provider,
    provider_event_id: input.providerEventId ?? null,
    provider_message_id: input.providerMessageId ?? null,
    status: input.status,
    error_message: input.errorMessage ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    throw error;
  }
}

export async function reserveWaitlistEmailSend(
  supabase: SupabaseClient<Database>,
  input: {
    normalizedEmail: string;
    column: SentColumn;
    reservationColumn: ReservationColumn;
  },
): Promise<boolean> {
  const update: WaitlistUpdate = {
    [input.reservationColumn]: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("marketing_waitlist")
    .update(update)
    .eq("normalized_email", input.normalizedEmail)
    .is(input.column, null)
    .is(input.reservationColumn, null)
    .select(input.reservationColumn)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function markWaitlistEmailSent(
  supabase: SupabaseClient<Database>,
  input: {
    normalizedEmail: string;
    column: SentColumn;
    reservationColumn: ReservationColumn;
  },
) {
  const update: WaitlistUpdate = {
    [input.column]: new Date().toISOString(),
    [input.reservationColumn]: null,
  };

  const { error } = await supabase
    .from("marketing_waitlist")
    .update(update)
    .eq("normalized_email", input.normalizedEmail);

  if (error) {
    throw error;
  }
}

export async function clearWaitlistEmailReservation(
  supabase: SupabaseClient<Database>,
  input: {
    normalizedEmail: string;
    reservationColumn: ReservationColumn;
  },
) {
  const update: WaitlistUpdate = {
    [input.reservationColumn]: null,
  };

  const { error } = await supabase
    .from("marketing_waitlist")
    .update(update)
    .eq("normalized_email", input.normalizedEmail);

  if (error) {
    throw error;
  }
}
