import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type StripeSubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export type SubscriptionAccessSummary = {
  status: StripeSubscriptionStatus;
  currentPeriodEnd: string | null;
};

export function normalizeBillingEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSubscriptionActive(subscription: SubscriptionAccessSummary | null): boolean {
  return subscription?.status === "active" || subscription?.status === "trialing";
}

export function toStripeTimestamp(value: number | null | undefined): string | null {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

export async function loadActiveBillingSubscriptionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SubscriptionAccessSummary | null> {
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("status,current_period_end")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? {
        status: data.status as StripeSubscriptionStatus,
        currentPeriodEnd: data.current_period_end,
      }
    : null;
}

export async function upsertBillingCustomer(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    email: string;
    stripeCustomerId: string;
  },
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("billing_customers")
    .upsert(
      {
        user_id: input.userId,
        normalized_email: normalizeBillingEmail(input.email),
        stripe_customer_id: input.stripeCustomerId,
        updated_at: now,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function loadBillingCustomerForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("billing_customers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertBillingSubscription(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    status: StripeSubscriptionStatus;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
    checkoutSessionId?: string | null;
  },
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .upsert(
      {
        user_id: input.userId,
        stripe_customer_id: input.stripeCustomerId,
        stripe_subscription_id: input.stripeSubscriptionId,
        stripe_price_id: input.stripePriceId,
        status: input.status,
        current_period_end: input.currentPeriodEnd,
        cancel_at_period_end: input.cancelAtPeriodEnd,
        trial_end: input.trialEnd,
        checkout_session_id: input.checkoutSessionId ?? null,
        updated_at: now,
      },
      { onConflict: "stripe_subscription_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function recordStripeWebhookEvent(
  supabase: SupabaseClient<Database>,
  input: {
    stripeEventId: string;
    eventType: string;
  },
): Promise<"created" | "duplicate"> {
  const { error } = await supabase.from("stripe_webhook_events").insert({
    stripe_event_id: input.stripeEventId,
    event_type: input.eventType,
  });

  if (!error) {
    return "created";
  }

  if ("code" in error && error.code === "23505") {
    return "duplicate";
  }

  throw error;
}
