import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PromptChip } from "@/lib/agent/card-types";
import { PromptChips } from "@/components/PromptChips";

describe("PromptChips", () => {
  it("renders a scrollable, lightweight prompt surface instead of a menu", () => {
    const markup = renderToStaticMarkup(
      <PromptChips chips={overflowingPromptChips} onSelect={() => undefined} />,
    );

    expect(markup.match(/<button/g)).toHaveLength(5);
    expect(markup).toContain("Upcoming bills");
    expect(markup).toContain("How should I think about spending?");
    expect(markup).toContain("What would a $25 purchase do?");
    expect(markup).toContain("Show recent transactions");
    expect(markup).toContain("Show the math");
    expect(markup).toContain("flex-nowrap");
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("scrollbar-none");
    expect(markup).toContain("justify-center");
    expect(markup).toContain("min-w-full");
    expect(markup).toContain("w-max");
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
    label: "How should I think about spending?",
    prompt: "How should I think about spending?",
  },
  {
    id: "try-25",
    label: "What would a $25 purchase do?",
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
