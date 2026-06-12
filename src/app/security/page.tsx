import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeDollarSign, Database, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import { LaunchAccessForm } from "@/components/marketing/LaunchAccessForm";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";
import { pipLaunch, pipPaidTrustLine } from "@/lib/marketing/pricing";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Security",
  description:
    "Pip uses read-only account data, keeps provider credentials server-side, cannot move money, and provides a data deletion path.",
  path: "/security",
});

const securityFacts = [
  {
    icon: ShieldCheck,
    title: "Read-only account data",
    copy: "Pip connects account and transaction data to calculate Spendable Cash Today. It is an insight layer, not a bank account.",
  },
  {
    icon: LockKeyhole,
    title: "No money movement",
    copy: "Pip does not initiate payments, transfers, card payments, ACH transactions, or other money movement.",
  },
  {
    icon: Database,
    title: "Server-side credentials",
    copy: "Provider access credentials are handled server-side. Browser code receives short-lived connection artifacts only when needed.",
  },
  {
    icon: Trash2,
    title: "Deletion path",
    copy: "You can ask Pip to delete stored financial data from the app when you want it cleared.",
  },
];

export default function SecurityPage() {
  return (
    <MarketingLayout>
      <main>
        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-normal text-moss">Security</p>
            <h1 className="font-display mt-4 text-5xl leading-[1] text-ink sm:text-6xl">
              Pip should feel cute, not careless.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/70">
              Pip asks for sensitive context, so the public site states the trust boundaries before
              anyone connects accounts.
            </p>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
            {securityFacts.map((fact) => {
              const Icon = fact.icon;

              return (
                <article className="rounded-[0.5rem] border border-line bg-paper p-6" key={fact.title}>
                  <Icon aria-hidden="true" className="text-moss" size={28} />
                  <h2 className="mt-5 text-2xl font-bold leading-tight text-ink">{fact.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-ink/66">{fact.copy}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.8fr_1fr]">
            <div>
              <BadgeDollarSign aria-hidden="true" className="text-moss" size={30} />
              <h2 className="font-display mt-4 text-4xl leading-tight text-ink sm:text-5xl">
                Paid because your data should not be the product.
              </h2>
            </div>
            <div className="space-y-5 text-base leading-8 text-ink/70">
              <p>
                {pipPaidTrustLine} The launch pricing model is designed around direct user payment,
                not ads, lead generation, or selling financial data.
              </p>
              <p>
                Pip stores normalized financial data, account metadata, sync logs, user settings,
                AI chat context needed for product behavior, and product events needed to operate
                the app.
              </p>
              <p>
                Pip does not store bank usernames or passwords. Raw provider payloads should stay
                minimal and exist only where needed for troubleshooting or normalization.
              </p>
              <p>
                Pip is not financial, tax, investment, credit, or legal advice. The number is a
                decision-support signal from available data.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-porcelain hover:bg-moss"
                  href="/privacy"
                >
                  Read privacy
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
                <Link
                  className="focus-ring inline-flex min-h-11 items-center rounded-full border border-line bg-porcelain px-5 text-sm font-bold text-ink hover:border-moss"
                  href="/terms"
                >
                  Read terms
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6" id="launch-access">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-4xl leading-tight text-ink">Get launch access to Pip.</h2>
            <p className="mt-4 text-base leading-7 text-ink/68">
              {pipLaunch.appStoreLine} Plans start at $2.99/week.
            </p>
            <div className="mt-7">
              <LaunchAccessForm sourcePage="/security" compact />
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
