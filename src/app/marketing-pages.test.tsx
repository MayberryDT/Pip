import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MarketingHomePage from "@/app/page";
import AppPage from "@/app/app/page";
import BlogIndexPage from "@/app/blog/page";
import ArticlePage from "@/app/blog/[slug]/page";
import HowItWorksPage from "@/app/how-it-works/page";
import PricingPage from "@/app/pricing/page";
import PrivacyPage from "@/app/privacy/page";
import SecurityPage from "@/app/security/page";
import SupportPage from "@/app/support/page";
import TermsPage from "@/app/terms/page";
import { marketingAssets, requiredMarketingAssetRoles } from "@/lib/marketing/assets";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

const stalePublicMarketingPattern =
  /\b(?:waitlist|tester|testers|launch access|launch list|notify me|request access)\b|join the beta|join the list|#launch-access|when pip launches|when it launches|coming soon to (?:iphone|android|the app store|google play)/i;

describe("marketing website pages", () => {
  it("renders the public root marketing homepage", () => {
    const html = renderToStaticMarkup(<MarketingHomePage />);

    expect(html).toContain("Before you spend, check Pip.");
    expect(html).toContain("Spendable Cash Today");
    expect(html).toContain("Get Pip");
    expect(html).toContain("$2.99/week");
    expect(html).toContain("$7.99/month");
    expect(html).toContain("Read-only account data. Pip cannot move your money.");
    expect(html).toContain("The balance is real. It is just not all open room.");
    expect(html).toContain("Built for people who will never use a budget.");
    expect(html).toContain(marketingAssets.homepageHeroProduct.src);
    expect(html).not.toMatch(stalePublicMarketingPattern);
    expect(html).not.toContain('type="email"');
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
    expect(renderToStaticMarkup(<PricingPage />)).toContain("Simple pricing for one daily number");
    expect(renderToStaticMarkup(<SecurityPage />)).toContain("No money movement");
    expect(renderToStaticMarkup(<SupportPage />)).toContain("Account Connection Help");
    expect(renderToStaticMarkup(<PrivacyPage />)).toContain("What Pip Stores");
    expect(renderToStaticMarkup(<TermsPage />)).toContain("Product Boundary");
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
    expect(html).toContain("Get Pip and try Spendable Cash Today");
    expect(html).toContain(marketingAssets.articleCoverTemplate.src);
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
    expect(urls).toContain("https://spendwithpip.com/pricing");
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
    expect(llms).toContain("$2.99/week");
    expect(llms).toContain("https://spendwithpip.com/security");
    expect(llms).toContain("Pip does not move money");
    expect(llms).not.toMatch(stalePublicMarketingPattern);
  });

  it("keeps old product names, stale launch language, and forms out of public marketing pages", async () => {
    const article = await ArticlePage({
      params: Promise.resolve({
        slug: "meet-pip-cute-money-companion",
      }),
    });
    const publicHtml = [
      renderToStaticMarkup(<MarketingHomePage />),
      renderToStaticMarkup(<BlogIndexPage />),
      renderToStaticMarkup(<HowItWorksPage />),
      renderToStaticMarkup(<PricingPage />),
      renderToStaticMarkup(<SecurityPage />),
      renderToStaticMarkup(<SupportPage />),
      renderToStaticMarkup(<PrivacyPage />),
      renderToStaticMarkup(<TermsPage />),
      renderToStaticMarkup(article),
    ].join("\n");

    expect(publicHtml).not.toContain("Free Cash");
    expect(publicHtml).not.toContain("PIP Cash Today");
    expect(publicHtml).not.toContain("My Margin");
    expect(publicHtml).not.toContain("finance command center");
    expect(publicHtml).not.toContain("AI finance coach");
    expect(publicHtml).not.toMatch(stalePublicMarketingPattern);
    expect(publicHtml).not.toContain('type="email"');
  });

  it("maps and renders the required marketing image assets", async () => {
    expect(requiredMarketingAssetRoles).toHaveLength(12);

    for (const asset of Object.values(marketingAssets)) {
      expect(asset.src).toMatch(/^\/marketing\//);
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
      expect(existsSync(join(process.cwd(), "public", asset.src))).toBe(true);
    }

    const article = await ArticlePage({
      params: Promise.resolve({
        slug: "what-is-spendable-cash-today",
      }),
    });
    const publicHtml = [
      renderToStaticMarkup(<MarketingHomePage />),
      renderToStaticMarkup(<BlogIndexPage />),
      renderToStaticMarkup(<HowItWorksPage />),
      renderToStaticMarkup(<PricingPage />),
      renderToStaticMarkup(<SecurityPage />),
      renderToStaticMarkup(article),
    ].join("\n");

    for (const asset of Object.values(marketingAssets)) {
      if (asset.role === "ogImage") {
        continue;
      }

      expect(publicHtml, asset.role).toContain(asset.src);
    }
  });
});
