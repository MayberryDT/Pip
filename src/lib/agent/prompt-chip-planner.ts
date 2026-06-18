import type { AgentCard, PromptChip } from "@/lib/agent/card-types";
import {
  normalizeText,
  summarizeConversationState,
  type ConversationStateSummary,
  type ConversationHistoryItem,
  type ConversationJob,
} from "@/lib/agent/conversation-state";
import type { SyncStatus } from "@/lib/data/sync-status";
import {
  getDisplayedSpendableCashTodayCents,
  getSpendableCashTodayState,
} from "@/lib/pip-cash/spendable-cash-today";
import { formatMoney } from "@/lib/money";
import type { PipCashResult } from "@/lib/types";

export type PromptChipFamilyId =
  | "ai-what-number-means"
  | "ai-why-today"
  | "ai-cutback-opportunity"
  | "ai-biggest-drivers"
  | "ai-recent-charges"
  | "ai-upcoming-bills"
  | "ai-next-few-days"
  | "ai-daily-trend"
  | "ai-recurring-items"
  | "ai-test-purchase"
  | "ai-try-20"
  | "ai-try-another-amount"
  | "ai-spending-breakdown"
  | "ai-show-math"
  | "ai-true-balances"
  | "ai-trust-receipt"
  | "ai-data-quality"
  | "ai-missing-card"
  | "ai-pending-items"
  | "ai-refresh-data"
  | "ai-payday-impact"
  | "ai-pattern-assumptions"
  | "ai-spending-pressure"
  | "ai-teach-money-basic"
  | "ai-cash-flow-basic"
  | "ai-bills-affect-today"
  | "ai-think-about-spending"
  | "ai-what-affects-today"
  | "ai-how-it-works";

export type PromptChipPlanInput = {
  result: PipCashResult | null;
  message: string;
  history?: ConversationHistoryItem[];
  shownCards?: Array<{
    type: AgentCard["type"] | string;
    title?: string;
  }>;
  lastToolNames?: string[];
  promptChips?: PromptChip[];
  responseCards?: AgentCard[];
  responseToolNames?: string[];
  selectedPromptChipId?: string;
  syncStatus?: SyncStatus | null;
  assistantMessage?: string;
  onboardingState?: {
    status: "guest" | "needs-consent" | "ready";
    hasFinancialData: boolean;
  };
  generatedChips?: PromptChip[];
};

export type PromptChipPlan = {
  chips: PromptChip[];
  conversationJob: ConversationJob;
  familyIds: string[];
  repeatedJob: boolean;
  repeatedTool: boolean;
  repeatedCard: boolean;
  fallbackReason: "none" | "recent-repeat" | "generated-supplement" | "state-default";
};

type PromptChipMode = "starter" | "context" | "education" | "diagnostic" | "action";

type ChipDefinition = {
  id: PromptChipFamilyId;
  label: string | ((context: PromptChipRenderContext | null) => string);
  prompt: string;
  mode: PromptChipMode;
};

type PromptChipRenderContext = {
  result: PipCashResult;
};

const starterChipFamilyIds = [
  "ai-why-today",
  "ai-cutback-opportunity",
  "ai-next-few-days",
] as const satisfies readonly PromptChipFamilyId[];

