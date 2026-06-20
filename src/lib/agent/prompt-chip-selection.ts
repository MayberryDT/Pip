import type { AgentCard, AgentResponse, PromptChip } from "@/lib/agent/card-types";
import {
  planPromptChips,
  type PromptChipPlan,
} from "@/lib/agent/prompt-chip-planner";
import {
  getOnboardingPromptChips,
  getReadyPromptChipExamples,
  isRetiredDefaultPromptChip,
} from "@/lib/agent/suggested-prompts";
import { containsDisallowedFinalLanguage } from "@/lib/agent/visible-response-guard";
import type { SyncStatus } from "@/lib/data/sync-status";
import type { FinancialSnapshot, PipCashResult } from "@/lib/types";

export type PromptChipSelectionOnboardingState = {
  status: "guest" | "needs-consent" | "ready";
  hasFinancialData: boolean;
};

export type PromptChipSelectionContext = {
  requestKind: "chat" | "prompt_chips";
  snapshot?: FinancialSnapshot;
  syncStatus?: SyncStatus | null;
  onboardingState: PromptChipSelectionOnboardingState;
  conversationState: {
    shownCards: Array<{
      type: AgentCard["type"] | string;
      title?: string;
    }>;
    lastToolNames: string[];
    promptChips: PromptChip[];
  };
};

export type PromptChipSelectionOutput = {
  message: string;
  responseMode?: AgentResponse["responseMode"];
  support?: string;
  promptChips: PromptChip[];
};

export type PromptChipSelectionOptions = {
  input: {
    message: string;
    requestKind?: "chat" | "prompt_chips";
    history?: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
    selectedPromptChipId?: string;
  };
  cards: AgentCard[];
  usedTools: string[];
  isSupportedCardPrompt: (normalizedPrompt: string) => boolean;
};

export function selectPromptChips(
  parsed: PromptChipSelectionOutput,
  context: PromptChipSelectionContext,
  result: PipCashResult | null,
  options: PromptChipSelectionOptions,
): PromptChipPlan {
  const generated = sanitizeGeneratedPromptChips(
    parsed.promptChips,
    context,
    options.isSupportedCardPrompt,
  );
  const fallback = result ? [] : getOnboardingPromptChips(context.onboardingState);

  if (!result) {
    return {
      chips: mergeGeneratedPromptChips(generated, fallback),
      conversationJob: "setup",
      familyIds: [],
      repeatedJob: false,
      repeatedTool: false,
      repeatedCard: false,
      fallbackReason: generated.length > 0 ? "generated-supplement" : "none",
    };
  }

  return planPromptChips({
    result,
    message: options.input.message,
    history: options.input.history,
    shownCards: context.conversationState.shownCards,
    lastToolNames: context.conversationState.lastToolNames,
    promptChips: context.conversationState.promptChips,
    responseCards: options.cards,
    responseToolNames: options.usedTools,
    selectedPromptChipId: options.input.selectedPromptChipId,
    syncStatus: context.syncStatus,
    assistantMessage: [parsed.message, parsed.support].filter(Boolean).join(" "),
    onboardingState: context.onboardingState,
    generatedChips: generated,
  });
}

export function getAvailablePromptChips(input: {
  snapshot?: FinancialSnapshot;
  onboardingState: PromptChipSelectionOnboardingState;
}): PromptChip[] {
  if (input.snapshot) {
    return getReadyPromptChipExamples();
  }

  return getOnboardingPromptChips(input.onboardingState);
}

function mergeGeneratedPromptChips(
  generated: PromptChip[],
  fallback: PromptChip[],
): PromptChip[] {
  const merged: PromptChip[] = [];
  const seenPrompts = new Set<string>();

  [...generated, ...fallback].forEach((chip) => {
    const key = normalizePrompt(chip.prompt);

    if (seenPrompts.has(key)) {
      return;
    }

    seenPrompts.add(key);
    merged.push(chip);
  });

  return merged.slice(0, 3);
}

function sanitizeGeneratedPromptChips(
  chips: PromptChip[],
  context: PromptChipSelectionContext,
  isSupportedCardPrompt: (normalizedPrompt: string) => boolean,
): PromptChip[] {
  const seenIds = new Set<string>();
  const seenPrompts = new Set<string>();
  const recentTexts = new Set(
    context.conversationState.promptChips.flatMap((chip) => [
      normalizePrompt(chip.label),
      normalizePrompt(chip.prompt),
    ]),
  );
  const sanitized: PromptChip[] = [];
  const recentFallback: PromptChip[] = [];

  chips.forEach((chip, index) => {
    const next = sanitizeGeneratedPromptChip(chip, context, index, isSupportedCardPrompt);

    if (!next) {
      return;
    }

    const promptKey = normalizePrompt(next.prompt);
    const labelKey = normalizePrompt(next.label);
    let id = next.id;

    if (seenPrompts.has(promptKey)) {
      return;
    }

    if (seenIds.has(id)) {
      id = withPromptChipIdSuffix(id, index);
    }

    seenIds.add(id);
    seenPrompts.add(promptKey);
    const sanitizedChip = {
      ...next,
      id,
    };

    if (recentTexts.has(promptKey) || recentTexts.has(labelKey)) {
      if (context.requestKind === "prompt_chips") {
        recentFallback.push(sanitizedChip);
      }

      return;
    }

    sanitized.push(sanitizedChip);
  });

  if (context.requestKind === "prompt_chips") {
    return [...sanitized, ...recentFallback].slice(0, 3);
  }

  return sanitized.slice(0, 3);
}

