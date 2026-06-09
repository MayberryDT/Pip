import type { FinancialSnapshot } from "@/lib/types";

export type FakeDataScenario =
  | "default"
  | "healthy"
  | "overspending"
  | "shortfall"
  | "low-confidence"
  | "missing-card"
  | "cash-guardrail"
  | "negative";

export const fakeSnapshot: FinancialSnapshot = {
  settings: {
    asOfDate: "2026-06-20",
    protectedSavingsMonthlyCents: 24300,
  },
  accounts: [
    {
      id: "acct_checking",
      name: "Everyday Checking",
      institutionName: "Northstar Bank",
      kind: "checking",
      balanceCents: 185642,
      availableBalanceCents: 182942,
      lastFour: "1042",
    },
    {
      id: "acct_savings",
      name: "Protected Savings",
      institutionName: "Northstar Bank",
      kind: "savings",
      balanceCents: 523000,
      availableBalanceCents: 523000,
      lastFour: "7719",
      isProtectedSavings: true,
    },
    {
      id: "acct_visa",
      name: "Everyday Visa",
      institutionName: "Northstar Bank",
      kind: "credit_card",
      balanceCents: -34218,
      availableBalanceCents: 315482,
      lastFour: "8821",
    },
  ],
  transactions: [
    {
      id: "tx_paycheck_june",
      accountId: "acct_checking",
      date: "2026-06-07",
      description: "Payroll deposit",
      merchantName: "Acme Studio",
      amountCents: 260000,
      category: "payroll",
      kind: "income",
    },
    {
      id: "tx_paycheck_may",
      accountId: "acct_checking",
      date: "2026-05-24",
      description: "Payroll deposit",
      merchantName: "Acme Studio",
      amountCents: 160000,
      category: "payroll",
      kind: "income",
    },
    {
      id: "tx_rent",
      accountId: "acct_checking",
      date: "2026-06-01",
      description: "June rent",
      merchantName: "Trailhead Apartments",
      amountCents: -145000,
      category: "rent",
      kind: "rent",
    },
    {
      id: "tx_grocery_1",
      accountId: "acct_visa",
      date: "2026-06-04",
      description: "Grocery",
      merchantName: "City Market",
      amountCents: -18437,
      category: "groceries",
      kind: "purchase",
    },
    {
      id: "tx_grocery_2",
      accountId: "acct_visa",
      date: "2026-06-14",
      description: "Grocery",
      merchantName: "City Market",
      amountCents: -9321,
      category: "groceries",
      kind: "purchase",
    },
    {
      id: "tx_dining",
      accountId: "acct_checking",
      date: "2026-06-11",
      description: "Dinner",
      merchantName: "Mesa Room",
      amountCents: -5466,
      category: "dining",
      kind: "purchase",
    },
    {
      id: "tx_gas",
      accountId: "acct_visa",
      date: "2026-05-29",
      description: "Fuel",
      merchantName: "Red Rock Fuel",
      amountCents: -4892,
      category: "gas",
      kind: "purchase",
    },
    {
      id: "tx_utilities",
      accountId: "acct_checking",
      date: "2026-06-03",
      description: "Utilities",
      merchantName: "City Power",
      amountCents: -13844,
      category: "utilities",
      kind: "purchase",
    },
    {
      id: "tx_phone",
      accountId: "acct_checking",
      date: "2026-05-27",
      description: "Phone bill",
      merchantName: "Signal Mobile",
      amountCents: -7200,
      category: "phone",
      kind: "purchase",
    },
    {
      id: "tx_subscriptions",
      accountId: "acct_visa",
      date: "2026-06-09",
      description: "Subscription bundle",
      merchantName: "Streambox",
      amountCents: -2799,
      category: "subscriptions",
      kind: "purchase",
    },
    {
      id: "tx_target",
      accountId: "acct_visa",
      date: "2026-06-16",
      description: "Household supplies",
      merchantName: "Target",
      amountCents: -12233,
      category: "shopping",
      kind: "purchase",
    },
    {
      id: "tx_coffee",
      accountId: "acct_checking",
      date: "2026-06-18",
      description: "Coffee",
      merchantName: "Copper Cup",
      amountCents: -1425,
      category: "coffee",
      kind: "purchase",
    },
    {
      id: "tx_pharmacy",
      accountId: "acct_visa",
      date: "2026-05-30",
      description: "Pharmacy",
      merchantName: "Walgreens",
      amountCents: -3650,
      category: "health",
      kind: "purchase",
    },
    {
      id: "tx_gym",
      accountId: "acct_checking",
      date: "2026-06-05",
      description: "Gym membership",
      merchantName: "Forge Fitness",
      amountCents: -3400,
      category: "fitness",
      kind: "purchase",
    },
    {
      id: "tx_rideshare",
      accountId: "acct_visa",
      date: "2026-06-12",
      description: "Ride",
      merchantName: "Lyft",
      amountCents: -2130,
      category: "transport",
      kind: "purchase",
    },
    {
      id: "tx_amazon",
      accountId: "acct_visa",
      date: "2026-06-08",
      description: "Online order",
      merchantName: "Amazon",
      amountCents: -8840,
      category: "shopping",
      kind: "purchase",
    },
    {
      id: "tx_weekend",
      accountId: "acct_checking",
      date: "2026-06-19",
      description: "Weekend supplies",
      merchantName: "Basecamp Market",
      amountCents: -27763,
      category: "shopping",
      kind: "purchase",
    },
    {
      id: "tx_refund",
      accountId: "acct_visa",
      date: "2026-06-13",
      description: "Return refund",
      merchantName: "REI",
      amountCents: 4000,
      category: "refund",
      kind: "refund",
    },
    {
      id: "tx_card_payment_deduped",
      accountId: "acct_checking",
      date: "2026-06-15",
      description: "Autopay Northstar Visa",
      merchantName: "Northstar Visa",
      amountCents: -53000,
      category: "credit card payment",
      kind: "credit_card_payment",
      metadata: {
        issuerName: "Northstar Visa",
        matchedConnectedCard: true,
      },
    },
    {
      id: "tx_possible_missing_card",
      accountId: "acct_checking",
      date: "2026-06-17",
      description: "Capital One card payment",
      merchantName: "Capital One",
      amountCents: -12400,
      category: "credit card payment",
      kind: "credit_card_payment",
      metadata: {
        issuerName: "Capital One",
        matchedConnectedCard: false,
      },
    },
    {
      id: "tx_transfer_savings",
      accountId: "acct_checking",
      date: "2026-06-06",
      description: "Transfer to savings",
      merchantName: "Northstar Bank",
      amountCents: -30000,
      category: "transfer",
      kind: "transfer",
    },
    {
      id: "tx_old_paycheck",
      accountId: "acct_checking",
      date: "2026-05-18",
      description: "Old payroll deposit",
      merchantName: "Acme Studio",
      amountCents: 260000,
      category: "payroll",
      kind: "income",
    },
  ],
};

