import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/LegalShell";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Android test access",
  description: "Android test access status for the Pip Google Play build.",
  path: "/android-access",
});

export default function AndroidAccessPage() {
  return (
    <LegalShell title="Android test access">
      <section>
        <h2 className="text-lg font-bold text-ink">Your access is active</h2>
        <p className="mt-3">
          Your Pip access is active for this Android test build. Purchases are not available in
          the Android app during this Play Store testing phase.
        </p>
        <p className="mt-3">
          Open <Link className="font-bold text-moss hover:text-ink" href="/app">Pip</Link> to use
          Spendable Cash Today, Ask Pip, account controls, support, legal links, and account deletion.
        </p>
      </section>
    </LegalShell>
  );
}
