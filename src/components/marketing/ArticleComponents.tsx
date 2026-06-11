import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import type { Article } from "@/lib/marketing/content";

export function ArticleCard({
  article,
  featured = false,
}: {
  article: Article;
  featured?: boolean;
}) {
  return (
    <article
      className={[
        "rounded-[0.5rem] border border-line bg-porcelain p-5 shadow-[0_12px_34px_rgba(60,50,40,0.06)]",
        featured ? "md:p-7" : "",
      ].join(" ")}
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
        className={[
          "font-display mt-4 leading-[1.05] text-ink",
          featured ? "text-4xl sm:text-5xl" : "text-2xl",
        ].join(" ")}
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

export function ArticleBody({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <div className="article-body mt-10 space-y-6 text-[1.02rem] leading-8 text-ink/74">
      {blocks.map((block, index) => renderBlock(block, index))}
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

function renderBlock(block: string, index: number) {
  if (block.startsWith("## ")) {
    const text = block.slice(3).trim();

    return (
      <h2 className="font-display pt-4 text-3xl leading-tight text-ink" id={slugify(text)} key={index}>
        {text}
      </h2>
    );
  }

  if (block.startsWith("### ")) {
    const text = block.slice(4).trim();

    return (
      <h3 className="pt-2 text-xl font-bold leading-tight text-ink" id={slugify(text)} key={index}>
        {text}
      </h3>
    );
  }

  const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);

  if (lines.every((line) => line.startsWith("- "))) {
    return (
      <ul className="space-y-2 pl-5" key={index}>
        {lines.map((line) => (
          <li className="list-disc" key={line}>
            {line.slice(2)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="max-w-prose" key={index}>
      {lines.join(" ")}
    </p>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
