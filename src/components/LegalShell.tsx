import Link from "next/link";
import type { ReactNode } from "react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export function LegalShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <MarketingLayout>
      <main className="px-4 py-14 text-ink sm:px-6">
        <article className="mx-auto max-w-2xl">
          <Link className="focus-ring text-sm font-semibold text-ink/[0.62] hover:text-ink" href="/">
            Pip
          </Link>
          <h1 className="font-display mt-8 text-5xl leading-tight tracking-normal">{title}</h1>
          <div className="mt-8 space-y-6 text-sm leading-7 text-ink/[0.68]">{children}</div>
        </article>
      </main>
    </MarketingLayout>
  );
}
