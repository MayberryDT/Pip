import { describe, expect, it } from "vitest";
import { buildSpendingOpportunities } from "@/lib/pip-cash/spending-opportunities";
import type { Account, FinancialSnapshot, Transaction } from "@/lib/types";

const accounts: Account[] = [
  {
    id: "checking",
    name: "Everyday Checking",
    institutionName: "Northstar Bank",
    kind: "checking",
    balanceCents: 180000,
  },
  {
    id: "card",
    name: "Everyday Visa",
    institutionName: "Northstar Bank",
    kind: "credit_card",
    balanceCents: -50000,
    lastFour: "8821",
  },
  {
    id: "protected-savings",
    name: "Protected Savings",
    institutionName: "Northstar Bank",
    kind: "savings",
    balanceCents: 250000,
    isProtectedSavings: true,
  },
];

describe("buildSpendingOpportunities", () => {
  it("ranks a dining increase over rent and computes the 14-day windows", () => {
    const [opportunity] = buildSpendingOpportunities(
      snapshot([
        tx({
          id: "current-rent",
          date: "2026-06-03",
          description: "Trailhead Apartments rent",
          category: "rent",
          amountCents: -160000,
        }),
        tx({
          id: "loan",
          date: "2026-06-05",
          description: "Student loan payment",
          category: "loan payment",
          amountCents: -45000,
        }),
        diningTx("current-dining-1", "2026-06-03", "Taqueria Sol", -7000),
        diningTx("current-dining-2", "2026-06-06", "Cafe Rojo", -1800),
        diningTx("current-dining-3", "2026-06-14", "DoorDash", -9200),
        diningTx("current-dining-4", "2026-06-16", "Corner Bakery", -2000),
        diningTx("previous-dining-1", "2026-05-25", "Taqueria Sol", -4000),
        diningTx("previous-dining-2", "2026-06-02", "Cafe Rojo", -3000),
        diningTx("outside-window", "2026-05-19", "Old Cafe", -99900),
      ]),
    );

    expect(opportunity).toMatchObject({
      category: "Dining",
      confidence: "high",
      transactionCount: 4,
      windowDays: 14,
      currentSpendCents: 20000,
      previousSpendCents: 7000,
      deltaCents: 13000,
    });
    expect(opportunity?.estimatedSavingsCents).toBeGreaterThan(0);
    expect(opportunity?.estimatedSavingsCents).toBeLessThanOrEqual(opportunity?.deltaCents ?? 0);
    expect(opportunity?.reasonCodes).toEqual(
      expect.arrayContaining([
        "discretionary_category",
        "recent_increase",
        "frequent_transactions",
        "material_spend",
      ]),
    );
    expect(opportunity?.suggestedAction).toContain("dining cap");
  });

  it("does not recommend rent even when rent is the biggest spend", () => {
    const opportunities = buildSpendingOpportunities(
      snapshot([
        tx({
          id: "rent",
          date: "2026-06-10",
          description: "June apartment rent",
          category: "rent",
          amountCents: -175000,
        }),
        diningTx("dining-1", "2026-06-08", "Noodle House", -2400),
        diningTx("dining-2", "2026-06-11", "Noodle House", -2200),
        diningTx("dining-3", "2026-06-13", "Noodle House", -2600),
        diningTx("dining-prev", "2026-05-28", "Noodle House", -2000),
      ]),
    );

    expect(opportunities.map((item) => item.category)).toEqual(["Dining"]);
  });

  it("excludes connected credit-card settlement payments", () => {
    const opportunities = buildSpendingOpportunities(
      snapshot([
        tx({
          id: "payment-1",
          date: "2026-06-05",
          description: "Autopay Northstar Visa 8821",
          merchantName: "Northstar Visa",
          category: "credit card payment",
          amountCents: -50000,
        }),
        tx({
          id: "payment-2",
          date: "2026-06-12",
          description: "Credit card payment ending 8821",
          category: "credit card payment",
          amountCents: -40000,
        }),
        tx({
          id: "payment-previous",
          date: "2026-05-29",
          description: "Autopay Northstar Visa 8821",
          category: "credit card payment",
          amountCents: -35000,
        }),
      ]),
    );

    expect(opportunities).toEqual([]);
  });

  it("excludes transfers and protected savings activity", () => {
    const opportunities = buildSpendingOpportunities(
      snapshot([
        tx({
          id: "transfer-1",
          date: "2026-06-07",
          description: "Transfer to savings",
          category: "transfer",
          kind: "transfer",
          amountCents: -30000,
        }),
        tx({
          id: "transfer-2",
          date: "2026-06-12",
          description: "Venmo transfer",
          category: "transfer",
          amountCents: -12000,
        }),
        tx({
          id: "protected-1",
          accountId: "protected-savings",
          date: "2026-06-14",
          description: "Protected savings set-aside",
          category: "savings",
          kind: "purchase",
          amountCents: -25000,
        }),
      ]),
    );

    expect(opportunities).toEqual([]);
  });

  it("returns no opportunities when current spending data is sparse", () => {
    const opportunities = buildSpendingOpportunities(
      snapshot([diningTx("single-dining", "2026-06-10", "Cafe Rojo", -3600)]),
    );

    expect(opportunities).toEqual([]);
  });

  it("returns sorted merchant examples without duplicates", () => {
    const [opportunity] = buildSpendingOpportunities(
      snapshot([
        diningTx("taqueria-1", "2026-06-04", "Taqueria Sol", -5000),
        diningTx("cafe", "2026-06-08", "Cafe Rojo", -3000),
        diningTx("taqueria-2", "2026-06-15", "Taqueria Sol", -2200),
        diningTx("previous", "2026-05-30", "Cafe Rojo", -2000),
      ]),
    );

    expect(opportunity?.merchantExamples).toEqual(["Taqueria Sol", "Cafe Rojo"]);
    expect(opportunity?.reasonCodes).toContain("merchant_concentration");
  });
});

function snapshot(transactions: Transaction[]): FinancialSnapshot {
  return {
    accounts,
    transactions,
    settings: {
      asOfDate: "2026-06-16",
      protectedSavingsMonthlyCents: 0,
    },
  };
}

function diningTx(
  id: string,
  date: string,
  merchantName: string,
  amountCents: number,
): Transaction {
  return tx({
    id,
    date,
    merchantName,
    description: merchantName,
    category: "dining",
    amountCents,
  });
}

function tx(input: Partial<Transaction>): Transaction {
  return {
    id: input.id ?? "tx",
    accountId: input.accountId ?? "checking",
    date: input.date ?? "2026-06-10",
    description: input.description ?? "Transaction",
    merchantName: input.merchantName,
    amountCents: input.amountCents ?? -1000,
    category: input.category,
    kind: input.kind,
    pending: input.pending,
    metadata: input.metadata,
  };
}
