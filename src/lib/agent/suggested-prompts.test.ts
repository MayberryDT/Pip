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
        id: "ai-what-number-means",
        label: "What does my $104 mean?",
        prompt: "What does my Spendable Cash Today number mean?",
      },
      {
        id: "ai-why-today",
        label: "Why is it $104 today?",
        prompt: "Show the biggest drivers behind today's number",
      },
      {
        id: "ai-teach-money-basic",
        label: "Teach me a money basic",
        prompt: "Teach me one useful money basic",
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
    ).toEqual(["why-savings-cushion"]);
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
