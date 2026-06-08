"use client";

import Link from "next/link";

export function LoginPanel() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
      <section className="w-full max-w-sm">
        <h1 className="font-display text-5xl font-normal tracking-normal">Spendable</h1>
        <p className="mt-5 text-sm leading-6 text-ink/[0.62]">
          Connect checking and cards so Spendable can count spending without making balances the
          default number.
        </p>
        <p className="mt-4 text-xs leading-5 text-ink/50">
          Sign in with Google to set up Spendable on this device.
        </p>
        <Link
          className="focus-ring mt-8 flex min-h-14 w-full items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)]"
          href="/api/auth/oauth/google"
        >
          Continue with Google
        </Link>
        <div className="mt-8 flex gap-4 text-xs font-semibold text-ink/[0.45]">
          <Link className="hover:text-ink" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-ink" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-ink" href="/support">
            Support
          </Link>
        </div>
      </section>
    </main>
  );
}
