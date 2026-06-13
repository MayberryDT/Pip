import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { ArticleCard } from "@/components/marketing/ArticleComponents";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import {
  SwissFigure,
  SwissKicker,
  SwissRuleList,
  SwissSection,
  SwissText,
  SwissTitle,
} from "@/components/marketing/SwissGrid";
import { marketingAssets } from "@/lib/marketing/assets";
import { getFeaturedArticle, getPublishedArticles } from "@/lib/marketing/content";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Pip Blog",
  description:
    "Product-led articles about Spendable Cash Today, misleading bank balances, no-budget spending, and daily money habits.",
  path: "/blog",
});

const categoryPills = ["Start here", "Bank balance", "Spendable Cash", "Cute finance", "No-budget habits"];

export default function BlogIndexPage() {
  const articles = getPublishedArticles();
  const featured = getFeaturedArticle();
  const remaining = featured ? articles.filter((article) => article.slug !== featured.slug) : articles;

  return (
    <MarketingLayout>
      <main>
        <SwissSection className="editorial-home-hero" folio="01 / Pip blog">
          <div className="col-span-12 lg:col-span-7">
            <SwissKicker>Pip blog</SwissKicker>
            <SwissTitle className="mt-5" level={1} size="page">
              Tiny money habits, no homework.
            </SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-9">
            <SwissText className="text-lg leading-8">
              Short, product-led reads about bank-balance guessing, cute money psychology, daily
              spending signals, and why one number can work better than a budget.
            </SwissText>
          </div>
          <div className="col-span-12 lg:col-span-8">
            <SwissFigure asset={marketingAssets.articleCoverTemplate} priority variant="wide" />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <SwissRuleList items={categoryPills} />
          </div>
        </SwissSection>

        <SwissSection folio="02 / Start here" tone="porcelain">
          <div className="col-span-12">{featured ? <ArticleCard article={featured} featured /> : null}</div>
          <div className="col-span-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {remaining.map((article) => (
              <ArticleCard article={article} key={article.slug} />
            ))}
          </div>
        </SwissSection>

        <SwissSection folio="03 / Product">
          <div className="col-span-12 lg:col-span-7">
            <SwissTitle size="section">Put the daily number behind the articles to work.</SwissTitle>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-9">
            <MarketingCtaLink
              className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 bg-ink px-6 text-sm font-bold text-porcelain transition hover:bg-moss"
              eventLabel="blog_index_get_pip"
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
