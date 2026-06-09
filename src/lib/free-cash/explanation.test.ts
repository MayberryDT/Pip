import { describe, expect, it } from "vitest";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { getPrimaryDriver, summarizeFreeCash } from "@/lib/free-cash/explanation";
import { fakeSnapshot } from "@/lib/fake-data";
import type { FinancialSnapshot } from "@/lib/types";

describe("Spendable Cash explanation primitives", () => {
  it("summarizes bounded aggregate math without exposing raw transaction details", () => {
    const summary = summarizeFreeCash(calculateFreeCash(fakeSnapshot));

    expect(summary).toContain("$104");
    expect(summary).toContain("normal room");
    expect(summary).toContain("recent spending pace");
    expect(summary).not.toContain("rolling calendar-month window");
    expect(summary).not.toContain("Trailhead Apartments");
    expect(summary).not.toContain("City Market");
    expect(summary).not.toContain("Copper Cup");
  });

  it("uses the V2 top driver when V2 metric is available", () => {
    expect(getPrimaryDriver(calculateFreeCash(fakeSnapshot))).toBe(
      "Pattern-based daily room after recurring obligations and protected savings.",
    );
  });

  it("falls back to the V2 baseline driver for sparse aggregate snapshots", () => {
    expect(getPrimaryDriver(calculateFreeCash(spendingSnapshot))).toBe(
      "Pattern-based daily room after recurring obligations and protected savings.",
    );
    expect(getPrimaryDriver(calculateFreeCash(incomeOnlySnapshot))).toBe(
      "Pattern-based daily room after recurring obligations and protected savings.",
    );
  });
});

const spendingSnapshot: FinancialSnapshot = {
  settings: {
    asOfDate: "2026-06-20",
    protectedSavingsMonthlyCents: 0,
  },
  accounts: [],
  transactions: [
    {
      id: "income",
      accountId: "checking",
      date: "2026-06-07",
      description: "Payroll deposit",
      amountCents: 100000,
      kind: "income",
    },
    {
      id: "spending",
      accountId: "checking",
      date: "2026-06-12",
      description: "Card purchase",
      amountCents: -2500,
      kind: "purchase",
    },
  ],
};

const incomeOnlySnapshot: FinancialSnapshot = {
  settings: {
    asOfDate: "2026-06-20",
    protectedSavingsMonthlyCents: 0,
  },
  accounts: [],
  transactions: [
    {
      id: "income",
      accountId: "checking",
      date: "2026-06-07",
      description: "Payroll deposit",
      amountCents: 100000,
      kind: "income",
    },
  ],
};
