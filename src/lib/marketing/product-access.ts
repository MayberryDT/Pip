import { marketingSite } from "@/lib/marketing/site";

export type ProductAccessIntent =
  | "get_pip"
  | "open_pip"
  | "view_pricing"
  | "see_how_it_works"
  | "read_security"
  | "read_blog";

export const productAccess = {
  status: "available",
  primaryLabel: "Get Pip",
  shortLabel: "Get Pip",
  openLabel: "Open Pip",
  fallbackHref: marketingSite.appPath,
  productSentence: "One daily number before you spend.",
  availabilityLine: "Use Pip on the web now.",
  appStoreLine: "App Store and Google Play links can be added when the native listings are ready.",
  subscriptionLine: "Subscriptions are managed wherever you start or install Pip.",
} as const;

export function getProductAccessHref() {
  return productAccess.fallbackHref;
}
