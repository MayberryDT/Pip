import { LegalShell } from "@/components/LegalShell";

export default function SupportPage() {
  return (
    <LegalShell title="Support">
      <p>
        For the private beta, support is handled directly by Tyler. If the Free Cash number looks
        wrong, start by using the data control to refresh or repair the connection.
      </p>
      <p>
        If a credit-card payment appears but the card is intentionally not connected, hide that
        missing-card nudge from the card. If a connection remains stale or failed after refresh,
        share the institution name and the last refresh time.
      </p>
      <p>
        Use the delete-data control before leaving the beta or when you want stored financial data
        cleared from the app.
      </p>
    </LegalShell>
  );
}
