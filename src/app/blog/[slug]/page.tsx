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
        <article className="px-4 py-14 sm:px-6 lg:py-20">
          <div className="mx-auto max-w-4xl">
            <Link
              className="focus-ring inline-flex items-center gap-2 rounded-full text-sm font-bold text-moss hover:text-ink"
              href="/blog"
            >
              <ArrowLeft aria-hidden="true" size={16} />
              Blog
            </Link>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              {article.featured ? (
                <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-bold uppercase tracking-normal text-ink">
                  Start here
                </span>
              ) : null}
              {article.tags.map((tag) => (
                <span
                  className="rounded-full border border-line bg-porcelain px-3 py-1 text-xs font-bold text-moss"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="font-display mt-5 max-w-3xl text-5xl leading-[1] text-ink sm:text-6xl">
              {article.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/70">{article.description}</p>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-bold uppercase tracking-normal text-taupe">
              <span className="inline-flex items-center gap-2">
                <img
                  src="/brand/pip-profile-clean.png"
                  alt=""
                  aria-hidden="true"
                  width={32}
                  height={32}
                  loading="lazy"
                  decoding="async"
                  className="h-8 w-8 rounded-full object-cover"
                />
                {article.author}
              </span>
              <span>Published {formatDate(article.publishedAt)}</span>
              {article.updatedAt !== article.publishedAt ? <span>Updated {formatDate(article.updatedAt)}</span> : null}
              <span>{article.readingTimeMinutes} min read</span>
            </div>
            <ArticleTableOfContents article={article} />
            <ArticleBody article={article} />
            <div className="max-w-3xl">
              <ArticleFaq faq={article.faq} />
            </div>
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

function ArticleTableOfContents({ article }: { article: NonNullable<ReturnType<typeof getArticleBySlug>> }) {
  const headings = article.headings.filter((heading) => heading.level === 2);

  if (headings.length < 4) {
    return null;
  }

  return (
    <nav
      aria-label="In this article"
      className="mt-9 max-w-2xl rounded-[0.5rem] border border-line bg-porcelain p-5"
    >
      <h2 className="text-sm font-bold uppercase tracking-normal text-moss">In this article</h2>
      <ol className="mt-4 grid gap-2 text-sm font-semibold leading-6 text-ink/70 sm:grid-cols-2">
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
