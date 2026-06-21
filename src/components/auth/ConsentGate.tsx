"use client";

import Link from "next/link";
import { PipIntroScene } from "@/components/onboarding/PipIntroScene";
import { ProtectedSavingsPicker } from "@/components/onboarding/ProtectedSavingsPicker";

export function ConsentGate({ email }: { email: string }) {
  async function acceptConsent(protectedSavingsMonthlyCents: number) {
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
      throw new Error(payload?.error ?? "I couldn’t save that amount yet. Please try again.");
    }

    window.location.reload();
  }

  return (
    <main className="pip-app-shell grid min-h-screen place-items-center px-4 py-8 text-ink">
      <section className="w-full max-w-sm">
        <PipIntroScene
          priority
          title="Choose monthly savings."
          messageClassName="onboarding-intro-message"
        >
          <p>
            This beta stores normalized financial data, provider tokens on the server, and product events
            needed to support the product. It never stores bank credentials or moves money.
          </p>
          <p className="mt-3">
            Connecting checking accounts and cards makes Spendable Cash Today more accurate because
            card spend can be counted before a payment settles.
          </p>
          <p className="mt-3">
            Pick what you want Pip to keep out of your daily spending number each month.
            Pip does not move money.
          </p>
          <p className="mt-3 text-xs leading-5 text-ink/50">{email}</p>
          <div className="mt-5">
            <ProtectedSavingsPicker idPrefix="fallback-onboarding" onSave={acceptConsent} />
          </div>
        </PipIntroScene>
        <div className="mt-8 flex gap-4 text-xs font-semibold text-ink/[0.45]">
          <Link className="focus-ring pip-text-action-link hover:text-ink" href="/privacy">
            Privacy
          </Link>
          <Link className="focus-ring pip-text-action-link hover:text-ink" href="/terms">
            Terms
          </Link>
          <Link className="focus-ring pip-text-action-link hover:text-ink" href="/support">
            Support
          </Link>
        </div>
      </section>
    </main>
  );
}
