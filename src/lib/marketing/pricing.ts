export const pipLaunch = {
  status: "prelaunchPaid",
  primaryCta: "Get launch access",
  primaryCtaShort: "Get access",
  appStoreLine: "Coming to iPhone and Android.",
  productSentence: "One daily number before you spend.",
  trialLine: "Try Pip when it launches. Plans start at $2.99/week.",
};

export const pipPricing = {
  weekly: {
    id: "weekly",
    label: "Weekly",
    price: "$2.99",
    period: "week",
    displayPrice: "$2.99/week",
    tagline: "Start small",
    description: "For people who want the lowest commitment.",
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
    recommended: true,
  },
} as const;

export const pipPricingPlans = [pipPricing.weekly, pipPricing.monthly] as const;

export const pipPricingIncludedFeatures = [
  "Spendable Cash Today",
  "Read-only account connection",
  "Savings cushion",
  "Ask Pip why the number changed",
  "Purchase checks",
  "Account management",
  "Financial reads",
  "Daily number updates",
] as const;

export const pipPaidTrustLine =
  "Pip is paid because your money data should not be the product.";

export const pipSubscriptionCaveat =
  "Subscriptions will be managed through the app stores when Pip launches.";
