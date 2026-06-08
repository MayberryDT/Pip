import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FreeCashHome, __freeCashHomeTestHooks } from "@/components/FreeCashHome";
import type { PromptChip } from "@/lib/agent/card-types";

describe("FreeCashHome", () => {
  it("keeps the Pip home surface to one number, assistant intro, and the agent input", () => {
    const markup = renderToStaticMarkup(<FreeCashHome />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(countOccurrences(markup, 'data-testid="free-cash-number"')).toBe(1);
    expect(countOccurrences(markup, 'data-testid="agent-thread"')).toBe(1);
    expect(countOccurrences(markup, 'data-testid="prompt-chips"')).toBe(0);
    expect(countOccurrences(markup, 'data-testid="agent-input"')).toBe(1);
    expect(visibleText).toContain("Pip");
    expect(visibleText).toContain("Spendable Cash Today");
    expect(visibleText).toContain("$43");
    expect(visibleText).toContain("Hi, I’m Pip. I’ll show what’s actually spendable today.");
    expect(markup).toContain("Ask Pip anything...");
    expect(markup).not.toContain("Why this number?");
    expect(markup).not.toContain("Can I spend $50?");
    expect(markup).not.toContain("What changed?");
    expect(markup).toContain('aria-label="Pip"');
    expect(visibleText).not.toMatch(/\b(balance|dashboard|budget)\b/i);
    expect(markup).not.toMatch(/<nav\b|<table\b|<canvas\b|\brole="(menu|tab|tablist)"/i);
  });

  it("keeps fake prototype data out of the authenticated real-data shell before backend data loads", () => {
    const markup = renderToStaticMarkup(<FreeCashHome enableAccountControls />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(markup).toContain("$--");
    expect(markup).not.toContain("$43");
    expect(markup).not.toContain("Can I spend $50?");
    expect(markup).toContain("What data do you use?");
    expect(visibleText).not.toContain("Data controls");
    expect(markup).not.toContain("Data controls");
  });

  it("shows Plaid OAuth completion as a same-screen Pip message", () => {
    const markup = renderToStaticMarkup(
      <FreeCashHome
        authState={{ status: "ready", email: "tester@example.com" }}
        connectionNotice="plaid-connected"
        enableAccountControls
      />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("Plaid connected");
    expect(visibleText).toContain("Your account data connected successfully.");
    expect(markup).toContain("$--");
  });

  it("keeps guest onboarding inside the Pip screen without showing fake Spendable Cash", () => {
    const markup = renderToStaticMarkup(<FreeCashHome authState={{ status: "guest" }} />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("Pip");
    expect(visibleText).toContain("Spendable Cash Today");
    expect(visibleText).toContain("$--");
    expect(visibleText).toContain("Hi, I’m Pip. I’ll help you find the money that’s actually okay to use today.");
    expect(markup).toContain("Continue with Google");
    expect(markup).toContain("How does Pip work?");
    expect(markup).toContain("What will I connect?");
    expect(markup).toContain("Ask Pip anything...");
    expect(markup).toContain("pip-waving.png");
    expect(markup).not.toContain("$43");
  });

  it("keeps failed Google auth on the same Pip screen", () => {
    const markup = renderToStaticMarkup(
      <FreeCashHome authNotice="auth-error" authState={{ status: "guest" }} />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("Google sign-in could not finish.");
    expect(visibleText).toContain("Hi, I’m Pip.");
    expect(markup).toContain("Ask Pip anything...");
  });

  it("keeps consent onboarding inside the Pip screen", () => {
    const markup = renderToStaticMarkup(
      <FreeCashHome authState={{ status: "needs-consent", email: "tester@example.com" }} />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("Pip");
    expect(visibleText).toContain("Let’s set aside a little cushion first.");
    expect(visibleText).toContain("Savings cushion");
    expect(visibleText).toContain("Use $200 cushion");
    expect(countOccurrences(markup, 'data-testid="prompt-chips"')).toBe(0);
    expect(countOccurrences(markup, 'data-testid="agent-input"')).toBe(0);
    expect(markup).toContain("pip-waving.png");
    expect(visibleText).not.toContain("Step 2");
    expect(markup).not.toContain("Protected savings, e.g. 200...");
    expect(markup).not.toContain("$43");
  });

  it("keeps visible chips when a chat response has no usable prompt chips", () => {
    const currentChips: PromptChip[] = [
      {
        id: "upcoming-bills",
        label: "Upcoming bills",
        prompt: "What bills are coming up?",
      },
    ];
    const lastNonEmptyChips: PromptChip[] = [
      {
        id: "payday-impact",
        label: "Payday impact",
        prompt: "How did payday affect today?",
      },
    ];

    expect(
      __freeCashHomeTestHooks.getNextVisiblePromptChips([], currentChips, lastNonEmptyChips),
    ).toEqual(currentChips);
    expect(
      __freeCashHomeTestHooks.getNextVisiblePromptChips([], [], lastNonEmptyChips),
    ).toEqual(lastNonEmptyChips);
  });
});

function countOccurrences(source: string, pattern: string): number {
  return source.split(pattern).length - 1;
}
