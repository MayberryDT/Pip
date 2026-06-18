import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import {
  SwissKicker,
  SwissNumber,
  SwissRuleList,
  SwissSection,
  SwissText,
  SwissTitle,
} from "@/components/marketing/SwissGrid";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";
import { pipTrustPolicy } from "@/lib/trust/pip-trust-policy";

export const metadata: Metadata = buildMarketingMetadata({
  title: "How the Number Works",
  description:
    "See how Pip calculates Spendable Cash Today, what data it uses, what can make it stale, and how the in-app trust receipt should be read.",
  path: pipTrustPolicy.publicLinks.howNumberWorks,
});

const inputs = [
  {
    title: "Connected balances",
    copy: "Checking, savings, and card balances are read through connected account data when available.",
  },
  {
    title: "Transactions",
    copy: "Recent deposits, purchases, refunds, transfers, fees, card payments, and recurring-looking items shape the current money picture.",
  },
  {
    title: "Monthly savings",
    copy: "Your chosen monthly savings are held back before the daily number is shown.",
  },
  {
    title: "Visible commitments",
    copy: "Likely recurring obligations and pending committed spend are treated as money already spoken for.",
  },
  {
    title: "Recent spending pace",
    copy: "Current-month everyday spending can pull the number down or lift it when spending is lighter than pattern.",
  },
  {
    title: "Cash reality",
    copy: "Available cash can cap a pattern-based number so the result does not float above visible cash constraints.",
  },
];

const edgeCases = [
  {
    title: "Credit cards",
    copy: "Pip separates purchases from card payments so settlement activity does not double count ordinary spending.",
  },
  {
    title: "Transfers",
    copy: "Transfers between connected accounts are not treated like everyday spending when the data makes the transfer visible.",
  },
  {
    title: "Refunds",
    copy: "Refunds reduce the spend pressure tied to the original spending pattern when they appear in connected data.",
  },
  {
    title: "Pending transactions",
    copy: "Pending committed spend can be held against the number, but authorizations may change before they post.",
  },
  {
    title: "Irregular bills",
    copy: "Annual, quarterly, cash, shared, or manually paid bills may be missed until enough connected evidence exists.",
  },
  {
    title: "Missing accounts",
    copy: "Accounts that are not connected, excluded, stale, revoked, or shared outside Pip can make the number incomplete.",
  },
];

const receiptRows = [
  {
    title: "Data freshness",
    copy: "The app receipt states the latest available provider refresh or says when no sync time is available.",
  },
  {
    title: "Accounts counted",
    copy: "The receipt shows how many active accounts are included in the current money snapshot.",
  },
  {
    title: "Time horizon",
    copy: "The number is a today signal, not a month-end guarantee or a full future-bill forecast.",
  },
  {
    title: "Known limits",
    copy: "Warnings such as missing data, low confidence, pending items, or stale connections are shown with the receipt.",
  },
];

export default function HowTheNumberWorksPage() {
  return (
    <MarketingLayout>
      <main>
        <SwissSection className="editorial-home-hero" folio="01 / Number mechanics">
          <div className="col-span-12 lg:col-span-8">
            <SwissKicker>How the number works</SwissKicker>
            <SwissTitle className="mt-5" level={1} size="page">
              Spendable Cash Today is simple on purpose, not magic.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-3 lg:col-start-10">
            <SwissNumber label="main inputs to the receipt">06</SwissNumber>
          </div>
          <div className="col-span-12 lg:col-span-5">
            <SwissText className="text-lg leading-8">
              {pipTrustPolicy.calculationSummary} The result is decision support from the data Pip
              can see, not a promise that every future obligation is known.
            </SwissText>
          </div>
          <div className="col-span-12 border-t border-line pt-5 lg:col-span-5 lg:col-start-8">
            <p className="text-sm font-black uppercase leading-6 tracking-[0.08em] text-moss">
              The in-app receipt should read like: based on connected data refreshed at a specific
              time, with known limits shown beside the number.
            </p>
          </div>
        </SwissSection>

        <SwissSection folio="02 / Inputs" tone="porcelain">
          <div className="col-span-12 lg:col-span-3">
            <SwissKicker>Inputs</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              What the calculation can see.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-9">
            <SwissRuleList className="md:grid-cols-2 lg:grid-cols-3" items={inputs} />
          </div>
        </SwissSection>

        <SwissSection folio="03 / Common cases">
          <div className="col-span-12 lg:col-span-4">
            <SwissKicker>Common cases</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              How messy data is treated.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-8">
            <SwissRuleList className="md:grid-cols-2" items={edgeCases} />
          </div>
        </SwissSection>

        <SwissSection folio="04 / Trust receipt" tone="porcelain">
          <div className="col-span-12 lg:col-span-4">
            <SwissKicker>Receipt</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              What the app should show beside the number.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-8">
            <SwissRuleList className="md:grid-cols-2" items={receiptRows} />
          </div>
          <div className="col-span-12 flex flex-wrap gap-3 lg:col-span-8 lg:col-start-5">
            <Link
              className="focus-ring inline-flex min-h-11 items-center gap-2 bg-ink px-5 text-sm font-bold text-porcelain hover:bg-moss"
              href="/security"
            >
              Read security
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <Link
              className="focus-ring inline-flex min-h-11 items-center border border-line bg-porcelain px-5 text-sm font-bold text-ink hover:border-moss"
              href="/privacy"
            >
              Read privacy
            </Link>
          </div>
        </SwissSection>

        <SwissSection folio="05 / Start" tone="ink">
          <div className="col-span-12 lg:col-span-7">
            <SwissTitle size="section">Use the number with its receipt, not without context.</SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-9">
            <MarketingCtaLink
              className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 bg-porcelain px-6 text-sm font-bold text-ink transition hover:bg-paper"
              eventLabel="number_works_get_pip"
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
