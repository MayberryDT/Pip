import { describe, expect, it } from "vitest";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import {
  cashGuardrailSpendableSnapshot,
  fakeSnapshot,
  healthySpendableSnapshot,
  lowConfidenceSpendableSnapshot,
  missingCardSpendableSnapshot,
  overspendingSpendableSnapshot,
  shortfallSpendableSnapshot,
} from "@/lib/fake-data";
import { classifySpendableTransaction, simulateSpendablePurchase } from "@/lib/free-cash/spendable-cash-today";
import type { Account, Transaction } from "@/lib/types";

describe("Spendable Cash Today V2", () => {
  it("builds a completed-month baseline before current-month spending", () => {
    const result = calculateFreeCash(healthySpendableSnapshot).spendableCashToday;

    expect(result).toMatchObject({
      metricVersion: "v2",
      completedMonthCount: 3,
      confidence: "high",
      averageMonthlyIncomeCents: 420000,
      averageMonthlyRecurringObligationsCents: 172000,
      protectedSavingsMonthlyCents: 20000,
      hiddenCushionCents: 12600,
      monthlyEverydayPoolCents: 215400,
      baselineDailyAllowanceCents: 7076,
    });
  });

  it("lowers today's room when current-month everyday spending is ahead of pace", () => {
    const result = calculateFreeCash(overspendingSpendableSnapshot).spendableCashToday;

    expect(result?.state).toBe("overspending");
    expect(result?.behaviorAdjustmentCents).toBeLessThan(0);
    expect(result?.actualEverydaySpendSoFarCents).toBeGreaterThan(
      result?.allowedSoFarThisMonthCents ?? 0,
    );
  });

  it("uses cash as a cap rather than the primary model", () => {
    const result = calculateFreeCash(cashGuardrailSpendableSnapshot).spendableCashToday;

    expect(result?.spendableCashTodayCents).toBe(200);
    expect(result?.cashDailyCapCents).toBe(200);
    expect(result?.cashRealityAdjustmentCents).toBeGreaterThan(0);
    expect(result?.drivers.map((driver) => driver.id)).toContain("cash-guardrail");
  });

  it("floors the public number at zero and keeps a separate shortfall", () => {
    const result = calculateFreeCash(shortfallSpendableSnapshot).spendableCashToday;

    expect(result?.spendableCashTodayCents).toBe(0);
    expect(result?.shortfallCents).toBeGreaterThan(0);
    expect(result?.state).toBe("shortfall");
  });

  it("marks early estimates as low confidence", () => {
    const result = calculateFreeCash(lowConfidenceSpendableSnapshot).spendableCashToday;

    expect(result?.completedMonthCount).toBe(0);
    expect(result?.confidence).toBe("low");
    expect(result?.state).toBe("low_confidence");
    expect(result?.dataStates.map((state) => state.id)).toContain("low-confidence");
  });

  it("keeps missing-card warnings attached to the V2 metric", () => {
    const result = calculateFreeCash(missingCardSpendableSnapshot).spendableCashToday;

    expect(result?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-card",
          issuerName: "Capital One",
        }),
      ]),
    );
    expect(result?.drivers.map((driver) => driver.id)).toContain("missing-data");
  });

  it("separates immediate purchase room from the recomputed V2 allowance", () => {
    const result = calculateFreeCash(fakeSnapshot);
    const simulation = simulateSpendablePurchase(2500, fakeSnapshot, {
      before: result.spendableCashToday,
      warnings: result.warnings,
      dataStates: result.dataStates,
      legacyRollingDailySurplusCents: result.freeCashTodayCents,
      legacyRollingNetCents: result.rollingNetCents,
    });

    expect(simulation.beforeCents).toBe(result.spendableCashToday?.spendableCashTodayCents);
    expect(simulation.todayRemainingCents).toBe(
      (result.spendableCashToday?.spendableCashTodayCents ?? 0) - 2500,
    );
    expect(simulation.todayRemainingCents).not.toBe(simulation.afterTodayCents);
    expect(simulation.afterTodayCents).toBe(simulation.after.spendableCashTodayCents);
  });

  it("classifies hidden transaction groups for recurring obligations and everyday spending", () => {
    const accountById = new Map<string, Account>([
      [
        "checking",
        {
          id: "checking",
          name: "Checking",
          institutionName: "Bank",
          kind: "checking",
          balanceCents: 100000,
        },
      ],
    ]);
    const tx = (input: Partial<Transaction>): Transaction => ({
      id: "tx",
      accountId: "checking",
      date: "2026-06-10",
      description: "Card purchase",
      amountCents: -1000,
      ...input,
    });

    expect(
      classifySpendableTransaction(
        tx({
          description: "City Power",
          merchantName: "City Power",
          category: "utilities",
          kind: "purchase",
        }),
        accountById,
      ),
    ).toMatchObject({
      group: "recurring_obligation",
      confidence: "high",
    });
    expect(
      classifySpendableTransaction(
        tx({
          description: "Grocery",
          merchantName: "City Market",
          category: "groceries",
          kind: "purchase",
        }),
        accountById,
      ),
    ).toMatchObject({
      group: "everyday_spending",
      confidence: "high",
    });
    expect(
      classifySpendableTransaction(
        tx({
          description: "Autopay Visa",
          category: "credit card payment",
          kind: "credit_card_payment",
        }),
        accountById,
      ),
    ).toMatchObject({
      group: "card_settlement",
      confidence: "high",
    });
  });
});
