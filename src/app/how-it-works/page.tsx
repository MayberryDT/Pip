import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import {
  SwissFigure,
  SwissKicker,
  SwissNumber,
  SwissRuleList,
  SwissSection,
  SwissText,
  SwissTitle,
} from "@/components/marketing/SwissGrid";
import { marketingAssets } from "@/lib/marketing/assets";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";
import { pipTrustPolicy } from "@/lib/trust/pip-trust-policy";

export const metadata: Metadata = buildMarketingMetadata({
  title: "How Pip Works",
  description:
    "Connect read-only account data, choose a savings cushion, check Spendable Cash Today, and ask Pip when you want the why.",
  path: "/how-it-works",
});

const steps = [
  {
    title: "Connect accounts",
    copy: "Pip reads balances and transactions through a read-only connection.",
  },
  {
    title: "Choose your cushion",
    copy: "Pick the savings cushion Pip should protect before showing today's room.",
  },
  {
    title: "Check one daily number",
    copy: "Open Pip and see Spendable Cash Today before the next purchase.",
  },
  {
    title: "Ask when you want the why",
    copy: "Ask Pip about changes, upcoming bills, missing accounts, or a purchase you are considering.",
  },
];

export default function HowItWorksPage() {
  return (
    <MarketingLayout>
      <main>
        <SwissSection className="editorial-home-hero" folio="01 / How Pip works">
          <div className="col-span-12 lg:col-span-8">
            <SwissKicker>How it works</SwissKicker>
            <SwissTitle className="mt-5" level={1} size="page">
              Pip turns money noise into one daily number.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-3 lg:col-start-10">
            <SwissNumber label="setup steps, then one daily habit">03</SwissNumber>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <SwissText className="text-lg leading-8">
              Your bank balance shows what exists. Pip holds back the money already spoken for and
              gives you Spendable Cash Today before the next purchase.
            </SwissText>
          </div>
          <div className="col-span-12 lg:col-span-8">
            <SwissFigure asset={marketingAssets.howPipWorksSteps} priority variant="wide" />
          </div>
        </SwissSection>

        <SwissSection folio="02 / Setup sequence" tone="porcelain">
          <div className="col-span-12 lg:col-span-3">
            <SwissKicker>Setup</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              Four steps, one default behavior.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-9">
            <SwissRuleList className="md:grid-cols-2 lg:grid-cols-4" items={steps} />
          </div>
        </SwissSection>

        <SwissSection folio="03 / Product boundary">
          <div className="col-span-12 lg:col-span-5">
            <SwissTitle size="section">The product is intentionally small.</SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-7">
            <SwissText>
              Pip is not trying to make you manage a dashboard or spreadsheet. The default behavior
              is one daily signal and a simple way to ask for context.
            </SwissText>
            <SwissText className="mt-5">
              If you want to inspect balances or transactions, ask Pip. They are not the default
              screen because the default screen should shape the next spending decision.
            </SwissText>
            <Link
              className="focus-ring mt-6 inline-flex items-center gap-2 text-sm font-bold text-moss hover:text-ink"
              href={pipTrustPolicy.publicLinks.howNumberWorks}
            >
              Read how the number works
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className="col-span-12 border-t border-line pt-5 lg:col-span-2">
            <p className="text-sm font-black uppercase leading-6 tracking-[0.08em] text-moss">
              The number comes first. The why is there when you ask.
            </p>
          </div>
          <div className="col-span-12 flex flex-wrap gap-3 lg:col-span-6 lg:col-start-7">
            <MarketingCtaLink
              className="focus-ring inline-flex min-h-11 items-center gap-2 bg-ink px-5 text-sm font-bold text-porcelain hover:bg-moss"
              eventLabel="how_it_works_get_pip"
              eventProperties={{ intent: "get_pip" }}
              href={getProductAccessHref()}
            >
              {productAccess.primaryLabel}
              <ArrowRight aria-hidden="true" size={16} />
            </MarketingCtaLink>
            <Link
              className="focus-ring inline-flex min-h-11 items-center border border-line bg-porcelain px-5 text-sm font-bold text-ink hover:border-moss"
              href="/pricing"
            >
              View pricing
            </Link>
          </div>
        </SwissSection>
      </main>
    </MarketingLayout>
  );
}
