import type { Metadata } from "next";
import { ArticleCard } from "@/components/marketing/ArticleComponents";
import { LaunchAccessForm } from "@/components/marketing/LaunchAccessForm";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { getFeaturedArticle, getPublishedArticles } from "@/lib/marketing/content";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { pipLaunch } from "@/lib/marketing/pricing";

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
        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-normal text-moss">Pip blog</p>
            <h1 className="font-display mt-4 text-5xl leading-[1] text-ink sm:text-6xl">
              Tiny money habits, no homework.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/70">
              Short, product-led reads about bank-balance guessing, cute money psychology, daily
              spending signals, and why one number can work better than a budget.
            </p>
            <div className="mt-7 flex flex-wrap gap-2" aria-label="Blog categories">
              {categoryPills.map((category) => (
                <span className="rounded-full border border-line bg-porcelain px-3 py-1 text-xs font-bold text-moss" key={category}>
                  {category}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-6xl">
            {featured ? <ArticleCard article={featured} featured /> : null}
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {remaining.map((article) => (
                <ArticleCard article={article} key={article.slug} />
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6" id="launch-access">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-4xl leading-tight text-ink">Try the number behind the articles.</h2>
            <p className="mt-4 text-base leading-7 text-ink/68">
              {pipLaunch.trialLine} {pipLaunch.appStoreLine}
            </p>
            <div className="mt-7">
              <LaunchAccessForm sourcePage="/blog" compact />
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
