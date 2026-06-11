import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  ArticleBody,
  ArticleCard,
  ArticleFaq,
  formatDate,
  JsonLd,
} from "@/components/marketing/ArticleComponents";
import { ArticleViewEvent } from "@/components/marketing/ArticleViewEvent";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import { getArticleBySlug, getPublishedArticles, getRelatedArticles } from "@/lib/marketing/content";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { buildArticleJsonLd, buildFaqJsonLd } from "@/lib/marketing/structured-data";

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
      <main>
        <article className="px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <Link
              className="focus-ring inline-flex items-center gap-2 rounded-full text-sm font-bold text-moss hover:text-ink"
              href="/blog"
            >
              <ArrowLeft aria-hidden="true" size={16} />
              Blog
            </Link>
            <div className="mt-8 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <span
                  className="rounded-full border border-line bg-porcelain px-3 py-1 text-xs font-bold text-moss"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="font-display mt-5 text-5xl leading-[1] text-ink sm:text-6xl">
              {article.title}
            </h1>
            <p className="mt-5 text-lg leading-8 text-ink/70">{article.description}</p>
            <div className="mt-6 flex flex-wrap gap-4 text-xs font-bold uppercase tracking-normal text-taupe">
              <span>{article.author}</span>
              <span>Published {formatDate(article.publishedAt)}</span>
              {article.updatedAt !== article.publishedAt ? <span>Updated {formatDate(article.updatedAt)}</span> : null}
              <span>{article.readingTimeMinutes} min read</span>
            </div>
            <ArticleBody body={article.body} />
            <ArticleFaq faq={article.faq} />
          </div>
        </article>

        <section className="bg-porcelain px-4 py-14 sm:px-6" id="join-beta">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-4xl leading-tight text-ink">Want the daily number?</h2>
            <p className="mt-4 text-base leading-7 text-ink/68">
              Join the beta list and get a note when Pip is ready for more testers.
            </p>
            <div className="mt-7">
              <WaitlistForm sourcePage={`/blog/${article.slug}`} compact />
            </div>
          </div>
        </section>

        {related.length > 0 ? (
          <section className="px-4 py-14 sm:px-6">
            <div className="mx-auto max-w-6xl">
              <h2 className="font-display text-4xl leading-tight text-ink">Related articles</h2>
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {related.map((relatedArticle) => (
                  <ArticleCard article={relatedArticle} key={relatedArticle.slug} />
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </MarketingLayout>
  );
}
