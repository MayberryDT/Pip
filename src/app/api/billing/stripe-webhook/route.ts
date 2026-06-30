import type Stripe from "stripe";
import { createStripeClient } from "@/lib/billing/stripe-client";
import {
  recordStripeWebhookEvent,
  toStripeTimestamp,
  upsertBillingCustomer,
  upsertBillingSubscription,
  type StripeSubscriptionStatus,
} from "@/lib/billing/billing-repository";
import { getBillingConfig, StripeBillingConfigError } from "@/lib/billing/stripe-config";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";

export const runtime = "nodejs";

type SubscriptionWebhookObject = {
  id: string;
  customer?: string | { id?: string } | null;
  status?: string | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
  trial_end?: number | null;
  metadata?: {
    supabase_user_id?: string;
  } | null;
  items?: {
    data?: Array<{
      price?: {
        id?: string;
      } | null;
    }>;
  } | null;
};

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return sensitiveJson({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const billing = getBillingConfig();

    if (billing.mode === "off") {
      return sensitiveJson({ error: "Billing is not enabled." }, { status: 503 });
    }

    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return sensitiveJson({ error: "Missing Stripe signature." }, { status: 400 });
    }

    const payload = await request.text();
    const stripe = createStripeClient(billing);
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, billing.webhookSecret);
    } catch {
      return sensitiveJson({ error: "Stripe webhook signature verification failed." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const status = await recordStripeWebhookEvent(admin, {
      stripeEventId: event.id,
      eventType: event.type,
    });

    if (status === "duplicate") {
      return sensitiveJson({ status: "duplicate" });
    }

    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(admin, event.data.object as Stripe.Checkout.Session);
    }

    if (isSubscriptionEvent(event.type)) {
      await handleSubscriptionEvent(admin, event.data.object as SubscriptionWebhookObject);
    }

    return sensitiveJson({ status: "processed" });
  } catch (error) {
    if (error instanceof StripeBillingConfigError) {
      return sensitiveJson({ error: "Billing is not enabled." }, { status: 503 });
    }

    if (error instanceof SupabaseConfigError) {
      return sensitiveJson({ error: error.message }, { status: 500 });
    }

    console.error("[stripe-webhook] Stripe webhook processing failed", error);
    return sensitiveJson({ error: "Stripe webhook processing failed." }, { status: 500 });
  }
}

async function handleCheckoutCompleted(
  supabase: Parameters<typeof upsertBillingCustomer>[0],
  session: Stripe.Checkout.Session,
) {
  const userId = session.metadata?.supabase_user_id ?? session.client_reference_id;
  const email = session.customer_details?.email ?? session.customer_email;
  const stripeCustomerId = toStripeId(session.customer);

  if (!userId || !email || !stripeCustomerId) {
    return;
  }

  await upsertBillingCustomer(supabase, {
    userId,
    email,
    stripeCustomerId,
  });
}

async function handleSubscriptionEvent(
  supabase: Parameters<typeof upsertBillingSubscription>[0],
  subscription: SubscriptionWebhookObject,
) {
  const userId = subscription.metadata?.supabase_user_id;
  const stripeCustomerId = toStripeId(subscription.customer);
  const stripePriceId = subscription.items?.data?.[0]?.price?.id;

  if (!userId || !stripeCustomerId || !stripePriceId || !subscription.status) {
    return;
  }

  await upsertBillingSubscription(supabase, {
    userId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId,
    status: subscription.status as StripeSubscriptionStatus,
    currentPeriodEnd: toStripeTimestamp(subscription.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    trialEnd: toStripeTimestamp(subscription.trial_end),
  });
}

function isSubscriptionEvent(type: string) {
  return (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  );
}

function toStripeId(value: string | { id?: string } | null | undefined) {
  if (typeof value === "string") {
    return value;
  }

  return value?.id ?? null;
}
