import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ArticleCard, JsonLd } from "@/components/marketing/ArticleComponents";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PricingCards } from "@/components/marketing/PricingCards";
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

const habitPoints = [
  {
    title: "Bills and subscriptions are held back",
    copy: "The bank balance shows what exists. Pip subtracts what already has a job.",
  },
  {
    title: "Your cushion stays protected",
    copy: "Your chosen cushion stays outside the everyday spending signal.",
  },
  {
    title: "The number reacts",
    copy: "Spending lightly can leave more room. Spending hot can make the next days tighter.",
  },
];

const trustFacts = [
  "Read-only account data",
  "Pip cannot move money",
  "No ads",
  "No selling your financial data",
  "Delete stored financial data",
];

const askExamples = [
  "Can I spend $50?",
  "Why did today change?",
  "What lowered it?",
  "What's coming up?",
];

const alternatives = [
  {
    title: "Bank balance guessing",
    copy: "Fast, but it treats every dollar in the account like open room.",
  },
  {
    title: "Budget apps",
    copy: "Detailed, but too much category management for people who will never budget.",
  },
  {
    title: "Spreadsheets",
    copy: "Powerful, but manual enough that the habit usually collapses.",
  },
  {
    title: "Pip",
    copy: "One daily spending signal before the next purchase.",
  },
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
        <SwissSection className="editorial-home-hero" folio="01 / Spendable Cash Today">
          <div className="col-span-12 lg:col-span-5">
            <SwissKicker>Spendable Cash Today</SwissKicker>
            <SwissTitle className="mt-5" level={1} size="hero">
              Before you spend, check Pip.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-6 lg:col-start-7 lg:row-span-4 lg:row-start-1">
            <SwissFigure asset={marketingAssets.homepageHeroProduct} priority variant="hero" />
          </div>
          <div className="col-span-12 lg:col-span-5">
            <SwissText>
              Pip gives you one calm daily number for what is actually okay to use today.
            </SwissText>
            <SwissText className="mt-4">
              Stop guessing from your bank balance without turning into a budget person.
            </SwissText>
          </div>
          <div className="col-span-12 flex flex-col gap-3 sm:flex-row sm:items-center lg:col-span-5">
            <MarketingCtaLink
              className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 bg-ink px-6 text-sm font-bold text-porcelain transition hover:bg-moss"
              eventLabel="home_hero_get_pip"
              eventProperties={{ intent: "get_pip", pricing_shown: true }}
              href={getProductAccessHref()}
            >
              {productAccess.primaryLabel}
              <ArrowRight aria-hidden="true" size={17} />
            </MarketingCtaLink>
            <Link
              className="focus-ring inline-flex min-h-12 items-center justify-center border border-line px-6 text-sm font-bold text-ink hover:border-moss"
              href="/how-it-works"
            >
              See how it works
            </Link>
          </div>
          <p className="col-span-12 text-sm font-bold leading-6 text-ink/64 lg:col-span-5">
            Read-only account data. Pip cannot move your money. No ads. No selling your financial data.
          </p>
        </SwissSection>

        <SwissSection folio="02 / Balance is not permission" tone="porcelain">
          <div className="col-span-12 lg:col-span-9">
            <SwissTitle size="section">
              The balance is real. It is just not all open room.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-3">
            <SwissKicker>Bank balance vs Pip</SwissKicker>
            <SwissText className="mt-5">
              Your bank app shows what exists. Pip subtracts what already has a job and gives you
              the number to check before the next purchase.
            </SwissText>
          </div>
          <div className="col-span-12 lg:col-span-10">
            <SwissFigure asset={marketingAssets.bankBalanceComparison} variant="bleed" />
          </div>
          <div className="col-span-12 grid gap-4 lg:col-span-2">
            <SwissNumber label="one number before spending">01</SwissNumber>
            <SwissNumber label="monthly budget homework">00</SwissNumber>
          </div>
        </SwissSection>

        <SwissSection folio="03 / Founder insight">
          <div className="col-span-12 lg:col-span-4">
            <SwissKicker>Founder insight</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              Built for people who will never use a budget.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-5">
            <SwissFigure asset={marketingAssets.founderInsight} variant="wide" />
          </div>
          <div className="col-span-12 lg:col-span-3">
            <SwissText>
              Most people already have a money habit: open the bank app, look at the balance, and
              treat it like permission. Pip keeps the habit small but changes the default number.
            </SwissText>
          </div>
          <div className="col-span-12 lg:col-span-8 lg:col-start-5">
            <SwissRuleList className="md:grid-cols-3" items={habitPoints} />
          </div>
        </SwissSection>

        <SwissSection folio="04 / The competition" tone="porcelain">
          <div className="col-span-12 lg:col-span-5">
            <SwissKicker>Not another budget app</SwissKicker>
            <SwissTitle className="mt-5" size="section">
              The real competitor is the habit you already have.
            </SwissTitle>
            <SwissText className="mt-6">
              Pip is not a spreadsheet, a full money dashboard, or a category lecture. It replaces
              bank-balance guessing with one daily signal.
            </SwissText>
          </div>
          <div className="col-span-12 lg:col-span-7">
            <SwissFigure asset={marketingAssets.budgetAppComparison} variant="wide" />
          </div>
          <div className="col-span-12">
            <SwissRuleList className="md:grid-cols-4" items={alternatives} />
          </div>
        </SwissSection>

        <SwissSection folio="05 / Meet Pip">
          <div className="col-span-12 lg:col-span-3">
            <SwissFigure asset={marketingAssets.cuteSeriousCharacter} variant="poster" />
          </div>
          <div className="col-span-12 lg:col-span-5">
            <SwissKicker>Meet Pip</SwissKicker>
            <SwissTitle className="mt-5" size="section">
              Cute makes the habit easier. The number still has to be serious.
            </SwissTitle>
            <SwissText className="mt-6">
              Money apps often feel cold or judgmental. Pip is softer because the daily check needs
              to be repeatable, but Spendable Cash Today still comes from real account data.
            </SwissText>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <SwissFigure asset={marketingAssets.pipEmotionalStates} variant="portrait" />
          </div>
        </SwissSection>

        <SwissSection folio="06 / How Pip works" id="how-it-works" tone="porcelain">
          <div className="col-span-12 lg:col-span-4">
            <SwissKicker>How Pip works</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              Connect accounts. Choose a cushion. Check one daily number.
            </SwissTitle>
            <SwissText className="mt-6">
              The number comes first. The why is there when you ask.
            </SwissText>
            <Link
              className="focus-ring mt-6 inline-flex items-center gap-2 text-sm font-bold text-moss hover:text-ink"
              href="/how-it-works"
            >
              See the steps
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className="col-span-12 lg:col-span-8">
            <SwissFigure asset={marketingAssets.howPipWorksSteps} variant="wide" />
          </div>
        </SwissSection>

        <SwissSection folio="07 / Pricing" id="pricing" tone="ink">
          <div className="col-span-12 lg:col-span-4">
            <SwissKicker>Pricing</SwissKicker>
            <SwissTitle className="mt-5" size="section">
              Simple pricing for one daily number.
            </SwissTitle>
            <SwissText className="mt-6">
              {pipPaidTrustLine} No ads. No selling your financial data.
            </SwissText>
          </div>
          <div className="col-span-12 lg:col-span-5">
            <PricingCards eventSource="home_pricing" />
          </div>
          <div className="col-span-12 lg:col-span-3">
            <SwissFigure asset={marketingAssets.pricingIllustration} variant="poster" />
          </div>
        </SwissSection>

        <SwissSection folio="08 / Trust model">
          <div className="col-span-12 lg:col-span-4">
            <SwissFigure asset={marketingAssets.securityTrustIllustration} variant="poster" />
          </div>
          <div className="col-span-12 lg:col-span-5">
            <SwissKicker>Trust</SwissKicker>
            <SwissTitle className="mt-5" size="section">
              Paid because your data should not be the product.
            </SwissTitle>
            <SwissText className="mt-6">
              Pip uses read-only account data. It cannot move your money. The paid model keeps the
              relationship direct.
            </SwissText>
            <Link
              className="focus-ring mt-6 inline-flex items-center gap-2 text-sm font-bold text-moss hover:text-ink"
              href="/security"
            >
              Read security details
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className="col-span-12 lg:col-span-3">
            <SwissRuleList items={trustFacts} />
          </div>
        </SwissSection>

        <SwissSection folio="09 / Ask and read" tone="porcelain">
          <div className="col-span-12 lg:col-span-4">
            <SwissKicker>Ask Pip</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              Ask when you want the why.
            </SwissTitle>
            <SwissText className="mt-6">
              Pip starts with one number, then gives context when you need it.
            </SwissText>
            <div className="mt-8 border-y border-line py-5">
              <p className="text-sm font-bold text-ink">You: Can I spend $50?</p>
              <p className="mt-3 text-base font-bold leading-7 text-ink/70">
                Pip: It fits today, but it would make tomorrow tighter.
              </p>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-3">
            <SwissRuleList items={askExamples} />
          </div>
          <div className="col-span-12 lg:col-span-5">
            <SwissFigure asset={marketingAssets.articleCoverTemplate} variant="wide" />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <SwissKicker>Pip blog</SwissKicker>
            <SwissTitle className="mt-5" size="compact">
              Tiny money habits, no homework.
            </SwissTitle>
            <SwissText className="mt-6">
              Product-led reads about bank-balance guessing, daily spending signals, cute finance
              design, and why one number can work better than a budget.
            </SwissText>
            <Link
              className="focus-ring mt-6 inline-flex items-center gap-2 text-sm font-bold text-moss hover:text-ink"
              href="/blog"
            >
              Read the Pip blog
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className="col-span-12 grid gap-5 md:grid-cols-3 lg:col-span-8">
            {featuredArticles.map((article) => (
              <ArticleCard article={article} key={article.slug} />
            ))}
          </div>
        </SwissSection>

        <SwissSection folio="10 / Get Pip" id="get-pip" tone="ink">
          <div className="col-span-12 lg:col-span-5">
            <SwissKicker>Get Pip</SwissKicker>
            <SwissTitle className="mt-5" size="section">
              Your bank balance is not permission to spend.
            </SwissTitle>
            <SwissText className="mt-6">
              Pip gives you one calm number before the next purchase. Plans start at{" "}
              {pipPricing.weekly.displayPrice}.
            </SwissText>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <MarketingCtaLink
                className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 bg-porcelain px-6 text-sm font-bold text-ink transition hover:bg-paper"
                eventLabel="home_final_get_pip"
                eventProperties={{ intent: "get_pip" }}
                href={getProductAccessHref()}
              >
                {productAccess.primaryLabel}
                <ArrowRight aria-hidden="true" size={17} />
              </MarketingCtaLink>
              <Link
                className="focus-ring inline-flex min-h-12 items-center justify-center border border-porcelain/24 px-6 text-sm font-bold text-porcelain hover:border-porcelain"
                href="/pricing"
              >
                View pricing
              </Link>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-7">
            <SwissFigure asset={marketingAssets.appStoreProductShowcase} variant="wide" />
          </div>
        </SwissSection>
      </main>
    </MarketingLayout>
  );
}
