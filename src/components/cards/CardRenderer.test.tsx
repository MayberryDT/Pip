import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactNode } from "react";
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

  it("wires missing-card suppression to the nudge button", () => {
    const suppressedIssuers: string[] = [];
    const element = CardRenderer({
      card: {
        type: "missing_card_nudge",
        title: "Possible missing card",
        detail: "I see a payment to Capital One, but that card is not connected.",
        issuerName: "Capital One",
      },
      onSuppressMissingCard: (issuerName) => suppressedIssuers.push(issuerName),
    });
    const button = findElementByType(element, "button");

    expect(button?.props.children).toBeTruthy();
    button?.props.onClick();
    expect(suppressedIssuers).toEqual(["Capital One"]);
  });
});

function findElementByType(node: ReactNode, type: string): any {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementByType(child, type);

      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isValidElement(node)) {
    return null;
  }

  if (node.type === type) {
    return node;
  }

  return findElementByType(node.props.children, type);
}

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
        title: "Why this number changed",
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
            label: "Possible missing card",
            detail: "I see a payment to Capital One, but that card is not connected.",
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
        "Why this number changed",
        "Income in window",
        "$3,200",
        "Possible missing card",
        "I see a payment to Capital One, but that card is not connected.",
        "Pending transactions included",
        "-$25",
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
      expectedText: ["Purchase simulation", "Current Spendable Cash", "Purchase", "After purchase", "$43", "-$50", "-$7"],
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
      name: "spending_breakdown",
      card: {
        type: "spending_breakdown",
        title: "Spending breakdown",
        window: {
          startDate: "2026-05-21",
          endDate: "2026-06-20",
          dayCount: 31,
          daysElapsed: 31,
          daysRemaining: 0,
        },
        totals: {
          incomeCents: 320000,
          spendingCents: 122000,
          refundCents: 4000,
          rentCents: 80000,
          cardPaymentCents: 50000,
          protectedSavingsMonthlyCents: 20000,
        },
        topCategories: [
          {
            id: "groceries",
            label: "Groceries",
            amountCents: -4200,
            transactionCount: 2,
          },
        ],
        topMerchants: [
          {
            id: "city-market",
            label: "City Market",
            amountCents: -4200,
            transactionCount: 2,
          },
        ],
        incomeSources: [
          {
            id: "payroll",
            label: "Payroll",
            amountCents: 320000,
            transactionCount: 1,
          },
        ],
      },
      expectedText: ["Spending breakdown", "Income", "$3,200", "Top categories", "Groceries", "Top merchants", "City Market"],
    },
    {
      name: "recurring_activity",
      card: {
        type: "recurring_activity",
        title: "Likely recurring activity",
        asOfDate: "2026-06-20",
        horizonDays: 45,
        items: [
          {
            id: "recurring-youtube-premium",
            label: "Youtube Premium",
            merchantName: "Youtube Premium",
            expectedDate: "2026-07-08",
            amountCents: -1399,
            kind: "purchase",
            cadence: "monthly",
            confidence: "high",
            sourceTransactionCount: 2,
            lastSeenDate: "2026-06-08",
          },
        ],
      },
      expectedText: ["Likely recurring activity", "Youtube Premium", "2026-07-08", "high confidence", "-$13.99"],
    },
    {
      name: "spendable_cash_forecast",
      card: {
        type: "spendable_cash_forecast",
        title: "7-day forecast",
        asOfDate: "2026-06-20",
        horizonDays: 7,
        currentSpendableCashCents: 4300,
        projectedSpendableCashCents: 3800,
        dailyTrendCents: -500,
        disclaimer: "Forecast only; not guaranteed.",
        points: [
          {
            date: "2026-06-21",
            projectedSpendableCashCents: 4200,
            deltaFromTodayCents: -100,
            expectedActivityCents: -500,
            rollingNetCents: 130200,
          },
        ],
        recurringItems: [
          {
            id: "recurring-youtube-premium",
            label: "Youtube Premium",
            merchantName: "Youtube Premium",
            expectedDate: "2026-07-08",
            amountCents: -1399,
            kind: "purchase",
            cadence: "monthly",
            confidence: "high",
            sourceTransactionCount: 2,
            lastSeenDate: "2026-06-08",
          },
        ],
      },
      expectedText: ["7-day forecast", "Now", "7 days", "$43", "$38", "2026-06-21", "Forecast only; not guaranteed."],
    },
    {
      name: "missing_card_nudge",
      card: {
        type: "missing_card_nudge",
        title: "Possible missing card",
        detail: "I see a payment to Capital One, but that card is not connected.",
        issuerName: "Capital One",
      },
      expectedText: [
        "Possible missing card",
        "I see a payment to Capital One, but that card is not connected.",
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
      name: "insight_card",
      card: {
        type: "insight_card",
        title: "Payday impact",
        summary: "Income is helping today, but spending and protected savings still count first.",
        rows: [
          {
            id: "income",
            label: "Income counted",
            amountCents: 320000,
            detail: "Paychecks inside the rolling month.",
            tone: "positive",
          },
          {
            id: "spending",
            label: "Spending and bills",
            amountCents: -122000,
            detail: "Spending offsets income.",
            tone: "negative",
          },
          {
            id: "today",
            label: "Today",
            valueText: "On track",
            detail: "The daily signal after the main factors.",
            tone: "neutral",
          },
        ],
        footer: "Payday helps most while it stays inside the rolling window.",
      },
      expectedText: [
        "Payday impact",
        "Income is helping today",
        "Income counted",
        "$3,200",
        "Spending and bills",
        "-$1,220",
        "On track",
        "Payday helps most",
      ],
    },
    {
      name: "connect_account",
      card: {
        type: "connect_account",
        title: "Connect or repair data",
        detail: "Ask me in chat to connect Plaid or repair a stale bank connection.",
      },
      expectedText: [
        "Connect or repair data",
        "Ask me in chat to connect Plaid or repair a stale bank connection.",
      ],
    },
  ];
}
