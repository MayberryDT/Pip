import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CreditCard, Landmark, MessageCircle, PiggyBank } from "lucide-react";
import { LaunchAccessForm } from "@/components/marketing/LaunchAccessForm";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { pipLaunch, pipPricing } from "@/lib/marketing/pricing";

export const metadata: Metadata = buildMarketingMetadata({
  title: "How Pip Works",
  description:
    "Choose a plan, connect read-only account data, pick a savings cushion, and check one daily number before you spend.",
  path: "/how-it-works",
});

const steps = [
  {
    icon: CreditCard,
    title: "Choose a plan",
    copy: `Start with weekly or monthly access when Pip launches. Plans start at ${pipPricing.weekly.displayPrice}.`,
  },
  {
    icon: Landmark,
    title: "Connect accounts",
    copy: "Pip reads balances and transactions from the accounts you connect. More complete spending data makes the daily number more useful.",
  },
  {
    icon: PiggyBank,
    title: "Pick a cushion",
    copy: "Choose the savings cushion Pip should protect before it shows what is usable today.",
  },
  {
    icon: MessageCircle,
    title: "Check one number",
    copy: "Open Pip, see Spendable Cash Today, and ask for detail only when you want the why.",
  },
];

export default function HowItWorksPage() {
  return (
    <MarketingLayout>
      <main>
        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-normal text-moss">How it works</p>
            <h1 className="font-display mt-4 text-5xl leading-[1] text-ink sm:text-6xl">
              Pip turns money noise into one daily number.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/70">
              Your bank balance shows what exists. Pip holds back the money already spoken for and
              gives you Spendable Cash Today before the next purchase.
            </p>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-4">
            {steps.map((step, index) => {
              const Icon = step.icon;

              return (
                <article className="rounded-[0.5rem] border border-line bg-paper p-6" key={step.title}>
                  <div className="flex items-center justify-between">
                    <Icon aria-hidden="true" className="text-moss" size={28} />
                    <span className="text-sm font-bold text-taupe">0{index + 1}</span>
                  </div>
                  <h2 className="mt-6 text-2xl font-bold leading-tight text-ink">{step.title}</h2>
                  <p className="mt-4 text-sm leading-6 text-ink/66">{step.copy}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.8fr_1fr]">
            <h2 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
              The product is intentionally small.
            </h2>
            <div className="space-y-5 text-base leading-8 text-ink/70">
              <p>
                Pip is not trying to make you manage a dashboard or spreadsheet. The default
                behavior is one daily signal and a simple way to ask for context.
              </p>
              <p>
                If you want to inspect balances or transactions, ask Pip. They are not the default
                screen because the default screen should shape the next spending decision.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-porcelain hover:bg-moss"
                  href="/pricing"
                >
                  See pricing
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
                <Link
                  className="focus-ring inline-flex min-h-11 items-center rounded-full border border-line bg-porcelain px-5 text-sm font-bold text-ink hover:border-moss"
                  href="/security"
                >
                  See trust boundaries
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6" id="launch-access">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-4xl leading-tight text-ink">Try the daily-number habit.</h2>
            <p className="mt-4 text-base leading-7 text-ink/68">
              {pipLaunch.trialLine} {pipLaunch.appStoreLine}
            </p>
            <div className="mt-7">
              <LaunchAccessForm sourcePage="/how-it-works" compact />
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
