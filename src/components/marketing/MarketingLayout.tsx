import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { marketingSite } from "@/lib/marketing/site";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingPageView } from "@/components/marketing/MarketingPageView";
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";

const navLinks = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/blog", label: "Blog" },
] as const;

const footerLinks = [
  ...navLinks,
  { href: "/support", label: "Support" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: marketingSite.appPath, label: "App" },
] as const;

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="editorial-site swiss-type min-h-screen bg-paper text-ink">
      <MarketingPageView />
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}

export function MarketingHeader() {
  return (
    <>
      <header className="editorial-header">
        <div className="editorial-header-grid">
          <Link className="focus-ring editorial-logo" href="/" aria-label="Pip home">
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
            {navLinks.map((link) => (
              <Link className="focus-ring editorial-nav-link" href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
            <Link className="focus-ring editorial-nav-link" href={marketingSite.appPath}>
              App
            </Link>
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
        </div>
      </header>
      <nav className="editorial-mobile-nav" aria-label="Mobile primary">
        {navLinks.map((link) => (
          <Link
            className="focus-ring editorial-mobile-link"
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
        <Link
          className="focus-ring editorial-mobile-link"
          href={marketingSite.appPath}
        >
          App
        </Link>
      </nav>
    </>
  );
}

export function MarketingFooter() {
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
          {footerLinks.map((link) => (
            <Link className="focus-ring" href={link.href} key={`${link.href}-${link.label}`}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
