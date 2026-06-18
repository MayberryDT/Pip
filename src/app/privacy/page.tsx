import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/LegalShell";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { pipTrustPolicy } from "@/lib/trust/pip-trust-policy";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Privacy",
  description: "Review what Pip stores, how provider credentials are handled, and how data deletion works.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy">
      <section>
        <h2 className="text-lg font-bold text-ink">Effective Date</h2>
        <p className="mt-3">
          Effective {pipTrustPolicy.effectiveDate}. Last updated {pipTrustPolicy.revisionDate}.
          Contact {pipTrustPolicy.supportEmail} for privacy questions.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">What Pip Stores</h2>
        <p className="mt-3">
          {pipTrustPolicy.privacyBoundaries[0]} This can include balances, transactions, merchant
          names, income patterns, account labels, and connection state.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">What Pip Does Not Store</h2>
        <p className="mt-3">
          Pip does not store bank usernames or passwords and does not move money. Provider tokens are
          handled server-side only. {pipTrustPolicy.privacyBoundaries[1]}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">How Data Is Used</h2>
        <p className="mt-3">
          Pip uses {pipTrustPolicy.bankDataProvider.name} connected account and transaction context to calculate Spendable Cash Today, show
          account connection state, explain why the number changed, and support account management.
          AI response reports and feedback are used to investigate confusing, unsafe, or inaccurate
          responses. Product events are used to operate and improve the app without selling financial
          data.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">AI Context</h2>
        <p className="mt-3">
          {pipTrustPolicy.aiProvider.role} Pip does not intentionally train a Pip-owned AI model on
          user financial records. Third-party AI handling depends on the deployed model provider and
          gateway terms.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Paid Product Model</h2>
        <p className="mt-3">
          Pip is a paid product because financial data should not be the product.{" "}
          {pipTrustPolicy.privacyBoundaries[2]}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Subscriptions and Payment Context</h2>
        <p className="mt-3">
          Subscription access and payment context are used to provide the plan you choose, resolve
          billing support questions, and maintain product access. Pip does not need payment context
          to move money and does not initiate transfers or payments.
        </p>
        <p className="mt-3">
          The Android Play test build is consumption-only and does not include purchase, checkout,
          upgrade, or external-payment prompts.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Deletion</h2>
        <p className="mt-3">
          You can delete your account from the in-app settings panel by typing DELETE, or use the{" "}
          <Link className="font-bold text-moss hover:text-ink" href="/delete-account">
            public deletion page
          </Link>{" "}
          if you cannot access the app. {pipTrustPolicy.deletionSummary}
        </p>
      </section>
    </LegalShell>
  );
}
