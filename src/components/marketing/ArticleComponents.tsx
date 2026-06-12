import Link from "next/link";
import { ArrowRight, Clock3, Quote } from "lucide-react";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { PipSays } from "@/components/marketing/PipSays";
import type { Article, ArticleBodyBlock } from "@/lib/marketing/content";
import { parseArticleBody } from "@/lib/marketing/content";
import { pipLaunch } from "@/lib/marketing/pricing";

export function ArticleCard({
  article,
  featured = false,
}: {
  article: Article;
  featured?: boolean;
}) {
  if (featured) {
    return (
      <article className="grid gap-6 rounded-[0.5rem] border border-line bg-paper p-6 shadow-[0_18px_44px_rgba(60,50,40,0.08)] md:grid-cols-[1fr_auto] md:p-8">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-bold uppercase tracking-normal text-ink">
              Start here
            </span>
            {article.tags.slice(0, 3).map((tag) => (
              <span
                className="rounded-full border border-line bg-porcelain px-3 py-1 text-xs font-bold text-moss"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
          <h2 className="font-display mt-5 max-w-3xl text-4xl leading-[1.05] text-ink sm:text-5xl">
            <Link className="focus-ring rounded hover:text-moss" href={`/blog/${article.slug}`}>
              {article.title}
            </Link>
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink/66">{article.description}</p>
          <div className="mt-5 flex flex-wrap items-center gap-4 text-xs font-bold uppercase tracking-normal text-taupe">
            <span>{formatDate(article.publishedAt)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 aria-hidden="true" size={14} />
              {article.readingTimeMinutes} min
            </span>
          </div>
          <Link
            className="focus-ring mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-porcelain transition hover:bg-moss"
            href={`/blog/${article.slug}`}
          >
            Start reading
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
        <img
          src="/brand/pip-waving.png"
          alt=""
          aria-hidden="true"
          width={416}
          height={484}
          loading="lazy"
          decoding="async"
          className="hidden h-44 w-auto self-end object-contain drop-shadow-[0_18px_28px_rgba(60,50,40,0.12)] md:block"
        />
      </article>
    );
  }

  return (
    <article
      className="rounded-[0.5rem] border border-line bg-porcelain p-5 shadow-[0_12px_34px_rgba(60,50,40,0.06)]"
    >
      <div className="flex flex-wrap gap-2">
        {article.tags.slice(0, 3).map((tag) => (
          <span
            className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-bold text-moss"
            key={tag}
          >
            {tag}
          </span>
        ))}
      </div>
      <h2
        className="font-display mt-4 text-2xl leading-[1.05] text-ink"
      >
        <Link className="focus-ring rounded hover:text-moss" href={`/blog/${article.slug}`}>
          {article.title}
        </Link>
      </h2>
      <p className="mt-3 text-sm leading-6 text-ink/66">{article.description}</p>
      <div className="mt-5 flex flex-wrap items-center gap-4 text-xs font-bold uppercase tracking-normal text-taupe">
        <span>{formatDate(article.publishedAt)}</span>
        <span className="inline-flex items-center gap-1">
          <Clock3 aria-hidden="true" size={14} />
          {article.readingTimeMinutes} min
        </span>
      </div>
      <Link
        className="focus-ring mt-5 inline-flex items-center gap-2 rounded-full text-sm font-bold text-moss hover:text-ink"
        href={`/blog/${article.slug}`}
      >
        Read article
        <ArrowRight aria-hidden="true" size={16} />
      </Link>
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
          {index === autoCtaIndex ? <InlineCtaCard body="Get launch access and try Pip when it launches." /> : null}
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
      <h2 className="font-display text-3xl leading-tight text-ink" id="article-faq">
        FAQ
      </h2>
      <div className="mt-6 grid gap-4">
        {faq.map((item) => (
          <article className="rounded-[0.5rem] border border-line bg-porcelain p-5" key={item.question}>
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
          <h2 className="font-display pt-4 text-3xl leading-tight text-ink" id={block.heading.id}>
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
    case "figure":
      return <ArticleFigure alt={block.alt} caption={block.caption} height={block.height} src={block.src} width={block.width} />;
  }
}

function ArticleCallout({ body, title }: { body: string; title?: string }) {
  return (
    <aside className="max-w-2xl rounded-[0.5rem] border-l-4 border-moss bg-porcelain p-5 shadow-[0_12px_28px_rgba(60,50,40,0.05)]">
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
    <aside className="max-w-2xl rounded-[0.5rem] border border-line bg-paper p-5 shadow-[0_12px_28px_rgba(60,50,40,0.05)]">
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
    <aside className="max-w-3xl rounded-[0.5rem] border border-line bg-porcelain p-5 shadow-[0_12px_28px_rgba(60,50,40,0.05)]">
      {title ? <p className="text-sm font-bold uppercase tracking-normal text-moss">{title}</p> : null}
      <div className={["grid gap-4 md:grid-cols-2", title ? "mt-4" : ""].join(" ")}>
        {items.map((item) => (
          <div className="rounded-[0.5rem] border border-line bg-paper p-4" key={item.label}>
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
  href = "#launch-access",
  label = pipLaunch.primaryCta,
}: {
  body: string;
  href?: string;
  label?: string;
}) {
  return (
    <aside className="max-w-2xl rounded-[0.5rem] border border-moss/30 bg-moss/10 p-5 shadow-[0_12px_28px_rgba(60,50,40,0.05)]">
      <p className="text-base font-bold leading-7 text-ink">{renderInlineText(body)}</p>
      <MarketingCtaLink
        className="focus-ring mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-moss px-5 text-sm font-bold text-porcelain transition hover:bg-ink"
        eventLabel="article_inline_cta"
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
      <p className="font-display mt-3 text-3xl leading-tight text-ink">{renderInlineText(body)}</p>
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
    <figure className="max-w-2xl">
      <img
        alt={alt}
        className="w-full rounded-[0.5rem] border border-line bg-porcelain object-cover"
        decoding="async"
        height={height}
        loading="lazy"
        src={src}
        width={width}
      />
      {caption ? <figcaption className="mt-3 text-sm leading-6 text-ink/58">{renderInlineText(caption)}</figcaption> : null}
    </figure>
  );
}

function renderInlineText(text: string) {
  const nodes: Array<string | JSX.Element> = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const [, label, href] = match;
    const className = "focus-ring rounded font-bold text-moss underline-offset-4 hover:text-ink hover:underline";

    if (href.startsWith("/")) {
      nodes.push(
        <Link className={className} href={href} key={`${href}-${match.index}`}>
          {label}
        </Link>,
      );
    } else {
      nodes.push(
        <a className={className} href={href} key={`${href}-${match.index}`} rel="noreferrer" target="_blank">
          {label}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
}