const readyChipCatalog: Record<PromptChipFamilyId, ChipDefinition> = {
  "ai-what-number-means": {
    id: "ai-what-number-means",
    label: (context) => context
      ? `What does my ${formatMoney(getDisplayedSpendableCashTodayCents(context.result))} mean?`
      : "What does my number mean?",
    prompt: "What does my Spendable Cash Today number mean?",
    mode: "starter",
  },
  "ai-why-today": {
    id: "ai-why-today",
    label: (context) => context
      ? `Why is it ${formatMoney(getDisplayedSpendableCashTodayCents(context.result))} today?`
      : "Why is it this amount today?",
    prompt: "Show the biggest drivers behind today's number",
    mode: "starter",
  },
  "ai-cutback-opportunity": {
    id: "ai-cutback-opportunity",
    label: "What can I cut back on?",
    prompt: "What can I cut back on from my recent spending?",
    mode: "context",
  },
  "ai-biggest-drivers": {
    id: "ai-biggest-drivers",
    label: "Show the biggest drivers",
    prompt: "Show the biggest drivers behind today's number",
    mode: "context",
  },
  "ai-recent-charges": {
    id: "ai-recent-charges",
    label: "Show recent charges",
    prompt: "Show my recent charges",
    mode: "context",
  },
  "ai-upcoming-bills": {
    id: "ai-upcoming-bills",
    label: "What bills are coming up?",
    prompt: "What bills are coming up?",
    mode: "context",
  },
  "ai-next-few-days": {
    id: "ai-next-few-days",
    label: "What happens in the next few days?",
    prompt: "Show my Spendable Cash forecast",
    mode: "context",
  },
  "ai-daily-trend": {
    id: "ai-daily-trend",
    label: "Show the 7-day trend",
    prompt: "Show 7 day trend",
    mode: "context",
  },
  "ai-recurring-items": {
    id: "ai-recurring-items",
    label: "Show likely repeat items",
    prompt: "Show likely recurring bills and income",
    mode: "context",
  },
  "ai-test-purchase": {
    id: "ai-test-purchase",
    label: "What would a $25 purchase do?",
    prompt: "Can I spend $25?",
    mode: "action",
  },
  "ai-try-20": {
    id: "ai-try-20",
    label: "What about $20 instead?",
    prompt: "What about $20 instead?",
    mode: "action",
  },
  "ai-try-another-amount": {
    id: "ai-try-another-amount",
    label: "Try a different amount",
    prompt: "Can I test a different purchase amount?",
    mode: "action",
  },
  "ai-spending-breakdown": {
    id: "ai-spending-breakdown",
    label: "Show my spending breakdown",
    prompt: "Show my spending breakdown",
    mode: "context",
  },
  "ai-show-math": {
    id: "ai-show-math",
    label: "Show how the math works",
    prompt: "Show the math",
    mode: "context",
  },
  "ai-true-balances": {
    id: "ai-true-balances",
    label: "Show actual account balances",
    prompt: "Show my true balances",
    mode: "context",
  },
  "ai-trust-receipt": {
    id: "ai-trust-receipt",
    label: "Show the receipt",
    prompt: "Show the trust receipt behind today's number",
    mode: "diagnostic",
  },
  "ai-data-quality": {
    id: "ai-data-quality",
    label: "Check if the data looks right",
    prompt: "Check data quality",
    mode: "diagnostic",
  },
  "ai-missing-card": {
    id: "ai-missing-card",
    label: "Could this be missing something?",
    prompt: "Is there a missing card in Spendable Cash Today?",
    mode: "diagnostic",
  },
  "ai-pending-items": {
    id: "ai-pending-items",
    label: "What is still pending?",
    prompt: "Check data quality for pending transactions",
    mode: "diagnostic",
  },
  "ai-refresh-data": {
    id: "ai-refresh-data",
    label: "Refresh connected data",
    prompt: "Refresh my connected data",
    mode: "diagnostic",
  },
  "ai-payday-impact": {
    id: "ai-payday-impact",
    label: "How did payday affect this?",
    prompt: "How did payday affect today?",
    mode: "context",
  },
  "ai-pattern-assumptions": {
    id: "ai-pattern-assumptions",
    label: "What pattern are you using?",
    prompt: "Show the pattern assumptions behind this number",
    mode: "context",
  },
  "ai-spending-pressure": {
    id: "ai-spending-pressure",
    label: "How is recent spending affecting this?",
    prompt: "How is recent spending affecting this?",
    mode: "context",
  },
  "ai-teach-money-basic": {
    id: "ai-teach-money-basic",
    label: "Teach me a money basic",
    prompt: "Teach me one useful money basic",
    mode: "starter",
  },
  "ai-cash-flow-basic": {
    id: "ai-cash-flow-basic",
    label: "What is cash flow?",
    prompt: "What is cash flow?",
    mode: "education",
  },
  "ai-bills-affect-today": {
    id: "ai-bills-affect-today",
    label: "How do bills affect today?",
    prompt: "How do bills affect Spendable Cash Today?",
    mode: "education",
  },
  "ai-think-about-spending": {
    id: "ai-think-about-spending",
    label: "How should I think about spending?",
    prompt: "How should I think about spending?",
    mode: "education",
  },
  "ai-what-affects-today": {
    id: "ai-what-affects-today",
    label: "What makes this go up or down?",
    prompt: "What makes Spendable Cash Today go up or down?",
    mode: "education",
  },
  "ai-how-it-works": {
    id: "ai-how-it-works",
    label: "What is Spendable Cash Today?",
    prompt: "What is Spendable Cash Today?",
    mode: "education",
  },
};

