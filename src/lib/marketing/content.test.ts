import { describe, expect, it } from "vitest";
import {
  calculateReadingTimeMinutes,
  getArticleBySlug,
  getFeaturedArticle,
  getPublishedArticles,
  getRelatedArticles,
  parseArticleSource,
} from "@/lib/marketing/content";

describe("marketing content loader", () => {
  it("publishes the launch article batch and excludes drafts", () => {
    const articles = getPublishedArticles();

    expect(articles).toHaveLength(5);
    expect(articles.map((article) => article.slug)).toContain("meet-pip-cute-money-companion");
    expect(articles.map((article) => article.slug)).not.toContain(
      "how-to-stop-overspending-without-tracking-every-purchase",
    );
  });

  it("selects a featured article and related articles from published content only", () => {
    const featured = getFeaturedArticle();

    expect(featured?.slug).toBe("meet-pip-cute-money-companion");
    expect(getRelatedArticles(featured!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "what-is-spendable-cash-today",
        }),
      ]),
    );
    expect(getRelatedArticles(featured!).some((article) => article.status !== "published")).toBe(false);
  });

  it("validates required frontmatter fields", () => {
    expect(() =>
      parseArticleSource(`---
title: "Missing SEO"
slug: "missing-seo"
publishedAt: "2026-06-11"
updatedAt: "2026-06-11"
author: "Pip"
status: "published"
tags:
  - spendable cash
---
## Quick answer

Body`),
    ).toThrow(/Invalid article frontmatter/);
  });

  it("calculates at least a one-minute reading time", () => {
    expect(calculateReadingTimeMinutes("short body")).toBe(1);
  });

  it("loads individual articles by slug", () => {
    expect(getArticleBySlug("what-is-spendable-cash-today")).toMatchObject({
      title: "What is Spendable Cash Today?",
      status: "published",
    });
    expect(getArticleBySlug("daily-spending-allowance-vs-budget")).toBeNull();
  });
});
