import type { PromptChip } from "@/lib/agent/card-types";
import {
  getDefaultReadyPromptChips,
  getReadyPromptChipCatalog,
} from "@/lib/agent/prompt-chip-planner";
import type { PipCashResult } from "@/lib/types";

export const guestOnboardingPromptChips: PromptChip[] = [
  {
    id: "how-pip-works",
    label: "How does Pip work?",
    prompt: "Tell me how Pip works",
  },
  {
    id: "what-will-connect",
    label: "What will I connect?",
    prompt: "What account data will I connect?",
  },
];

export const consentOnboardingPromptChips: PromptChip[] = [
  {
    id: "why-monthly-savings",
    label: "Why monthly savings?",
    prompt: "Why does Pip ask for monthly savings?",
  },
];

export const dataOnboardingPromptChips: PromptChip[] = [
  {
    id: "what-data-used",
    label: "What data do you use?",
    prompt: "What data does Pip use?",
  },
  {
    id: "why-connect-accounts",
    label: "Why connect accounts?",
    prompt: "Why should I connect accounts?",
  },
];

const retiredDefaultPromptChipTexts = new Set([
  "missing card",
  "why today?",
  "why today",
  "test purchase",
  "why this number?",
  "can i spend $50?",
  "what changed?",
]);

export function getSuggestedPrompts(result: PipCashResult): PromptChip[] {
  return getDefaultReadyPromptChips(result);
}

export function getReadyPromptChipExamples(): PromptChip[] {
  return getReadyPromptChipCatalog();
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
