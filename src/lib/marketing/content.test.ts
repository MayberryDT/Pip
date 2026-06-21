import { describe, expect, it } from "vitest";
import {
  calculateReadingTimeMinutes,
  containsStaleLaunchLanguage,
  getAllArticles,
  getArticleBySlug,
  getArticleQualityIssues,
  getFeaturedArticle,
  getPublishedArticles,
  getRelatedArticles,
  parseArticleBody,
  parseArticleSource,
  pillarArticleSlugs,
} from "@/lib/marketing/content";

describe("marketing content loader", () => {
  it("publishes the product article batch and excludes drafts", () => {
    const articles = getPublishedArticles();

    expect(articles).toHaveLength(5);
    expect(articles.map((article) => article.slug)).toContain("meet-pip-cute-money-companion");
    expect(articles.map((article) => article.slug)).toContain("how-much-can-i-spend-today");
    expect(articles.map((article) => article.slug)).toContain("budgeting-app-alternative");
    expect(articles.map((article) => article.slug)).not.toContain("why-pip-is-paid");
    expect(articles.map((article) => article.slug)).not.toContain(
      "how-to-stop-overspending-without-tracking-every-purchase",
    );
  });

  it("maps priority answer queries to published answer pages", () => {
    const publishedSlugs = new Set(getPublishedArticles().map((article) => article.slug));
    const priorityQueryTargets = [
      "what-is-spendable-cash-today",
      "why-your-bank-balance-is-misleading",
      "how-much-can-i-spend-today",
      "meet-pip-cute-money-companion",
    ];

    for (const slug of priorityQueryTargets) {
      expect(publishedSlugs.has(slug), slug).toBe(true);
    }
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

  it("enforces published article quality gates", () => {
    const articles = getPublishedArticles();

    for (const article of articles) {
      expect(getArticleQualityIssues(article), article.slug).toEqual([]);
      expect(article.bodyWordCount).toBeGreaterThanOrEqual(900);
      expect(article.bodyWordCount).toBeLessThanOrEqual(1200);
      expect(article.hasInlineCta).toBe(true);
      expect(article.headings.some((heading) => heading.level === 2 && heading.text !== "Quick answer")).toBe(true);
      expect(article.headings.some((heading) => heading.level === 2 && heading.text === "Source notes")).toBe(true);
      expect(containsStaleLaunchLanguage(article.body), article.slug).toBe(false);
    }
  });

  it("keeps paid product article topics in draft until they are ready", () => {
    const articles = getAllArticles();
    const draftSlugs = articles.filter((article) => article.status === "draft").map((article) => article.slug);

    expect(draftSlugs).toEqual(
      expect.arrayContaining([
        "why-pip-is-paid",
        "why-your-money-app-should-not-be-free",
        "bank-balance-vs-spending-number",
      ]),
    );
  });

  it("parses supported rich article blocks", () => {
    const blocks = parseArticleBody(`## Quick answer

Intro paragraph with a [link](/security).

:::callout title="The short version"
Your bank balance is real.
:::

:::pip-says
Check one number first.
:::

:::money-example title="Simple example"
Bank balance: $900
Room left: $120
:::

:::comparison title="Bank vs Pip"
Bank app: Shows the pile.
Pip: Shows the daily signal.
:::

:::cta
Get Pip.
:::

:::quote
Overspending often starts with one misleading number.
:::

:::figure src="/brand/pip-character/v001/medium/onboarding-wave.png" alt="Pip waving" width="416" height="484"
Pip waving.
:::`);

    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "callout",
      "pip-says",
      "money-example",
      "comparison",
      "inline-cta",
      "pull-quote",
      "figure",
    ]);
  });

  it("parses generated article markdown without leaking raw syntax", () => {
    const parsed = parseArticleSource(`---
title: "Budgeting App Alternative"
description: "One daily spending number instead of category budgets."
slug: "budgeting-app-alternative"
publishedAt: "2026-06-21"
updatedAt: "2026-06-21"
author: "Pip"
status: "published"
tags:
  - spendable cash
seo:
  title: "Budgeting App Alternative"
  description: "One daily spending number instead of category budgets."
ogImage: "/marketing/blog/articles/budgeting-app-alternative.svg"
---
# budgeting app alternative

## Quick answer

Pip is a budgeting app alternative that uses **Spendable Cash Today** as a read-only daily signal. It is not financial advice.

> Estimated spendable today = usable cash - near-term bills - protected savings.

## Realistic dollar example

| What's in play | Amount | Why it matters |
| --- | ---: | --- |
| Checking account balance | $4,500 | Raw bank balance looks big |
| Rent due in 3 days | -$2,000 | Must stay in the account |
`);

    const blocks = parseArticleBody(parsed.body);

    expect(blocks.some((block) => block.type === "heading" && block.heading.text === "budgeting app alternative")).toBe(false);
    expect(blocks.some((block) => block.type === "pull-quote")).toBe(true);
    expect(blocks.some((block) => block.type === "table")).toBe(true);
  });

  it("rejects malformed or unsafe article bodies", () => {
    expect(() => parseArticleBody(`:::unknown
Body
:::`)).toThrow(/Unsupported custom article block type/);

    expect(() => parseArticleBody(`:::callout
Body`)).toThrow(/missing a closing marker/);

    expect(() => parseArticleBody(`<script>alert("x")</script>`)).toThrow(/raw HTML/);
  });

  it("loads individual articles by slug", () => {
    expect(getArticleBySlug("what-is-spendable-cash-today")).toMatchObject({
      title: "What is Spendable Cash Today?",
      status: "published",
    });
    expect(getArticleBySlug("daily-spending-allowance-vs-budget")).toBeNull();
  });
});
