import { createStripeClient } from "@/lib/billing/stripe-client";
import { getBillingConfig, StripeBillingConfigError } from "@/lib/billing/stripe-config";
import { loadBillingCustomerForUser } from "@/lib/billing/billing-repository";
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

    const admin = createSupabaseAdminClient();
    const billingCustomer = await loadBillingCustomerForUser(admin, user.id);

    if (!billingCustomer?.stripe_customer_id) {
      return sensitiveJson({ error: "No billing customer exists for this account." }, { status: 404 });
    }

    const stripe = createStripeClient(billing);
    const siteUrl = getSiteUrl();
    const session = await stripe.billingPortal.sessions.create({
      customer: billingCustomer.stripe_customer_id,
      return_url: `${siteUrl}/app?billing=portal-return`,
    });

    return sensitiveJson({ url: session.url });
  } catch (error) {
    if (error instanceof StripeBillingConfigError) {
      return sensitiveJson({ error: "Billing is not enabled." }, { status: 503 });
    }

    if (error instanceof SupabaseConfigError) {
      return sensitiveJson({ error: error.message }, { status: 500 });
    }

    console.error("[billing-portal] Customer Portal session creation failed", error);
    return sensitiveJson({ error: "Customer Portal session creation failed." }, { status: 500 });
  }
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}
