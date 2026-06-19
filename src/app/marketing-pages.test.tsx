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
import HowTheNumberWorksPage from "@/app/how-the-number-works/page";
import { PricingPageContent } from "@/components/marketing/PricingPageContent";
import PrivacyPage from "@/app/privacy/page";
import SecurityPage from "@/app/security/page";
import SupportPage from "@/app/support/page";
import TermsPage from "@/app/terms/page";
import AndroidAccessPage from "@/app/android-access/page";
import DeleteAccountPage from "@/app/delete-account/page";
import { marketingAssets, requiredMarketingAssetRoles } from "@/lib/marketing/assets";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

const stalePublicMarketingPattern =
  /\b(?:waitlist|launch access|launch list|notify me|request access)\b|join the beta|join the list|#launch-access|when pip launches|when it launches|coming soon to (?:iphone|android|the app store|google play)/i;

const homepageSectionHooks = [
  "hero",
  "balance",
  "habit",
  "anti-budget",
  "how-it-works",
  "pricing-trust",
  "ask-pip",
  "blog",
  "final-cta",
];

const renderedMarketingAssetRoles = [
  "homepageHeroProduct",
  "homepageBalanceRoom",
  "homepageHabitShift",
  "homepageAntiBudget",
  "homepageHowItWorks",
  "homepageAskPip",
  "homepageFinalCta",
  "blogMeetPipCard",
  "blogBankBalanceCard",
  "blogSpendableCashCard",
  "pricingIllustration",
  "securityTrustIllustration",
  "howPipWorksSteps",
  "articleCoverTemplate",
] as const;

