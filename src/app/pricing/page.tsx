import type { Metadata } from "next";
import { headers } from "next/headers";
import AndroidAccessPage from "@/app/android-access/page";
import { PricingPageContent } from "@/components/marketing/PricingPageContent";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { isAndroidAppShellUserAgent } from "@/lib/platform/android-shell";

const pricingMetadata: Metadata = buildMarketingMetadata({
  title: "Pip Pricing",
  description:
    "Pip costs $7.99/month for one daily spending number, read-only account connection, and Ask Pip context.",
  path: "/pricing",
});

const androidAccessMetadata: Metadata = buildMarketingMetadata({
  title: "Android test access",
  description: "Android test access status for the Pip Google Play build.",
  path: "/android-access",
});

export async function generateMetadata(): Promise<Metadata> {
  return (await isAndroidPricingRequest()) ? androidAccessMetadata : pricingMetadata;
}

export default async function PricingPage() {
  if (await isAndroidPricingRequest()) {
    return <AndroidAccessPage />;
  }

  return <PricingPageContent />;
}

async function isAndroidPricingRequest(): Promise<boolean> {
  const requestHeaders = await headers();

  return isAndroidAppShellUserAgent(requestHeaders.get("user-agent"));
}
