import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AgentCard } from "@/lib/agent/card-types";
import { CardRenderer } from "@/components/cards/CardRenderer";

describe("CardRenderer", () => {
  it.each(getRenderableCards())("renders the $name card without missing-field artifacts", ({ card, expectedText }) => {
    const markup = renderToStaticMarkup(
      <CardRenderer card={card} onSuppressMissingCard={() => undefined} />,
    );

    for (const text of expectedText) {
      expect(markup).toContain(text);
    }

    expect(markup).not.toContain("undefined");
    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("[object Object]");
  });
});

function getRenderableCards(): Array<{
  name: AgentCard["type"];
  card: AgentCard;
  expectedText: string[];
}> {
  return [
    {
      name: "free_cash_explanation",
      card: {
        type: "free_cash_explanation",
        title: "Why Free Cash changed",
        summary: "$43 comes from income, spending, and protected savings.",
        drivers: [
          {
            id: "income",
            label: "Income in window",
            detail: "Paychecks and deposits that count as income.",
            amountCents: 320000,
            tone: "positive",
          },
        ],
        warnings: [
          {
            id: "missing-card",
            label: "Free Cash may be missing card spend",
            detail: "A payment to Capital One appears in checking.",
            tone: "warning",
            issuerName: "Capital One",
          },
        ],
        dataStates: [
          {
            id: "pending-transactions",
            label: "Pending transactions included",
            detail: "Pending card purchases are included.",
            amountCents: -2500,
            tone: "warning",
          },
        ],
      },
      expectedText: [
        "Why Free Cash changed",
        "$43 comes from income, spending, and protected savings.",
        "Income in window",
        "$3,200",
        "A payment to Capital One appears in checking.",
        "Pending card purchases are included.",
      ],
    },
    {
      name: "purchase_simulation",
      card: {
        type: "purchase_simulation",
        title: "Purchase simulation",
        amountCents: 5000,
        beforeCents: 4300,
        afterTodayCents: -700,
        monthlyAverageAfterCents: -700,
      },
      expectedText: ["Purchase simulation", "Now", "After", "$43", "-$7"],
    },
    {
      name: "true_balances",
      card: {
        type: "true_balances",
        title: "True balances",
        balances: [
          {
            accountId: "acct_1",
            name: "Everyday Checking",
            institutionName: "Northstar Bank",
            kind: "checking",
            balanceCents: 123456,
            availableBalanceCents: 120000,
            lastFour: "1234",
          },
        ],
      },
      expectedText: ["True balances", "Everyday Checking", "Northstar Bank", "$1,234.56"],
    },
    {
      name: "recent_transactions",
      card: {
        type: "recent_transactions",
        title: "Recent transactions",
        transactions: [
          {
            id: "tx_1",
            accountId: "acct_1",
            date: "2026-06-05",
            description: "POS PURCHASE COFFEE",
            merchantName: "Copper Cup",
            amountCents: -425,
            kind: "purchase",
            pending: false,
          },
        ],
      },
      expectedText: ["Recent transactions", "Copper Cup", "2026-06-05", "-$4.25"],
    },
    {
      name: "missing_card_nudge",
      card: {
        type: "missing_card_nudge",
        title: "Free Cash may be missing card spend",
        detail: "A payment to Capital One appears in checking, but that card is not connected.",
        issuerName: "Capital One",
      },
      expectedText: [
        "Free Cash may be missing card spend",
        "A payment to Capital One appears in checking",
        "Hide nudge",
      ],
    },
    {
      name: "math_breakdown",
      card: {
        type: "math_breakdown",
        title: "Math breakdown",
        incomeTotalCents: 320000,
        spendingTotalCents: 122000,
        protectedSavingsMonthlyCents: 20000,
        rollingNetCents: 178000,
        dayCount: 31,
      },
      expectedText: [
        "Math breakdown",
        "Income",
        "Spending",
        "Protected savings",
        "Rolling net",
        "$1,780",
      ],
    },
    {
      name: "connect_account",
      card: {
        type: "connect_account",
        title: "Connect or repair data",
        detail: "Use the data control to connect Plaid or repair a stale bank connection.",
      },
      expectedText: [
        "Connect or repair data",
        "Use the data control to connect Plaid or repair a stale bank connection.",
      ],
    },
  ];
}
