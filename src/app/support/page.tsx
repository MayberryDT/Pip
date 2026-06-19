import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/LegalShell";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { marketingSite } from "@/lib/marketing/site";
import { pipTrustPolicy } from "@/lib/trust/pip-trust-policy";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Support",
  description: "Get Pip support for account connection, app access, account data, and data deletion questions.",
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
          . Include the email address you use for Pip, the device or browser you are using, and a
          short description of what happened.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">App Access</h2>
        <p className="mt-3">
          Use Pip on the web from the App link in the site header. Native App Store and Google Play
          links can be added when those listings are ready. The Android Play test build is
          consumption-only and does not include purchase or external-payment prompts.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Account Connection Help</h2>
        <p className="mt-3">
          If Spendable Cash Today looks wrong, ask Pip in the chat to refresh data or repair the
          connection. If a connection remains stale after refresh, share the institution name and the
          last refresh time with support.
        </p>
        <p className="mt-3">
          For calculation context, read{" "}
          <Link className="font-bold text-moss hover:text-ink" href={pipTrustPolicy.publicLinks.howNumberWorks}>
            how the number works
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Access Support</h2>
        <p className="mt-3">
          Contact support if your account access does not match the access you expected. Do not
          email bank credentials, provider passwords, card numbers, one-time codes, or full account
          numbers.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Data Deletion</h2>
        <p className="mt-3">
          Open Settings in the app and type DELETE to delete your account. You can also use the{" "}
          <Link className="font-bold text-moss hover:text-ink" href="/delete-account">
            public deletion page
          </Link>{" "}
          if you cannot access the app.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">AI Response Reports</h2>
        <p className="mt-3">
          Use the report control under an assistant response if the answer looks inaccurate,
          confusing, unsafe, misleading, or privacy-sensitive. Include only the context needed to
          investigate the response.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Helpful Links</h2>
        <p className="mt-3">
          Read <Link className="font-bold text-moss hover:text-ink" href={pipTrustPolicy.publicLinks.howNumberWorks}>how the number works</Link>,{" "}
          the <Link className="font-bold text-moss hover:text-ink" href="/security">security overview</Link>,{" "}
          <Link className="font-bold text-moss hover:text-ink" href="/privacy">privacy summary</Link>, and{" "}
          <Link className="font-bold text-moss hover:text-ink" href="/terms">terms</Link> for the current product
          boundaries.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">FAQ</h2>
        <h3 className="mt-3 font-bold text-ink">Can Pip move my money?</h3>
        <p className="mt-2">
          No. {pipTrustPolicy.securityBoundaries[1]}
        </p>
        <h3 className="mt-4 font-bold text-ink">Can Pip make credit or lending decisions?</h3>
        <p className="mt-2">
          No. Pip does not make loan, credit, underwriting, insurance, or investment decisions.
        </p>
      </section>
    </LegalShell>
  );
}
