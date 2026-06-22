import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Leaf,
  ShieldCheck,
} from "lucide-react";
import { ArticleCard, JsonLd } from "@/components/marketing/ArticleComponents";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PricingCards } from "@/components/marketing/PricingCards";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import { marketingAssets } from "@/lib/marketing/assets";
import { getPublishedArticles } from "@/lib/marketing/content";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";
import { pipPaidTrustLine, pipPricing } from "@/lib/marketing/pricing";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/marketing/structured-data";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Pip",
  description:
    "Pip is a paid daily money companion that shows Spendable Cash Today: one calm number before you spend. One monthly subscription costs $7.99/month.",
  path: "/",
});

const featuredBlogSlug = "meet-pip-cute-money-companion";

const steps = [
  {
    title: "Connect securely",
    copy: "Link read-only accounts so Pip can understand the money coming in and going out.",
  },
  {
    title: "Choose monthly savings",
    copy: "Pick the amount you want held outside everyday spending decisions.",
  },
  {
    title: "Check Pip first",
    copy: "Open one number before the next purchase instead of guessing from your bank balance.",
  },
  {
    title: "Ask for the why",
    copy: "When the number changes, Pip can explain what moved it without turning the app into a dashboard.",
  },
];

const identityProofs = ["Read-only data", "Savings protected", "One daily number"];

const trustProofs = [
  "Read-only data in",
  "Pip calculates",
  "Cannot move money",
  "No ads or data selling",
];

const askPipPrompts = ["Can I spend $50?", "Why did today change?", "What's coming up?"];

const askPipConversation = [
  {
    speaker: "You",
    body: "Can I spend $50?",
    tone: "user",
  },
  {
    speaker: "Pip",
    body: "After a $50 purchase, today's estimate would be about $84, assuming no missing or pending activity.",
    tone: "pip",
  },
  {
    speaker: "You",
    body: "Why did today change?",
    tone: "user",
  },
  {
    speaker: "Pip",
    body: "Your phone bill posted this morning.",
    tone: "pip",
  },
] as const;

