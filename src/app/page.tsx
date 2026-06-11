import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import { JsonLd } from "@/components/marketing/ArticleComponents";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/marketing/structured-data";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Pip",
  description:
    "Pip is a cute daily money companion that shows what is actually okay to use today. No budget. No dashboard. Just one number.",
  path: "/",
});

const howItWorks = [
  {
    title: "Connect your accounts",
    copy: "Pip reads account and transaction data so the daily number is based on what is really happening.",
  },
  {
    title: "Pick a cushion",
    copy: "Protect savings first, then let Pip hold back bills, recent spending pressure, and uneven timing.",
  },
  {
    title: "Check one number",
    copy: "Open Pip, see Spendable Cash Today, ask for detail only when you want it, and move on.",
  },
];

const trustFacts = [
  "Read-only account connection",
  "No money movement",
  "Provider credentials stay server-side",
  "Delete-data path before leaving beta",
];

const faqs = [
  {
    question: "What is Spendable Cash Today?",
    answer:
      "It is Pip's daily spending signal: the amount that is actually okay to use today after bills, savings cushion, and recent spending pressure are considered.",
  },
  {
    question: "Is Pip a budget app?",
    answer:
      "No. Pip does not ask you to maintain categories, decode charts, or manage a spreadsheet. The default experience is one number and a simple chat input.",
  },
  {
    question: "Does Pip move my money?",
    answer: "No. Pip is a read-only insight layer for the beta. It does not initiate payments or transfers.",
  },
  {
    question: "Why is my bank balance different?",
    answer:
      "Your bank balance shows what exists. Pip tries to show what remains usable today after money that is already spoken for is held back.",
  },
  {
    question: "Is Pip in the App Store?",
    answer:
      "Not yet. App Store and Google Play versions are planned later. Beta testers can try Pip on the web first.",
  },
];

