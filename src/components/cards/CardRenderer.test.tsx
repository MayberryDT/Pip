import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { AgentCard } from "@/lib/agent/card-types";
import { CardRenderer } from "@/components/cards/CardRenderer";

describe("CardRenderer", () => {
  it.each(getRenderableCards())("renders the $name card without missing-field artifacts", ({ card, expectedText, absentText = [] }) => {
    const markup = renderToStaticMarkup(
      <CardRenderer card={card} onSuppressMissingCard={() => undefined} />,
    );

    for (const text of expectedText) {
      expect(markup).toContain(text);
    }

    for (const text of absentText) {
      expect(markup).not.toContain(text);
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

  it("submits account card action prompts through chat", () => {
    const prompts: string[] = [];
    const element = CardRenderer({
      card: accountConnectionsCard(),
      onSubmitPrompt: (prompt) => prompts.push(prompt),
    });
    const button = findElementByType(element, "button");

    button?.props.onClick();
    expect(prompts).toEqual(["Add account"]);
  });

  it("submits settings card action prompts through chat", () => {
    const prompts: string[] = [];
    const element = CardRenderer({
      card: settingsPanelCard(),
      onSubmitPrompt: (prompt) => prompts.push(prompt),
    });
    const button = findElementByType(element, "button");

    button?.props.onClick();
    expect(prompts).toEqual(["Show support"]);
  });

  it("applies long-token wrapping to insight card text surfaces", () => {
    const longToken = "GENERAL_SERVICES_OTHER_GENERAL_SERVICES".repeat(4);
    const markup = renderToStaticMarkup(
      <CardRenderer
        card={{
          type: "insight_card",
          title: longToken,
          summary: longToken,
          rows: [
            {
              id: "pathological-token",
              label: longToken,
              detail: longToken,
              valueText: longToken,
              tone: "warning",
            },
          ],
          footer: longToken,
        }}
      />,
    );

    expect(markup).toContain(longToken);
    expect(markup).toMatch(/<section class="[^"]*pip-wrap-anywhere/);
    expect(markup).toMatch(/<h3 class="[^"]*pip-wrap-anywhere/);
    expect(countOccurrences(markup, "pip-wrap-anywhere")).toBeGreaterThanOrEqual(6);
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

  if (
    typeof node.type === "function" &&
    !(node.type.prototype && "render" in node.type.prototype)
  ) {
    const element = node as ReactElement;
    const Component = node.type as (props: any) => ReactNode;

    return findElementByType(Component(element.props), type);
  }

  return findElementByType(node.props.children, type);
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

function getRenderableCards(): Array<{
  name: AgentCard["type"];
  card: AgentCard;
  expectedText: string[];
  absentText?: string[];
}> {
  return [
    {
      name: "pip_cash_explanation",
      card: {
        type: "pip_cash_explanation",
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
        todayRemainingCents: -700,
        todayOverageCents: 700,
        afterTodayCents: 4300,
        monthlyAverageAfterCents: -700,
      },
      expectedText: ["Purchase simulation", "Current Spendable Cash", "Purchase", "Spendable Cash after", "$43", "-$50", "-$7"],
      absentText: ["Today room left", "Daily room change"],
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
        "Monthly savings",
        "Rolling net",
        "$1,780",
      ],
    },
    {
      name: "trust_receipt",
      card: {
        type: "trust_receipt",
        title: "Trust receipt",
        summary: "$43 is based on connected data and visible constraints through the current receipt.",
        asOfLabel: "Connected data refreshed Jun 18, 2:14 PM",
        rows: [
          {
            id: "freshness",
            label: "Data freshness",
            value: "Refreshed",
            detail: "Last successful provider refresh: Jun 18, 2:14 PM.",
            tone: "neutral",
          },
          {
            id: "confidence",
            label: "Confidence",
            value: "medium",
            detail: "Confidence comes from the available account and transaction pattern.",
            tone: "warning",
          },
        ],
        knownLimits: [
          {
            id: "pending-transactions",
            label: "Pending transactions included",
            detail: "Pending card purchases are included.",
          },
        ],
        footer: "Cash spending and manually paid bills can still change the picture.",
      },
      expectedText: [
        "Trust receipt",
        "$43 is based on connected data",
        "Connected data refreshed Jun 18",
        "Data freshness",
        "Refreshed",
        "Confidence",
        "medium",
        "Pending transactions included",
        "Cash spending and manually paid bills",
      ],
    },
    {
      name: "savings_goal_plan",
      card: {
        type: "savings_goal_plan",
        title: "Savings Goals",
        goalId: "goal-trip",
        name: "Japan trip",
        targetAmountCents: 500000,
        currentAmountCents: 50000,
        remainingCents: 450000,
        targetDate: "2026-12-01",
        recommendedMonthlyContributionCents: 75000,
        monthlyContributionCents: 0,
        includeInSpendableCash: false,
        summary: "$4,500 left for Japan trip. $750/month uses the same Monthly Savings system as Spendable Cash Today. Pip tracks the plan, but does not move money.",
      },
      expectedText: [
        "Savings Goals",
        "$4,500 left for Japan trip",
        "Monthly Savings",
        "$750",
        "Savings goals live inside Monthly Savings",
        "Tracked in Pip only",
        "Pip does not move money",
      ],
      absentText: ["Monthly plan", "Tracked only.", "Not held out", "would keep it on pace"],
    },
    {
      name: "savings_goals_summary",
      card: {
        type: "savings_goals_summary",
        title: "Savings Goals",
        summary: "1 active savings goal tracked inside Monthly Savings. Pip does not move money.",
        activeGoalCount: 1,
        protectedMonthlyContributionCents: 0,
        goals: [
          {
            goalId: "goal-trip",
            name: "Japan trip",
            targetAmountCents: 500000,
            currentAmountCents: 50000,
            remainingCents: 450000,
            targetDate: "2026-12-01",
            monthlyContributionCents: 75000,
            includeInSpendableCash: false,
          },
        ],
      },
      expectedText: [
        "Savings Goals",
        "tracked inside Monthly Savings",
        "Pip does not move money",
        "Japan trip",
        "$4,500 left",
        "Monthly Savings",
        "$750/month in Monthly Savings",
      ],
      absentText: ["Tracked only.", "Not held out", "Monthly Savings tracked in Pip only"],
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
      name: "guidance_card",
      card: {
        type: "guidance_card",
        title: "My read",
        stance: "watch",
        summary: "You are not in crisis, but recent spending is running hot.",
        rows: [
          {
            label: "Main pressure",
            detail: "Recent everyday spending is ahead of pace.",
            tone: "warning",
            evidenceIds: ["recent-spending-hot"],
          },
          {
            label: "Why it matters",
            detail: "Today's number is lower while that pressure recovers.",
            tone: "neutral",
            evidenceIds: ["behavior-adjustment-negative"],
          },
        ],
        footer: "Based on Spendable Cash Today evidence.",
      },
      expectedText: [
        "My read",
        "Watch",
        "You are not in crisis",
        "Main pressure",
        "Recent everyday spending is ahead of pace.",
        "Why it matters",
        "Based on Spendable Cash Today evidence.",
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
    {
      name: "account_connections",
      card: accountConnectionsCard(),
      expectedText: [
        "Account connections",
        "Chase",
        "Everyday Checking",
        "Used in today",
        "Capital One",
        "Needs repair",
      ],
    },
    {
      name: "settings_panel",
      card: settingsPanelCard(),
      expectedText: [
        "Settings",
        "Account",
        "tester@example.com",
        "Connected data loaded",
        "Support",
        "Privacy and terms",
      ],
    },
    {
      name: "settings_detail",
      card: {
        type: "settings_detail",
        title: "Terms",
        summary: "Pip is a spending signal and assistant.",
        rows: [
          {
            label: "Accuracy",
            detail: "Pending or missing data can change Spendable Cash Today.",
          },
        ],
        actions: [
          {
            id: "settings-overview",
            label: "Settings",
            prompt: "Settings",
            style: "secondary",
          },
        ],
      },
      expectedText: [
        "Terms",
        "Pip is a spending signal and assistant.",
        "Accuracy",
        "Pending or missing data can change Spendable Cash Today.",
      ],
    },
  ];
}

function settingsPanelCard(): AgentCard {
  return {
    type: "settings_panel",
    title: "Settings",
    accountRows: [
      {
        label: "Account",
        value: "tester@example.com",
      },
      {
        label: "Data",
        value: "Connected data loaded",
      },
    ],
    sections: [
      {
        title: "Support",
        body: "Get help, report answer quality, or send tester feedback from this chat.",
      },
      {
        title: "Privacy and terms",
        body: "Read the short in-app version here without leaving Pip.",
      },
    ],
    actions: [
      {
        id: "settings-support",
        label: "Support",
        prompt: "Show support",
        style: "secondary",
      },
      {
        id: "settings-delete-account",
        label: "Delete account",
        prompt: "Delete my account",
        style: "danger",
      },
    ],
  };
}

function accountConnectionsCard(): AgentCard {
  return {
    type: "account_connections",
    title: "Account connections",
    institutions: [
      {
        institutionId: "institution-1",
        institutionName: "Chase",
        provider: "plaid",
        status: "connected",
        accounts: [
          {
            accountId: "account-1",
            name: "Everyday Checking",
            kind: "checking",
            lastFour: "1042",
            includedInPipCash: true,
            isProtectedSavings: false,
            active: true,
            roleLabel: "Used in today's number",
          },
        ],
        actions: [
          {
            id: "add-account",
            label: "Add account",
            prompt: "Add account",
            style: "primary",
          },
        ],
      },
      {
        institutionId: "institution-2",
        institutionName: "Capital One",
        provider: "plaid",
        status: "failed",
        accounts: [],
        actions: [
          {
            id: "repair-institution-2",
            label: "Reconnect",
            prompt: "Reconnect Capital One",
            style: "primary",
          },
        ],
      },
    ],
  };
}
