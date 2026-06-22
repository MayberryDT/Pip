import { describe, expect, it } from "vitest";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { buildFinancialGuidanceContext } from "@/lib/pip-cash/guidance-context";
import {
  cashGuardrailPipSnapshot,
  fakeSnapshot,
  healthyPipSnapshot,
  lowConfidencePipSnapshot,
  missingCardPipSnapshot,
  overspendingPipSnapshot,
  shortfallPipSnapshot,
} from "@/lib/fake-data";

describe("financial guidance context", () => {
  it("builds V2 evidence without relying on legacy rolling surplus", () => {
    const result = calculatePipCash(overspendingPipSnapshot);
    const context = buildFinancialGuidanceContext(result);
    const evidenceIds = context.evidence.map((evidence) => evidence.id);

    expect(context.metricVersion).toBe("v2");
    expect(context.currentRead.spendableCashTodayCents).toBe(
      result.spendableCashToday?.spendableCashTodayCents,
    );
    expect(context.pattern.baselineDailyAllowanceCents).toBe(
      result.spendableCashToday?.baselineDailyAllowanceCents,
    );
    expect(context.behavior.behaviorAdjustmentCents).toBe(
      result.spendableCashToday?.behaviorAdjustmentCents,
    );
    expect(evidenceIds).toEqual(expect.arrayContaining([
      "spendable-today",
      "state",
      "confidence",
      "data_quality",
      "baseline-room",
      "normal-room",
      "bills-held-back",
      "recurring-obligations",
      "protected-savings",
      "hidden-cushion",
      "recent-spending-hot",
      "behavior-adjustment-negative",
    ]));
    expect(new Set(evidenceIds).size).toBe(evidenceIds.length);
    expect(context.allowedDomains).toEqual(expect.arrayContaining(["spending", "cash_pressure"]));
    expect(context.blockedDomains).toEqual(expect.arrayContaining(["securities", "tax", "specific_loans"]));
  });

  it.each([
    ["healthy", healthyPipSnapshot, "recent-spending-light"],
    ["shortfall", shortfallPipSnapshot, "shortfall"],
    ["low confidence", lowConfidencePipSnapshot, "low-confidence"],
    ["missing card", missingCardPipSnapshot, "missing-card"],
    ["cash guardrail", cashGuardrailPipSnapshot, "cash-guardrail"],
  ])("adds conditional evidence for %s state", (_name, snapshot, expectedEvidenceId) => {
    const context = buildFinancialGuidanceContext(calculatePipCash(snapshot));

    expect(context.evidence.map((evidence) => evidence.id)).toContain(expectedEvidenceId);
  });

  it("exposes directional possible moves without final advice copy", () => {
    const context = buildFinancialGuidanceContext(calculatePipCash(shortfallPipSnapshot));

    expect(context.possibleMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "essentials-first",
          domain: "spending",
          reasonEvidenceIds: expect.arrayContaining(["shortfall"]),
        }),
      ]),
    );
    expect(JSON.stringify(context.possibleMoves)).not.toContain("Tell the user");
  });

  it("uses the unified Monthly Savings amount in pattern evidence", () => {
    const result = calculatePipCash({
      ...fakeSnapshot,
      settings: {
        ...fakeSnapshot.settings,
        protectedSavingsMonthlyCents: 30000,
      },
      savingsGoals: [
        {
          id: "goal-1",
          userId: "user-1",
          name: "Trip",
          targetAmountCents: 500000,
          targetDate: "2027-06-18",
          startingAmountCents: 0,
          currentAmountCents: 100000,
          monthlyContributionCents: 35000,
          includeInSpendableCash: true,
          status: "active",
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z",
        },
      ],
    });
    const context = buildFinancialGuidanceContext(result);

    expect(context.pattern.protectedSavingsMonthlyCents).toBe(30000);
    expect(context.pattern.monthlySavingsCents).toBe(35000);
    expect(context.evidence.find((evidence) => evidence.id === "protected-savings")).toMatchObject({
      amountCents: -35000,
      detail: "Monthly Savings includes active savings goals.",
    });
  });
});
