import type { PromptChip } from "@/lib/agent/card-types";
import type { FreeCashResult } from "@/lib/types";

export const guestOnboardingPromptChips: PromptChip[] = [
  {
    id: "how-pip-works",
    label: "How it works",
    prompt: "Tell me how Pip works",
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
    id: "how-pip-works",
    label: "How it works",
    prompt: "Tell me how Pip works",
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

const retiredDefaultPromptChipTexts = new Set([
  "why this number?",
  "can i spend $50?",
  "what changed?",
]);

export function getSuggestedPrompts(_result: FreeCashResult): PromptChip[] {
  return [];
}

export function isRetiredDefaultPromptChip(chip: Pick<PromptChip, "label" | "prompt">): boolean {
  return (
    retiredDefaultPromptChipTexts.has(normalizePromptChipText(chip.label)) ||
    retiredDefaultPromptChipTexts.has(normalizePromptChipText(chip.prompt))
  );
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

function normalizePromptChipText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
