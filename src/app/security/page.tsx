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
import { pipPaidTrustLine } from "@/lib/marketing/pricing";
import { pipTrustPolicy } from "@/lib/trust/pip-trust-policy";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Security",
  description:
    "Pip uses read-only account data, keeps provider credentials server-side, cannot move money, and provides a data deletion path.",
  path: "/security",
});

const securityFacts = [
  {
    title: "Read-only account data",
    copy: `${pipTrustPolicy.bankDataProvider.name} provides read-only account and transaction data for Spendable Cash Today. Pip is an insight layer, not a bank account.`,
  },
  {
    title: "No money movement",
    copy: pipTrustPolicy.securityBoundaries[1],
  },
  {
    title: "Server-side credentials",
    copy: "Provider access tokens stay server-side. Browser code receives short-lived connection artifacts only when needed.",
  },
  {
    title: "No bank passwords",
    copy: pipTrustPolicy.securityBoundaries[2],
  },
  {
    title: "No ads or data selling",
    copy: "Pip is paid directly, so the product does not need ads or financial-data resale.",
  },
  {
    title: "Deletion path",
    copy: "You can delete your account from in-app Settings or use the public deletion page if you cannot access the app.",
  },
];

const paidTrustNotes = [
  {
    title: "Direct product model",
    copy: `${pipPaidTrustLine} The pricing model is designed around direct user payment, not ads, lead generation, or selling financial data.`,
  },
  {
    title: "Stored product data",
    copy: pipTrustPolicy.privacyBoundaries[0],
  },
  {
    title: "Provider boundary",
    copy: "Pip does not store bank usernames or passwords. Raw provider payloads should stay minimal and exist only where needed for troubleshooting or normalization.",
  },
  {
    title: "AI boundary",
    copy: `${pipTrustPolicy.aiProvider.role} AI explanations can be incomplete or wrong.`,
  },
  {
    title: "Independent validation",
    copy: pipTrustPolicy.securityBoundaries[4],
  },
  {
    title: "Decision-support signal",
    copy: "Pip is not financial, tax, investment, credit, or legal advice. The number is a decision-support signal from available data.",
  },
];

export default function SecurityPage() {
  return (
    <MarketingLayout showPricingLinks={false}>
      <main>
        <SwissSection className="editorial-home-hero" folio="01 / Security">
          <div className="col-span-12 lg:col-span-7">
            <SwissKicker>Security</SwissKicker>
            <SwissTitle className="mt-5" level={1} size="page">
              Pip should feel cute, not careless.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-3 lg:col-start-10">
            <SwissNumber label="trust boundaries stated before connection">05</SwissNumber>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <SwissText className="text-lg leading-8">
              Pip asks for sensitive context, so the public site states the trust boundaries before
              anyone connects accounts.
            </SwissText>
          </div>
          <div className="col-span-12 lg:col-span-8">
            <SwissFigure asset={marketingAssets.securityTrustIllustration} priority variant="wide" />
          </div>
        </SwissSection>

        <SwissSection folio="02 / Trust model" tone="porcelain">
          <div className="col-span-12 lg:col-span-3">
            <SwissKicker>Trust model</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              The boundaries are the product.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-9">
            <SwissRuleList className="md:grid-cols-2 lg:grid-cols-5" items={securityFacts} />
          </div>
        </SwissSection>

        <SwissSection folio="03 / Paid trust model">
          <div className="col-span-12 lg:col-span-6">
            <SwissTitle size="section">
              Paid because your data should not be the product.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-6">
            <SwissRuleList className="md:grid-cols-2" items={paidTrustNotes} />
          </div>
          <div className="col-span-12 flex flex-wrap gap-3 lg:col-span-6 lg:col-start-7">
            <Link
              className="focus-ring inline-flex min-h-11 items-center gap-2 bg-ink px-5 text-sm font-bold text-porcelain hover:bg-moss"
              href={pipTrustPolicy.publicLinks.howNumberWorks}
            >
              How the number works
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <Link
              className="focus-ring inline-flex min-h-11 items-center border border-line bg-porcelain px-5 text-sm font-bold text-ink hover:border-moss"
              href="/privacy"
            >
              Read privacy
            </Link>
            <Link
              className="focus-ring inline-flex min-h-11 items-center border border-line bg-porcelain px-5 text-sm font-bold text-ink hover:border-moss"
              href="/terms"
            >
              Read terms
            </Link>
          </div>
        </SwissSection>

        <SwissSection folio="04 / Start" tone="ink">
          <div className="col-span-12 lg:col-span-7">
            <SwissTitle size="section">
              Check one number without giving Pip control of your money.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-9">
            <MarketingCtaLink
              className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 bg-porcelain px-6 text-sm font-bold text-ink hover:bg-paper"
              eventLabel="security_get_pip"
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
