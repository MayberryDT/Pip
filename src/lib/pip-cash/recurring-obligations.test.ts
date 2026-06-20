import { describe, expect, it } from "vitest";
import { buildRecurringObligations } from "@/lib/pip-cash/recurring-obligations";
import type { FinancialSnapshot, RecurringObligationRule } from "@/lib/types";

describe("buildRecurringObligations", () => {
  it("uses active user-confirmed rules as confirmed obligations", () => {
    const model = buildRecurringObligations({
      snapshot: snapshotWithTransactions([]),
      rules: [
        rule({
          merchantKey: "city-power",
          label: "City Power",
          expectedAmountCents: 8400,
          source: "user_confirmed",
          status: "active",
        }),
      ],
    });

    expect(model.confirmed).toEqual([
      expect.objectContaining({
        merchantKey: "city-power",
        label: "City Power",
        expectedAmountCents: 8400,
      }),
    ]);
    expect(model.suggestions).toEqual([]);
  });

  it("keeps auto-detected repeat activity as suggestions until confirmed", () => {
    const model = buildRecurringObligations({
      snapshot: snapshotWithTransactions([
        ["march-power", "2026-03-03", "City Power", -8000],
        ["april-power", "2026-04-03", "City Power", -8200],
        ["may-power", "2026-05-03", "City Power", -8400],
      ]),
      rules: [],
    });

    expect(model.confirmed).toEqual([]);
    expect(model.suggestions).toEqual([
      expect.objectContaining({
        merchantKey: "city-power",
        label: "City Power",
        expectedAmountCents: 8200,
      }),
    ]);
  });

  it("lets ignored user corrections suppress automatic suggestions", () => {
    const model = buildRecurringObligations({
      snapshot: snapshotWithTransactions([
        ["march-target", "2026-03-03", "Target", -8000],
        ["april-target", "2026-04-03", "Target", -8200],
        ["may-target", "2026-05-03", "Target", -8400],
      ]),
      rules: [
        rule({
          merchantKey: "target",
          label: "Target",
          expectedAmountCents: 0,
          source: "user_correction",
          status: "ignored",
        }),
      ],
    });

    expect(model.confirmed).toEqual([]);
    expect(model.suggestions).toEqual([]);
    expect(model.ignoredMerchantKeys).toEqual(["target"]);
  });
});

function rule(overrides: Partial<RecurringObligationRule>): RecurringObligationRule {
  return {
    id: "rule-1",
    userId: "user-1",
    merchantKey: "city-power",
    label: "City Power",
    expectedAmountCents: 8400,
    cadence: "monthly",
    source: "user_confirmed",
    status: "active",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...overrides,
  };
}

function snapshotWithTransactions(
  rows: Array<[string, string, string, number]>,
): FinancialSnapshot {
  return {
    settings: {
      asOfDate: "2026-06-20",
      protectedSavingsMonthlyCents: 0,
    },
    accounts: [
      {
        id: "checking",
        name: "Checking",
        institutionName: "Bank",
        kind: "checking",
        balanceCents: 100000,
      },
    ],
    transactions: rows.map(([id, date, merchantName, amountCents]) => ({
      id,
      accountId: "checking",
      date,
      description: merchantName,
      merchantName,
      amountCents,
      kind: "purchase",
    })),
  };
}
