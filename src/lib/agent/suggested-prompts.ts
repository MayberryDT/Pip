import type { PromptChip } from "@/lib/agent/card-types";
import type { FreeCashResult } from "@/lib/types";

export function getSuggestedPrompts(result: FreeCashResult): PromptChip[] {
  const base: PromptChip[] = [
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
      id: "changed",
      label: "What changed?",
      prompt: "What changed?",
    },
  ];

  if (result.warnings.some((warning) => warning.id === "missing-card")) {
    return base;
  }

  if (result.freeCashTodayCents < 0) {
    return [
      base[0],
      {
        id: "math",
        label: "Show math",
        prompt: "Show the math",
      },
      {
        id: "transactions",
        label: "Recent transactions",
        prompt: "Show recent transactions",
      },
    ];
  }

  return base;
}
