import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FreeCashHome } from "@/components/FreeCashHome";

describe("FreeCashHome", () => {
  it("keeps the themed home surface to one number, insight cards, prompt chips, and the agent input", () => {
    const markup = renderToStaticMarkup(<FreeCashHome />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(countOccurrences(markup, 'data-testid="free-cash-number"')).toBe(1);
    expect(countOccurrences(markup, 'data-testid="agent-thread"')).toBe(1);
    expect(countOccurrences(markup, 'data-testid="prompt-chips"')).toBe(1);
    expect(countOccurrences(markup, 'data-testid="agent-input"')).toBe(1);
    expect(visibleText).toContain("Spendable");
    expect(visibleText).toContain("Free Cash Today");
    expect(visibleText).toContain("$43");
    expect(visibleText).toContain("Good morning.");
    expect(visibleText).toContain("Temporary insight");
    expect(markup).toContain("Ask anything...");
    expect(visibleText).not.toMatch(/\b(balance|dashboard|budget)\b/i);
    expect(markup).not.toMatch(/<nav\b|<table\b|<canvas\b|\brole="(menu|tab|tablist)"/i);
  });

  it("keeps fake prototype data out of the authenticated real-data shell before backend data loads", () => {
    const markup = renderToStaticMarkup(<FreeCashHome enableAccountControls />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(markup).toContain("$--");
    expect(markup).not.toContain("$43");
    expect(markup).not.toContain("Can I spend $50?");
    expect(visibleText).not.toContain("Data");
    expect(markup).not.toContain("Data controls");
  });

  it("keeps guest onboarding inside the Spendable screen without showing fake Free Cash", () => {
    const markup = renderToStaticMarkup(<FreeCashHome authState={{ status: "guest" }} />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("Spendable");
    expect(visibleText).toContain("Free Cash Today");
    expect(visibleText).toContain("$--");
    expect(visibleText).toContain("Your Free Cash number starts here.");
    expect(markup).toContain("Enter your email...");
    expect(markup).not.toContain("$43");
  });

  it("keeps consent onboarding inside the Spendable screen", () => {
    const markup = renderToStaticMarkup(
      <FreeCashHome authState={{ status: "needs-consent", email: "tester@example.com" }} />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("Spendable");
    expect(visibleText).toContain("Welcome back.");
    expect(visibleText).toContain("Step 2 is choosing protected savings.");
    expect(visibleText).toContain("Use $200");
    expect(markup).toContain("Protected savings, e.g. 200...");
    expect(markup).not.toContain("$43");
  });
});

function countOccurrences(source: string, pattern: string): number {
  return source.split(pattern).length - 1;
}
