import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { pipSubscriptionCaveat } from "@/lib/marketing/pricing";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Terms",
  description: "Review Pip terms, product boundaries, subscription context, and no-money-movement limits.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalShell title="Terms">
      <p>
        Pip is an experimental decision-support tool. It is not financial, tax, investment, credit,
        or legal advice.
      </p>
      <p>
        The app shows a deterministic Spendable Cash Today signal from available data. Missing
        accounts, delayed provider data, pending transactions, refunds, transfers, and provider
        errors can make the number incomplete or stale.
      </p>
      <p>
        Pip does not initiate payments, transfers, card payments, ACH transactions, Zelle payments,
        or any other money movement.
      </p>
      <p>{pipSubscriptionCaveat}</p>
    </LegalShell>
  );
}
