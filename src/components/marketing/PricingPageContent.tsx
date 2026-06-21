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
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";
import {
  pipPaidTrustLine,
  pipPricing,
  pipPricingIncludedFeatures,
  pipSubscriptionCaveat,
} from "@/lib/marketing/pricing";
import { pipTrustPolicy } from "@/lib/trust/pip-trust-policy";

const pricingFaq = [
  {
    title: "What does Pip cost?",
    copy: `Pip costs ${pipPricing.monthly.displayPrice}. One price, one way to pay.`,
  },
  {
    title: "Why is Pip paid?",
    copy: "Pip uses sensitive money context. The paid model keeps incentives direct: no ads and no selling your financial data.",
  },
  {
    title: "What is included?",
    copy: "The monthly subscription includes Spendable Cash Today, read-only account connection, monthly savings, Ask Pip, purchase checks, account management, financial reads, and daily number updates.",
  },
  {
    title: "How are subscriptions managed?",
    copy: pipSubscriptionCaveat,
  },
  {
    title: "Is there a trial or refund policy?",
    copy: "Trials, refunds, grace periods, and billing recovery depend on the platform and offer shown when you start the subscription.",
  },
];

const notPip = [
  "Not a bank account",
  "Not a budgeting command center",
  "Not a spreadsheet",
  "Not financial, tax, legal, investment, or credit advice",
];

export function PricingPageContent() {
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
              Pip helps you stop guessing from your bank balance before the next purchase. One
              monthly subscription costs {pipPricing.monthly.displayPrice}.
            </SwissText>
          </div>
          <div className="col-span-12 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1">
            <PricingCards eventSource="pricing_page" />
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
              href={pipTrustPolicy.publicLinks.security}
            >
              Read the security model
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <Link
              className="focus-ring mt-4 inline-flex items-center gap-2 text-sm font-bold text-moss hover:text-ink"
              href={pipTrustPolicy.publicLinks.howNumberWorks}
            >
              Read how the number works
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
