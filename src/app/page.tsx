import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Landmark,
  Leaf,
  MessageCircle,
  PiggyBank,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";
import { ArticleCard, JsonLd } from "@/components/marketing/ArticleComponents";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PricingCards } from "@/components/marketing/PricingCards";
import { marketingAssets } from "@/lib/marketing/assets";
import { getPublishedArticles } from "@/lib/marketing/content";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";
import { pipPaidTrustLine, pipPricing } from "@/lib/marketing/pricing";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/marketing/structured-data";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Pip",
  description:
    "Pip is a paid daily money companion that shows Spendable Cash Today: one calm number before you spend. Plans start at $2.99/week.",
  path: "/",
});

const featuredBlogSlugs = [
  "meet-pip-cute-money-companion",
  "why-your-bank-balance-is-misleading",
  "what-is-spendable-cash-today",
];

const steps = [
  {
    title: "Connect securely",
    copy: "Link read-only accounts so Pip can understand the money coming in and going out.",
    Icon: Landmark,
  },
  {
    title: "Protect the cushion",
    copy: "Pick the amount you want held outside everyday spending decisions.",
    Icon: PiggyBank,
  },
  {
    title: "Check Pip first",
    copy: "Open one number before the next purchase instead of guessing from your bank balance.",
    Icon: SearchCheck,
  },
  {
    title: "Ask for the why",
    copy: "When the number changes, Pip can explain what moved it without turning the app into a dashboard.",
    Icon: MessageCircle,
  },
];

