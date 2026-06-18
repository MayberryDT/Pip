import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/LegalShell";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { marketingSite } from "@/lib/marketing/site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Delete your Pip account",
  description: "Request deletion of your Pip account and associated app data.",
  path: "/delete-account",
});

export default function DeleteAccountPage() {
  return (
    <LegalShell title="Delete your Pip account">
      <section>
        <h2 className="text-lg font-bold text-ink">In-app deletion</h2>
        <p className="mt-3">
          To delete your Pip account, open Pip, go to Settings, choose Delete account, and confirm
          by typing DELETE.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">If you cannot log in</h2>
        <p className="mt-3">
          Email{" "}
          <a className="font-bold text-moss hover:text-ink" href={`mailto:${marketingSite.supportEmail}`}>
            {marketingSite.supportEmail}
          </a>{" "}
          from the email address associated with your Pip account and include Delete Pip account in
          the subject line.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">What deletion covers</h2>
        <p className="mt-3">
          Deleting your account deletes your app account and associated financial data, including
          connected account metadata, balances, transactions, sync logs, provider token records,
          settings, product events tied to your account, AI chat history, AI reports, and tester
          feedback tied to your account.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Limited retention</h2>
        <p className="mt-3">
          Pip may retain limited records when required for security, fraud prevention, legal, tax,
          accounting, or compliance reasons. Retained records are limited to the purpose that
          requires retention.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Timing and privacy</h2>
        <p className="mt-3">
          In-app account deletion starts immediately. Email deletion requests are reviewed as soon
          as practical. Read the <Link className="font-bold text-moss hover:text-ink" href="/privacy">privacy policy</Link>{" "}
          for more detail about Pip data handling.
        </p>
      </section>
    </LegalShell>
  );
}
