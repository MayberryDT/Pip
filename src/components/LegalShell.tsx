import Link from "next/link";
import type { ReactNode } from "react";

export function LegalShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-paper px-4 py-10 text-ink sm:px-6">
      <article className="mx-auto max-w-2xl">
        <Link className="text-sm font-semibold text-ink/[0.62] hover:text-ink" href="/">
          Pip
        </Link>
        <h1 className="mt-8 text-4xl font-semibold tracking-normal">{title}</h1>
        <div className="mt-8 space-y-6 text-sm leading-7 text-ink/[0.68]">{children}</div>
      </article>
    </main>
  );
}