const trustFacts = [
  "Read-only account data",
  "Pip cannot move money",
  "No ads",
  "No selling your financial data",
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
      <main className="pip-home">
        <section className="pip-home-section pip-hero-section">
          <div className="pip-home-wrap pip-hero-grid">
            <div className="pip-copy-stack">
              <p className="pip-pill-label">
                <Bell aria-hidden="true" size={16} />
                Introducing a calmer way to spend
              </p>
              <h1 className="pip-home-title pip-home-title-hero" aria-label="Before you spend, check Pip.">
                Before you spend, <span>check Pip.</span>
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
              <p className="pip-trust-line">
                Read-only account data. Pip cannot move your money. No ads. No selling your
                financial data.
              </p>
            </div>
            <div className="pip-hero-media">
              <div className="pip-hero-glow" aria-hidden="true" />
              <img
                alt={marketingAssets.homepageHeroProduct.alt}
                decoding="async"
                fetchPriority="high"
                height={marketingAssets.homepageHeroProduct.height}
                loading="eager"
                src={marketingAssets.homepageHeroProduct.src}
                width={marketingAssets.homepageHeroProduct.width}
              />
            </div>
          </div>
        </section>

        <section className="pip-home-section pip-section-paper">
          <div className="pip-home-wrap pip-centered-block">
            <h2 className="pip-home-title pip-home-title-section">
              The balance is real. It is just not all open room.
            </h2>
            <p className="pip-home-text">
              Your bank app shows what exists. Pip subtracts what already has a job and gives you
              the number to check before the next purchase.
            </p>
            <div className="pip-framed-media pip-framed-media-large">
              <img
                alt={marketingAssets.bankBalanceComparison.alt}
                decoding="async"
                height={marketingAssets.bankBalanceComparison.height}
                loading="lazy"
                src={marketingAssets.bankBalanceComparison.src}
                width={marketingAssets.bankBalanceComparison.width}
              />
            </div>
          </div>
        </section>

        <section className="pip-home-section">
          <div className="pip-home-wrap">
            <div className="pip-two-column pip-founder-row">
              <div className="pip-framed-media">
                <img
                  alt={marketingAssets.founderInsight.alt}
                  decoding="async"
                  height={marketingAssets.founderInsight.height}
                  loading="lazy"
                  src={marketingAssets.founderInsight.src}
                  width={marketingAssets.founderInsight.width}
                />
              </div>
              <div className="pip-copy-stack">
                <h2 className="pip-home-title pip-home-title-compact">
                  Built for people who will never use a budget.
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
              </div>
            </div>
            <div className="pip-habit-card">
              <p className="pip-kicker">The habit</p>
              <h2 className="pip-home-title pip-home-title-section">
                One number for the moment right before you spend.
              </h2>
              <div className="pip-number-card" aria-label="Example Spendable Cash Today amount">
                <span>Spendable Cash Today</span>
                <strong>$84</strong>
                <div aria-hidden="true">
                  <i />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pip-home-section pip-section-sage">
          <div className="pip-home-wrap">
            <div className="pip-centered-block">
              <h2 className="pip-home-title pip-home-title-section">
                Pip is <em>not</em> another budget app.
              </h2>
              <p className="pip-home-text">
                Say goodbye to spreadsheets, category guilt, and complex charts. Clarity should
                feel calming, not like homework.
              </p>
            </div>
            <div className="pip-framed-media pip-framed-media-large">
              <img
                alt={marketingAssets.budgetAppComparison.alt}
                decoding="async"
                height={marketingAssets.budgetAppComparison.height}
                loading="lazy"
                src={marketingAssets.budgetAppComparison.src}
                width={marketingAssets.budgetAppComparison.width}
              />
            </div>
            <div className="pip-two-column pip-meet-row">
              <div className="pip-copy-stack">
                <p className="pip-kicker">Meet Pip</p>
                <h2 className="pip-home-title pip-home-title-section">
                  Cute on purpose. Serious where it counts.
                </h2>
                <p className="pip-home-text">
                  Money is stressful. Pip is softer because the daily check needs to be repeatable,
                  but Spendable Cash Today still comes from real account data.
                </p>
              </div>
              <div className="pip-character-pair">
                <div className="pip-character-card">
                  <img
                    alt={marketingAssets.cuteSeriousCharacter.alt}
                    decoding="async"
                    height={marketingAssets.cuteSeriousCharacter.height}
                    loading="lazy"
                    src={marketingAssets.cuteSeriousCharacter.src}
                    width={marketingAssets.cuteSeriousCharacter.width}
                  />
                </div>
                <div className="pip-character-card pip-character-card-wide">
                  <img
                    alt={marketingAssets.pipEmotionalStates.alt}
                    decoding="async"
                    height={marketingAssets.pipEmotionalStates.height}
                    loading="lazy"
                    src={marketingAssets.pipEmotionalStates.src}
                    width={marketingAssets.pipEmotionalStates.width}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pip-home-section" id="how-it-works">
          <div className="pip-home-wrap">
            <div className="pip-centered-block">
              <p className="pip-kicker">How it works</p>
              <h2 className="pip-home-title pip-home-title-section">
                Four calm steps to Spendable Cash Today.
              </h2>
            </div>
            <div className="pip-step-grid">
              {steps.map(({ Icon, copy, title }, index) => (
                <article className="pip-soft-card pip-step-card" key={title}>
                  <span className="pip-step-icon">
                    <Icon aria-hidden="true" size={26} strokeWidth={1.8} />
                  </span>
                  <p>{String(index + 1).padStart(2, "0")}</p>
                  <h3>{title}</h3>
                  <span>{copy}</span>
                </article>
              ))}
              <article className="pip-soft-card pip-step-showcase">
                <div>
                  <h3>Connect accounts. Choose a cushion. Check one daily number.</h3>
                  <p>The number comes first. The why is there when you ask.</p>
                </div>
                <img
                  alt={marketingAssets.howPipWorksSteps.alt}
                  decoding="async"
                  height={marketingAssets.howPipWorksSteps.height}
                  loading="lazy"
                  src={marketingAssets.howPipWorksSteps.src}
                  width={marketingAssets.howPipWorksSteps.width}
                />
              </article>
            </div>
          </div>
        </section>

        <section className="pip-home-section pip-section-paper" id="pricing">
          <div className="pip-home-wrap pip-pricing-security-grid">
            <div className="pip-copy-stack">
              <p className="pip-kicker">Pricing</p>
              <h2 className="pip-home-title pip-home-title-compact">
                Simple pricing for one daily number.
              </h2>
              <p className="pip-home-text">
                {pipPaidTrustLine} No ads. No selling your financial data.
              </p>
              <PricingCards eventSource="home_pricing" />
              <div className="pip-framed-media pip-pricing-media">
                <img
                  alt={marketingAssets.pricingIllustration.alt}
                  decoding="async"
                  height={marketingAssets.pricingIllustration.height}
                  loading="lazy"
                  src={marketingAssets.pricingIllustration.src}
                  width={marketingAssets.pricingIllustration.width}
                />
              </div>
            </div>
            <div className="pip-security-panel" id="security">
              <p className="pip-kicker">Trust</p>
              <h2 className="pip-home-title pip-home-title-compact">
                Cute does not mean careless.
              </h2>
              <p className="pip-home-text">
                Pip uses read-only account data. It cannot move your money. The paid model keeps
                the relationship direct.
              </p>
              <div className="pip-framed-media">
                <img
                  alt={marketingAssets.securityTrustIllustration.alt}
                  decoding="async"
                  height={marketingAssets.securityTrustIllustration.height}
                  loading="lazy"
                  src={marketingAssets.securityTrustIllustration.src}
                  width={marketingAssets.securityTrustIllustration.width}
                />
              </div>
              <div className="pip-trust-grid">
                {trustFacts.map((fact) => (
                  <span key={fact}>
                    <ShieldCheck aria-hidden="true" size={17} />
                    {fact}
                  </span>
                ))}
              </div>
              <Link className="pip-inline-link focus-ring" href="/security">
                Read security details
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </div>
        </section>

        <section className="pip-home-section">
          <div className="pip-home-wrap pip-two-column pip-ask-row">
            <div className="pip-framed-media">
              <img
                alt={marketingAssets.articleCoverTemplate.alt}
                decoding="async"
                height={marketingAssets.articleCoverTemplate.height}
                loading="lazy"
                src={marketingAssets.articleCoverTemplate.src}
                width={marketingAssets.articleCoverTemplate.width}
              />
            </div>
            <div className="pip-copy-stack">
              <p className="pip-kicker">Ask Pip</p>
              <h2 className="pip-home-title pip-home-title-section">
                Have a conversation with your money.
              </h2>
              <p className="pip-home-text">
                Sometimes you need more than a number. Ask Pip natural questions and get calm,
                context-aware answers without digging through transaction histories.
              </p>
              <div className="pip-chat-prompts" aria-label="Example questions">
                <span>Can I spend $50?</span>
                <span>Why did today change?</span>
                <span>What's coming up?</span>
              </div>
            </div>
          </div>
        </section>

        <section className="pip-home-section pip-section-paper" id="blog">
          <div className="pip-home-wrap">
            <div className="pip-centered-block">
              <p className="pip-kicker">Pip blog</p>
              <h2 className="pip-home-title pip-home-title-section">
                Tiny money habits, no homework.
              </h2>
              <p className="pip-home-text">
                Product-led reads about bank-balance guessing, daily spending signals, cute finance
                design, and why one number can work better than a budget.
              </p>
            </div>
            <div className="pip-article-grid">
              {featuredArticles.map((article) => (
                <ArticleCard article={article} key={article.slug} />
              ))}
            </div>
          </div>
        </section>

        <section className="pip-home-section pip-final-cta" id="get-pip">
          <div className="pip-home-wrap pip-final-grid">
            <div className="pip-copy-stack">
              <Leaf aria-hidden="true" className="pip-final-icon" size={46} strokeWidth={1.5} />
              <h2 className="pip-home-title pip-home-title-hero">
                Your bank balance is not permission to spend.
              </h2>
              <p className="pip-home-lede">
                Pip gives you one calm number before the next purchase. Plans start at{" "}
                {pipPricing.weekly.displayPrice}.
              </p>
              <div className="pip-action-row">
                <MarketingCtaLink
                  className="pip-button pip-button-primary focus-ring"
                  eventLabel="home_final_get_pip"
                  eventProperties={{ intent: "get_pip" }}
                  href={getProductAccessHref()}
                >
                  {productAccess.primaryLabel}
                  <ArrowRight aria-hidden="true" size={17} />
                </MarketingCtaLink>
                <Link className="pip-button pip-button-secondary focus-ring" href="/pricing">
                  View pricing
                </Link>
              </div>
            </div>
            <div className="pip-framed-media">
              <img
                alt={marketingAssets.appStoreProductShowcase.alt}
                decoding="async"
                height={marketingAssets.appStoreProductShowcase.height}
                loading="lazy"
                src={marketingAssets.appStoreProductShowcase.src}
                width={marketingAssets.appStoreProductShowcase.width}
              />
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
