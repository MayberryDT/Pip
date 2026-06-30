"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

type BillingPortalAction = {
  label: string;
  endpoint: string;
};

type PortalResponse = {
  url?: string;
  error?: string;
};

type BillingPortalOptions = {
  endpoint?: string;
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<{
    ok: boolean;
    json: () => Promise<PortalResponse>;
  }>;
  assign?: (url: string) => void;
};

export async function openBillingPortal({
  endpoint = "/api/billing/portal",
  fetcher = fetch,
  assign = (url) => window.location.assign(url),
}: BillingPortalOptions = {}) {
  const response = await fetcher(endpoint, {
    method: "POST",
  });
  const body: PortalResponse = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || "Billing could not open.");
  }

  if (!body.url) {
    throw new Error("Billing could not open.");
  }

  assign(body.url);
}

export function BillingPortalActionButton({ action }: { action: BillingPortalAction }) {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    if (isOpening) {
      return;
    }

    setIsOpening(true);
    setError("");

    try {
      await openBillingPortal({ endpoint: action.endpoint });
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Billing could not open.");
      setIsOpening(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        className="focus-ring ui-pressable inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-porcelain/[0.58] px-4 text-sm font-semibold text-ink"
        disabled={isOpening}
        onClick={onClick}
      >
        <ExternalLink aria-hidden="true" size={16} />
        {isOpening ? "Opening billing..." : action.label}
      </button>
      {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
