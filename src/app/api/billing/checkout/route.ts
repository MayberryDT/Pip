import { createStripeClient } from "@/lib/billing/stripe-client";
import { getBillingConfig, StripeBillingConfigError } from "@/lib/billing/stripe-config";
import { loadBillingCustomerForUser, upsertBillingCustomer } from "@/lib/billing/billing-repository";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return sensitiveJson({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const billing = getBillingConfig();

    if (billing.mode === "off") {
      return sensitiveJson({ error: "Billing is not enabled." }, { status: 503 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return sensitiveJson({ error: "Authentication required." }, { status: 401 });
    }

    if (!user.email) {
      return sensitiveJson({ error: "Billing requires an account email." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const stripe = createStripeClient(billing);
    const existingCustomer = await loadBillingCustomerForUser(admin, user.id);
    let stripeCustomerId = existingCustomer?.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });

      stripeCustomerId = customer.id;
      await upsertBillingCustomer(admin, {
        userId: user.id,
        email: user.email,
        stripeCustomerId,
      });
    }

    const siteUrl = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [
        {
          price: billing.monthlyPriceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/app?billing=success`,
      cancel_url: `${siteUrl}/app?billing=cancelled`,
      client_reference_id: user.id,
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
        },
      },
      metadata: {
        supabase_user_id: user.id,
      },
    });

    return sensitiveJson({ url: session.url });
  } catch (error) {
    if (error instanceof StripeBillingConfigError) {
      return sensitiveJson({ error: "Billing is not enabled." }, { status: 503 });
    }

    if (error instanceof SupabaseConfigError) {
      return sensitiveJson({ error: error.message }, { status: 500 });
    }

    console.error("[billing-checkout] Checkout session creation failed", error);
    return sensitiveJson({ error: "Checkout session creation failed." }, { status: 500 });
  }
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}
