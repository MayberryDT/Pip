import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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
import { getArticleVisual } from "@/lib/marketing/article-visuals";
import { getPublishedArticles } from "@/lib/marketing/content";
import { publicMarketingPages } from "@/lib/marketing/site";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

const stalePublicMarketingPattern =
  /\b(?:launch access|launch list|notify me|request access)\b|join the beta|join the list|#launch-access|when pip launches|when it launches|coming soon to (?:iphone|android|the app store|google play)/i;

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
    expect(html).toContain("Join waitlist");
    expect(html).toContain("Email for early access");
    expect(html).toContain("app access invites and occasional product updates");
    expect(html).toContain("Unsubscribe anytime");
    expect(html).not.toContain("Get Pip");
    expect(html).toContain("$7.99/month");
    expect(html).not.toContain("$2.99/week");
    expect(html).not.toContain("Best value");
    expect(html).not.toContain("About $95.88/year");
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
    expect(html).not.toContain("Yes. You still have $84 for today.");
    expect(html).toContain(
      "After a $50 purchase, today&#x27;s estimate would be about $84, assuming no missing or pending activity.",
    );
    expect(html).toContain(marketingAssets.blogMeetPipCard.src);
    expect(html).toContain(">How the number works</a>");
    expect(html).toContain("editorial-mobile-menu");
    expect(html).not.toContain("editorial-mobile-nav");
    expect(html).not.toContain('href="/app"');
    expect(html).not.toMatch(stalePublicMarketingPattern);
    expect(html).toContain('type="email"');
  });

  it("loads visible blog card images eagerly instead of leaving blank lazy slots", () => {
    const homeHtml = renderToStaticMarkup(<MarketingHomePage />);
    const blogIndexHtml = renderToStaticMarkup(<BlogIndexPage />);

    const homeSupportingArticles = getPublishedArticles()
      .filter((article) => article.slug !== "meet-pip-cute-money-companion")
      .slice(0, 2);

    expect(homeSupportingArticles.map((article) => article.slug)).toEqual([
      "why-is-my-bank-balance-misleading",
      "budgeting-app-alternative",
    ]);
    expectImageLoading(homeHtml, marketingAssets.blogMeetPipCard.src, "eager");
    for (const article of homeSupportingArticles) {
      expect(homeHtml).toContain(article.title);
      expectImageLoading(homeHtml, getArticleVisual(article).src, "eager");
    }
    expectImageLoading(blogIndexHtml, marketingAssets.blogMeetPipCard.src, "eager");
    expectImageLoading(blogIndexHtml, marketingAssets.blogBankBalanceCard.src, "eager");
    expectImageLoading(blogIndexHtml, marketingAssets.blogSpendableCashCard.src, "eager");
  });

  it("keeps mobile marketing chrome from stacking sticky bars", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const mobileChromeCss = css
      .slice(css.lastIndexOf("@media (max-width: 1100px)"))
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

  it("keeps marketing header nav labels on one line before switching to the menu", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const navLinkCss = css
      .slice(css.lastIndexOf(".editorial-nav-link {"))
      .split(".editorial-nav-link:hover")[0];

    expect(navLinkCss).toContain("flex: 0 0 auto;");
    expect(navLinkCss).toContain("white-space: nowrap;");
    expect(css).toContain("@media (max-width: 1100px)");
  });

  it("keeps the hero product asset transparent", () => {
    const heroAsset = readFileSync(
      join(process.cwd(), "public", marketingAssets.homepageHeroProduct.src.replace(/^\//, "")),
    );

    expect(heroAsset[25]).toBe(6);
  });

  it("keeps the mobile hero subject from being clipped", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const mobileHeroCss = sliceCssFromMediaQueryContaining(
      css,
      "@media (max-width: 767px)",
      ".pip-home-title-lockup {\n    max-width: none;",
    );

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
      .split("@media (max-width: 1100px)")[0];
    const mobileCss = sliceCssFromMediaQueryContaining(css, "@media (max-width: 767px)", ".pip-generated-figure,");
    const posterCss = css
      .slice(css.indexOf(".pip-story-poster-anti,\n.pip-story-poster-final {"))
      .split(".pip-story-poster-anti::before")[0];

    expect(css).toContain(".pip-balance-layout,");
    expect(css).toContain(".pip-generated-figure {");
    expect(css).toContain(".pip-habit-layout,");
    expect(css).toContain(".pip-identity-summary,");
    expect(css).toContain(".pip-step-rule-list {");
    expect(css).toContain(".pip-blog-editorial-grid {");
    expect(css).toContain(".pip-final-figure {");
    expect(css).toContain(".pip-home-section {\n  padding: 5.75rem 0;");
    expect(css).toContain(".pip-hero-section {");
    expect(css).toContain("padding-bottom: 5.5rem;");
    expect(posterCss).toContain("aspect-ratio: 16 / 8.5;");
    expect(tabletCss).toContain(".pip-balance-layout,");
    expect(tabletCss).toContain(".pip-habit-layout,");
    expect(tabletCss).toContain(".pip-ask-layout {");
    expect(tabletCss).toContain("grid-template-columns: 1fr;");
    expect(mobileCss).toContain(".pip-generated-figure,");
    expect(mobileCss).toContain(".pip-chat-prompts span {");
    expect(mobileCss).toContain("min-height: 2.75rem;");
  });

  it("keeps the product app gated at /app when access checks are unavailable", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    try {
      const page = await AppPage({
        searchParams: Promise.resolve({}),
      });
      const html = renderToStaticMarkup(page);

      expect(html).toContain("Pip access is temporarily unavailable");
      expect(html).not.toContain("data-testid=\"agent-thread\"");
      expect(html).not.toContain("Continue with Google");
      expect(html).not.toContain("$104");
      expect(html).not.toContain("I see a payment to Capital One");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("renders required public support pages", () => {
    expect(renderToStaticMarkup(<HowItWorksPage />)).toContain(
      "Pip turns your bank balance into today&#x27;s spending room.",
    );
    expect(renderToStaticMarkup(<HowTheNumberWorksPage />)).toContain(
      "The in-app receipt should read like",
    );
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
    expect(html).toContain("Join waitlist");
    expect(html).toContain(marketingAssets.blogSpendableCashCard.src);
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
    expect(urls).toContain("https://spendwithpip.com/blog/how-much-can-i-spend-today");
    expect(urls).not.toContain("https://spendwithpip.com/app");
    expect(urls).not.toContain("https://spendwithpip.com/blog/daily-spending-allowance-vs-budget");
  });

  it("uses marketing metadata as the source for public sitemap dates", () => {
    const entries = new Map(sitemap().map((entry) => [entry.url, entry]));

    for (const page of publicMarketingPages) {
      expect(entries.get(`https://spendwithpip.com${page.path === "/" ? "/" : page.path}`)?.lastModified).toEqual(
        new Date(`${page.updatedAt}T00:00:00Z`),
      );
    }

    const article = getPublishedArticles().find((candidate) => candidate.slug === "what-is-spendable-cash-today");

    expect(entries.get("https://spendwithpip.com/blog/what-is-spendable-cash-today")?.lastModified).toEqual(
      new Date(`${article?.updatedAt}T00:00:00Z`),
    );
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
    expect(llms).toContain("$7.99/month");
    expect(llms).not.toContain("$2.99/week");
    expect(llms).not.toMatch(/weekly pricing|weekly plan/i);
    expect(llms).toContain("https://spendwithpip.com/how-the-number-works");
    expect(llms).toContain("https://spendwithpip.com/security");
    expect(llms).toContain("https://spendwithpip.com/delete-account");
    expect(llms).toContain("https://spendwithpip.com/blog/how-much-can-i-spend-today");
    expect(llms).toContain("Pip does not move money");
    expect(llms).toContain("AI explains and answers");
    expect(llms).not.toMatch(stalePublicMarketingPattern);
  });

  it("keeps old product names and stale launch language out of public marketing pages", async () => {
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
    expect(publicHtml).toContain('type="email"');
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

function sliceCssFromMediaQueryContaining(css: string, mediaQuery: string, selector: string): string {
  const selectorIndex = css.indexOf(selector);
  expect(selectorIndex).toBeGreaterThanOrEqual(0);

  const mediaIndex = css.lastIndexOf(mediaQuery, selectorIndex);
  expect(mediaIndex).toBeGreaterThanOrEqual(0);

  return css.slice(mediaIndex);
}

function expectImageLoading(html: string, src: string, loading: "eager" | "lazy"): void {
  const imageMatch = html.match(new RegExp(`<img[^>]+src="${escapeRegExp(src)}"[^>]*>`));

  expect(imageMatch?.[0], src).toContain(`loading="${loading}"`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
