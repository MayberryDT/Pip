import { LegalShell } from "@/components/LegalShell";

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy">
      <p>
        Spendable is a private beta. It stores normalized financial data, account metadata, sync
        logs, user settings, and product events needed to calculate Free Cash and support beta
        testing.
      </p>
      <p>
        Spendable does not store bank usernames or passwords and does not move money. Provider
        tokens and credentials are handled server-side only. Raw provider payloads should be kept
        minimal and used for troubleshooting or normalization.
      </p>
      <p>
        You can delete stored financial data from the data control in the app. Deletion removes
        financial rows, sync logs, product events, connected institutions, missing-card preferences,
        provider tokens, and settings for your account.
      </p>
    </LegalShell>
  );
}
