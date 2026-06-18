import { describe, expect, it } from "vitest";
import {
  getOnboardingPromptChips,
  getSuggestedPrompts,
  isRetiredDefaultPromptChip,
} from "@/lib/agent/suggested-prompts";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";

describe("prompt chips", () => {
  it("provides deterministic ready-state financial next steps", () => {
    expect(getSuggestedPrompts(calculatePipCash(fakeSnapshot))).toEqual([
      {
        id: "ai-pattern-assumptions",
        label: "What pattern are you using?",
        prompt: "Show the pattern assumptions behind this number",
      },
      {
        id: "ai-data-quality",
        label: "Check if the data looks right",
        prompt: "Check data quality",
      },
      {
        id: "ai-biggest-drivers",
        label: "Show the biggest drivers",
        prompt: "Show the biggest drivers behind today's number",
      },
    ]);
  });

  it("keeps onboarding chips available", () => {
    expect(getOnboardingPromptChips({ status: "guest", hasFinancialData: false }).map((chip) => chip.id)).toEqual([
      "how-pip-works",
      "what-will-connect",
    ]);
    expect(
      getOnboardingPromptChips({ status: "needs-consent", hasFinancialData: false }).map((chip) => chip.id),
    ).toEqual(["why-monthly-savings"]);
    expect(
      getOnboardingPromptChips({ status: "ready", hasFinancialData: false }).map((chip) => chip.id),
    ).toEqual(["what-data-used", "why-connect-accounts"]);
  });

  it("marks the retired ready-state defaults so generated chips cannot reintroduce them", () => {
    expect(isRetiredDefaultPromptChip({ label: "Why this number?", prompt: "Why this number?" })).toBe(true);
    expect(isRetiredDefaultPromptChip({ label: "Can I spend $50?", prompt: "Can I spend $50?" })).toBe(true);
    expect(isRetiredDefaultPromptChip({ label: "What changed?", prompt: "What changed?" })).toBe(true);
    expect(isRetiredDefaultPromptChip({ label: "Missing card", prompt: "Missing card" })).toBe(true);
    expect(isRetiredDefaultPromptChip({ label: "Why today?", prompt: "Why today?" })).toBe(true);
    expect(isRetiredDefaultPromptChip({ label: "Test purchase", prompt: "Test purchase" })).toBe(true);
    expect(isRetiredDefaultPromptChip({ label: "Upcoming bills", prompt: "What bills are coming up?" })).toBe(false);
  });
});
