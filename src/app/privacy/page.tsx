import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Privacy",
  description: "Review what Pip stores, how provider credentials are handled, and how data deletion works.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy">
      <section>
        <h2 className="text-lg font-bold text-ink">What Pip Stores</h2>
        <p className="mt-3">
          Pip stores normalized financial data, account metadata, sync logs, user settings, AI chat
          context needed for product behavior, and product events needed to calculate Spendable Cash
          Today and operate the app.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">What Pip Does Not Store</h2>
        <p className="mt-3">
          Pip does not store bank usernames or passwords and does not move money. Provider tokens and
          credentials are handled server-side only. Raw provider payloads should be kept minimal and
          used for troubleshooting or normalization only when needed.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">How Data Is Used</h2>
        <p className="mt-3">
          Pip uses connected account and transaction context to calculate Spendable Cash Today, show
          account connection state, explain why the number changed, and support account management.
          Product events are used to operate and improve the app without selling financial data.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Paid Product Model</h2>
        <p className="mt-3">
          Pip is a paid product because financial data should not be the product. Pip does not use an
          ad-supported or financial-data-selling model.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Subscriptions and Payment Context</h2>
        <p className="mt-3">
          Subscription access and payment context are used to provide the plan you choose, resolve
          billing support questions, and maintain product access. Pip does not need payment context
          to move money and does not initiate transfers or payments.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Deletion</h2>
        <p className="mt-3">
          You can ask Pip to delete stored financial data in the chat. Deletion removes financial
          rows, sync logs, product events, connected institutions, missing-card preferences, provider
          tokens, and settings for your account.
        </p>
      </section>
    </LegalShell>
  );
}
