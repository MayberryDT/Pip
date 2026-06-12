import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { marketingSite } from "@/lib/marketing/site";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { MarketingPageView } from "@/components/marketing/MarketingPageView";

const navLinks = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/blog", label: "Blog" },
  { href: "/support", label: "Support" },
] as const;

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <MarketingPageView />
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/90 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link className="focus-ring inline-flex items-center gap-2 rounded-full" href="/" aria-label="Pip home">
          <img
            src="/brand/pip-wordmark.png"
            alt="Pip"
            width={212}
            height={177}
            loading="eager"
            decoding="async"
            className="h-11 w-auto object-contain"
          />
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-semibold text-ink/70 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <Link className="focus-ring rounded-full hover:text-ink" href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
          <Link className="focus-ring rounded-full hover:text-ink" href={marketingSite.appPath}>
            App
          </Link>
        </nav>
        <MarketingCtaLink
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-sm font-bold text-porcelain shadow-soft transition hover:bg-moss"
          eventLabel="site_header_join_beta"
          href="#join-beta"
        >
          Join beta
          <ArrowRight aria-hidden="true" size={16} strokeWidth={2.4} />
        </MarketingCtaLink>
      </div>
      <nav
        className="mx-auto mt-3 flex max-w-6xl gap-3 overflow-x-auto pb-1 text-sm font-semibold text-ink/70 md:hidden"
        aria-label="Mobile primary"
      >
        {navLinks.map((link) => (
          <Link
            className="focus-ring shrink-0 rounded-full border border-line bg-porcelain px-3 py-2 hover:text-ink"
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
        <Link
          className="focus-ring shrink-0 rounded-full border border-line bg-porcelain px-3 py-2 hover:text-ink"
          href={marketingSite.appPath}
        >
          App
        </Link>
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-porcelain px-4 py-10 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1.2fr_1fr]">
        <div>
          <img
            src="/brand/pip-wordmark.png"
            alt="Pip"
            width={212}
            height={177}
            loading="lazy"
            decoding="async"
            className="h-11 w-auto object-contain"
          />
          <p className="mt-4 max-w-md text-sm leading-6 text-ink/66">
            Pip is a cute daily money companion that shows Spendable Cash Today. No budget. No
            dashboard. Just one calm number.
          </p>
          <p className="mt-4 text-sm text-ink/66">{marketingSite.supportEmail}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm font-semibold text-ink/70 sm:grid-cols-3">
          {[...navLinks, { href: "/privacy", label: "Privacy" }, { href: "/terms", label: "Terms" }, { href: marketingSite.appPath, label: "App" }].map(
            (link) => (
              <Link className="focus-ring rounded-full hover:text-ink" href={link.href} key={`${link.href}-${link.label}`}>
                {link.label}
              </Link>
            ),
          )}
        </div>
      </div>
    </footer>
  );
}
