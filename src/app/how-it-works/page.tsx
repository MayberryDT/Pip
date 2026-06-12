import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Landmark, MessageCircle, PiggyBank } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "How Pip Works",
  description:
    "Pip connects read-only account data, protects savings, and turns the rest into one daily number: Spendable Cash Today.",
  path: "/how-it-works",
});

const steps = [
  {
    icon: Landmark,
    title: "Connect accounts",
    copy: "Pip reads balances and transactions from the accounts you connect. More complete spending data makes the daily number more useful.",
  },
  {
    icon: PiggyBank,
    title: "Protect savings first",
    copy: "You choose a savings cushion, and Pip holds that back before it shows what is usable today.",
  },
  {
    icon: MessageCircle,
    title: "Ask only when needed",
    copy: "The default is one number. If you want detail, ask why the number changed, whether a purchase fits today, or what recent spending did.",
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
              gives you Spendable Cash Today.
            </p>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
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
              <Link
                className="focus-ring inline-flex items-center gap-2 rounded-full text-sm font-bold text-moss hover:text-ink"
                href="/security"
              >
                See the trust boundaries
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6" id="join-beta">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-4xl leading-tight text-ink">Try the daily-number habit.</h2>
            <p className="mt-4 text-base leading-7 text-ink/68">
              Join the beta list and get access when Pip is ready for more testers.
            </p>
            <div className="mt-7">
              <WaitlistForm sourcePage="/how-it-works" compact />
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
