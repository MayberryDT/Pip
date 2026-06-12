import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/LegalShell";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { marketingSite } from "@/lib/marketing/site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Support",
  description: "Get Pip support for account connection, billing, launch status, and data deletion questions.",
  path: "/support",
});

export default function SupportPage() {
  return (
    <LegalShell title="Support">
      <section>
        <h2 className="text-lg font-bold text-ink">Contact</h2>
        <p className="mt-3">
          For help, email{" "}
          <a className="font-bold text-moss hover:text-ink" href={`mailto:${marketingSite.supportEmail}`}>
            {marketingSite.supportEmail}
          </a>
          . Include the email address you use for Pip and a short description of what happened.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Launch Status</h2>
        <p className="mt-3">
          Pip is preparing for paid launch on iPhone and Android. You can request launch access from
          the homepage or pricing page.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Account Connection Help</h2>
        <p className="mt-3">
          If Spendable Cash Today looks wrong, ask Pip in the chat to refresh data or repair the
          connection. If a connection remains stale after refresh, share the institution name and the
          last refresh time with support.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Billing Support</h2>
        <p className="mt-3">
          Subscriptions will be managed through the app stores when Pip launches. Pip will provide
          account-specific billing guidance after subscriptions are available.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Data Deletion</h2>
        <p className="mt-3">
          Ask Pip to delete data when you want stored financial data cleared from the app. You can
          also contact support if you cannot access the chat.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Helpful Links</h2>
        <p className="mt-3">
          Read the <Link className="font-bold text-moss hover:text-ink" href="/security">security overview</Link>,{" "}
          <Link className="font-bold text-moss hover:text-ink" href="/privacy">privacy summary</Link>, and{" "}
          <Link className="font-bold text-moss hover:text-ink" href="/terms">terms</Link> for the current product
          boundaries.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">FAQ</h2>
        <h3 className="mt-3 font-bold text-ink">Can Pip move my money?</h3>
        <p className="mt-2">No. Pip does not initiate payments, transfers, card payments, ACH transactions, or other money movement.</p>
        <h3 className="mt-4 font-bold text-ink">Where do I get pricing details?</h3>
        <p className="mt-2">
          See the <Link className="font-bold text-moss hover:text-ink" href="/pricing">pricing page</Link> for weekly
          and monthly launch plans.
        </p>
      </section>
    </LegalShell>
  );
}