export function getReadyPromptChipCatalog(): PromptChip[] {
  return Object.values(readyChipCatalog).map((chip) => toPromptChip(chip));
}

export function getDefaultReadyPromptChips(result: PipCashResult): PromptChip[] {
  return planPromptChips({
    result,
    message: "",
  }).chips;
}

export function planPromptChips(input: PromptChipPlanInput): PromptChipPlan {
  if (!input.result) {
    return {
      chips: [],
      conversationJob: "setup",
      familyIds: [],
      repeatedJob: false,
      repeatedTool: false,
      repeatedCard: false,
      fallbackReason: "none",
    };
  }

  const result = input.result;
  const summary = summarizeConversationState({
    message: input.message,
    history: input.history,
    shownCards: input.shownCards,
    lastToolNames: input.lastToolNames,
    promptChips: input.promptChips,
    selectedPromptChipId: input.selectedPromptChipId,
    responseCards: input.responseCards,
    responseToolNames: input.responseToolNames,
    result,
    syncStatus: input.syncStatus,
    onboardingState: input.onboardingState,
  });
  const prioritizedIds = prioritizeChipFamilies(input, summary);
  const recentKeys = new Set(summary.recentChipKeys);
  const selectedKey = normalizeText(input.selectedPromptChipId);
  const fresh: PromptChipFamilyId[] = [];
  const repeated: PromptChipFamilyId[] = [];

  for (const id of prioritizedIds) {
    const chip = toPromptChip(readyChipCatalog[id], {
      result,
    });
    const keys = getChipKeys(chip);

    if (selectedKey && keys.includes(selectedKey)) {
      continue;
    }

    if (keys.some((key) => recentKeys.has(key))) {
      repeated.push(id);
      continue;
    }

    fresh.push(id);
  }

  const deterministicIds = [...fresh, ...repeated].slice(0, 3);
  const deterministicChips = deterministicIds.map((id) => toPromptChip(readyChipCatalog[id], {
    result,
  }));
  const merged = mergePromptChips(
    deterministicChips,
    sanitizeGeneratedSupplements(input.generatedChips ?? [], deterministicChips, recentKeys),
  ).slice(0, 3);

  return {
    chips: merged,
    conversationJob: summary.currentJob,
    familyIds: merged.map((chip) => chip.id),
    repeatedJob: summary.repeatedJob,
    repeatedTool: summary.repeatedTool,
    repeatedCard: summary.repeatedCard,
    fallbackReason:
      fresh.length >= 3
        ? "none"
        : deterministicChips.length < 3 && merged.length >= 3
          ? "generated-supplement"
          : fresh.length === 0
            ? "recent-repeat"
            : "state-default",
  };
}

