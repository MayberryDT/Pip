import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PromptChip } from "@/lib/agent/card-types";
import { PromptChips } from "@/components/PromptChips";

describe("PromptChips", () => {
  it("renders a capped, lightweight prompt surface instead of a menu", () => {
    const markup = renderToStaticMarkup(
      <PromptChips chips={overflowingPromptChips} onSelect={() => undefined} />,
    );

    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup).toContain("Why this number?");
    expect(markup).toContain("Can I spend $50?");
    expect(markup).toContain("Show true balances");
    expect(markup).not.toContain("Show recent transactions");
    expect(markup).not.toContain("Show the math");
    expect(markup).not.toContain("role=&quot;menu&quot;");
  });
});

const overflowingPromptChips: PromptChip[] = [
  {
    id: "why",
    label: "Why this number?",
    prompt: "Why this number?",
  },
  {
    id: "spend-50",
    label: "Can I spend $50?",
    prompt: "Can I spend $50?",
  },
  {
    id: "balances",
    label: "Show true balances",
    prompt: "Show true balances",
  },
  {
    id: "transactions",
    label: "Show recent transactions",
    prompt: "Show recent transactions",
  },
  {
    id: "math",
    label: "Show the math",
    prompt: "Show the math",
  },
];