export const negativeFreeCashSnapshot: FinancialSnapshot = {
  settings: {
    asOfDate: "2026-06-20",
    protectedSavingsMonthlyCents: 20000,
  },
  accounts: [
    {
      id: "acct_checking",
      name: "Everyday Checking",
      institutionName: "Northstar Bank",
      kind: "checking",
      balanceCents: 62114,
      availableBalanceCents: 59414,
      lastFour: "1042",
    },
    {
      id: "acct_savings",
      name: "Protected Savings",
      institutionName: "Northstar Bank",
      kind: "savings",
      balanceCents: 319000,
      availableBalanceCents: 319000,
      lastFour: "7719",
      isProtectedSavings: true,
    },
    {
      id: "acct_visa",
      name: "Everyday Visa",
      institutionName: "Northstar Bank",
      kind: "credit_card",
      balanceCents: -84622,
      availableBalanceCents: 231378,
      lastFour: "8821",
    },
  ],
  transactions: [
    {
      id: "neg_paycheck_june",
      accountId: "acct_checking",
      date: "2026-06-07",
      description: "Payroll deposit",
      merchantName: "Acme Studio",
      amountCents: 180000,
      category: "payroll",
      kind: "income",
    },
    {
      id: "neg_rent",
      accountId: "acct_checking",
      date: "2026-06-01",
      description: "June rent",
      merchantName: "Trailhead Apartments",
      amountCents: -145000,
      category: "rent",
      kind: "rent",
    },
    {
      id: "neg_car_repair",
      accountId: "acct_visa",
      date: "2026-06-05",
      description: "Brake repair",
      merchantName: "Summit Auto",
      amountCents: -64200,
      category: "auto",
      kind: "purchase",
    },
    {
      id: "neg_groceries",
      accountId: "acct_visa",
      date: "2026-06-12",
      description: "Grocery",
      merchantName: "City Market",
      amountCents: -27150,
      category: "groceries",
      kind: "purchase",
    },
    {
      id: "neg_utilities",
      accountId: "acct_checking",
      date: "2026-06-03",
      description: "Utilities",
      merchantName: "City Power",
      amountCents: -16444,
      category: "utilities",
      kind: "purchase",
    },
    {
      id: "neg_pending_card",
      accountId: "acct_visa",
      date: "2026-06-20",
      description: "Pending hotel hold",
      merchantName: "Canyon Lodge",
      amountCents: -43300,
      category: "travel",
      kind: "purchase",
      pending: true,
    },
    {
      id: "neg_refund",
      accountId: "acct_visa",
      date: "2026-06-17",
      description: "Return refund",
      merchantName: "Target",
      amountCents: 12000,
      category: "refund",
      kind: "refund",
    },
    {
      id: "neg_card_payment",
      accountId: "acct_checking",
      date: "2026-06-18",
      description: "Autopay Northstar Visa",
      merchantName: "Northstar Visa",
      amountCents: -80000,
      category: "credit card payment",
      kind: "credit_card_payment",
      metadata: {
        issuerName: "Northstar Visa",
        matchedConnectedCard: true,
      },
    },
    {
      id: "neg_exited_groceries",
      accountId: "acct_visa",
      date: "2026-05-19",
      description: "Older grocery run",
      merchantName: "City Market",
      amountCents: -22100,
      category: "groceries",
      kind: "purchase",
    },
  ],
};

