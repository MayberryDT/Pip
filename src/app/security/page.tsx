import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";

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
    copy: "Pip connects account and transaction data to calculate Spendable Cash Today. The beta product is an insight layer.",
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
    copy: "Beta users can ask Pip to delete stored financial data before leaving the product.",
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
              Pip asks for sensitive context, so the public site needs plain trust boundaries before
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
            <h2 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
              What Pip stores in the beta.
            </h2>
            <div className="space-y-5 text-base leading-8 text-ink/70">
              <p>
                Pip stores normalized financial data, account metadata, sync logs, user settings,
                AI chat context needed for product behavior, and product events needed for beta
                operations.
              </p>
              <p>
                Pip does not store bank usernames or passwords. Raw provider payloads should stay
                minimal and exist only where needed for troubleshooting or normalization.
              </p>
              <p>
                The current terms say Pip is not financial, tax, investment, credit, or legal
                advice. The number is a decision-support signal from available data.
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
                  className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-porcelain px-5 text-sm font-bold text-ink hover:border-moss"
                  href="/terms"
                >
                  Read terms
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-porcelain px-4 py-16 sm:px-6" id="join-beta">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-4xl leading-tight text-ink">Join when the beta opens wider.</h2>
            <p className="mt-4 text-base leading-7 text-ink/68">
              Get a note when Pip is ready for more testers.
            </p>
            <div className="mt-7">
              <WaitlistForm sourcePage="/security" compact />
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
