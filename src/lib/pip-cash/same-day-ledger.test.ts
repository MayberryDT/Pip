import { describe, expect, it } from "vitest";
import { buildSameDayLedger } from "@/lib/pip-cash/same-day-ledger";
import type { ClassifiedSpendableTransaction, SpendableTransactionGroup } from "@/lib/types";

describe("buildSameDayLedger", () => {
  it("subtracts same-day pending and posted discretionary spend once", () => {
    const ledger = buildSameDayLedger({
      asOfDate: "2026-06-20",
      transactions: [
        classified("target-pending", -1800, "everyday_spending", {
          pending: true,
          merchantName: "Target",
        }),
        classified("target-posted", -1800, "everyday_spending", {
          merchantName: "Target",
        }),
      ],
      obligations: [],
    });

    expect(ledger.discretionarySpendCents).toBe(1800);
    expect(ledger.pendingSpendCents).toBe(0);
    expect(ledger.items).toEqual([
      expect.objectContaining({
        transactionId: "target-posted",
        treatment: "daily_spend",
        amountCents: -1800,
      }),
    ]);
  });

  it("adds same-day refunds back while ignoring settlements and transfers", () => {
    const ledger = buildSameDayLedger({
      asOfDate: "2026-06-20",
      transactions: [
        classified("refund", 1200, "refund"),
        classified("settlement", -5000, "card_settlement"),
        classified("transfer", -2500, "transfer"),
      ],
      obligations: [],
    });

    expect(ledger.refundCents).toBe(1200);
    expect(ledger.discretionarySpendCents).toBe(0);
    expect(ledger.items.map((item) => item.treatment)).toEqual([
      "daily_refund",
      "card_settlement",
      "transfer",
    ]);
  });

  it("applies only variance for confirmed same-day recurring obligations", () => {
    const obligation = {
      merchantKey: "city-rent",
      label: "City Rent",
      expectedAmountCents: 120000,
    };

    const exact = buildSameDayLedger({
      asOfDate: "2026-06-20",
      transactions: [
        classified("rent-exact", -120000, "recurring_obligation", {
          merchantName: "City Rent",
        }),
      ],
      obligations: [obligation],
    });
    const high = buildSameDayLedger({
      asOfDate: "2026-06-20",
      transactions: [
        classified("rent-high", -125000, "recurring_obligation", {
          merchantName: "City Rent",
        }),
      ],
      obligations: [obligation],
    });
    const low = buildSameDayLedger({
      asOfDate: "2026-06-20",
      transactions: [
        classified("rent-low", -115000, "recurring_obligation", {
          merchantName: "City Rent",
        }),
      ],
      obligations: [obligation],
    });

    expect(exact.billVarianceCents).toBe(0);
    expect(exact.items[0]).toMatchObject({
      treatment: "expected_bill",
      expectedAmountCents: 120000,
      varianceCents: 0,
    });
    expect(high.billVarianceCents).toBe(-5000);
    expect(high.items[0]).toMatchObject({
      treatment: "bill_variance",
      varianceCents: -5000,
    });
    expect(low.billVarianceCents).toBe(5000);
    expect(low.items[0]).toMatchObject({
      treatment: "bill_variance",
      varianceCents: 5000,
    });
  });

  it("treats confirmed merchants as recurring obligations even when classification says everyday spending", () => {
    const ledger = buildSameDayLedger({
      asOfDate: "2026-06-20",
      transactions: [
        classified("gym-today", -4500, "everyday_spending", {
          merchantName: "Neighborhood Gym",
          category: "fitness",
          kind: "purchase",
        }),
      ],
      obligations: [
        {
          merchantKey: "neighborhood-gym",
          label: "Neighborhood Gym",
          expectedAmountCents: 4500,
        },
      ],
    });

    expect(ledger.discretionarySpendCents).toBe(0);
    expect(ledger.billVarianceCents).toBe(0);
    expect(ledger.items[0]).toMatchObject({
      transactionId: "gym-today",
      treatment: "expected_bill",
      expectedAmountCents: 4500,
      varianceCents: 0,
    });
  });

  it("does not subtract auto-classified same-day recurring obligations as daily spend", () => {
    const ledger = buildSameDayLedger({
      asOfDate: "2026-06-20",
      transactions: [
        classified("power-today", -8400, "recurring_obligation", {
          merchantName: "City Power",
          category: "utilities",
          kind: "purchase",
        }),
      ],
      obligations: [],
    });

    expect(ledger.discretionarySpendCents).toBe(0);
    expect(ledger.billVarianceCents).toBe(0);
    expect(ledger.items[0]).toMatchObject({
      transactionId: "power-today",
      treatment: "expected_bill",
      expectedAmountCents: 8400,
      varianceCents: 0,
    });
  });
});

function classified(
  id: string,
  amountCents: number,
  group: SpendableTransactionGroup,
  overrides: Partial<ClassifiedSpendableTransaction["transaction"]> = {},
): ClassifiedSpendableTransaction {
  return {
    transaction: {
      id,
      accountId: "checking",
      date: "2026-06-20",
      description: overrides.description ?? overrides.merchantName ?? id,
      amountCents,
      pending: false,
      ...overrides,
    },
    group,
    confidence: "high",
    reason: group,
  };
}