export const healthySpendableSnapshot = buildSpendableScenario({
  scenarioId: "healthy",
  checkingAvailableCents: 260000,
  currentEverydaySpendCents: 60000,
});

export const overspendingSpendableSnapshot = buildSpendableScenario({
  scenarioId: "overspending",
  checkingAvailableCents: 240000,
  currentEverydaySpendCents: 245000,
});

export const shortfallSpendableSnapshot = buildSpendableScenario({
  scenarioId: "shortfall",
  checkingAvailableCents: 4000,
  monthlyIncomeCents: 220000,
  monthlyRecurringCents: 215000,
  protectedSavingsMonthlyCents: 30000,
  currentEverydaySpendCents: 120000,
});

export const lowConfidenceSpendableSnapshot = buildSpendableScenario({
  scenarioId: "low-confidence",
  checkingAvailableCents: 140000,
  currentEverydaySpendCents: 58000,
  completedMonthCount: 0,
});

export const missingCardSpendableSnapshot = buildSpendableScenario({
  scenarioId: "missing-card",
  checkingAvailableCents: 260000,
  currentEverydaySpendCents: 72000,
  includeMissingCardPayment: true,
});

export const cashGuardrailSpendableSnapshot = buildSpendableScenario({
  scenarioId: "cash-guardrail",
  checkingAvailableCents: 2800,
  currentEverydaySpendCents: 65000,
});

export function getFakeSnapshot(scenario: string | null | undefined): FinancialSnapshot {
  switch (scenario) {
    case "healthy":
      return healthySpendableSnapshot;
    case "overspending":
      return overspendingSpendableSnapshot;
    case "shortfall":
      return shortfallSpendableSnapshot;
    case "low-confidence":
      return lowConfidenceSpendableSnapshot;
    case "missing-card":
      return missingCardSpendableSnapshot;
    case "cash-guardrail":
      return cashGuardrailSpendableSnapshot;
    case "negative":
      return negativeFreeCashSnapshot;
    case "default":
    default:
      return fakeSnapshot;
  }
}

export function isFakeDataScenario(value: string | null | undefined): value is FakeDataScenario {
  return (
    value === "default" ||
    value === "healthy" ||
    value === "overspending" ||
    value === "shortfall" ||
    value === "low-confidence" ||
    value === "missing-card" ||
    value === "cash-guardrail" ||
    value === "negative"
  );
}

