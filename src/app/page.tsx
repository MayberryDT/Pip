import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Landmark,
  MessageCircle,
  PiggyBank,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PipSays } from "@/components/marketing/PipSays";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import { JsonLd } from "@/components/marketing/ArticleComponents";
import { getPublishedArticles } from "@/lib/marketing/content";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/marketing/structured-data";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Pip",
  description:
    "Pip is a cute daily money companion that shows Spendable Cash Today, one calm number for what's actually okay to use today. No budget. No dashboard.",
  path: "/",
});

const howItWorks = [
  {
    title: "Connect accounts",
    copy: "Pip reads balances and transactions through a read-only connection.",
  },
  {
    title: "Pick a savings cushion",
    copy: "Choose what you want Pip to hold back before showing today's number.",
  },
  {
    title: "Check the daily number",
    copy: "Open Pip, see Spendable Cash Today, and spend around that number.",
  },
];

const dailyNumberPoints = [
  {
    title: "Bills held back",
    copy: "Money with another job should not look like open room.",
    icon: ReceiptText,
  },
  {
    title: "Savings cushion protected",
    copy: "Pip keeps your chosen cushion out of the daily spending signal.",
    icon: PiggyBank,
  },
  {
    title: "Recent spending included",
    copy: "The number can react when spending pressure changes.",
    icon: Landmark,
  },
];

const answerChips = [
  "Why did today's number change?",
  "Can I spend $50?",
  "What lowered it?",
  "What's coming up?",
  "Why is it $0 today?",
  "What account is missing?",
];

const trustFacts = [
  "Read-only account connection",
  "Pip cannot move money",
  "Provider credentials stay server-side",
  "Delete your financial data",
];

const featuredBlogSlugs = [
  "meet-pip-cute-money-companion",
  "why-your-bank-balance-is-misleading",
  "what-is-spendable-cash-today",
];