function prioritizeChipFamilies(
  input: PromptChipPlanInput,
  summary: ConversationStateSummary,
): PromptChipFamilyId[] {
  const job = summary.currentJob;
  const questionIds = getQuestionChipFamilyIds(input.assistantMessage);
  const stateIds = shouldIncludeDiagnosticChip(summary)
    ? getStateChipFamilyIds(summary).slice(0, 1)
    : [];

  if (questionIds.length > 0) {
    return uniqueFamilyIds([
      ...questionIds,
      "ai-cash-flow-basic",
      ...getJobChipFamilyIds(job),
      ...stateIds,
      "ai-what-affects-today",
    ]);
  }

  if (shouldUseStarterChips(input, summary)) {
    return [...starterChipFamilyIds];
  }

  const state = input.result ? getSpendableCashTodayState(input.result) : "normal";
  const useStateDefaultsOnly = Boolean(
    (job === "home" || job === "broad_chat") &&
      state !== "normal" &&
      state !== "healthy",
  );
  const jobIds = useStateDefaultsOnly ? [] : getJobChipFamilyIds(job);
  const defaultIds =
    state === "shortfall" || state === "tight"
      ? (["ai-cutback-opportunity", "ai-spending-pressure", "ai-upcoming-bills", "ai-biggest-drivers"] as const)
      : state === "overspending"
        ? (["ai-cutback-opportunity", "ai-spending-pressure", "ai-upcoming-bills", "ai-next-few-days"] as const)
        : state === "low_confidence" || state === "missing_data"
          ? (["ai-pattern-assumptions", "ai-data-quality", "ai-biggest-drivers", "ai-how-it-works"] as const)
          : (["ai-why-today", "ai-cutback-opportunity", "ai-next-few-days", "ai-cash-flow-basic"] as const);
  return uniqueFamilyIds([...stateIds, ...jobIds, ...defaultIds, "ai-true-balances", "ai-how-it-works"]);
}

function getQuestionChipFamilyIds(message: string | undefined): PromptChipFamilyId[] {
  const normalized = normalizeText(message);

  if (!normalized || !/\?/.test(message ?? "")) {
    return [];
  }

  const ids: PromptChipFamilyId[] = [];

  if (/\b(biggest drivers?|drivers?|main factors?|more detail|in more detail|why)\b/.test(normalized)) {
    ids.push("ai-biggest-drivers");
  }

  if (/\b(forecast|next few days|quick forecast|next days?|tomorrow|coming days?)\b/.test(normalized)) {
    ids.push("ai-next-few-days");
  }

  if (/\b(recent charges?|recent transactions?|recent purchases?|activity)\b/.test(normalized)) {
    ids.push("ai-recent-charges");
  }

  if (/\b(upcoming bills?|bills? coming up|recurring|subscriptions?|repeat items?)\b/.test(normalized)) {
    ids.push("ai-upcoming-bills");
  }

  if (/\b(cut back|cutback|overspending|spending too much|spend less|save money|waste)\b/.test(normalized)) {
    ids.push("ai-cutback-opportunity");
  }

  if (/\b(math|formula|calculation)\b/.test(normalized)) {
    ids.push("ai-show-math");
  }

  if (/\b(trust|receipt|reliable|accurate|current|fresh|missing data)\b/.test(normalized)) {
    ids.push("ai-trust-receipt");
  }

  if (/\b(test|try|purchase|spend amount|different amount)\b/.test(normalized)) {
    ids.push("ai-test-purchase");
  }

  return uniqueFamilyIds(ids);
}

function getStateChipFamilyIds(summary: ConversationStateSummary): PromptChipFamilyId[] {
  const ids: PromptChipFamilyId[] = [];

  if (summary.hasStaleSync) {
    ids.push("ai-refresh-data");
  }

  if (summary.hasMissingCardWarning) {
    ids.push("ai-missing-card");
  } else if (summary.hasPendingDataState) {
    ids.push("ai-pending-items");
  }

  if (ids.length === 0 && summary.hasStaleSync) {
    ids.push("ai-data-quality");
  }

  return ids;
}

function shouldUseStarterChips(
  input: PromptChipPlanInput,
  summary: ConversationStateSummary,
): boolean {
  const selectedMode = input.selectedPromptChipId
    ? readyChipCatalog[input.selectedPromptChipId as PromptChipFamilyId]?.mode
    : null;

  if (selectedMode) {
    return false;
  }

  if (shouldIncludeDiagnosticChip(summary)) {
    return false;
  }

  const state = input.result ? getSpendableCashTodayState(input.result) : "normal";

  if (state !== "normal" && state !== "healthy") {
    return false;
  }

  const hasResponseSurface = Boolean(input.responseCards?.length || input.responseToolNames?.length);

  return summary.currentJob === "home" || (summary.currentJob === "broad_chat" && !hasResponseSurface);
}

