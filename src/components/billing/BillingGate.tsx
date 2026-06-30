"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { AppAccessSignOutButton } from "@/components/app-access/AppAccessSignOutButton";

type CheckoutResponse = {
  url?: string;
  error?: string;
};

type BillingCheckoutOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<{
    ok: boolean;
    json: () => Promise<CheckoutResponse>;
  }>;
  assign?: (url: string) => void;
};

export async function startBillingCheckout({
  fetcher = fetch,
  assign = (url) => window.location.assign(url),
}: BillingCheckoutOptions = {}) {
  const response = await fetcher("/api/billing/checkout", {
    method: "POST",
  });
  const body: CheckoutResponse = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || "Checkout could not start.");
  }

  if (!body.url) {
    throw new Error("Checkout could not start.");
  }

  assign(body.url);
}

export function BillingGate({ email }: { email?: string }) {
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    if (isStartingCheckout) {
      return;
    }

    setIsStartingCheckout(true);
    setError("");

    try {
      await startBillingCheckout();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not start.");
      setIsStartingCheckout(false);
    }
  }

  return (
    <div className="space-y-3">
      {email ? (
        <p className="text-center text-xs font-semibold text-ink/[0.52]">Signed in as {email}</p>
      ) : null}
      <button
        type="button"
        className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)] transition disabled:text-paper/60"
        disabled={isStartingCheckout}
        onClick={onClick}
      >
        <CreditCard aria-hidden="true" className="h-5 w-5" />
        {isStartingCheckout ? "Opening Stripe..." : "Subscribe with Stripe"}
      </button>
      {error ? <p className="text-center text-xs font-semibold text-red-700">{error}</p> : null}
      <AppAccessSignOutButton />
    </div>
  );
}
