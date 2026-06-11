import type { MetadataRoute } from "next";
import { getPublishedArticles } from "@/lib/marketing/content";
import { getCanonicalUrl, publicMarketingPages } from "@/lib/marketing/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const publicPages = publicMarketingPages.map((page) => ({
    url: getCanonicalUrl(page.path),
    lastModified: new Date("2026-06-11"),
    changeFrequency: page.path === "/" ? "weekly" as const : "monthly" as const,
    priority: page.path === "/" ? 1 : 0.75,
  }));
  const articles = getPublishedArticles().map((article) => ({
    url: getCanonicalUrl(`/blog/${article.slug}`),
    lastModified: new Date(`${article.updatedAt}T00:00:00Z`),
    changeFrequency: "monthly" as const,
    priority: article.featured ? 0.8 : 0.65,
  }));

  return [...publicPages, ...articles];
}
