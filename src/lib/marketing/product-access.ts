export type ProductAccessIntent =
  | "get_pip"
  | "open_pip"
  | "view_pricing"
  | "see_how_it_works"
  | "read_security"
  | "read_blog";

export const productAccess = {
  status: "waitlist",
  primaryLabel: "Join waitlist",
  shortLabel: "Join waitlist",
  openLabel: "Join waitlist",
  fallbackHref: "/#waitlist",
  productSentence: "One daily number before you spend.",
  availabilityLine: "Join the email waitlist for app access.",
  appStoreLine: "App access is invite-managed while the native listings are prepared.",
  subscriptionLine: "Subscriptions are managed wherever you start or install Pip.",
} as const;

export function getProductAccessHref() {
  return productAccess.fallbackHref;
}
