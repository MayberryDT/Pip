import { describe, expect, it } from "vitest";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { buildFinancialGuidanceContext } from "@/lib/free-cash/guidance-context";
import {
  cashGuardrailSpendableSnapshot,
  healthySpendableSnapshot,
  lowConfidenceSpendableSnapshot,
  missingCardSpendableSnapshot,
  overspendingSpendableSnapshot,
  shortfallSpendableSnapshot,
} from "@/lib/fake-data";

describe("financial guidance context", () => {
  it("builds V2 evidence without relying on legacy rolling surplus", () => {
    const result = calculateFreeCash(overspendingSpendableSnapshot);
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
    ["healthy", healthySpendableSnapshot, "recent-spending-light"],
    ["shortfall", shortfallSpendableSnapshot, "shortfall"],
    ["low confidence", lowConfidenceSpendableSnapshot, "low-confidence"],
    ["missing card", missingCardSpendableSnapshot, "missing-card"],
    ["cash guardrail", cashGuardrailSpendableSnapshot, "cash-guardrail"],
  ])("adds conditional evidence for %s state", (_name, snapshot, expectedEvidenceId) => {
    const context = buildFinancialGuidanceContext(calculateFreeCash(snapshot));

    expect(context.evidence.map((evidence) => evidence.id)).toContain(expectedEvidenceId);
  });

  it("exposes directional possible moves without final advice copy", () => {
    const context = buildFinancialGuidanceContext(calculateFreeCash(shortfallSpendableSnapshot));

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
});
