import { LegalShell } from "@/components/LegalShell";

export default function SupportPage() {
  return (
    <LegalShell title="Support">
      <p>
        For this beta, support is handled directly by Tyler. If Spendable Cash Today looks wrong,
        ask Pip in the chat to refresh data or repair the connection.
      </p>
      <p>
        If a credit-card payment appears but the card is intentionally not connected, hide that
        missing-card nudge from the card. If a connection remains stale or failed after refresh,
        share the institution name and the last refresh time.
      </p>
      <p>
        Ask Pip to delete data before leaving the beta or when you want stored financial data
        cleared from the app.
      </p>
    </LegalShell>
  );
}
