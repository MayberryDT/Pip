"use client";

import Link from "next/link";
import { useState } from "react";

export function ConsentGate({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const [protectedSavings, setProtectedSavings] = useState("200");

  async function acceptConsent() {
    setStatus("saving");
    setError("");
    const protectedSavingsMonthlyCents = Math.max(
      0,
      Math.round(Number(protectedSavings || "0") * 100),
    );

    const response = await fetch("/api/auth/consent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        protectedSavingsMonthlyCents,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus("error");
      setError(payload?.error ?? "Consent failed.");
      return;
    }

    window.location.reload();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
      <section className="w-full max-w-sm">
        <h1 className="text-4xl font-semibold tracking-normal">Before real data</h1>
        <p className="mt-5 text-sm leading-6 text-ink/[0.66]">
          Spendable stores normalized financial data, provider tokens on the server, and product
          events needed to support the private beta. It never stores bank credentials or moves
          money.
        </p>
        <p className="mt-4 text-sm leading-6 text-ink/[0.66]">
          Connecting checking accounts and cards makes Spendable more accurate because card spend
          can be counted before a payment settles.
        </p>
        <p className="mt-4 text-xs leading-5 text-ink/50">{email}</p>
        <label className="mt-7 block text-sm font-semibold" htmlFor="onboarding-protected-savings">
          Protected savings
        </label>
        <div className="mt-3 flex min-h-14 items-center gap-2 rounded-full border border-ink/12 bg-white px-5 shadow-[0_12px_34px_rgba(23,26,31,0.08)]">
          <span className="text-base font-semibold text-ink/46">$</span>
          <input
            id="onboarding-protected-savings"
            className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none"
            inputMode="numeric"
            value={protectedSavings}
            disabled={status === "saving"}
            onChange={(event) => setProtectedSavings(event.target.value.replace(/[^\d]/g, ""))}
          />
        </div>
        <button
          type="button"
          className="focus-ring mt-8 min-h-14 w-full rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)] disabled:bg-ink/30"
          disabled={status === "saving"}
          onClick={acceptConsent}
        >
          {status === "saving" ? "Saving" : "Accept and continue"}
        </button>
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
        {error ? <p className="mt-4 text-sm leading-6 text-red-700">{error}</p> : null}
      </section>
    </main>
  );
}
