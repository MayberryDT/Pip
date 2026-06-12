import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeDollarSign, ShieldCheck, Sparkles } from "lucide-react";
import { LaunchAccessForm } from "@/components/marketing/LaunchAccessForm";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PricingCards } from "@/components/marketing/PricingCards";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import {
  pipLaunch,
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
    question: "What do the plans cost?",
    answer: `${pipPricing.weekly.displayPrice} or ${pipPricing.monthly.displayPrice}. The monthly plan is the better value for people who want Pip as a daily habit.`,
  },
  {
    question: "What is included?",
    answer:
      "Spendable Cash Today, read-only account connection, savings cushion support, Ask Pip explanations, purchase checks, account management, financial reads, and daily number updates.",
  },
  {
    question: "Why is Pip paid?",
    answer:
      "Pip uses sensitive money context. The paid model keeps incentives direct: no ads and no selling your financial data.",
  },
  {
    question: "How will subscriptions be managed?",
    answer: pipSubscriptionCaveat,
  },
];

export default function PricingPage() {
  return (
    <MarketingLayout>
      <main>
        <section className="px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[0.78fr_1fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-normal text-moss">Pricing</p>
              <h1 className="font-display mt-4 text-5xl leading-[1] text-ink sm:text-6xl">
                Simple pricing for one daily number.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/70">
                Pip helps you stop guessing from your bank balance before the next purchase. Plans
                start at {pipPricing.weekly.displayPrice}.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="rounded-full border border-line bg-porcelain px-3 py-1 text-sm font-bold text-moss">
                  {pipLaunch.appStoreLine}
                </span>
                <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm font-bold text-ink">
                  {pipPricing.monthly.displayPrice} best value
                </span>
              </div>
            </div>
            <PricingCards eventSource="pricing_page" showIncluded />
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.8fr_1fr]">
            <div>
              <BadgeDollarSign aria-hidden="true" className="text-moss" size={30} />
              <h2 className="font-display mt-4 text-4xl leading-tight text-ink sm:text-5xl">
                Paid on purpose.
              </h2>
            </div>
            <div className="space-y-5 text-base leading-8 text-ink/70">
              <p>{pipPaidTrustLine}</p>
              <p>
                A money app should not need your attention for ads, offers, or data resale. Pip is
                priced as a direct product so the core job can stay simple: one number before you
                spend.
              </p>
              <Link
                className="focus-ring inline-flex items-center gap-2 rounded-full text-sm font-bold text-moss hover:text-ink"
                href="/security"
              >
                Read the security model
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <Sparkles aria-hidden="true" className="text-gold" size={28} />
              <h2 className="font-display mt-4 text-4xl leading-tight text-ink sm:text-5xl">
                What every plan includes.
              </h2>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {pipPricingIncludedFeatures.map((feature) => (
                <div className="rounded-[0.5rem] border border-line bg-porcelain p-5" key={feature}>
                  <ShieldCheck aria-hidden="true" className="text-moss" size={20} />
                  <p className="mt-3 text-sm font-bold leading-6 text-ink">{feature}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-4xl leading-tight text-ink sm:text-5xl">Pricing FAQ</h2>
            <div className="mt-8 divide-y divide-line rounded-[0.5rem] border border-line bg-paper">
              {pricingFaq.map((item) => (
                <div className="p-5" key={item.question}>
                  <h3 className="text-lg font-bold text-ink">{item.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink/66">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6" id="launch-access">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-4xl leading-tight text-ink">Get launch access.</h2>
            <p className="mt-4 text-base leading-7 text-ink/68">
              {pipLaunch.productSentence} {pipLaunch.appStoreLine}
            </p>
            <div className="mt-7">
              <LaunchAccessForm sourcePage="/pricing" compact />
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
