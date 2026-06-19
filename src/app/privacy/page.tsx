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
          Pip is operated for support and privacy purposes by {pipTrustPolicy.legalOperatorLabel}.
          Contact {pipTrustPolicy.supportEmail} for privacy questions.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">What Pip Stores</h2>
        <p className="mt-3">
          {pipTrustPolicy.privacyBoundaries[0]} This can include email address, Supabase user ID,
          auth metadata, reviewer or tester access data, balances, transactions, merchant names,
          income patterns, account labels, institution state, settings, and derived Spendable Cash
          Today records.
        </p>
        <p className="mt-3">
          Pip may also store chat prompts, assistant responses, selected financial context used to
          answer a question, AI response reports, report reasons and details, tester feedback,
          product events, settings changes, sync events, deletion events, IP address, user agent,
          Android build version, request logs, error logs, and diagnostic metadata.
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
        <h2 className="text-lg font-bold text-ink">Processors and Providers</h2>
        <p className="mt-3">
          Pip uses service providers to operate the app. Supabase provides authentication, database
          infrastructure, row-level security, and account deletion support. Netlify provides hosting,
          serverless functions, request routing, request logs, and deployment infrastructure. Plaid
          provides read-only account connection data. OpenAI or Netlify AI Gateway may process prompts,
          assistant context, selected financial context, and answer-quality information to generate
          responses.
        </p>
        <p className="mt-3">
          These providers are used to provide Pip, keep it secure, troubleshoot problems, and improve
          reliability. Pip does not sell financial data and does not run an advertising model.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">AI Context</h2>
        <p className="mt-3">
          {pipTrustPolicy.aiProvider.role} Pip does not intentionally train a Pip-owned AI model on
          user financial records. Third-party AI handling depends on the deployed model provider and
          gateway terms. AI response reports and tester feedback may include the reported answer,
          report reason, optional details, app version, platform, and diagnostic context needed to
          investigate the report.
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
          The Android Play test build is consumption-only and does not include purchase or
          external-payment prompts.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Security and Retention</h2>
        <p className="mt-3">
          Pip uses encrypted connections in transit. Bank usernames and passwords are not stored by
          Pip, and provider tokens are handled server-side. Pip cannot move, withdraw, transfer,
          invest, borrow, or pay money from a connected account.
        </p>
        <p className="mt-3">
          Pip keeps data while an account is active and as needed to provide the app, support users,
          investigate abuse or security issues, meet legal, tax, or accounting obligations, and
          complete deletion requests. Account deletion removes user-scoped app data, while limited
          records may be retained only when needed for fraud prevention, security, tax, accounting,
          or legal obligations.
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
