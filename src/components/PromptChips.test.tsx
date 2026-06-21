import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PromptChip } from "@/lib/agent/card-types";
import { PromptChips } from "@/components/PromptChips";

describe("PromptChips", () => {
  it("renders a scrollable, lightweight prompt surface instead of a menu", () => {
    const markup = renderToStaticMarkup(
      <PromptChips chips={overflowingPromptChips} onSelect={() => undefined} />,
    );

    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup).toContain("Upcoming bills");
    expect(markup).toContain("How should I think about spending?");
    expect(markup).toContain("What would a $25 purchase do?");
    expect(markup).not.toContain("Show recent transactions");
    expect(markup).not.toContain("Show the math");
    expect(markup).toContain("pip-prompt-grid");
    expect(markup).toContain("grid-cols-2");
    expect(markup).toContain("min-w-full");
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("min-w-0");
    expect(markup).not.toContain("overflow-x-auto");
    expect(markup).not.toContain("whitespace-nowrap");
    expect(markup).not.toContain("role=&quot;menu&quot;");
  });

  it("can render compact active-chat chips without horizontal clipping", () => {
    const markup = renderToStaticMarkup(
      <PromptChips compact chips={overflowingPromptChips} onSelect={() => undefined} />,
    );

    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup).toContain("is-compact");
    expect(markup).toContain("min-h-11");
    expect(markup).not.toContain("overflow-x-auto");
    expect(markup).not.toContain("whitespace-nowrap");
    expect(markup).toContain("What would a $25 purchase do?");
  });

  it("keeps compact chip CSS at a 44px target minimum", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const compactCss = css.slice(
      css.indexOf(".pip-prompt-tray.is-compact .pip-prompt-chip {"),
      css.indexOf(".pip-prompt-chip:nth-child(3):last-child"),
    );

    expect(compactCss).toContain("min-height: 2.75rem;");
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
