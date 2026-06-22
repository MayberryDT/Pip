import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Menu } from "lucide-react";
import { marketingSite } from "@/lib/marketing/site";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingPageView } from "@/components/marketing/MarketingPageView";
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";

const navLinks = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/how-the-number-works", label: "How the number works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/blog", label: "Blog" },
] as const;

const footerLinks = [
  ...navLinks,
  { href: "/support", label: "Support" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/delete-account", label: "Delete account" },
] as const;

export function MarketingLayout({
  children,
  showPricingLinks = true,
  homeHref = "/",
}: {
  children: ReactNode;
  showPricingLinks?: boolean;
  homeHref?: string;
}) {
  return (
    <div className="editorial-site swiss-type min-h-screen bg-paper text-ink">
      <MarketingPageView />
      <MarketingHeader showPricingLinks={showPricingLinks} homeHref={homeHref} />
      {children}
      <MarketingFooter showPricingLinks={showPricingLinks} />
    </div>
  );
}

export function MarketingHeader({
  showPricingLinks = true,
  homeHref = "/",
}: {
  showPricingLinks?: boolean;
  homeHref?: string;
}) {
  const visibleNavLinks = getVisibleMarketingLinks(navLinks, showPricingLinks);

  return (
    <>
      <header className="editorial-header">
        <div className="editorial-header-grid">
          <Link className="focus-ring editorial-logo" href={homeHref} aria-label="Pip home">
            <img
              src="/brand/pip-logo.png"
              alt="Pip"
              width={757}
              height={634}
              loading="eager"
              decoding="async"
              className="h-11 w-auto object-contain"
            />
          </Link>
          <nav className="editorial-nav" aria-label="Primary">
            {visibleNavLinks.map((link) => (
              <Link className="focus-ring editorial-nav-link" href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <MarketingCtaLink
            className="focus-ring editorial-header-cta"
            eventLabel="site_header_get_pip"
            eventProperties={{ intent: "get_pip" }}
            href={getProductAccessHref()}
          >
            {productAccess.primaryLabel}
            <ArrowRight aria-hidden="true" size={16} strokeWidth={2.4} />
          </MarketingCtaLink>
          <details className="editorial-mobile-menu">
            <summary className="focus-ring editorial-mobile-menu-trigger" aria-label="Open navigation">
              <Menu aria-hidden="true" size={19} strokeWidth={2.3} />
            </summary>
            <nav className="editorial-mobile-menu-panel" aria-label="Mobile primary">
              {visibleNavLinks.map((link) => (
                <Link
                  className="focus-ring editorial-mobile-link"
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </header>
    </>
  );
}

export function MarketingFooter({ showPricingLinks = true }: { showPricingLinks?: boolean }) {
  const visibleFooterLinks = getVisibleMarketingLinks(footerLinks, showPricingLinks);

  return (
    <footer className="editorial-footer">
      <div className="editorial-footer-grid">
        <div className="editorial-footer-brand">
          <img
            src="/brand/pip-logo.png"
            alt="Pip"
            width={757}
            height={634}
            loading="lazy"
            decoding="async"
            className="h-11 w-auto object-contain"
          />
          <p>
            Your bank balance is not permission to spend. Pip gives you one calm number before the
            next purchase.
          </p>
          <p>{marketingSite.supportEmail}</p>
        </div>
        <div className="editorial-footer-links">
          {visibleFooterLinks.map((link) => (
            <Link className="focus-ring" href={link.href} key={`${link.href}-${link.label}`}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}

function getVisibleMarketingLinks<T extends readonly { href: string; label: string }[]>(
  links: T,
  showPricingLinks: boolean,
) {
  return showPricingLinks ? links : links.filter((link) => link.href !== "/pricing");
}
