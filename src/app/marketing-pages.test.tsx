import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MarketingHomePage from "@/app/page";
import AppPage from "@/app/app/page";
import BlogIndexPage from "@/app/blog/page";
import ArticlePage from "@/app/blog/[slug]/page";
import HowItWorksPage from "@/app/how-it-works/page";
import SecurityPage from "@/app/security/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("marketing website pages", () => {
  it("renders the public root marketing homepage", () => {
    const html = renderToStaticMarkup(<MarketingHomePage />);

    expect(html).toContain("Before you spend, check Pip.");
    expect(html).toContain("Spendable Cash Today");
    expect(html).toContain("Join the beta");
    expect(html).toContain("Read-only account data. Pip cannot move your money.");
    expect(html).toContain("Your bank app shows the pile. Pip shows the spending number.");
  });

  it("keeps the product app available at /app", async () => {
    const page = await AppPage({
      searchParams: Promise.resolve({
        onboarding: "guest",
      }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Hi,");
    expect(html).toContain("Spendable Cash Today");
  });

  it("renders required public support pages", () => {
    expect(renderToStaticMarkup(<HowItWorksPage />)).toContain("Pip turns money noise into one daily number");
    expect(renderToStaticMarkup(<SecurityPage />)).toContain("No money movement");
  });

  it("renders the blog index and a published article page", async () => {
    const blogHtml = renderToStaticMarkup(<BlogIndexPage />);

    expect(blogHtml).toContain("Tiny money habits, no homework.");
    expect(blogHtml).toContain("Start here");

    const article = await ArticlePage({
      params: Promise.resolve({
        slug: "what-is-spendable-cash-today",
      }),
    });

    const html = renderToStaticMarkup(article);

    expect(html).toContain("What is Spendable Cash Today?");
    expect(html).toContain("In this article");
    expect(html).toContain("FAQ");
    expect(html).toContain("application/ld+json");
    expect(html).toContain("BreadcrumbList");
    expect(html).toContain("Join the beta and try Spendable Cash Today");
  });

  it("renders rich article blocks on published article pages", async () => {
    const article = await ArticlePage({
      params: Promise.resolve({
        slug: "why-your-bank-balance-is-misleading",
      }),
    });

    const html = renderToStaticMarkup(article);

    expect(html).toContain("The short version");
    expect(html).toContain("Why $900 might not mean $900");
    expect(html).toContain("Bank balance vs Pip");
    expect(html).toContain("Overspending often starts with one misleading number.");
  });

  it("includes public pages and published articles in sitemap only", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain("https://spendwithpip.com/");
    expect(urls).toContain("https://spendwithpip.com/blog/what-is-spendable-cash-today");
    expect(urls).not.toContain("https://spendwithpip.com/app");
    expect(urls).not.toContain("https://spendwithpip.com/blog/daily-spending-allowance-vs-budget");
  });

  it("keeps robots focused on public marketing pages", () => {
    expect(robots()).toMatchObject({
      rules: [
        {
          userAgent: "*",
          disallow: expect.arrayContaining(["/api/", "/auth/", "/plaid/", "/app"]),
        },
      ],
      sitemap: "https://spendwithpip.com/sitemap.xml",
    });
  });

  it("ships llms.txt with the product thesis and public page map", () => {
    const llms = readFileSync(join(process.cwd(), "public/llms.txt"), "utf8");

    expect(llms).toContain("Spendable Cash Today");
    expect(llms).toContain("https://spendwithpip.com/security");
    expect(llms).toContain("Pip does not move money");
  });

  it("keeps old product names and overbroad positioning out of public marketing pages", async () => {
    const article = await ArticlePage({
      params: Promise.resolve({
        slug: "meet-pip-cute-money-companion",
      }),
    });
    const publicHtml = [
      renderToStaticMarkup(<MarketingHomePage />),
      renderToStaticMarkup(<BlogIndexPage />),
      renderToStaticMarkup(<HowItWorksPage />),
      renderToStaticMarkup(<SecurityPage />),
      renderToStaticMarkup(article),
    ].join("\n");

    expect(publicHtml).not.toContain("Free Cash");
    expect(publicHtml).not.toContain("PIP Cash Today");
    expect(publicHtml).not.toContain("My Margin");
    expect(publicHtml).not.toContain("finance command center");
    expect(publicHtml).not.toContain("AI finance coach");
  });
});
