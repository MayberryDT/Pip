import { describe, expect, it } from "vitest";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { getPrimaryDriver, summarizeFreeCash } from "@/lib/free-cash/explanation";
import { fakeSnapshot } from "@/lib/fake-data";
import type { FinancialSnapshot } from "@/lib/types";

describe("Free Cash explanation primitives", () => {
  it("summarizes bounded aggregate math without exposing raw transaction details", () => {
    const summary = summarizeFreeCash(calculateFreeCash(fakeSnapshot));

    expect(summary).toContain("$43");
    expect(summary).toContain("$4,200 income");
    expect(summary).toContain("-$2,624 spending");
    expect(summary).toContain("-$200 protected savings");
    expect(summary).toContain("rolling calendar-month window");
    expect(summary).not.toContain("Trailhead Apartments");
    expect(summary).not.toContain("City Market");
    expect(summary).not.toContain("Copper Cup");
  });

  it("prioritizes rent as the primary driver when rent is inside the window", () => {
    expect(getPrimaryDriver(calculateFreeCash(fakeSnapshot))).toBe(
      "Rent is inside the current rolling window.",
    );
  });

  it("falls back to spending pressure or income depending on the aggregate result", () => {
    expect(getPrimaryDriver(calculateFreeCash(spendingSnapshot))).toBe(
      "Spending in the current window is the biggest pressure on Free Cash.",
    );
    expect(getPrimaryDriver(calculateFreeCash(incomeOnlySnapshot))).toBe(
      "Income is carrying the current Free Cash number.",
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