export default function MarketingHomePage() {
  return (
    <MarketingLayout>
      <JsonLd data={buildOrganizationJsonLd()} />
      <JsonLd data={buildWebSiteJsonLd()} />
      <main>
        <section className="px-4 pb-16 pt-10 sm:px-6 lg:pb-20 lg:pt-16">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_0.86fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-normal text-moss">Meet Pip</p>
              <h1 className="font-display mt-4 max-w-3xl text-5xl leading-[0.98] text-ink sm:text-6xl lg:text-7xl">
                The number your bank won't show you.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/70">
                Pip is a cute daily money companion that shows what's actually okay to use today.
                No budget. No dashboard. Just one number.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-sm font-bold text-porcelain shadow-soft transition hover:bg-moss"
                  href="#join-beta"
                >
                  Join the beta
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
                <Link
                  className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-porcelain px-6 text-sm font-bold text-ink transition hover:border-moss"
                  href="/how-it-works"
                >
                  See how Pip works
                </Link>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[25rem]">
              <div className="rounded-[2.25rem] border border-line bg-ink p-3 shadow-soft">
                <div className="overflow-hidden rounded-[1.7rem] bg-paper">
                  <div className="px-6 pb-7 pt-5">
                    <div className="flex items-center justify-between">
                      <img
                        src="/brand/pip-wordmark.png"
                        alt="Pip"
                        width={212}
                        height={177}
                        loading="eager"
                        decoding="async"
                        className="h-10 w-auto object-contain"
                      />
                      <img
                        src="/brand/pip-profile-clean.png"
                        alt=""
                        aria-hidden="true"
                        width={64}
                        height={64}
                        loading="eager"
                        decoding="async"
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    </div>
                    <p className="font-display mt-10 text-center text-xl font-semibold text-ink/68">
                      Spendable Cash Today
                    </p>
                    <p className="font-display mt-4 text-center text-[6rem] leading-none text-ink">$84</p>
                    <p className="mx-auto mt-5 max-w-[17rem] text-center text-sm font-semibold leading-6 text-ink/62">
                      That's your room for today after bills and savings.
                    </p>
                    <div className="mt-7 rounded-[0.5rem] border border-line bg-porcelain p-4">
                      <p className="text-sm font-bold text-ink">Ask Pip</p>
                      <p className="mt-2 text-sm leading-6 text-ink/64">
                        Why did today's number change?
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <img
                src="/brand/pip-waving.png"
                alt=""
                aria-hidden="true"
                width={416}
                height={484}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="absolute -bottom-10 -left-8 h-36 w-auto object-contain drop-shadow-[0_18px_28px_rgba(60,50,40,0.12)] sm:h-44"
              />
            </div>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.86fr_1fr]">
            <h2 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
              Your bank balance is not your spending number.
            </h2>
            <div className="space-y-5 text-base leading-8 text-ink/70">
              <p>
                Your bank app shows the pile of money. It does not show what bills, savings, and
                recent spending have already claimed.
              </p>
              <p>
                Pip gives you the number that matters today. Open Pip. See today's number. Spend
                around it. Move on.
              </p>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6" id="how-it-works">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-normal text-moss">How it works</p>
              <h2 className="font-display mt-3 text-4xl leading-tight text-ink sm:text-5xl">
                Three steps. One daily signal.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {howItWorks.map((step, index) => (
                <article className="rounded-[0.5rem] border border-line bg-porcelain p-6" key={step.title}>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-moss text-sm font-bold text-porcelain">
                    {index + 1}
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-ink">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-ink/66">{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1fr_0.8fr]">
            <div>
              <Sparkles aria-hidden="true" className="text-gold" size={28} />
              <h2 className="font-display mt-4 text-4xl leading-tight text-ink sm:text-5xl">
                A little money companion that checks the math for you.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-ink/70">
                Pip is not here to lecture you. Pip gives you one calm number every day, then lets
                you ask for details only when you want them.
              </p>
            </div>
            <div className="rounded-[0.5rem] border border-line bg-paper p-6">
              <MessageCircle aria-hidden="true" className="text-river" size={28} />
              <h3 className="mt-4 text-xl font-bold text-ink">No spreadsheet energy.</h3>
              <p className="mt-3 text-sm leading-6 text-ink/66">
                No categories to maintain. No charts to decode. Pip learns your pattern and gives
                you one number.
              </p>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.8fr_1fr]">
            <div>
              <ShieldCheck aria-hidden="true" className="text-moss" size={32} />
              <h2 className="font-display mt-4 text-4xl leading-tight text-ink sm:text-5xl">
                Trust boundaries in plain English.
              </h2>
              <p className="mt-5 text-base leading-8 text-ink/70">
                Pip uses read-only account data. It cannot move your money. You can ask Pip to
                delete stored financial data before leaving the beta.
              </p>
              <Link
                className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full text-sm font-bold text-moss hover:text-ink"
                href="/security"
              >
                Read security details
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {trustFacts.map((fact) => (
                <div className="rounded-[0.5rem] border border-line bg-porcelain p-5" key={fact}>
                  <CheckCircle2 aria-hidden="true" className="text-moss" size={20} />
                  <p className="mt-3 text-sm font-bold leading-6 text-ink">{fact}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-4xl leading-tight text-ink sm:text-5xl">Questions people ask first.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {faqs.map((item) => (
                <article className="rounded-[0.5rem] border border-line bg-paper p-5" key={item.question}>
                  <h3 className="text-base font-bold text-ink">{item.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink/66">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6" id="join-beta">
          <div className="mx-auto max-w-4xl rounded-[0.5rem] border border-line bg-porcelain p-6 text-center shadow-soft sm:p-9">
            <h2 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
              Stop guessing from your bank balance.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-ink/68">
              App Store and Google Play versions are coming. Beta testers can try Pip on the web
              first.
            </p>
            <div className="mt-8">
              <WaitlistForm sourcePage="/" />
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
