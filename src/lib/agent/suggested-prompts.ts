import type { PromptChip } from "@/lib/agent/card-types";
import type { FreeCashResult } from "@/lib/types";

export const guestOnboardingPromptChips: PromptChip[] = [
  {
    id: "how-spendable-works",
    label: "How it works",
    prompt: "Tell me how Spendable works",
  },
  {
    id: "get-signed-up",
    label: "Get signed up",
    prompt: "Get me signed up",
  },
  {
    id: "connect-data",
    label: "Connect data",
    prompt: "Let's connect my data",
  },
];

export const consentOnboardingPromptChips: PromptChip[] = [
  {
    id: "use-default-savings",
    label: "Use $200",
    prompt: "continue",
  },
  {
    id: "set-250-savings",
    label: "Use $250",
    prompt: "$250",
  },
  {
    id: "why-protected-savings",
    label: "Why this step?",
    prompt: "Why do you need protected savings?",
  },
];

export const dataOnboardingPromptChips: PromptChip[] = [
  {
    id: "how-spendable-works",
    label: "How it works",
    prompt: "Tell me how Spendable works",
  },
  {
    id: "connect-data",
    label: "Connect data",
    prompt: "Connect my data",
  },
  {
    id: "set-protected-savings",
    label: "Protected savings",
    prompt: "Set protected savings",
  },
];

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
      id: "forecast",
      label: "Show forecast",
      prompt: "Show my Spendable Cash forecast",
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
        id: "breakdown",
        label: "Show breakdown",
        prompt: "Show my spending breakdown",
      },
    ];
  }

  return base;
}

export function getOnboardingPromptChips(input: {
  status: "guest" | "needs-consent" | "ready";
  hasFinancialData?: boolean;
}): PromptChip[] {
  if (input.status === "guest") {
    return guestOnboardingPromptChips;
  }

  if (input.status === "needs-consent") {
    return consentOnboardingPromptChips;
  }

  if (!input.hasFinancialData) {
    return dataOnboardingPromptChips;
  }

  return [];
}

export function selectPromptChipsFromAllowlist(
  selectedIds: string[],
  allowlist: PromptChip[],
): PromptChip[] {
  const chipsById = new Map(allowlist.map((chip) => [chip.id, chip]));
  const selected = selectedIds
    .map((id) => chipsById.get(id))
    .filter((chip): chip is PromptChip => Boolean(chip));

  if (selected.length > 0) {
    return selected.slice(0, 3);
  }

  return allowlist.slice(0, 3);
}
