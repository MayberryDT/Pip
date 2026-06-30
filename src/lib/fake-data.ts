import type { FinancialSnapshot } from "@/lib/types";

export type FakeDataScenario =
  | "default"
  | "healthy"
  | "overspending"
  | "shortfall"
  | "low-confidence"
  | "missing-card"
  | "cash-guardrail"
  | "cutback-dining"
  | "negative"
  | "production-scale";

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

export const negativePipCashSnapshot: FinancialSnapshot = {
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

export const healthyPipSnapshot = buildPipScenario({
  scenarioId: "healthy",
  checkingAvailableCents: 260000,
  currentEverydaySpendCents: 60000,
});

export const overspendingPipSnapshot = buildPipScenario({
  scenarioId: "overspending",
  checkingAvailableCents: 240000,
  currentEverydaySpendCents: 245000,
});

export const shortfallPipSnapshot = buildPipScenario({
  scenarioId: "shortfall",
  checkingAvailableCents: 4000,
  monthlyIncomeCents: 220000,
  monthlyRecurringCents: 215000,
  protectedSavingsMonthlyCents: 30000,
  currentEverydaySpendCents: 120000,
});

export const lowConfidencePipSnapshot = buildPipScenario({
  scenarioId: "low-confidence",
  checkingAvailableCents: 140000,
  currentEverydaySpendCents: 58000,
  completedMonthCount: 0,
});

export const missingCardPipSnapshot = buildPipScenario({
  scenarioId: "missing-card",
  checkingAvailableCents: 260000,
  currentEverydaySpendCents: 72000,
  includeMissingCardPayment: true,
});

export const cashGuardrailPipSnapshot = buildPipScenario({
  scenarioId: "cash-guardrail",
  checkingAvailableCents: 2800,
  currentEverydaySpendCents: 65000,
});

export const cutbackDiningPipSnapshot: FinancialSnapshot = {
  settings: {
    asOfDate: "2026-06-20",
    protectedSavingsMonthlyCents: 20000,
  },
  accounts: [
    {
      id: "cutback_checking",
      name: "Everyday Checking",
      institutionName: "Northstar Bank",
      kind: "checking",
      balanceCents: 260000,
      availableBalanceCents: 258000,
      lastFour: "1042",
    },
    {
      id: "cutback_visa",
      name: "Everyday Visa",
      institutionName: "Northstar Bank",
      kind: "credit_card",
      balanceCents: -42000,
      availableBalanceCents: 300000,
      lastFour: "8821",
    },
  ],
  transactions: [
    {
      id: "cutback_paycheck",
      accountId: "cutback_checking",
      date: "2026-06-07",
      description: "Payroll deposit",
      merchantName: "Acme Studio",
      amountCents: 260000,
      category: "payroll",
      kind: "income",
    },
    {
      id: "cutback_rent",
      accountId: "cutback_checking",
      date: "2026-06-01",
      description: "June rent",
      merchantName: "Trailhead Apartments",
      amountCents: -145000,
      category: "rent",
      kind: "rent",
    },
    {
      id: "cutback_dining_1",
      accountId: "cutback_visa",
      date: "2026-06-08",
      description: "Dinner",
      merchantName: "Mesa Room",
      amountCents: -7200,
      category: "dining",
      kind: "purchase",
    },
    {
      id: "cutback_dining_2",
      accountId: "cutback_checking",
      date: "2026-06-11",
      description: "Takeout",
      merchantName: "DoorDash",
      amountCents: -5400,
      category: "dining",
      kind: "purchase",
    },
    {
      id: "cutback_dining_3",
      accountId: "cutback_visa",
      date: "2026-06-15",
      description: "Lunch",
      merchantName: "Cafe Rojo",
      amountCents: -3200,
      category: "dining",
      kind: "purchase",
    },
    {
      id: "cutback_dining_4",
      accountId: "cutback_visa",
      date: "2026-06-19",
      description: "Dinner",
      merchantName: "Mesa Room",
      amountCents: -4200,
      category: "dining",
      kind: "purchase",
    },
    {
      id: "cutback_prev_dining_1",
      accountId: "cutback_visa",
      date: "2026-05-27",
      description: "Lunch",
      merchantName: "Cafe Rojo",
      amountCents: -3100,
      category: "dining",
      kind: "purchase",
    },
    {
      id: "cutback_prev_dining_2",
      accountId: "cutback_checking",
      date: "2026-06-02",
      description: "Dinner",
      merchantName: "Mesa Room",
      amountCents: -3700,
      category: "dining",
      kind: "purchase",
    },
    {
      id: "cutback_transfer",
      accountId: "cutback_checking",
      date: "2026-06-13",
      description: "Transfer to savings",
      merchantName: "Northstar Bank",
      amountCents: -50000,
      category: "transfer",
      kind: "transfer",
    },
  ],
};

export const productionScalePipSnapshot = buildProductionScaleSnapshot();

export function getFakeSnapshot(scenario: string | null | undefined): FinancialSnapshot {
  switch (scenario) {
    case "healthy":
      return healthyPipSnapshot;
    case "overspending":
      return overspendingPipSnapshot;
    case "shortfall":
      return shortfallPipSnapshot;
    case "low-confidence":
      return lowConfidencePipSnapshot;
    case "missing-card":
      return missingCardPipSnapshot;
    case "cash-guardrail":
      return cashGuardrailPipSnapshot;
    case "cutback-dining":
      return cutbackDiningPipSnapshot;
    case "negative":
      return negativePipCashSnapshot;
    case "production-scale":
      return productionScalePipSnapshot;
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
    value === "cutback-dining" ||
    value === "negative" ||
    value === "production-scale"
  );
}

function buildProductionScaleSnapshot(): FinancialSnapshot {
  const months = [
    "2025-01",
    "2025-02",
    "2025-03",
    "2025-04",
    "2025-05",
    "2025-06",
    "2025-07",
    "2025-08",
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
  ];
  const transactions = months.flatMap((month, index) =>
    buildProductionScaleMonth({
      month,
      monthIndex: index,
      currentMonth: month === "2026-06",
    }),
  );

  return {
    settings: {
      asOfDate: "2026-06-20",
      protectedSavingsMonthlyCents: 65000,
    },
    accounts: [
      {
        id: "prod_checking_primary",
        name: "Primary Checking",
        institutionName: "Cedar Test Bank",
        kind: "checking",
        balanceCents: 624300,
        availableBalanceCents: 618900,
        lastFour: "1204",
      },
      {
        id: "prod_checking_household",
        name: "Household Checking",
        institutionName: "Cedar Test Bank",
        kind: "checking",
        balanceCents: 187500,
        availableBalanceCents: 185100,
        lastFour: "2291",
      },
      {
        id: "prod_savings_protected",
        name: "Protected Savings",
        institutionName: "Cedar Test Bank",
        kind: "savings",
        balanceCents: 1484000,
        availableBalanceCents: 1484000,
        lastFour: "4588",
        isProtectedSavings: true,
      },
      {
        id: "prod_savings_emergency",
        name: "Emergency Reserve",
        institutionName: "Pine Test Credit Union",
        kind: "savings",
        balanceCents: 723000,
        availableBalanceCents: 723000,
        lastFour: "8073",
      },
      {
        id: "prod_card_everyday",
        name: "Everyday Rewards Card",
        institutionName: "Cedar Test Bank",
        kind: "credit_card",
        balanceCents: -184200,
        availableBalanceCents: 515800,
        lastFour: "6194",
      },
      {
        id: "prod_card_travel",
        name: "Travel Card",
        institutionName: "Summit Test Financial",
        kind: "credit_card",
        balanceCents: -94800,
        availableBalanceCents: 405200,
        lastFour: "3342",
      },
      {
        id: "prod_card_store",
        name: "Store Card",
        institutionName: "Harbor Test Bank",
        kind: "credit_card",
        balanceCents: -12650,
        availableBalanceCents: 187350,
        lastFour: "5520",
      },
      {
        id: "prod_auto_loan",
        name: "Auto Loan",
        institutionName: "Pine Test Credit Union",
        kind: "loan",
        balanceCents: -1132000,
        availableBalanceCents: 0,
        lastFour: "9407",
        includedInPipCash: false,
      },
    ],
    savingsGoals: [
      {
        id: "prod_goal_winter_trip",
        userId: "prod_local_user",
        name: "Winter trip",
        targetAmountCents: 240000,
        targetDate: "2026-12-15",
        startingAmountCents: 30000,
        currentAmountCents: 74000,
        monthlyContributionCents: 6000,
        includeInSpendableCash: true,
        status: "active",
        createdAt: "2026-02-01T12:00:00.000Z",
        updatedAt: "2026-06-18T12:00:00.000Z",
      },
    ],
    transactions,
  };
}

function buildProductionScaleMonth(input: {
  month: string;
  monthIndex: number;
  currentMonth: boolean;
}): FinancialSnapshot["transactions"] {
  const prefix = `prod-${input.month}`;
  const day = (value: number) => `${input.month}-${String(value).padStart(2, "0")}`;
  const incomeBumpCents = input.monthIndex % 6 === 0 ? 18000 : 0;
  const groceryShiftCents = (input.monthIndex % 4) * 325;
  const diningShiftCents = (input.monthIndex % 5) * 215;
  const pendingSuffix = input.currentMonth ? "-pending" : "";
  const scaleDiscretionarySpend = (amountCents: number) =>
    input.currentMonth ? Math.round(amountCents * 0.55) : amountCents;
  const baseTransactions: FinancialSnapshot["transactions"] = [
    {
      id: `${prefix}-income-primary`,
      accountId: "prod_checking_primary",
      date: day(5),
      description: "Payroll deposit",
      merchantName: "Evergreen Payroll",
      amountCents: 325000 + incomeBumpCents,
      category: "payroll",
      kind: "income",
    },
    {
      id: `${prefix}-income-household`,
      accountId: "prod_checking_household",
      date: day(20),
      description: "Household payroll deposit",
      merchantName: "Juniper Studio",
      amountCents: 214000,
      category: "payroll",
      kind: "income",
    },
    {
      id: `${prefix}-rent`,
      accountId: "prod_checking_primary",
      date: day(1),
      description: "Monthly rent",
      merchantName: "Ridgeview Homes",
      amountCents: -212500,
      category: "rent",
      kind: "rent",
    },
    {
      id: `${prefix}-utilities`,
      accountId: "prod_checking_primary",
      date: day(3),
      description: "Electric and water",
      merchantName: "Valley Utilities",
      amountCents: -19600 - input.monthIndex * 18,
      category: "utilities",
      kind: "purchase",
    },
    {
      id: `${prefix}-phone`,
      accountId: "prod_card_everyday",
      date: day(8),
      description: "Wireless bill",
      merchantName: "Signal Grove Mobile",
      amountCents: -11800,
      category: "phone",
      kind: "purchase",
    },
    {
      id: `${prefix}-insurance`,
      accountId: "prod_checking_household",
      date: day(12),
      description: "Insurance premium",
      merchantName: "Anchor Mutual",
      amountCents: -16400,
      category: "insurance",
      kind: "purchase",
    },
    {
      id: `${prefix}-childcare`,
      accountId: "prod_checking_household",
      date: day(6),
      description: "Childcare tuition",
      merchantName: "Little Pines Learning",
      amountCents: -72000,
      category: "childcare",
      kind: "purchase",
    },
    {
      id: `${prefix}-subscription-video`,
      accountId: "prod_card_everyday",
      date: day(9),
      description: "Streaming bundle",
      merchantName: "Stream Garden",
      amountCents: -2899,
      category: "subscriptions",
      kind: "purchase",
    },
    {
      id: `${prefix}-subscription-workout`,
      accountId: "prod_card_everyday",
      date: day(14),
      description: "Fitness subscription",
      merchantName: "Forge Online",
      amountCents: -1900,
      category: "subscriptions",
      kind: "purchase",
    },
    {
      id: `${prefix}-auto-payment`,
      accountId: "prod_checking_primary",
      date: day(15),
      description: "Auto loan payment",
      merchantName: "Pine Test Credit Union",
      amountCents: -38600,
      category: "auto",
      kind: "purchase",
    },
    {
      id: `${prefix}-protected-transfer`,
      accountId: "prod_checking_primary",
      date: day(7),
      description: "Transfer to protected savings",
      merchantName: "Cedar Test Bank",
      amountCents: -65000,
      category: "transfer",
      kind: "transfer",
    },
    {
      id: `${prefix}-reserve-transfer`,
      accountId: "prod_checking_household",
      date: day(18),
      description: "Emergency reserve transfer",
      merchantName: "Pine Test Credit Union",
      amountCents: -25000,
      category: "transfer",
      kind: "transfer",
    },
    {
      id: `${prefix}-card-payment-everyday`,
      accountId: "prod_checking_primary",
      date: day(16),
      description: "Autopay Everyday Rewards Card",
      merchantName: "Cedar Test Bank Card",
      amountCents: -98000 - input.monthIndex * 525,
      category: "credit card payment",
      kind: "credit_card_payment",
      metadata: {
        issuerName: "Cedar Test Bank Card",
        matchedConnectedCard: true,
      },
    },
    {
      id: `${prefix}-card-payment-missing`,
      accountId: "prod_checking_household",
      date: day(17),
      description: "Autopay detached card",
      merchantName: "Willow Card Services",
      amountCents: -18600,
      category: "credit card payment",
      kind: "credit_card_payment",
      metadata: {
        issuerName: "Willow Card Services",
        matchedConnectedCard: input.monthIndex % 3 !== 0,
      },
    },
    ...buildProductionScaleSpendGroup(prefix, "groceries", "Maple Market", "prod_card_everyday", [
      [2, scaleDiscretionarySpend(-17440 - groceryShiftCents)],
      [10, scaleDiscretionarySpend(-13890 - groceryShiftCents)],
      [15, scaleDiscretionarySpend(-21210 - groceryShiftCents)],
      [19, scaleDiscretionarySpend(-11480 - groceryShiftCents)],
    ]),
    ...buildProductionScaleSpendGroup(prefix, "dining", "Mesa Test Kitchen", "prod_card_everyday", [
      [4, scaleDiscretionarySpend(-4250 - diningShiftCents)],
      [11, scaleDiscretionarySpend(-3180 - diningShiftCents)],
      [13, scaleDiscretionarySpend(-6490 - diningShiftCents)],
      [18, scaleDiscretionarySpend(-2875 - diningShiftCents)],
    ]),
    ...buildProductionScaleSpendGroup(prefix, "transport", "Metro Test Transit", "prod_card_everyday", [
      [3, scaleDiscretionarySpend(-650)],
      [7, scaleDiscretionarySpend(-2420)],
      [16, scaleDiscretionarySpend(-3180)],
    ]),
    {
      id: `${prefix}-pharmacy`,
      accountId: "prod_card_everyday",
      date: day(10),
      description: "Pharmacy purchase",
      merchantName: "Clover Pharmacy",
      amountCents: scaleDiscretionarySpend(-3480),
      category: "health",
      kind: "purchase",
    },
    {
      id: `${prefix}-medical-copay`,
      accountId: "prod_card_everyday",
      date: day(13),
      description: "Care visit copay",
      merchantName: "North Clinic",
      amountCents: scaleDiscretionarySpend(-4500),
      category: "health",
      kind: "purchase",
    },
    {
      id: `${prefix}-travel${pendingSuffix}`,
      accountId: "prod_card_travel",
      date: day(input.currentMonth ? 19 : 11),
      description: "Regional travel",
      merchantName: "Compass Rail",
      amountCents: scaleDiscretionarySpend(-28600 - input.monthIndex * 140),
      category: "travel",
      kind: "purchase",
      pending: input.currentMonth,
    },
    {
      id: `${prefix}-home-supplies`,
      accountId: "prod_card_store",
      date: day(9),
      description: "Home supplies",
      merchantName: "Habitat Supply",
      amountCents: scaleDiscretionarySpend(-9740),
      category: "home",
      kind: "purchase",
    },
    {
      id: `${prefix}-school`,
      accountId: "prod_card_store",
      date: day(12),
      description: "School supplies",
      merchantName: "Notebook Corner",
      amountCents: scaleDiscretionarySpend(-4220),
      category: "education",
      kind: "purchase",
    },
    {
      id: `${prefix}-coffee-a`,
      accountId: "prod_card_everyday",
      date: day(6),
      description: "Coffee",
      merchantName: "Copper Test Cafe",
      amountCents: scaleDiscretionarySpend(-725),
      category: "coffee",
      kind: "purchase",
    },
    {
      id: `${prefix}-coffee-b`,
      accountId: "prod_card_everyday",
      date: day(17),
      description: "Coffee",
      merchantName: "Copper Test Cafe",
      amountCents: scaleDiscretionarySpend(-690),
      category: "coffee",
      kind: "purchase",
    },
    {
      id: `${prefix}-pet-supplies`,
      accountId: "prod_card_everyday",
      date: day(14),
      description: "Pet supplies",
      merchantName: "Paw Print Supply",
      amountCents: scaleDiscretionarySpend(-5320),
      category: "pets",
      kind: "purchase",
    },
    {
      id: `${prefix}-entertainment`,
      accountId: "prod_card_travel",
      date: day(19),
      description: "Weekend tickets",
      merchantName: "Civic Stage",
      amountCents: scaleDiscretionarySpend(-7400),
      category: "entertainment",
      kind: "purchase",
    },
  ];

  if (input.monthIndex % 4 === 1) {
    baseTransactions.push({
      id: `${prefix}-refund`,
      accountId: "prod_card_everyday",
      date: day(18),
      description: "Returned item credit",
      merchantName: "Habitat Supply",
      amountCents: 4200,
      category: "refund",
      kind: "refund",
    });
  }

  if (input.monthIndex % 5 === 2) {
    baseTransactions.push({
      id: `${prefix}-fee`,
      accountId: "prod_checking_primary",
      date: day(19),
      description: "Account service fee",
      merchantName: "Cedar Test Bank",
      amountCents: -1200,
      category: "bank fees",
      kind: "fee",
    });
  }

  if (input.currentMonth) {
    baseTransactions.push(
      {
        id: `${prefix}-same-day-market-posted`,
        accountId: "prod_card_everyday",
        date: day(20),
        description: "Same-day groceries",
        merchantName: "Maple Market",
        amountCents: -750,
        category: "groceries",
        kind: "purchase",
      },
      {
        id: `${prefix}-same-day-market-pending`,
        accountId: "prod_card_everyday",
        date: day(20),
        description: "Same-day groceries pending",
        merchantName: "Maple Market",
        amountCents: -750,
        category: "groceries",
        kind: "purchase",
        pending: true,
      },
    );
  }

  return baseTransactions;
}

function buildProductionScaleSpendGroup(
  prefix: string,
  category: string,
  merchantName: string,
  accountId: string,
  entries: Array<[number, number]>,
): FinancialSnapshot["transactions"] {
  return entries.map(([day, amountCents], index) => ({
    id: `${prefix}-${category}-${index + 1}`,
    accountId,
    date: `${prefix.slice("prod-".length)}-${String(day).padStart(2, "0")}`,
    description: category === "groceries" ? "Grocery run" : category,
    merchantName,
    amountCents,
    category,
    kind: "purchase",
  }));
}

function buildPipScenario(input: {
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
