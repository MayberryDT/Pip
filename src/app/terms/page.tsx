import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { pipTrustPolicy } from "@/lib/trust/pip-trust-policy";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Terms",
  description: "Review Pip terms, product boundaries, subscription context, and no-money-movement limits.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalShell title="Terms">
      <section>
        <h2 className="text-lg font-bold text-ink">Effective Date</h2>
        <p className="mt-3">
          Effective {pipTrustPolicy.effectiveDate}. Last updated {pipTrustPolicy.revisionDate}.
          Contact {pipTrustPolicy.supportEmail} for support or policy questions.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Product Boundary</h2>
        <p className="mt-3">
          Pip is a decision-support tool for everyday spending. {pipTrustPolicy.calculationSummary}
          It provides context when you ask for the why.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">No Advice</h2>
        <p className="mt-3">
          Pip is not financial, tax, investment, credit, or legal advice. You are responsible for
          your spending, account connection choices, monthly savings settings, savings goals, and financial decisions.
          Pip does not make loan, credit, underwriting, insurance, or investment decisions.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">No Money Movement</h2>
        <p className="mt-3">
          {pipTrustPolicy.securityBoundaries[1]}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">No Guarantee</h2>
        <p className="mt-3">
          Spendable Cash Today is an estimate from connected data and settings. It is not a guarantee
          that every obligation, refund, reimbursement, transfer, authorization, cash purchase,
          shared-account change, or manually paid bill is known.
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
        <p className="mt-3">
          Purchases and subscriptions are not available in the Android Play test build. Where Pip
          offers paid access on another platform, cancel through the platform where the subscription
          started before renewal.
        </p>
        <p className="mt-3">
          Trials, refunds, grace periods, and billing recovery depend on the platform and offer shown
          when you start the subscription. Email support if product access and platform billing do
          not match.
        </p>
        <p className="mt-3">
          The Android Play test build is consumption-only and does not include purchase or
          external-payment prompts.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">AI Responses</h2>
        <p className="mt-3">
          Pip may use AI to explain the deterministic Spendable Cash Today calculation and connected
          account context. AI responses can be incomplete or wrong. Use the in-app report control if
          a response looks inaccurate, unsafe, misleading, or privacy-sensitive.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Service Availability</h2>
        <p className="mt-3">
          Pip may change product behavior, supported providers, pricing, models, or availability as
          the product evolves. Sync jobs, providers, app hosting, and AI services can be delayed or
          unavailable.
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
          product changes. The current public support contact is {pipTrustPolicy.supportEmail}.
        </p>
      </section>
    </LegalShell>
  );
}