describe("marketing website pages", () => {
  it("renders the public root marketing homepage", () => {
    const html = renderToStaticMarkup(<MarketingHomePage />);

    for (const section of homepageSectionHooks) {
      expect(html).toContain(`data-section="${section}"`);
    }

    expect(html).toContain("Before you spend, check Pip.");
    expect(html).toContain("Spendable Cash Today");
    expect(html).toContain("pip-home-title-lockup");
    expect(html).toContain('class="pip-title-line"');
    expect(html).toContain('class="pip-title-line pip-title-line-accent"');
    expect(html).toContain("Get Pip");
    expect(html).toContain("$2.99/week");
    expect(html).toContain("$7.99/month");
    expect(html).not.toContain("Read-only account data. Pip cannot move your money.");
    expect(html).not.toContain("Read-only account data");
    expect(html).not.toContain("Pip cannot move money");
    expect(html).toContain("Your balance is not all open room.");
    expect(html).toContain("Same check. Better number.");
    expect(html).toContain("Same habit");
    expect(html).toContain("Better number");
    expect(html).toContain("Read-only data");
    expect(html).toContain("Savings protected");
    expect(html).toContain("One daily number");
    expect(html).toContain("Read the blog");
    expect(html).toContain("Featured read");
    expect(html).toContain("pip-generated-figure");
    expect(html).toContain(marketingAssets.homepageHeroProduct.src);
    expect(html).toContain(marketingAssets.homepageBalanceRoom.src);
    expect(html).toContain(marketingAssets.homepageAskPip.src);
    expect(html).toContain(marketingAssets.blogMeetPipCard.src);
    expect(html).toContain("editorial-mobile-menu");
    expect(html).not.toContain("editorial-mobile-nav");
    expect(html).not.toMatch(stalePublicMarketingPattern);
    expect(html).not.toContain('type="email"');
  });

  it("keeps mobile marketing chrome from stacking sticky bars", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const mobileChromeCss = css
      .slice(css.lastIndexOf("@media (max-width: 900px)"))
      .split("@media (max-width: 767px)")[0];

    expect(mobileChromeCss).toContain(".editorial-header {\n    position: relative;");
    expect(mobileChromeCss).toContain("z-index: 60;");
    expect(mobileChromeCss).toContain("grid-template-columns: 1fr auto auto;");
    expect(mobileChromeCss).toContain(".editorial-mobile-menu {\n    position: relative;");
    expect(mobileChromeCss).toContain("display: block;");
    expect(mobileChromeCss).toContain(".editorial-mobile-menu-panel {");
    expect(mobileChromeCss).toContain("position: absolute;");
    expect(mobileChromeCss).toContain(".editorial-footer-grid {\n    row-gap: 1rem;");
    expect(mobileChromeCss).not.toContain(".editorial-mobile-nav {\n    position: static;");
    expect(mobileChromeCss).not.toContain("position: sticky;");
    expect(mobileChromeCss).not.toContain("top: 4.5rem;");
  });

  it("keeps the hero product asset transparent", () => {
    const heroAsset = readFileSync(
      join(process.cwd(), "public", marketingAssets.homepageHeroProduct.src.replace(/^\//, "")),
    );

    expect(heroAsset[25]).toBe(6);
  });

  it("keeps the mobile hero subject from being clipped", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const mobileHeroCss = css.slice(css.lastIndexOf("@media (max-width: 767px)"));

    expect(css).toContain(".pip-title-line {\n  display: block;\n  white-space: nowrap;");
    expect(css).toContain(".pip-home-title .pip-title-line-accent,");
    expect(css).toContain(".pip-home-title-lockup {\n  max-width: none;");
    expect(mobileHeroCss).toContain(".pip-home-title-lockup {\n    max-width: none;");
    expect(mobileHeroCss).toContain(".pip-hero-stage {\n    min-height: min(31.5rem, 124vw);");
    expect(mobileHeroCss).toContain("margin: 1.25rem -1.25rem -0.5rem;");
    expect(mobileHeroCss).toContain("overflow: visible;");
    expect(mobileHeroCss).toContain(".pip-home .pip-stage-subject {");
    expect(mobileHeroCss).toContain("top: 0;");
    expect(mobileHeroCss).toContain("bottom: auto;");
    expect(mobileHeroCss).toContain("max-width: 100%;");
  });

  it("keeps redesigned homepage sections scoped and responsive", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const tabletCss = css
      .slice(css.lastIndexOf("@media (max-width: 980px)"))
      .split("@media (max-width: 900px)")[0];
    const mobileCss = css.slice(css.lastIndexOf("@media (max-width: 767px)"));

    expect(css).toContain(".pip-balance-layout,");
    expect(css).toContain(".pip-generated-figure {");
    expect(css).toContain(".pip-habit-layout,");
    expect(css).toContain(".pip-identity-summary,");
    expect(css).toContain(".pip-step-rule-list {");
    expect(css).toContain(".pip-blog-editorial-grid {");
    expect(css).toContain(".pip-final-figure {");
    expect(tabletCss).toContain(".pip-balance-layout,");
    expect(tabletCss).toContain(".pip-habit-layout,");
    expect(tabletCss).toContain(".pip-ask-layout {");
    expect(tabletCss).toContain("grid-template-columns: 1fr;");
    expect(mobileCss).toContain(".pip-generated-figure,");
    expect(mobileCss).toContain(".pip-chat-prompts span {");
    expect(mobileCss).toContain("min-height: 2.75rem;");
  });

  it("keeps the product app available at /app", async () => {
    const page = await AppPage({
      searchParams: Promise.resolve({
        onboarding: "guest",
      }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Hi,");
    expect(html).toContain("Continue with Google");
    expect(html).not.toContain("Spendable Cash Today");
  });

  it("renders required public support pages", () => {
    expect(renderToStaticMarkup(<HowItWorksPage />)).toContain("Pip turns money noise into one daily number");
    expect(renderToStaticMarkup(<HowTheNumberWorksPage />)).toContain("Spendable Cash Today is simple on purpose");
    expect(renderToStaticMarkup(<PricingPageContent />)).toContain("Simple pricing for one daily number");
    expect(renderToStaticMarkup(<SecurityPage />)).toContain("No money movement");
    expect(renderToStaticMarkup(<SupportPage />)).toContain("Account Connection Help");
    expect(renderToStaticMarkup(<PrivacyPage />)).toContain("What Pip Stores");
    expect(renderToStaticMarkup(<TermsPage />)).toContain("Product Boundary");
    expect(renderToStaticMarkup(<DeleteAccountPage />)).toContain("Delete your Pip account");
    expect(renderToStaticMarkup(<AndroidAccessPage />)).toContain("Your access is active");
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
    expect(urls).toContain("https://spendwithpip.com/how-the-number-works");
    expect(urls).toContain("https://spendwithpip.com/pricing");
    expect(urls).toContain("https://spendwithpip.com/delete-account");
    expect(urls).toContain("https://spendwithpip.com/blog/what-is-spendable-cash-today");
    expect(urls).not.toContain("https://spendwithpip.com/app");
    expect(urls).not.toContain("https://spendwithpip.com/blog/daily-spending-allowance-vs-budget");
  });

  it("keeps robots focused on public marketing pages", () => {
    const robotsResult = robots();

    expect(robotsResult).toMatchObject({
      rules: [
        {
          userAgent: "*",
          disallow: expect.arrayContaining(["/api/", "/auth/", "/plaid/", "/app", "/reviewer-login"]),
        },
      ],
      sitemap: "https://spendwithpip.com/sitemap.xml",
    });
    const firstRule = Array.isArray(robotsResult.rules) ? robotsResult.rules[0] : robotsResult.rules;

    expect(firstRule?.allow).toEqual(
      expect.arrayContaining(["/how-the-number-works", "/pricing"]),
    );
  });

  it("keeps reviewer login out of public indexing", async () => {
    const { metadata } = await import("@/app/reviewer-login/page");

    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
    });
  });

  it("ships llms.txt with the product thesis and public page map", () => {
    const llms = readFileSync(join(process.cwd(), "public/llms.txt"), "utf8");

    expect(llms).toContain("Spendable Cash Today");
    expect(llms).toContain("$2.99/week");
    expect(llms).toContain("https://spendwithpip.com/how-the-number-works");
    expect(llms).toContain("https://spendwithpip.com/security");
    expect(llms).toContain("Pip does not move money");
    expect(llms).toContain("AI explains and answers");
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
      renderToStaticMarkup(<PricingPageContent />),
      renderToStaticMarkup(<SecurityPage />),
      renderToStaticMarkup(<SupportPage />),
      renderToStaticMarkup(<PrivacyPage />),
      renderToStaticMarkup(<TermsPage />),
      renderToStaticMarkup(<DeleteAccountPage />),
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
    expect(requiredMarketingAssetRoles).toHaveLength(21);

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
      renderToStaticMarkup(<PricingPageContent />),
      renderToStaticMarkup(<SecurityPage />),
      renderToStaticMarkup(article),
    ].join("\n");

    for (const role of renderedMarketingAssetRoles) {
      const asset = marketingAssets[role];

      expect(publicHtml, asset.role).toContain(asset.src);
    }
  });
});
