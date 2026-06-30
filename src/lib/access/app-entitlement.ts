import type { SubscriptionAccessSummary } from "@/lib/billing/billing-repository";
import { isSubscriptionActive } from "@/lib/billing/billing-repository";
import type { AppAccessGrant } from "@/lib/data/app-access-grants";

export type AppEntitlementSummary = {
  hasAccess: boolean;
  source: "manual_grant" | "subscription" | null;
  billingRequired: boolean;
  grant: AppAccessGrant | null;
  subscription: SubscriptionAccessSummary | null;
};

export function summarizeAppEntitlement(input: {
  grant: AppAccessGrant | null;
  subscription: SubscriptionAccessSummary | null;
}): AppEntitlementSummary {
  if (input.grant) {
    return {
      hasAccess: true,
      source: "manual_grant",
      billingRequired: false,
      grant: input.grant,
      subscription: input.subscription,
    };
  }

  if (isSubscriptionActive(input.subscription)) {
    return {
      hasAccess: true,
      source: "subscription",
      billingRequired: false,
      grant: input.grant,
      subscription: input.subscription,
    };
  }

  return {
    hasAccess: false,
    source: null,
    billingRequired: true,
    grant: input.grant,
    subscription: input.subscription,
  };
}
