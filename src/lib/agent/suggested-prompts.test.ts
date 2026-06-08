import { describe, expect, it } from "vitest";
import { getSuggestedPrompts } from "@/lib/agent/suggested-prompts";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { fakeSnapshot, negativeFreeCashSnapshot } from "@/lib/fake-data";

describe("getSuggestedPrompts", () => {
  it("keeps the visible prompt surface capped at three chips", () => {
    expect(getSuggestedPrompts(calculateFreeCash(fakeSnapshot))).toHaveLength(3);
  });

  it("keeps the default surface calm when a missing-card warning exists", () => {
    expect(getSuggestedPrompts(calculateFreeCash(fakeSnapshot)).map((chip) => chip.id)).toEqual([
      "why",
      "spend-50",
      "forecast",
    ]);
  });

  it("keeps the same default prompts when the missing-card nudge is suppressed", () => {
    const result = calculateFreeCash({
      ...fakeSnapshot,
      settings: {
        ...fakeSnapshot.settings,
        suppressedMissingCardIssuers: ["Capital One"],
      },
    });

    expect(getSuggestedPrompts(result).map((chip) => chip.id)).toEqual([
      "why",
      "spend-50",
      "forecast",
    ]);
  });

  it("suggests diagnosis prompts when Free Cash is negative and no missing-card warning is active", () => {
    const result = calculateFreeCash(negativeFreeCashSnapshot);

    expect(getSuggestedPrompts(result).map((chip) => chip.id)).toEqual([
      "why",
      "math",
      "breakdown",
    ]);
  });
});
