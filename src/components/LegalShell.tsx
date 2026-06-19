import Link from "next/link";
import type { ReactNode } from "react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { SwissKicker, SwissSection, SwissTitle } from "@/components/marketing/SwissGrid";

export function LegalShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <MarketingLayout showPricingLinks={false} homeHref="/app">
      <main>
        <SwissSection folio="Reference / Pip">
          <div className="col-span-12 lg:col-span-3">
            <Link className="focus-ring text-sm font-bold text-moss hover:text-ink" href="/app">
              Pip
            </Link>
            <SwissKicker className="mt-8">Reference</SwissKicker>
            <SwissTitle className="mt-5" level={1} size="page">
              {title}
            </SwissTitle>
          </div>
          <article className="col-span-12 space-y-10 text-sm leading-7 text-ink/[0.70] lg:col-span-7 lg:col-start-5">
            {children}
          </article>
        </SwissSection>
      </main>
    </MarketingLayout>
  );
}
