import { describe, expect, it } from "vitest";
import {
  getOnboardingPromptChips,
  getSuggestedPrompts,
  isRetiredDefaultPromptChip,
} from "@/lib/agent/suggested-prompts";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";

describe("prompt chips", () => {
  it("does not provide deterministic ready-state defaults", () => {
    expect(getSuggestedPrompts(calculateFreeCash(fakeSnapshot))).toEqual([]);
  });

  it("keeps onboarding chips available", () => {
    expect(getOnboardingPromptChips({ status: "guest", hasFinancialData: false }).map((chip) => chip.id)).toEqual([
      "how-pip-works",
      "what-will-connect",
    ]);
    expect(
      getOnboardingPromptChips({ status: "needs-consent", hasFinancialData: false }).map((chip) => chip.id),
    ).toEqual(["why-savings-cushion"]);
    expect(
      getOnboardingPromptChips({ status: "ready", hasFinancialData: false }).map((chip) => chip.id),
    ).toEqual(["what-data-used", "why-connect-accounts"]);
  });

  it("marks the retired ready-state defaults so generated chips cannot reintroduce them", () => {
    expect(isRetiredDefaultPromptChip({ label: "Why this number?", prompt: "Why this number?" })).toBe(true);
    expect(isRetiredDefaultPromptChip({ label: "Can I spend $50?", prompt: "Can I spend $50?" })).toBe(true);
    expect(isRetiredDefaultPromptChip({ label: "What changed?", prompt: "What changed?" })).toBe(true);
    expect(isRetiredDefaultPromptChip({ label: "Upcoming bills", prompt: "What bills are coming up?" })).toBe(false);
  });
});
