import { productAccess } from "@/lib/marketing/product-access";

export const pipProductAccess = productAccess;

export const pipPricing = {
  weekly: {
    id: "weekly",
    label: "Weekly",
    price: "$2.99",
    period: "week",
    displayPrice: "$2.99/week",
    tagline: "Start small",
    description: "For people who want the lowest commitment.",
    annualizedLabel: "About $155.48/year if kept weekly",
    recommended: false,
  },
  monthly: {
    id: "monthly",
    label: "Monthly",
    price: "$7.99",
    period: "month",
    displayPrice: "$7.99/month",
    tagline: "Best value",
    description: "For people who want Pip as a daily habit.",
    annualizedLabel: "About $95.88/year if kept monthly",
    recommended: true,
  },
} as const;

export const pipPricingPlans = [pipPricing.weekly, pipPricing.monthly] as const;

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
  "Subscriptions are managed wherever you start or install Pip.";
