import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PricingCards } from "@/components/marketing/PricingCards";
import {
  SwissFigure,
  SwissKicker,
  SwissRuleList,
  SwissSection,
  SwissText,
  SwissTitle,
} from "@/components/marketing/SwissGrid";
import { marketingAssets } from "@/lib/marketing/assets";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";
import {
  pipPaidTrustLine,
  pipPricing,
  pipPricingIncludedFeatures,
  pipSubscriptionCaveat,
} from "@/lib/marketing/pricing";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Pip Pricing",
  description:
    "Pip plans start at $2.99/week for one daily spending number, read-only account connection, and Ask Pip context.",
  path: "/pricing",
});

const pricingFaq = [
  {
    title: "What do the plans cost?",
    copy: `${pipPricing.weekly.displayPrice} or ${pipPricing.monthly.displayPrice}. Monthly is the better value for people who want Pip as a daily habit.`,
  },
  {
    title: "Why is Pip paid?",
    copy: "Pip uses sensitive money context. The paid model keeps incentives direct: no ads and no selling your financial data.",
  },
  {
    title: "Who is weekly for?",
    copy: "Weekly is for people who want the lowest commitment before making Pip a daily habit.",
  },
  {
    title: "Who is monthly for?",
    copy: "Monthly is for people who want the best value and plan to check Pip before spending most days.",
  },
  {
    title: "How are subscriptions managed?",
    copy: pipSubscriptionCaveat,
  },
];

const notPip = [
  "Not a bank account",
  "Not a budgeting command center",
  "Not a spreadsheet",
  "Not financial, tax, legal, investment, or credit advice",
];

export default function PricingPage() {
  return (
    <MarketingLayout>
      <main>
        <SwissSection className="editorial-home-hero pricing-hero" folio="01 / Pricing">
          <div className="col-span-12 lg:col-span-5 lg:row-start-1">
            <SwissKicker>Pricing</SwissKicker>
            <SwissTitle className="mt-5" level={1} size="page">
              Simple pricing for one daily number.
            </SwissTitle>
            <SwissText className="mt-6 text-lg leading-8">
              Pip helps you stop guessing from your bank balance before the next purchase. Plans
              start at {pipPricing.weekly.displayPrice}.
            </SwissText>
          </div>
          <div className="col-span-12 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1">
            <PricingCards eventSource="pricing_page" showIncluded />
          </div>
        </SwissSection>

        <SwissSection folio="02 / Why paid" tone="porcelain">
          <div className="col-span-12 lg:col-span-4">
            <SwissFigure asset={marketingAssets.pricingIllustration} variant="poster" />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <SwissKicker>Why paid</SwissKicker>
            <SwissTitle className="mt-5" size="section">
              Paid on purpose.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <SwissText>{pipPaidTrustLine}</SwissText>
            <SwissText className="mt-5">
              A money app should not need your attention for ads, offers, or data resale. Pip is
              priced as a direct product so the core job can stay simple: one number before you
              spend.
            </SwissText>
            <Link
              className="focus-ring mt-6 inline-flex items-center gap-2 text-sm font-bold text-moss hover:text-ink"
              href="/security"
            >
              Read the security model
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </SwissSection>

        <SwissSection folio="03 / Included">
          <div className="col-span-12 lg:col-span-3">
            <SwissKicker>Included</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              What every plan includes.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-9">
            <SwissRuleList
              className="sm:grid-cols-2 lg:grid-cols-4"
              items={pipPricingIncludedFeatures.map((feature) => ({ title: feature, copy: "" }))}
            />
          </div>
        </SwissSection>

        <SwissSection folio="04 / Boundaries" tone="porcelain">
          <div className="col-span-12 lg:col-span-4">
            <SwissKicker>Boundaries</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              What Pip is not.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-8">
            <SwissRuleList className="sm:grid-cols-2" items={notPip} />
          </div>
        </SwissSection>

        <SwissSection folio="05 / Questions">
          <div className="col-span-12 lg:col-span-3">
            <SwissKicker>FAQ</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              Pricing questions.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-9">
            <SwissRuleList className="md:grid-cols-2" items={pricingFaq} />
          </div>
        </SwissSection>

        <SwissSection folio="06 / Start" tone="ink">
          <div className="col-span-12 lg:col-span-7">
            <SwissTitle size="section">Start with one number before you spend.</SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-9">
            <MarketingCtaLink
              className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 bg-porcelain px-6 text-sm font-bold text-ink transition hover:bg-paper"
              eventLabel="pricing_final_get_pip"
              eventProperties={{ intent: "get_pip" }}
              href={getProductAccessHref()}
            >
              {productAccess.primaryLabel}
              <ArrowRight aria-hidden="true" size={17} />
            </MarketingCtaLink>
          </div>
        </SwissSection>
      </main>
    </MarketingLayout>
  );
}