function sanitizeGeneratedPromptChip(
  chip: PromptChip,
  context: PromptChipSelectionContext,
  index: number,
  isSupportedCardPrompt: (normalizedPrompt: string) => boolean,
): PromptChip | null {
  const label = cleanPromptChipText(chip.label, 56);
  const prompt = cleanPromptChipText(chip.prompt, 160);

  if (!label || !prompt) {
    return null;
  }

  if (isRetiredDefaultPromptChip({ label, prompt })) {
    return null;
  }

  if (containsDisallowedFinalLanguage(label + " " + prompt)) {
    return null;
  }

  const capabilitySafeChip = sanitizePromptChipCapability(
    { label, prompt },
    context,
    isSupportedCardPrompt,
  );

  if (!capabilitySafeChip) {
    return null;
  }

  if (/^discuss\b/i.test(capabilitySafeChip.label)) {
    return null;
  }

  const requestedId = normalizePromptChipId(chip.id);
  const privilegedId = getPermittedPrivilegedPromptChipId(
    requestedId,
    context,
    capabilitySafeChip.label + " " + capabilitySafeChip.prompt,
  );
  const id = privilegedId ?? createGeneratedPromptChipId(
    requestedId,
    capabilitySafeChip.label,
    capabilitySafeChip.prompt,
    index,
  );

  return {
    id,
    label: capabilitySafeChip.label,
    prompt: capabilitySafeChip.prompt,
  };
}

function sanitizePromptChipCapability(
  chip: Pick<PromptChip, "label" | "prompt">,
  context: PromptChipSelectionContext,
  isSupportedCardPrompt: (normalizedPrompt: string) => boolean,
): Pick<PromptChip, "label" | "prompt"> | null {
  const text = normalizePrompt(chip.label + " " + chip.prompt);

  if (!hasPromptChipDisplayVerb(text)) {
    return chip;
  }

  if (!context.snapshot) {
    return null;
  }

  if (isSupportedCardPrompt(text)) {
    return chip;
  }

  return downgradePromptChipToDiscussion(chip);
}

function hasPromptChipDisplayVerb(normalized: string): boolean {
  return /\b(show|see|list|pull|view|forecast|breakdown|trend view)\b/.test(normalized);
}

function downgradePromptChipToDiscussion(
  chip: Pick<PromptChip, "label" | "prompt">,
): Pick<PromptChip, "label" | "prompt"> {
  const subject = chip.label
    .replace(/^(show|see|list|pull|view|forecast|break down|breakdown)\s+/i, "")
    .replace(/\b(cards?|view)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const discussionSubject = /^compare$/i.test(subject) ? "credit card options" : subject;
  const label = cleanPromptChipText("Discuss " + (discussionSubject || "this"), 36);
  const promptBase = chip.prompt
    .replace(/^(i want to|i'd like to|can you|could you|please)\s+/i, "")
    .replace(/^(show|see|list|pull|view|forecast|break down|breakdown)\s+(me\s+)?/i, "Let's discuss ")
    .replace(/\bcard options\b/gi, "credit card options")
    .replace(/\bcard use\b/gi, "credit card use")
    .replace(/\bcard usage\b/gi, "credit card usage")
    .replace(/\bcards\b/gi, "credit cards");
  const prompt = cleanPromptChipText(promptBase, 160);

  return {
    label,
    prompt: /^let'?s discuss/i.test(prompt) ? prompt : "Let's discuss " + prompt,
  };
}

function getPermittedPrivilegedPromptChipId(
  id: string,
  context: PromptChipSelectionContext,
  visibleText: string,
): string | null {
  const normalized = visibleText.toLowerCase();

  if (id === "get-signed-up") {
    return context.onboardingState.status === "guest" &&
      /\b(sign|signed|google|start|continue)\b/.test(normalized)
      ? id
      : null;
  }

  if (id === "connect-data") {
    return !context.snapshot &&
      context.onboardingState.status !== "needs-consent" &&
      /\b(connect|data|account|plaid)\b/.test(normalized)
      ? id
      : null;
  }

  if (id === "use-default-savings") {
    return context.onboardingState.status === "needs-consent" &&
      /\b(200|default|continue|ok|yes)\b/.test(normalized)
      ? id
      : null;
  }

  if (id === "set-250-savings") {
    return context.onboardingState.status === "needs-consent" && /\b250\b/.test(normalized)
      ? id
      : null;
  }

  return null;
}

function cleanPromptChipText(text: string, maxLength: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
}

function normalizePromptChipId(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createGeneratedPromptChipId(
  requestedId: string,
  label: string,
  prompt: string,
  index: number,
): string {
  if (requestedId.startsWith("ai-")) {
    return requestedId;
  }

  const slug = normalizePromptChipId(label + "-" + prompt).replace(/^ai-/, "").slice(0, 60);

  return ("ai-" + (slug || "suggestion-" + (index + 1))).slice(0, 80);
}

function withPromptChipIdSuffix(id: string, index: number): string {
  const suffix = "-" + (index + 1);
  return id.slice(0, 80 - suffix.length) + suffix;
}

function normalizePrompt(message: string): string {
  return message
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
