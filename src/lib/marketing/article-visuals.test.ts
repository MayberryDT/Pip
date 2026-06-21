import { describe, expect, it } from "vitest";
import { getArticleVisual } from "@/lib/marketing/article-visuals";
import type { Article } from "@/lib/marketing/content";

const article = {
  title: "Budgeting App Alternative",
  description: "One daily number.",
  slug: "budgeting-app-alternative",
  publishedAt: "2026-06-21",
  updatedAt: "2026-06-21",
  author: "Pip",
  status: "published",
  featured: false,
  tags: ["spendable cash"],
  seo: { title: "Budgeting App Alternative", description: "One daily number." },
  faq: [],
  ogImage: "/marketing/blog/articles/budgeting-app-alternative.svg",
  blocks: [],
  body: "",
  bodyWordCount: 950,
  hasInlineCta: true,
  headings: [],
  readingTimeMinutes: 5,
} satisfies Article;

describe("getArticleVisual", () => {
  it("uses article ogImage before static fallback assets", () => {
    expect(getArticleVisual(article).src).toBe("/marketing/blog/articles/budgeting-app-alternative.svg");
  });
});
