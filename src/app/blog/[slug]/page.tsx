import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  ArticleBody,
  ArticleCard,
  ArticleFaq,
  formatDate,
  JsonLd,
} from "@/components/marketing/ArticleComponents";
import { ArticleViewEvent } from "@/components/marketing/ArticleViewEvent";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import {
  SwissFigure,
  SwissKicker,
  SwissSection,
  SwissText,
  SwissTitle,
} from "@/components/marketing/SwissGrid";
import { marketingAssets } from "@/lib/marketing/assets";
import { getArticleBySlug, getPublishedArticles, getRelatedArticles } from "@/lib/marketing/content";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";
import { buildArticleJsonLd, buildBreadcrumbJsonLd, buildFaqJsonLd } from "@/lib/marketing/structured-data";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return getPublishedArticles().map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) {
    return {};
  }

  return buildMarketingMetadata({
    title: article.seo.title,
    description: article.seo.description,
    path: `/blog/${article.slug}`,
    type: "article",
    image: article.ogImage,
  });
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const related = getRelatedArticles(article);

  return (
    <MarketingLayout>
      <ArticleViewEvent slug={article.slug} tags={article.tags} />
      <JsonLd data={buildArticleJsonLd(article)} />
      <JsonLd data={buildFaqJsonLd(article.faq)} />
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: article.title, path: `/blog/${article.slug}` },
        ])}
      />
      <main>
        <article>
          <SwissSection folio="01 / Article">
            <div className="col-span-12 lg:col-span-7">
              <Link
                className="focus-ring inline-flex items-center gap-2 text-sm font-bold text-moss hover:text-ink"
                href="/blog"
              >
                <ArrowLeft aria-hidden="true" size={16} />
                Blog
              </Link>
              <div className="mt-8 flex flex-wrap items-start gap-4">
                {article.featured ? (
                  <span className="border-t border-gold pt-2 text-xs font-extrabold uppercase tracking-[0.08em] text-ink">
                    Start here
                  </span>
                ) : null}
                {article.tags.map((tag) => (
                  <span className="border-t border-line pt-2 text-xs font-bold text-moss" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <SwissTitle className="mt-6 max-w-5xl" level={1} size="page">
                {article.title}
              </SwissTitle>
              <SwissText className="mt-6 text-lg leading-8">{article.description}</SwissText>
              <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-bold uppercase tracking-[0.08em] text-taupe">
                <span>{article.author}</span>
                <span>Published {formatDate(article.publishedAt)}</span>
                {article.updatedAt !== article.publishedAt ? <span>Updated {formatDate(article.updatedAt)}</span> : null}
                <span>{article.readingTimeMinutes} min read</span>
              </div>
            </div>
            <div className="col-span-12 lg:col-span-4 lg:col-start-9">
              <SwissFigure asset={marketingAssets.articleCoverTemplate} variant="poster" />
            </div>
            <div className="col-span-12 lg:col-span-3">
              <ArticleTableOfContents article={article} />
            </div>
            <div className="col-span-12 lg:col-span-7 lg:col-start-5">
              <ArticleBody article={article} />
              <div className="max-w-3xl">
                <ArticleFaq faq={article.faq} />
              </div>
            </div>
          </SwissSection>
        </article>

        <SwissSection folio="02 / Try Pip" tone="porcelain">
          <div className="col-span-12 lg:col-span-7">
            <SwissTitle size="compact">Want the daily number?</SwissTitle>
            <SwissText className="mt-4">
              Get Pip and check Spendable Cash Today before the next spending decision.
            </SwissText>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-9">
            <MarketingCtaLink
              className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 bg-ink px-6 text-sm font-bold text-porcelain transition hover:bg-moss"
              eventLabel="article_page_get_pip"
              eventProperties={{ intent: "get_pip", slug: article.slug }}
              href={getProductAccessHref()}
            >
              {productAccess.primaryLabel}
              <ArrowRight aria-hidden="true" size={17} />
            </MarketingCtaLink>
          </div>
        </SwissSection>

        {related.length > 0 ? (
          <SwissSection folio="03 / Related">
            <div className="col-span-12">
              <SwissTitle size="compact">Related articles</SwissTitle>
            </div>
            <div className="col-span-12 grid gap-8 md:grid-cols-3">
              {related.map((relatedArticle) => (
                <ArticleCard article={relatedArticle} key={relatedArticle.slug} />
              ))}
            </div>
          </SwissSection>
        ) : null}
      </main>
    </MarketingLayout>
  );
}

function ArticleTableOfContents({ article }: { article: NonNullable<ReturnType<typeof getArticleBySlug>> }) {
  const headings = article.headings.filter((heading) => heading.level === 2);

  if (headings.length < 4) {
    return null;
  }

  return (
    <nav aria-label="In this article" className="border-y border-line py-5 lg:sticky lg:top-28">
      <h2 className="text-xs font-extrabold uppercase tracking-[0.08em] text-moss">In this article</h2>
      <ol className="mt-4 grid gap-2 text-sm font-semibold leading-6 text-ink/70">
        {headings.map((heading) => (
          <li key={heading.id}>
            <Link className="focus-ring rounded hover:text-moss" href={`#${heading.id}`}>
              {heading.text}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
