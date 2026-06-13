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
      <section>
        <h2 className="text-lg font-bold text-ink">Product Boundary</h2>
        <p className="mt-3">
          Pip is a decision-support tool for everyday spending. It shows a deterministic Spendable
          Cash Today signal from available data and provides context when you ask for the why.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">No Advice</h2>
        <p className="mt-3">
          Pip is not financial, tax, investment, credit, or legal advice. You are responsible for
          your spending, account connection choices, cushion settings, and financial decisions.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">No Money Movement</h2>
        <p className="mt-3">
          Pip does not initiate payments, transfers, card payments, ACH transactions, Zelle payments,
          or any other money movement.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Account Data Limitations</h2>
        <p className="mt-3">
          Missing accounts, delayed provider data, pending transactions, refunds, transfers, stale
          credentials, and provider errors can make the number incomplete or stale.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Subscriptions and Cancellation</h2>
        <p className="mt-3">{pipSubscriptionCaveat}</p>
        <p className="mt-3">
          Weekly and monthly plan availability may vary by platform. Cancellation and billing
          support should be handled through the platform or support channel where the subscription
          was started.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Acceptable Use</h2>
        <p className="mt-3">
          Do not misuse Pip, attempt to access another person's account, interfere with connected
          providers, or use the app in a way that compromises account security or service operation.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Changes and Contact</h2>
        <p className="mt-3">
          Pip may update product behavior, supported providers, pricing, or these terms as the
          product changes. Contact support for account-specific questions.
        </p>
      </section>
    </LegalShell>
  );
}
