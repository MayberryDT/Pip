import { productAccess } from "@/lib/marketing/product-access";

export const pipProductAccess = productAccess;

export const pipPricing = {
  monthly: {
    id: "monthly",
    label: "Monthly",
    price: "$7.99",
    period: "month",
    displayPrice: "$7.99/month",
    tagline: "One simple price",
    description: "For people who want Pip as a daily spending habit.",
  },
} as const;

export const pipPricingPlans = [pipPricing.monthly] as const;

export const pipPricingIncludedFeatures = [
  "Spendable Cash Today",
  "Read-only account connection",
  "Monthly savings",
  "Ask Pip why the number changed",
  "Purchase checks",
  "Account management",
  "Financial reads",
  "Daily number updates",
] as const;

export const pipPaidTrustLine =
  "Pip is paid because your money data should not be the product.";

export const pipSubscriptionCaveat =
  "One monthly subscription. Cancel where you subscribed.";