export default function MarketingHomePage() {
  const articles = getPublishedArticles();
  const featuredArticles = featuredBlogSlugs
    .map((slug) => articles.find((article) => article.slug === slug))
    .filter((article): article is (typeof articles)[number] => Boolean(article));

  return (
    <MarketingLayout>
      <JsonLd data={buildOrganizationJsonLd()} />
      <JsonLd data={buildWebSiteJsonLd()} />
      <main>
        <section className="px-4 pb-20 pt-12 sm:px-6 lg:pb-28 lg:pt-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-normal text-moss">Meet Pip</p>
              <h1 className="font-display mt-4 max-w-3xl text-5xl leading-[0.98] text-ink sm:text-6xl lg:text-7xl">
                Before you spend, check Pip.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/70">
                Pip gives you one calm daily number: Spendable Cash Today.
              </p>
              <p className="mt-4 max-w-2xl text-base leading-7 text-ink/66">
                It helps you stop guessing from your bank balance without building a budget,
                spreadsheet, or finance dashboard.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <MarketingCtaLink
                  className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-sm font-bold text-porcelain shadow-soft transition hover:bg-moss"
                  eventLabel="home_hero_join_beta"
                  href="#join-beta"
                >
                  Join the beta
                  <ArrowRight aria-hidden="true" size={17} />
                </MarketingCtaLink>
                <MarketingCtaLink
                  className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-porcelain px-6 text-sm font-bold text-ink transition hover:border-moss"
                  eventLabel="home_hero_how_it_works"
                  href="/how-it-works"
                >
                  See how Pip works
                </MarketingCtaLink>
              </div>
              <p className="mt-4 text-sm font-bold text-ink/58">
                Read-only account data. Pip cannot move your money.
              </p>
            </div>
            <div className="relative mx-auto w-full max-w-[25rem] pt-8">
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
                      <span className="rounded-full bg-moss/10 px-3 py-1 text-xs font-bold text-moss">Today</span>
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
                      <p className="mt-2 text-sm leading-6 text-ink/64">Why did today's number change?</p>
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
                className="absolute -bottom-8 -left-7 h-40 w-auto object-contain drop-shadow-[0_18px_28px_rgba(60,50,40,0.12)] sm:h-48"
              />
            </div>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <h2 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
                Your bank app shows the pile. Pip shows the spending number.
              </h2>
              <p className="mt-5 text-base leading-8 text-ink/70">
                A balance can look like permission. Pip holds back bills, savings, and recent
                spending pressure before showing what's actually useful today.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
              <article className="rounded-[0.5rem] border border-line bg-paper p-6">
                <p className="text-sm font-bold uppercase tracking-normal text-taupe">Bank balance</p>
                <p className="font-display mt-4 text-6xl leading-none text-ink">$1,247</p>
                <p className="mt-5 text-base font-bold text-ink">Looks like plenty.</p>
                <p className="mt-2 text-sm leading-6 text-ink/64">
                  But rent, subscriptions, and card spending may already be waiting.
                </p>
              </article>
              <div className="flex items-center justify-center text-sm font-bold uppercase tracking-normal text-moss md:px-2">
                Instead
              </div>
              <article className="rounded-[0.5rem] border border-moss/30 bg-moss/10 p-6">
                <p className="text-sm font-bold uppercase tracking-normal text-moss">Spendable Cash Today</p>
                <p className="font-display mt-4 text-6xl leading-none text-ink">$84</p>
                <p className="mt-5 text-base font-bold text-ink">Room for today.</p>
                <p className="mt-2 text-sm leading-6 text-ink/64">
                  After bills, savings, and your recent spending pattern are considered.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 lg:py-16">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.92fr_1fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-normal text-moss">The daily number</p>
              <h2 className="font-display mt-3 text-4xl leading-tight text-ink sm:text-5xl">
                One number for the daily spending moment.
              </h2>
              <p className="mt-5 text-base leading-8 text-ink/70">
                Most overspending does not start with a spreadsheet. It starts with one small
                decision: lunch, a cart, a night out, a quick "I probably have enough." Pip gives
                you a calmer default before that moment.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {dailyNumberPoints.map((point) => {
                const Icon = point.icon;

                return (
                  <article className="rounded-[0.5rem] border border-line bg-porcelain p-5" key={point.title}>
                    <Icon aria-hidden="true" className="text-moss" size={24} />
                    <h3 className="mt-4 text-base font-bold text-ink">{point.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink/66">{point.copy}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-paper px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.72fr_1fr]">
            <div className="relative mx-auto w-full max-w-xs">
              <img
                src="/brand/pip-waving.png"
                alt="Pip waving"
                width={416}
                height={484}
                loading="lazy"
                decoding="async"
                className="mx-auto h-64 w-auto object-contain drop-shadow-[0_18px_28px_rgba(60,50,40,0.12)]"
              />
            </div>
            <div>
              <Sparkles aria-hidden="true" className="text-gold" size={28} />
              <h2 className="font-display mt-4 text-4xl leading-tight text-ink sm:text-5xl">
                A tiny companion makes money feel less heavy.
              </h2>
              <p className="mt-5 text-base leading-8 text-ink/70">
                Pip is intentionally soft. Checking money should not feel like opening a judgment
                machine. Pip gives a small daily signal, reacts calmly, and lets you ask for more
                only when you want it.
              </p>
              <div className="mt-7 max-w-2xl">
                <PipSays compact>Your balance is real. It's just not all open room.</PipSays>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 lg:py-16" id="how-it-works">
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

        <section className="bg-porcelain px-4 py-12 sm:px-6 lg:py-14">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1fr]">
            <div>
              <MessageCircle aria-hidden="true" className="text-river" size={30} />
              <h2 className="font-display mt-4 text-4xl leading-tight text-ink sm:text-5xl">
                Ask when you want the why.
              </h2>
              <p className="mt-5 text-base leading-8 text-ink/70">
                The number comes first. The explanation is there when you ask.
              </p>
            </div>
            <div className="flex flex-wrap content-start gap-3">
              {answerChips.map((chip) => (
                <span className="rounded-full border border-line bg-paper px-4 py-2 text-sm font-bold text-ink/72" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 lg:py-16">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.8fr_1fr]">
            <div>
              <ShieldCheck aria-hidden="true" className="text-moss" size={32} />
              <h2 className="font-display mt-4 text-4xl leading-tight text-ink sm:text-5xl">
                Cute does not mean careless.
              </h2>
              <p className="mt-5 text-base leading-8 text-ink/70">
                Pip uses read-only account data. It cannot move your money. Provider credentials
                stay server-side. You can delete stored financial data before leaving the beta.
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

        <section className="bg-porcelain px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <HelpCircle aria-hidden="true" className="text-gold" size={28} />
              <h2 className="font-display mt-4 text-4xl leading-tight text-ink sm:text-5xl">
                Tiny money habits, no homework.
              </h2>
              <p className="mt-5 text-base leading-8 text-ink/70">
                Read about bank-balance guessing, daily spending signals, cute finance design, and
                why one number can work better than a budget for everyday behavior.
              </p>
            </div>
            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {featuredArticles.map((article) => (
                <article className="rounded-[0.5rem] border border-line bg-paper p-5" key={article.slug}>
                  <p className="text-xs font-bold uppercase tracking-normal text-moss">{article.tags[0]}</p>
                  <h3 className="font-display mt-3 text-2xl leading-tight text-ink">
                    <Link className="focus-ring rounded hover:text-moss" href={`/blog/${article.slug}`}>
                      {article.title}
                    </Link>
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-ink/66">{article.description}</p>
                </article>
              ))}
            </div>
            <Link
              className="focus-ring mt-7 inline-flex items-center gap-2 rounded-full text-sm font-bold text-moss hover:text-ink"
              href="/blog"
            >
              Read the Pip blog
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:py-20" id="join-beta">
          <div className="mx-auto max-w-4xl rounded-[0.5rem] border border-line bg-porcelain p-6 text-center shadow-soft sm:p-9">
            <h2 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
              Stop guessing from your bank balance.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-ink/68">
              Join the beta and try the daily number before Pip comes to the App Store and Google
              Play.
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
