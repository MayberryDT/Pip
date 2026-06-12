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
      <p>
        Pip stores normalized financial data, account metadata, sync logs, user settings, AI chat
        context needed for product behavior, and product events needed to calculate Spendable Cash
        Today and operate the app.
      </p>
      <p>
        Pip does not store bank usernames or passwords and does not move money. Provider tokens and
        credentials are handled server-side only. Raw provider payloads should be kept minimal and
        used for troubleshooting or normalization only when needed.
      </p>
      <p>
        Pip is a paid product because financial data should not be the product. Pip does not use an
        ad-supported or financial-data-selling model.
      </p>
      <p>
        You can ask Pip to delete stored financial data in the chat. Deletion removes financial
        rows, sync logs, product events, connected institutions, missing-card preferences, provider
        tokens, and settings for your account.
      </p>
    </LegalShell>
  );
}
