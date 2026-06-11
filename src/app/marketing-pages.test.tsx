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

    expect(html).toContain("The number your bank won");
    expect(html).toContain("Spendable Cash Today");
    expect(html).toContain("Join the beta");
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
    expect(renderToStaticMarkup(<BlogIndexPage />)).toContain("Money habits without the homework");

    const article = await ArticlePage({
      params: Promise.resolve({
        slug: "what-is-spendable-cash-today",
      }),
    });

    const html = renderToStaticMarkup(article);

    expect(html).toContain("What is Spendable Cash Today?");
    expect(html).toContain("FAQ");
    expect(html).toContain("application/ld+json");
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
});
