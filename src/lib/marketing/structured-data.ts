import type { Article } from "@/lib/marketing/content";
import { getCanonicalUrl, marketingSite } from "@/lib/marketing/site";

type JsonLd = Record<string, unknown>;

export function buildOrganizationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Pip",
    url: getCanonicalUrl("/"),
    logo: getCanonicalUrl("/icon-512.png"),
  };
}

export function buildWebSiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Pip",
    url: getCanonicalUrl("/"),
    description: marketingSite.defaultDescription,
  };
}

export function buildArticleJsonLd(article: Article): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: {
      "@type": "Organization",
      name: article.author,
    },
    publisher: {
      "@type": "Organization",
      name: "Pip",
      logo: {
        "@type": "ImageObject",
        url: getCanonicalUrl("/icon-512.png"),
      },
    },
    mainEntityOfPage: getCanonicalUrl(`/blog/${article.slug}`),
    keywords: article.tags.join(", "),
  };
}

export function buildFaqJsonLd(faq: Article["faq"]): JsonLd | null {
  if (!faq?.length) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
