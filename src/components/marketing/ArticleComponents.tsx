import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Clock3, Quote } from "lucide-react";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { PipSays } from "@/components/marketing/PipSays";
import { getArticleVisual } from "@/lib/marketing/article-visuals";
import type { Article, ArticleBodyBlock } from "@/lib/marketing/content";
import { parseArticleBody } from "@/lib/marketing/content";
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";

export function ArticleCard({
  article,
  featured = false,
  variant,
}: {
  article: Article;
  featured?: boolean;
  variant?: "default" | "featured" | "homeFeatured" | "homeCompact";
}) {
  const resolvedVariant = variant ?? (featured ? "featured" : "default");

  if (resolvedVariant === "homeFeatured") {
    const asset = getArticleVisual(article);

    return (
      <article className="pip-blog-card pip-blog-card-feature">
        <Link className="focus-ring pip-blog-card-media" href={`/blog/${article.slug}`}>
          <img
            src={asset.src}
            alt={asset.alt}
            width={asset.width}
            height={asset.height}
            loading="lazy"
            decoding="async"
          />
        </Link>
        <div className="pip-blog-card-body">
          <span className="pip-blog-card-label">Featured read</span>
          <h3>
            <Link className="focus-ring rounded hover:text-moss" href={`/blog/${article.slug}`}>
              {article.title}
            </Link>
          </h3>
          <p>{article.description}</p>
          <div className="pip-blog-card-meta">
            <span>{formatDate(article.publishedAt)}</span>
            <span>
              <Clock3 aria-hidden="true" size={14} />
              {article.readingTimeMinutes} min
            </span>
          </div>
        </div>
      </article>
    );
  }

  if (resolvedVariant === "homeCompact") {
    const asset = getArticleVisual(article);

    return (
      <article className="pip-blog-card pip-blog-card-compact">
        <Link className="focus-ring pip-blog-card-media" href={`/blog/${article.slug}`}>
          <img
            src={asset.src}
            alt={asset.alt}
            width={asset.width}
            height={asset.height}
            loading="lazy"
            decoding="async"
          />
        </Link>
        <div className="pip-blog-card-body">
          <div className="pip-blog-card-tags">
            {article.tags.slice(0, 2).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <h3>
            <Link className="focus-ring rounded hover:text-moss" href={`/blog/${article.slug}`}>
              {article.title}
            </Link>
          </h3>
          <p>{article.description}</p>
          <div className="pip-blog-card-meta">
            <span>{formatDate(article.publishedAt)}</span>
            <span>
              <Clock3 aria-hidden="true" size={14} />
              {article.readingTimeMinutes} min
            </span>
          </div>
        </div>
      </article>
    );
  }

  if (resolvedVariant === "featured") {
    const asset = getArticleVisual(article);

    return (
      <article className="pip-blog-card pip-blog-card-feature pip-blog-card-index-feature">
        <Link className="focus-ring pip-blog-card-media" href={`/blog/${article.slug}`}>
          <img
            src={asset.src}
            alt={asset.alt}
            width={asset.width}
            height={asset.height}
            loading="lazy"
            decoding="async"
          />
        </Link>
        <div className="pip-blog-card-body">
          <div className="pip-blog-card-tags">
            <span>
              Start here
            </span>
            {article.tags.slice(0, 3).map((tag) => (
              <span key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <h2>
            <Link className="focus-ring rounded hover:text-moss" href={`/blog/${article.slug}`}>
              {article.title}
            </Link>
          </h2>
          <p>{article.description}</p>
          <div className="pip-blog-card-meta">
            <span>{formatDate(article.publishedAt)}</span>
            <span>
              <Clock3 aria-hidden="true" size={14} />
              {article.readingTimeMinutes} min
            </span>
          </div>
          <Link
            className="focus-ring pip-blog-read-link"
            href={`/blog/${article.slug}`}
          >
            Start reading
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </article>
    );
  }

  const asset = getArticleVisual(article);

  return (
    <article className="pip-blog-card pip-blog-card-default">
      <Link className="focus-ring pip-blog-card-media" href={`/blog/${article.slug}`}>
        <img
          src={asset.src}
          alt={asset.alt}
          width={asset.width}
          height={asset.height}
          loading="lazy"
          decoding="async"
        />
      </Link>
      <div className="pip-blog-card-body">
        <div className="pip-blog-card-tags">
          {article.tags.slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <h2>
          <Link className="focus-ring rounded hover:text-moss" href={`/blog/${article.slug}`}>
            {article.title}
          </Link>
        </h2>
        <p>{article.description}</p>
        <div className="pip-blog-card-meta">
          <span>{formatDate(article.publishedAt)}</span>
          <span>
            <Clock3 aria-hidden="true" size={14} />
            {article.readingTimeMinutes} min
          </span>
        </div>
        <Link className="focus-ring pip-blog-read-link" href={`/blog/${article.slug}`}>
          Read article
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </article>
  );
}

export function ArticleBody({
  article,
  body,
}: {
  article?: Article;
  body?: string;
}) {
  const blocks = article?.blocks ?? parseArticleBody(body ?? "");
  const autoCtaIndex = article && !article.hasInlineCta ? Math.max(1, Math.floor(blocks.length / 2)) : -1;

  return (
    <div className="article-body mt-10 space-y-6 text-[1.02rem] leading-8 text-ink/74">
      {blocks.map((block, index) => (
        <div key={`${block.type}-${index}`}>
          {renderBlock(block)}
          {index === autoCtaIndex ? <InlineCtaCard body="Get Pip and check one daily number before you spend." /> : null}
        </div>
      ))}
    </div>
  );
}

export function ArticleFaq({ faq }: { faq: Article["faq"] }) {
  if (!faq?.length) {
    return null;
  }

  return (
    <section className="mt-14 border-t border-line pt-10" aria-labelledby="article-faq">
      <h2 className="swiss-type text-3xl font-extrabold leading-tight text-ink" id="article-faq">
        FAQ
      </h2>
      <div className="mt-6 grid gap-4">
        {faq.map((item) => (
          <article className="border-t border-line pt-5" key={item.question}>
            <h3 className="text-base font-bold text-ink">{item.question}</h3>
            <p className="mt-2 text-sm leading-6 text-ink/66">{item.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function JsonLd({ data }: { data: Record<string, unknown> | null }) {
  if (!data) {
    return null;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function renderBlock(block: ArticleBodyBlock) {
  switch (block.type) {
    case "heading":
      if (block.heading.level === 2) {
        return (
          <h2 className="swiss-type pt-4 text-3xl font-extrabold leading-tight text-ink" id={block.heading.id}>
            {block.heading.text}
          </h2>
        );
      }

      return (
        <h3 className="pt-2 text-xl font-bold leading-tight text-ink" id={block.heading.id}>
          {block.heading.text}
        </h3>
      );
    case "paragraph":
      return <p className="max-w-prose">{renderInlineText(block.text)}</p>;
    case "list":
      return (
        <ul className="max-w-prose space-y-2 pl-5">
          {block.items.map((item) => (
            <li className="list-disc" key={item}>
              {renderInlineText(item)}
            </li>
          ))}
        </ul>
      );
    case "callout":
      return <ArticleCallout body={block.body} title={block.title} />;
    case "pip-says":
      return (
        <PipSays>
          <p>{renderInlineText(block.body)}</p>
        </PipSays>
      );
    case "money-example":
      return <MoneyExampleBlock rows={block.rows} title={block.title} />;
    case "comparison":
      return <ComparisonBlock items={block.items} title={block.title} />;
    case "inline-cta":
      return <InlineCtaCard body={block.body} href={block.href} label={block.label} />;
    case "pull-quote":
      return <PullQuote body={block.body} />;
    case "table":
      return <ArticleTable alignments={block.alignments} headers={block.headers} rows={block.rows} />;
    case "figure":
      return <ArticleFigure alt={block.alt} caption={block.caption} height={block.height} src={block.src} width={block.width} />;
  }
}

function ArticleTable({
  alignments,
  headers,
  rows,
}: {
  alignments: Array<"left" | "center" | "right">;
  headers: string[];
  rows: string[][];
}) {
  const alignmentClass = (alignment: "left" | "center" | "right" | undefined) =>
    alignment === "right" ? "text-right" : alignment === "center" ? "text-center" : "text-left";

  return (
    <div className="max-w-3xl overflow-x-auto rounded-3xl border border-line bg-paper shadow-[0_18px_44px_rgba(28,27,27,0.045)]">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-moss/10 text-xs font-extrabold uppercase tracking-normal text-moss">
          <tr>
            {headers.map((header, index) => (
              <th className={["border-b border-line px-4 py-3", alignmentClass(alignments[index])].join(" ")} key={`${header}-${index}`}>
                {renderInlineText(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line text-ink/72">
          {rows.map((row, rowIndex) => (
            <tr key={`${row.join("-")}-${rowIndex}`}>
              {headers.map((header, columnIndex) => (
                <td className={["px-4 py-3 align-top", alignmentClass(alignments[columnIndex])].join(" ")} key={`${header}-${columnIndex}`}>
                  {renderInlineText(row[columnIndex] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArticleCallout({ body, title }: { body: string; title?: string }) {
  return (
    <aside className="max-w-2xl rounded-3xl border border-moss/20 bg-moss/10 p-6 shadow-[0_18px_44px_rgba(28,27,27,0.045)]">
      {title ? <p className="text-sm font-bold uppercase tracking-normal text-moss">{title}</p> : null}
      <p className={["text-base leading-7 text-ink/74", title ? "mt-2" : ""].join(" ")}>{renderInlineText(body)}</p>
    </aside>
  );
}

function MoneyExampleBlock({
  rows,
  title,
}: {
  rows: Array<{ label: string; value: string }>;
  title?: string;
}) {
  return (
    <aside className="max-w-2xl rounded-3xl border border-line bg-paper p-6 shadow-[0_18px_44px_rgba(28,27,27,0.045)]">
      <p className="text-sm font-bold uppercase tracking-normal text-moss">{title ?? "Money example"}</p>
      <dl className="mt-4 divide-y divide-line font-mono text-sm">
        {rows.map((row) => (
          <div className="grid grid-cols-[1fr_auto] gap-4 py-2 first:pt-0 last:pb-0" key={`${row.label}-${row.value}`}>
            <dt className="text-ink/64">{row.label}</dt>
            <dd className="text-right font-bold text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function ComparisonBlock({
  items,
  title,
}: {
  items: Array<{ label: string; value: string }>;
  title?: string;
}) {
  return (
    <aside className="max-w-3xl rounded-3xl border border-line bg-porcelain p-6 shadow-[0_18px_44px_rgba(28,27,27,0.045)]">
      {title ? <p className="text-sm font-bold uppercase tracking-normal text-moss">{title}</p> : null}
      <div className={["grid gap-4 md:grid-cols-2", title ? "mt-4" : ""].join(" ")}>
        {items.map((item) => (
          <div className="rounded-2xl bg-paper p-4" key={item.label}>
            <p className="text-sm font-bold text-ink">{item.label}</p>
            <p className="mt-2 text-sm leading-6 text-ink/66">{renderInlineText(item.value)}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function InlineCtaCard({
  body,
  href = getProductAccessHref(),
  label = productAccess.primaryLabel,
}: {
  body: string;
  href?: string;
  label?: string;
}) {
  return (
    <aside className="max-w-2xl rounded-3xl border border-moss/20 bg-moss/10 p-6 shadow-[0_18px_44px_rgba(28,27,27,0.045)]">
      <p className="text-base font-bold leading-7 text-ink">{renderInlineText(body)}</p>
      <MarketingCtaLink
        className="focus-ring mt-4 inline-flex min-h-11 items-center justify-center gap-2 bg-moss px-5 text-sm font-bold text-porcelain transition hover:bg-ink"
        eventLabel="article_inline_cta"
        eventProperties={{ intent: "get_pip" }}
        href={href}
      >
        {label}
        <ArrowRight aria-hidden="true" size={16} />
      </MarketingCtaLink>
    </aside>
  );
}

function PullQuote({ body }: { body: string }) {
  return (
    <blockquote className="max-w-2xl border-y border-line py-6">
      <Quote aria-hidden="true" className="text-gold" size={24} />
      <p className="swiss-type mt-3 text-3xl font-extrabold leading-tight text-ink">{renderInlineText(body)}</p>
    </blockquote>
  );
}

function ArticleFigure({
  alt,
  caption,
  height,
  src,
  width,
}: {
  alt: string;
  caption?: string;
  height?: number;
  src: string;
  width?: number;
}) {
  return (
    <figure className="max-w-2xl overflow-hidden rounded-3xl border border-line bg-porcelain shadow-[0_18px_44px_rgba(28,27,27,0.045)]">
      <img
        alt={alt}
        className="aspect-[16/9] w-full object-cover"
        decoding="async"
        height={height}
        loading="lazy"
        src={src}
        width={width}
      />
      {caption ? <figcaption className="p-4 text-sm leading-6 text-ink/58">{renderInlineText(caption)}</figcaption> : null}
    </figure>
  );
}

function renderInlineText(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2] && match[3]) {
      const label = match[2];
      const href = match[3];
      const className = "focus-ring rounded font-bold text-moss underline-offset-4 hover:text-ink hover:underline";

      nodes.push(
        href.startsWith("/") ? (
          <Link className={className} href={href} key={`${href}-${match.index}`}>
            {label}
          </Link>
        ) : (
          <a className={className} href={href} key={`${href}-${match.index}`} rel="noreferrer" target="_blank">
            {label}
          </a>
        ),
      );
    } else if (match[4]) {
      nodes.push(
        <strong className="font-extrabold text-ink" key={`strong-${match.index}`}>
          {match[4]}
        </strong>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
}