function buildSpendableScenario(input: {
  scenarioId: string;
  checkingAvailableCents: number;
  currentEverydaySpendCents: number;
  monthlyIncomeCents?: number;
  monthlyRecurringCents?: number;
  protectedSavingsMonthlyCents?: number;
  completedMonthCount?: number;
  includeMissingCardPayment?: boolean;
}): FinancialSnapshot {
  const monthlyIncomeCents = input.monthlyIncomeCents ?? 420000;
  const monthlyRecurringCents = input.monthlyRecurringCents ?? 172000;
  const protectedSavingsMonthlyCents = input.protectedSavingsMonthlyCents ?? 20000;
  const completedMonthCount = input.completedMonthCount ?? 3;
  const completedMonths = ["2026-03", "2026-04", "2026-05"].slice(3 - completedMonthCount);
  const transactions = [
    ...completedMonths.flatMap((month) =>
      buildMonthlyPatternTransactions({
        scenarioId: input.scenarioId,
        month,
        incomeCents: monthlyIncomeCents,
        recurringCents: monthlyRecurringCents,
        everydaySpendCents: 104000,
      }),
    ),
    ...buildMonthlyPatternTransactions({
      scenarioId: input.scenarioId,
      month: "2026-06",
      incomeCents: monthlyIncomeCents,
      recurringCents: monthlyRecurringCents,
      everydaySpendCents: input.currentEverydaySpendCents,
      currentMonth: true,
    }),
  ];

  if (input.includeMissingCardPayment) {
    transactions.push({
      id: `${input.scenarioId}-missing-card-payment`,
      accountId: "acct_checking",
      date: "2026-06-17",
      description: "Capital One card payment",
      merchantName: "Capital One",
      amountCents: -18400,
      category: "credit card payment",
      kind: "credit_card_payment",
      metadata: {
        issuerName: "Capital One",
        matchedConnectedCard: false,
      },
    });
  }

  return {
    settings: {
      asOfDate: "2026-06-20",
      protectedSavingsMonthlyCents,
    },
    accounts: [
      {
        id: "acct_checking",
        name: "Everyday Checking",
        institutionName: "Northstar Bank",
        kind: "checking",
        balanceCents: input.checkingAvailableCents,
        availableBalanceCents: input.checkingAvailableCents,
        lastFour: "1042",
      },
      {
        id: "acct_savings",
        name: "Protected Savings",
        institutionName: "Northstar Bank",
        kind: "savings",
        balanceCents: 420000,
        availableBalanceCents: 420000,
        lastFour: "7719",
        isProtectedSavings: true,
      },
      {
        id: "acct_visa",
        name: "Everyday Visa",
        institutionName: "Northstar Bank",
        kind: "credit_card",
        balanceCents: -42000,
        availableBalanceCents: 258000,
        lastFour: "8821",
      },
    ],
    transactions,
  };
}

function buildMonthlyPatternTransactions(input: {
  scenarioId: string;
  month: string;
  incomeCents: number;
  recurringCents: number;
  everydaySpendCents: number;
  currentMonth?: boolean;
}): FinancialSnapshot["transactions"] {
  const rentCents = Math.min(input.recurringCents, 145000);
  const remainingRecurringCents = Math.max(0, input.recurringCents - rentCents);
  const utilityCents = Math.round(remainingRecurringCents * 0.48);
  const phoneCents = Math.round(remainingRecurringCents * 0.25);
  const subscriptionCents = Math.max(0, remainingRecurringCents - utilityCents - phoneCents);
  const everydayHalfCents = Math.round(input.everydaySpendCents / 2);
  const everydayRestCents = input.everydaySpendCents - everydayHalfCents;
  const currentDay = input.currentMonth ? "18" : "20";

  return [
    {
      id: `${input.scenarioId}-${input.month}-income`,
      accountId: "acct_checking",
      date: `${input.month}-07`,
      description: "Payroll deposit",
      merchantName: "Acme Studio",
      amountCents: input.incomeCents,
      category: "payroll",
      kind: "income",
    },
    {
      id: `${input.scenarioId}-${input.month}-rent`,
      accountId: "acct_checking",
      date: `${input.month}-01`,
      description: "Monthly rent",
      merchantName: "Trailhead Apartments",
      amountCents: -rentCents,
      category: "rent",
      kind: "rent",
    },
    {
      id: `${input.scenarioId}-${input.month}-utilities`,
      accountId: "acct_checking",
      date: `${input.month}-03`,
      description: "Utilities",
      merchantName: "City Power",
      amountCents: -utilityCents,
      category: "utilities",
      kind: "purchase",
    },
    {
      id: `${input.scenarioId}-${input.month}-phone`,
      accountId: "acct_checking",
      date: `${input.month}-10`,
      description: "Phone bill",
      merchantName: "Signal Mobile",
      amountCents: -phoneCents,
      category: "phone",
      kind: "purchase",
    },
    {
      id: `${input.scenarioId}-${input.month}-subscription`,
      accountId: "acct_visa",
      date: `${input.month}-09`,
      description: "Subscription bundle",
      merchantName: "Streambox",
      amountCents: -subscriptionCents,
      category: "subscriptions",
      kind: "purchase",
    },
    {
      id: `${input.scenarioId}-${input.month}-groceries`,
      accountId: "acct_visa",
      date: `${input.month}-12`,
      description: "Groceries",
      merchantName: "City Market",
      amountCents: -everydayHalfCents,
      category: "groceries",
      kind: "purchase",
    },
    {
      id: `${input.scenarioId}-${input.month}-shopping`,
      accountId: "acct_visa",
      date: `${input.month}-${currentDay}`,
      description: "Household supplies",
      merchantName: "Basecamp Market",
      amountCents: -everydayRestCents,
      category: "shopping",
      kind: "purchase",
    },
  ];
}