function shouldIncludeDiagnosticChip(summary: ConversationStateSummary): boolean {
  return (
    summary.hasStaleSync ||
    summary.currentJob === "data_quality" ||
    summary.lastAnsweredJob === "data_quality"
  );
}

function getJobChipFamilyIds(job: ConversationJob): PromptChipFamilyId[] {
  switch (job) {
    case "explain_number":
      return ["ai-spending-pressure", "ai-upcoming-bills", "ai-show-math", "ai-next-few-days"];
    case "purchase_test":
      return ["ai-try-20", "ai-next-few-days", "ai-biggest-drivers", "ai-try-another-amount"];
    case "forecast":
      return ["ai-recurring-items", "ai-upcoming-bills", "ai-recent-charges", "ai-biggest-drivers"];
    case "recurring_activity":
      return ["ai-next-few-days", "ai-recent-charges", "ai-spending-breakdown", "ai-biggest-drivers"];
    case "recent_transactions":
      return ["ai-biggest-drivers", "ai-spending-breakdown", "ai-upcoming-bills", "ai-next-few-days"];
    case "spending_breakdown":
      return ["ai-show-math", "ai-recent-charges", "ai-upcoming-bills", "ai-payday-impact"];
    case "math":
      return ["ai-biggest-drivers", "ai-what-affects-today", "ai-how-it-works"];
    case "true_balances":
      return ["ai-why-today", "ai-test-purchase", "ai-next-few-days"];
    case "data_quality":
      return ["ai-trust-receipt", "ai-why-today", "ai-recent-charges", "ai-refresh-data"];
    case "financial_guidance":
      return ["ai-cutback-opportunity", "ai-spending-pressure", "ai-upcoming-bills", "ai-next-few-days"];
    case "definition":
      return ["ai-biggest-drivers", "ai-test-purchase", "ai-next-few-days"];
    case "duplicate_follow_up":
      return ["ai-recent-charges", "ai-show-math", "ai-next-few-days", "ai-spending-breakdown"];
    case "setup":
    case "home":
    case "broad_chat":
      return ["ai-why-today", "ai-cutback-opportunity", "ai-next-few-days", "ai-upcoming-bills"];
  }
}

function mergePromptChips(primary: PromptChip[], supplements: PromptChip[]): PromptChip[] {
  const merged: PromptChip[] = [];
  const seen = new Set<string>();

  for (const chip of [...primary, ...supplements]) {
    const key = normalizeText(chip.prompt);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(chip);
  }

  return merged;
}

function sanitizeGeneratedSupplements(
  chips: PromptChip[],
  deterministicChips: PromptChip[],
  recentKeys: Set<string>,
): PromptChip[] {
  const deterministicKeys = new Set(deterministicChips.flatMap(getChipKeys));

  return chips.filter((chip) => {
    const keys = getChipKeys(chip);

    if (keys.some((key) => deterministicKeys.has(key) || recentKeys.has(key))) {
      return false;
    }

    return !isRetiredPromptChip(chip);
  });
}

function uniqueFamilyIds(ids: readonly PromptChipFamilyId[]): PromptChipFamilyId[] {
  return [...new Set(ids)];
}

function toPromptChip(chip: ChipDefinition, context?: PromptChipRenderContext): PromptChip {
  return {
    id: chip.id,
    label: typeof chip.label === "function"
      ? chip.label(context ?? null)
      : chip.label,
    prompt: chip.prompt,
  };
}

function getChipKeys(chip: PromptChip): string[] {
  return [normalizeText(chip.id), normalizeText(chip.label), normalizeText(chip.prompt)];
}

function isRetiredPromptChip(chip: Pick<PromptChip, "label" | "prompt">): boolean {
  const texts = [normalizeText(chip.label), normalizeText(chip.prompt)];

  return texts.some((text) =>
    text === "missing card" ||
    text === "why today" ||
    text === "test purchase" ||
    text === "why this number" ||
    text === "can i spend $50" ||
    text === "what changed"
  );
}
