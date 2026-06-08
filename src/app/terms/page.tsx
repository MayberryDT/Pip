import { LegalShell } from "@/components/LegalShell";

export default function TermsPage() {
  return (
    <LegalShell title="Terms">
      <p>
        Spendable is an experimental decision-support tool. It is not
        financial, tax, investment, credit, or legal advice.
      </p>
      <p>
        The app shows a deterministic Spendable Cash signal from available data. Missing accounts,
        delayed provider data, pending transactions, refunds, transfers, and provider errors can
        make the number incomplete or stale.
      </p>
      <p>
        Spendable does not initiate payments, transfers, card payments, ACH transactions, Zelle
        payments, or any other money movement in the MVP.
      </p>
    </LegalShell>
  );
}