export default function MarketingHomePage() {
  const articles = getPublishedArticles();
  const featuredArticle =
    articles.find((article) => article.slug === featuredBlogSlug) ?? articles[0] ?? null;
  const supportingArticles = articles
    .filter((article) => article.slug !== featuredArticle?.slug)
    .slice(0, 2);

  return (
    <MarketingLayout>
      <JsonLd data={buildOrganizationJsonLd()} />
      <JsonLd data={buildWebSiteJsonLd()} />
      <main className="pip-home">
        <section className="pip-home-section pip-hero-section" data-section="hero">
          <div className="pip-home-wrap pip-hero-grid">
            <div className="pip-copy-stack">
              <p className="pip-pill-label">
                <Bell aria-hidden="true" size={16} />
                Introducing a calmer way to spend
              </p>
              <h1
                className="pip-home-title pip-home-title-hero pip-home-title-lockup"
                aria-label="Before you spend, check Pip."
              >
                <span className="pip-title-line">Before you spend,</span>
                <span className="pip-title-line pip-title-line-accent">check Pip.</span>
              </h1>
              <p className="pip-home-lede">
                Pip gives you Spendable Cash Today: one calm number before the next purchase,
                so you can stop guessing from your bank balance without building a budget.
              </p>
              <div className="pip-action-row">
                <MarketingCtaLink
                  className="pip-button pip-button-primary focus-ring"
                  eventLabel="home_hero_get_pip"
                  eventProperties={{ intent: "get_pip", pricing_shown: true }}
                  href={getProductAccessHref()}
                >
                  {productAccess.primaryLabel}
                  <ArrowRight aria-hidden="true" size={17} />
                </MarketingCtaLink>
                <Link className="pip-button pip-button-secondary focus-ring" href="/how-it-works">
                  See how it works
                </Link>
              </div>
            </div>
            <div className="pip-hero-stage" aria-label="Pip app product scene">
              <div className="pip-stage-glow" aria-hidden="true" />
              <div className="pip-stage-sun" aria-hidden="true" />
              <img
                alt={marketingAssets.homepageHeroProduct.alt}
                className="pip-stage-subject"
                decoding="async"
                fetchPriority="high"
                height={marketingAssets.homepageHeroProduct.height}
                loading="eager"
                src={marketingAssets.homepageHeroProduct.src}
                width={marketingAssets.homepageHeroProduct.width}
              />
              <div className="pip-stage-ground" aria-hidden="true" />
            </div>
          </div>
        </section>

        <section className="pip-home-section pip-section-paper" data-section="balance">
          <div className="pip-home-wrap pip-balance-layout pip-balance-layout-reversed">
            <div className="pip-copy-stack pip-balance-copy">
              <p className="pip-kicker">Balance room</p>
              <h2 className="pip-home-title pip-home-title-section">
                Your balance is not all open room.
              </h2>
              <p className="pip-home-text">
                Your bank app shows what exists. Pip subtracts what already has a job and gives you
                the number to check before the next purchase.
              </p>
            </div>
            <figure className="pip-generated-figure pip-balance-figure">
              <img
                alt={marketingAssets.homepageBalanceRoom.alt}
                decoding="async"
                height={marketingAssets.homepageBalanceRoom.height}
                loading="lazy"
                src={marketingAssets.homepageBalanceRoom.src}
                width={marketingAssets.homepageBalanceRoom.width}
              />
            </figure>
          </div>
        </section>

        <section className="pip-home-section" data-section="habit">
          <div className="pip-home-wrap pip-habit-layout">
              <div className="pip-copy-stack pip-habit-copy">
                <p className="pip-kicker">The habit</p>
                <h2 className="pip-home-title pip-home-title-compact">
                  Same check. Better number.
                </h2>
                <p className="pip-home-text">
                  Most people already have a money habit: open the bank app, look at the balance,
                  and treat it like permission. Pip keeps the habit small but changes the default
                  number.
                </p>
                <p className="pip-home-text">
                  No category lecture. No spreadsheet upkeep. Just a single daily signal that makes
                  the next decision easier.
                </p>
                <div className="pip-habit-chips" aria-label="Habit shift">
                  <span>Same habit</span>
                  <span>Better number</span>
                </div>
              </div>
              <figure className="pip-generated-figure pip-habit-figure">
                <img
                  alt={marketingAssets.homepageHabitShift.alt}
                  decoding="async"
                  height={marketingAssets.homepageHabitShift.height}
                  loading="lazy"
                  src={marketingAssets.homepageHabitShift.src}
                  width={marketingAssets.homepageHabitShift.width}
                />
              </figure>
          </div>
        </section>

        <section className="pip-home-section pip-section-sage" data-section="anti-budget">
          <div className="pip-home-wrap pip-identity-chapter">
            <figure className="pip-story-poster pip-story-poster-anti">
              <img
                alt={marketingAssets.homepageAntiBudget.alt}
                decoding="async"
                height={marketingAssets.homepageAntiBudget.height}
                loading="lazy"
                src={marketingAssets.homepageAntiBudget.src}
                width={marketingAssets.homepageAntiBudget.width}
              />
              <figcaption className="pip-story-overlay pip-story-overlay-center">
                <p className="pip-kicker">Not another budget app</p>
                <h2 className="pip-home-title pip-home-title-section">
                  Pip is <em>not</em> another budget app.
                </h2>
                <p className="pip-home-text">
                  Say goodbye to spreadsheets, category guilt, and complex charts. Clarity should
                  feel calming, not like homework.
                </p>
                <div className="pip-proof-rail" aria-label="Pip proof points">
                  {identityProofs.map((proof) => (
                    <span className="pip-proof-pill" key={proof}>
                      <ShieldCheck aria-hidden="true" size={17} />
                      {proof}
                    </span>
                  ))}
                </div>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="pip-home-section" data-section="how-it-works" id="how-it-works">
          <div className="pip-home-wrap">
            <div className="pip-centered-block">
              <p className="pip-kicker">How it works</p>
              <h2 className="pip-home-title pip-home-title-section">
                Four calm steps to one daily number.
              </h2>
            </div>
            <figure className="pip-generated-figure pip-wide-figure">
              <img
                alt={marketingAssets.homepageHowItWorks.alt}
                decoding="async"
                height={marketingAssets.homepageHowItWorks.height}
                loading="lazy"
                src={marketingAssets.homepageHowItWorks.src}
                width={marketingAssets.homepageHowItWorks.width}
              />
            </figure>
            <div className="pip-step-rule-list" aria-label="Four steps to Spendable Cash Today">
              {steps.map(({ copy, title }, index) => (
                <article className="pip-step-rule" key={title}>
                  <p>{String(index + 1).padStart(2, "0")}</p>
                  <h3>{title}</h3>
                  <span>{copy}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="pip-home-section pip-section-paper" data-section="pricing-trust" id="pricing">
          <div className="pip-home-wrap">
            <div className="pip-conversion-panel">
              <div className="pip-copy-stack pip-conversion-copy">
                <p className="pip-kicker">Pricing</p>
                <h2 className="pip-home-title pip-home-title-compact">
                  Simple pricing for one daily number.
                </h2>
                <p className="pip-home-text">
                  {pipPaidTrustLine} No ads. No selling your financial data.
                </p>
                <PricingCards eventSource="home_pricing" />
              </div>
              <div className="pip-trust-proof" id="security">
                <p className="pip-kicker">Trust</p>
                <h2 className="pip-home-title pip-home-title-compact">
                  Cute does not mean careless.
                </h2>
                <p className="pip-home-text">
                  Read-only connections feed the daily signal. Pip calculates the number, keeps the
                  paid relationship direct, and never turns your data into ads.
                </p>
                <div className="pip-trust-proof-flow" aria-label="How Pip handles account signals">
                  {trustProofs.map((proof, index) => (
                    <div className="pip-trust-proof-node" key={proof}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{proof}</strong>
                    </div>
                  ))}
                </div>
                <Link className="pip-inline-link focus-ring" href="/security">
                  Read security details
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="pip-home-section" data-section="ask-pip" id="ask-pip">
          <div className="pip-home-wrap pip-ask-layout">
            <div className="pip-copy-stack pip-ask-copy">
              <p className="pip-kicker">Ask Pip</p>
              <h2 className="pip-home-title pip-home-title-section">
                Ask Pip about your money.
              </h2>
              <p className="pip-home-text">
                Sometimes you need more than a number. Ask Pip natural questions and get calm,
                context-aware answers without digging through transaction histories.
              </p>
              <div className="pip-chat-prompts" aria-label="Example questions">
                {askPipPrompts.map((prompt) => (
                  <span key={prompt}>{prompt}</span>
                ))}
              </div>
            </div>
            <figure className="pip-generated-figure pip-ask-proof">
              <img
                alt={marketingAssets.homepageAskPip.alt}
                decoding="async"
                height={marketingAssets.homepageAskPip.height}
                loading="lazy"
                src={marketingAssets.homepageAskPip.src}
                width={marketingAssets.homepageAskPip.width}
              />
              <div className="pip-ask-thread" aria-label="Example Ask Pip conversation">
                {askPipConversation.map((message) => (
                  <p className={`pip-ask-bubble pip-ask-bubble-${message.tone}`} key={`${message.speaker}-${message.body}`}>
                    <span>{message.speaker}</span>
                    {message.body}
                  </p>
                ))}
              </div>
            </figure>
          </div>
        </section>

        <section className="pip-home-section pip-section-paper pip-blog-section" data-section="blog" id="blog">
          <div className="pip-home-wrap">
            <div className="pip-blog-editorial-head pip-centered-block">
                <p className="pip-kicker">Pip blog</p>
                <h2 className="pip-home-title pip-home-title-section">
                  Tiny money habits, no homework.
                </h2>
                <p className="pip-home-text">
                  Product-led reads about bank-balance guessing, daily spending signals, cute
                  finance design, and why one number can work better than a budget.
                </p>
                <Link className="pip-inline-link focus-ring" href="/blog">
                  Read the blog
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
            </div>
            <div className="pip-blog-editorial-grid">
              {featuredArticle ? (
                <ArticleCard article={featuredArticle} imageLoading="eager" variant="homeFeatured" />
              ) : null}
              <div className="pip-blog-supporting">
                {supportingArticles.map((article) => (
                  <ArticleCard article={article} imageLoading="eager" key={article.slug} variant="homeCompact" />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pip-home-section pip-final-cta" data-section="final-cta" id="waitlist">
          <div className="pip-home-wrap">
            <figure className="pip-story-poster pip-story-poster-final">
              <img
                alt={marketingAssets.homepageFinalCta.alt}
                decoding="async"
                height={marketingAssets.homepageFinalCta.height}
                loading="lazy"
                src={marketingAssets.homepageFinalCta.src}
                width={marketingAssets.homepageFinalCta.width}
              />
              <figcaption className="pip-story-overlay pip-story-overlay-left pip-final-overlay">
              <Leaf aria-hidden="true" className="pip-final-icon" size={46} strokeWidth={1.5} />
              <h2 className="pip-home-title pip-home-title-hero">
                <span className="pip-title-line">Check Pip </span>
                <span className="pip-title-line">before you spend.</span>
              </h2>
              <p className="pip-home-lede">
                Pip gives you one calm number before the next purchase. One monthly subscription
                costs {pipPricing.monthly.displayPrice}.
              </p>
              <WaitlistForm compact sourcePage="/" />
              <div className="pip-action-row">
                <Link className="pip-button pip-button-secondary focus-ring" href="/pricing">
                  View pricing
                </Link>
              </div>
              <p className="pip-final-proof">One price: {pipPricing.monthly.displayPrice}.</p>
              </figcaption>
            </figure>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
