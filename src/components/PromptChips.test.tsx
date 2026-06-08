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
    expect(markup).toContain("Upcoming bills");
    expect(markup).toContain("Show true balances");
    expect(markup).toContain("Try $25");
    expect(markup).not.toContain("Show recent transactions");
    expect(markup).not.toContain("Show the math");
    expect(markup).toContain("flex-nowrap");
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("scrollbar-none");
    expect(markup).toContain("whitespace-nowrap");
    expect(markup).not.toContain("role=&quot;menu&quot;");
  });
});

const overflowingPromptChips: PromptChip[] = [
  {
    id: "upcoming-bills",
    label: "Upcoming bills",
    prompt: "What bills are coming up?",
  },
  {
    id: "balances",
    label: "Show true balances",
    prompt: "Show true balances",
  },
  {
    id: "try-25",
    label: "Try $25",
    prompt: "Can I spend $25?",
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
