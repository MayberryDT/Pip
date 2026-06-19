import type { AgentCard } from "@/lib/agent/card-types";
import { resolveActionIntent } from "@/lib/agent/action-router";
import {
  type DeterministicAgentToolName,
  type IntentCatalogEntry,
  intentCatalog,
} from "@/lib/agent/intent-catalog";
import { scoreIntentEmbedding } from "@/lib/agent/intent-embeddings";
import {
  extractIntentSlots,
  normalizeIntentText,
  type IntentSlots,
} from "@/lib/agent/intent-slots";

export type IntentRouterMode = "legacy" | "catalog" | "hybrid";

export type IntentCandidate = {
  intentId: string;
  lexicalScore: number;
  embeddingScore: number | null;
  stateScore: number;
  combinedScore: number;
  matchedPositiveExamples: string[];
  matchedNegativeExamples: string[];
  matchedLexicalBoosts: string[];
  extractedSlots: IntentSlots;
};

export type IntentRouteDecision =
  | {
      kind: "route";
      intentId: string;
      toolName: DeterministicAgentToolName;
      args: Record<string, unknown>;
      requireCard: boolean;
      confidence: number;
      margin: number;
      source: "action_gate" | "catalog_lexical" | "hybrid" | "prompt_chip";
      candidates: IntentCandidate[];
      cardTypes: AgentCard["type"][];
    }
  | {
      kind: "clarify";
      question: string;
      options: Array<{ label: string; intentId: string }>;
      confidence: number;
      margin: number;
      candidates: IntentCandidate[];
    }
  | {
      kind: "abstain";
      reason: "low_confidence" | "open_set" | "unsupported" | "missing_snapshot" | "unsafe_action";
      confidence: number;
      candidates: IntentCandidate[];
    };

export type ResolveIntentRouteInput = {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  shownCards?: Array<{ type: AgentCard["type"] | string; title?: string }>;
  lastToolNames?: string[];
  selectedPromptChipId?: string;
  hasSnapshot?: boolean;
  mode?: IntentRouterMode;
};

const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "have",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "show",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "why",
  "with",
  "you",
]);

const unsupportedDomainPattern =
  /\b(credit score|stock|stocks|shares|etf|crypto|bitcoin|ethereum|taxes?|bankruptcy|loan|payday loan|mortgage|insurance|dispute (?:this )?charge|password|routing number|wire transfer|transfer money|move money|pay bills?)\b/;

export function getIntentRouterMode(
  env: Record<string, string | undefined> = process.env,
): IntentRouterMode {
  const mode = env.PIP_INTENT_ROUTER_MODE;

  if (mode === "legacy" || mode === "catalog" || mode === "hybrid") {
    return mode;
  }

  return "hybrid";
}

export function resolveIntentRoute(input: ResolveIntentRouteInput): IntentRouteDecision {
  const mode = input.mode ?? getIntentRouterMode();
  const normalized = normalizeIntentText(input.message);
  const slots = extractIntentSlots(input.message);

  if (!normalized || mode === "legacy") {
    return {
      kind: "abstain",
      reason: normalized ? "unsupported" : "low_confidence",
      confidence: 0,
      candidates: [],
    };
  }

  const actionDecision = resolveActionIntent(input.message, slots);

  if (actionDecision.kind === "route") {
    return {
      kind: "route",
      intentId: actionDecision.intent.id,
      toolName: actionDecision.intent.toolName as DeterministicAgentToolName,
      args: actionDecision.args,
      requireCard: shouldRequireCard(actionDecision.intent),
      confidence: actionDecision.confidence,
      margin: 1,
      source: "action_gate",
      candidates: [],
      cardTypes: actionDecision.intent.cardTypes,
    };
  }

  if (unsupportedDomainPattern.test(normalized) && !isPolicyQuestion(normalized)) {
    return {
      kind: "abstain",
      reason: "open_set",
      confidence: 0,
      candidates: [],
    };
  }

  const affirmativeFollowUpIntent = getAffirmativeFollowUpIntent(normalized, input.history);

  if (affirmativeFollowUpIntent) {
    return {
      kind: "route",
      intentId: affirmativeFollowUpIntent.id,
      toolName: affirmativeFollowUpIntent.toolName,
      args: buildArgs(affirmativeFollowUpIntent, slots),
      requireCard: shouldRequireCard(affirmativeFollowUpIntent),
      confidence: 0.96,
      margin: 1,
      source: "catalog_lexical",
      candidates: [],
      cardTypes: affirmativeFollowUpIntent.cardTypes,
    };
  }

  const purchaseSimulationIntent = getPurchaseSimulationIntent(normalized, slots);

  if (purchaseSimulationIntent) {
    return {
      kind: "route",
      intentId: purchaseSimulationIntent.id,
      toolName: purchaseSimulationIntent.toolName,
      args: buildArgs(purchaseSimulationIntent, slots),
      requireCard: shouldRequireCard(purchaseSimulationIntent),
      confidence: 1,
      margin: 1,
      source: "catalog_lexical",
      candidates: [],
      cardTypes: purchaseSimulationIntent.cardTypes,
    };
  }

  const actualBalancesIntent = getActualBalancesIntent(normalized);

  if (actualBalancesIntent) {
    return {
      kind: "route",
      intentId: actualBalancesIntent.id,
      toolName: actualBalancesIntent.toolName,
      args: buildArgs(actualBalancesIntent, slots),
      requireCard: shouldRequireCard(actualBalancesIntent),
      confidence: 0.98,
      margin: 1,
      source: "catalog_lexical",
      candidates: [],
      cardTypes: actualBalancesIntent.cardTypes,
    };
  }

  const deterministicIntent = getDeterministicCatalogIntent(normalized);

  if (deterministicIntent) {
    return {
      kind: "route",
      intentId: deterministicIntent.id,
      toolName: deterministicIntent.toolName,
      args: buildArgs(deterministicIntent, slots),
      requireCard: shouldRequireCard(deterministicIntent),
      confidence: 0.94,
      margin: 1,
      source: "catalog_lexical",
      candidates: [],
      cardTypes: deterministicIntent.cardTypes,
    };
  }

  const candidates = getRankedCandidates(input, normalized, slots, mode);
  const [top, second] = candidates;

  if (!top) {
    return {
      kind: "abstain",
      reason: "low_confidence",
      confidence: 0,
      candidates: [],
    };
  }

  const topIntent = intentCatalog.find((entry) => entry.id === top.intentId);

  if (!topIntent?.toolName) {
    return {
      kind: "abstain",
      reason: "unsupported",
      confidence: top.combinedScore,
      candidates,
    };
  }

  const margin = top.combinedScore - (second?.combinedScore ?? 0);

  if (topIntent.requiresSnapshot && input.hasSnapshot === false) {
    return {
      kind: "abstain",
      reason: "missing_snapshot",
      confidence: top.combinedScore,
      candidates,
    };
  }

  if (topIntent.requiredSlots?.some((slot) => top.extractedSlots[slot] === undefined)) {
    return {
      kind: "abstain",
      reason: "low_confidence",
      confidence: top.combinedScore,
      candidates,
    };
  }

  const threshold = getRouteThreshold(topIntent);

  if (top.combinedScore >= threshold && margin >= getMarginThreshold(topIntent)) {
    return {
      kind: "route",
      intentId: topIntent.id,
      toolName: topIntent.toolName,
      args: buildArgs(topIntent, slots),
      requireCard: shouldRequireCard(topIntent),
      confidence: top.combinedScore,
      margin,
      source: mode === "hybrid" ? "hybrid" : "catalog_lexical",
      candidates,
      cardTypes: topIntent.cardTypes,
    };
  }

  if (top.combinedScore >= Math.max(0.45, threshold - 0.16) && second) {
    return {
      kind: "clarify",
      question: buildClarificationQuestion(topIntent, intentCatalog.find((entry) => entry.id === second.intentId)),
      options: [top, second].map((candidate) => ({
        label: getClarificationLabel(candidate.intentId),
        intentId: candidate.intentId,
      })),
      confidence: top.combinedScore,
      margin,
      candidates,
    };
  }

  return {
    kind: "abstain",
    reason: "low_confidence",
    confidence: top.combinedScore,
    candidates,
  };
}

export function isCatalogSupportedPrompt(text: string): boolean {
  const decision = resolveIntentRoute({
    message: text,
    hasSnapshot: true,
    mode: "hybrid",
  });

  return decision.kind === "route" && decision.cardTypes.length > 0;
}

export function resolveIntentConversationJob(
  message: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
) {
  const decision = resolveIntentRoute({
    message,
    history,
    hasSnapshot: true,
    mode: "hybrid",
  });

  if (decision.kind !== "route") {
    return null;
  }

  return intentCatalog.find((entry) => entry.id === decision.intentId)?.conversationJob ?? null;
}

function getRankedCandidates(
  input: ResolveIntentRouteInput,
  normalized: string,
  slots: IntentSlots,
  mode: IntentRouterMode,
): IntentCandidate[] {
  const candidates = intentCatalog
    .filter((entry) => entry.risk !== "write_action" && entry.risk !== "destructive")
    .map((entry) => scoreCandidate(entry, input, normalized, slots, mode))
    .filter((candidate) => candidate.combinedScore > 0.12)
    .sort((left, right) => right.combinedScore - left.combinedScore)
    .slice(0, 5);

  return candidates;
}

function getPurchaseSimulationIntent(
  normalized: string,
  slots: IntentSlots,
): (IntentCatalogEntry & { toolName: DeterministicAgentToolName }) | null {
  if (slots.amount_cents === undefined || isTransactionHistoryAmountPrompt(normalized)) {
    return null;
  }

  if (!isPurchaseSimulationAmountPrompt(normalized)) {
    return null;
  }

  const intent = intentCatalog.find((entry) => entry.id === "purchase.simulation");

  return intent?.toolName ? {
    ...intent,
    toolName: intent.toolName,
  } : null;
}

function getActualBalancesIntent(
  normalized: string,
): (IntentCatalogEntry & { toolName: DeterministicAgentToolName }) | null {
  if (!isActualBalancePrompt(normalized)) {
    return null;
  }

  const intent = intentCatalog.find((entry) => entry.id === "balances.actual_accounts");

  return intent?.toolName ? {
    ...intent,
    toolName: intent.toolName,
  } : null;
}

function getAffirmativeFollowUpIntent(
  normalized: string,
  history: ResolveIntentRouteInput["history"],
): (IntentCatalogEntry & { toolName: DeterministicAgentToolName }) | null {
  if (!isAffirmativeFollowUp(normalized)) {
    return null;
  }

  const recentHistory = [...(history ?? []).slice(-4)].reverse();

  for (const item of recentHistory) {
    if (item.role !== "assistant") {
      continue;
    }

    const content = normalizeIntentText(item.content);
    const intentId = getOfferedFollowUpIntentId(content);

    if (!intentId) {
      continue;
    }

    const intent = intentCatalog.find((entry) => entry.id === intentId);

    if (intent?.toolName) {
      return {
        ...intent,
        toolName: intent.toolName,
      };
    }
  }

  return null;
}

function getDeterministicCatalogIntent(
  normalized: string,
): (IntentCatalogEntry & { toolName: DeterministicAgentToolName }) | null {
  const intentId = getDeterministicIntentId(normalized);

  if (!intentId) {
    return null;
  }

  const intent = intentCatalog.find((entry) => entry.id === intentId);

  return intent?.toolName ? {
    ...intent,
    toolName: intent.toolName,
  } : null;
}

function getDeterministicIntentId(normalized: string): string | null {
  if (isConnectedAccountsPrompt(normalized)) {
    return "account.connected_accounts";
  }

  if (isRecentTransactionsPrompt(normalized)) {
    return "transactions.recent";
  }

  if (isRecurringActivityPrompt(normalized)) {
    return "recurring.activity";
  }

  if (isTrustReceiptPrompt(normalized)) {
    return "trust.receipt";
  }

  if (isDataQualityPrompt(normalized)) {
    return "data.quality";
  }

  if (isSyncStatusPrompt(normalized)) {
    return "sync.status";
  }

  if (isTrustPolicyPrompt(normalized)) {
    return "policy.trust";
  }

  if (isSpendableDefinitionPrompt(normalized)) {
    return "definition.spendable_cash";
  }

  if (isPaydayImpactPrompt(normalized)) {
    return "insight.payday_impact";
  }

  if (isSpendableFactorsPrompt(normalized)) {
    return "insight.spendable_factors";
  }

  if (isRecentSpendingPressurePrompt(normalized)) {
    return "spending.recent_pressure";
  }

  if (isPatternAssumptionsPrompt(normalized)) {
    return "spendable.pattern_assumptions";
  }

  return null;
}

function isActualBalancePrompt(normalized: string): boolean {
  if (!/\bbalances?\b/.test(normalized)) {
    return false;
  }

  if (/\bbalance transfer\b/.test(normalized)) {
    return false;
  }

  if (/\b(connected|linked|selected|using|used|count|counts|affect|add|connect|link|repair|reconnect|fix|remove|disconnect|unlink|institution)\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(account|accounts|bank|banks|checking|savings|available|current|true|real|actual)\b.{0,48}\bbalances?\b/.test(normalized) ||
    /\bbalances?\b.{0,48}\b(account|accounts|bank|banks|checking|savings|available|current)\b/.test(normalized) ||
    /\bwhat(?:'s| is)?\s+my\s+balances?\b/.test(normalized) ||
    /\bshow\b.{0,24}\bmy\b.{0,24}\bbalances?\b/.test(normalized) ||
    /\bhow much\b.{0,48}\b(have|checking|savings|account|bank)\b/.test(normalized) ||
    /\b(can'?t|cant|cannot)\b.{0,48}\bshow\b.{0,48}\bbalances?\b/.test(normalized)
  );
}

function isConnectedAccountsPrompt(normalized: string): boolean {
  if (/\bbalances?\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(connected|linked|selected)\s+(accounts?|banks?|cards?|institutions?)\b/.test(normalized) ||
    /\b(accounts?|banks?|cards?|institutions?)\b.{0,32}\b(connected|linked|selected|used)\b/.test(normalized) ||
    /\bwhat is pip using\b/.test(normalized) ||
    /\bwhat accounts (?:affect|count toward)\b/.test(normalized) ||
    /\bwhich accounts are used\b/.test(normalized) ||
    /\bshow accounts you can see\b/.test(normalized)
  );
}

function isRecentTransactionsPrompt(normalized: string): boolean {
  return (
    /\bwhat did i (?:buy|spend)\b.{0,32}\b(lately|recently|yesterday|this week|last week)?\b/.test(normalized) ||
    /\b(show|list|pull up|find)\b.{0,32}\b(recent|latest)\b.{0,20}\b(transactions?|charges?|purchases?|activity)\b/.test(normalized) ||
    /\bwhat charges hit\b/.test(normalized) ||
    /\bwhere did my money go yesterday\b/.test(normalized)
  );
}

function isRecurringActivityPrompt(normalized: string): boolean {
  return (
    /\b(subscriptions?|bills?|monthly charges?)\b.{0,36}\b(coming up|upcoming|repeat|recurring|every month)\b/.test(normalized) ||
    /\bwhat repeats every month\b/.test(normalized) ||
    /\b(show|list)\b.{0,24}\b(recurring|repeat|upcoming bills?|monthly charges?)\b/.test(normalized) ||
    /\byoutube premium\b.{0,24}\bcoming up\b/.test(normalized)
  );
}

function isDataQualityPrompt(normalized: string): boolean {
  if (/\b(refresh|sync now|delete)\b/.test(normalized)) {
    return false;
  }

  return /\b(data quality|missing (?:card|data|something)|data (?:is|might be|may be|could be) missing|what data (?:might|may|could) be missing|pending (?:transactions?|items?)|incomplete|everything counted)\b/.test(normalized);
}

function isTrustReceiptPrompt(normalized: string): boolean {
  if (/\b(refresh|sync now|delete)\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(trust receipt|can i trust|what data is counted|what does this include|when was this updated|number current|up to date)\b/.test(normalized) ||
    /\b(data|number|spendable cash|spendable cash today)\b.{0,32}\b(stale|fresh|current|up to date)\b/.test(normalized) ||
    /\b(stale|fresh|current|up to date)\b.{0,32}\b(data|number|spendable cash|spendable cash today)\b/.test(normalized)
  );
}

function isSyncStatusPrompt(normalized: string): boolean {
  return (
    /\bdid you refresh\b/.test(normalized) ||
    /\bwhen did this last sync\b/.test(normalized) ||
    /\bwhy is this not updating\b/.test(normalized) ||
    /\b(refresh|sync) status\b/.test(normalized) ||
    /\blast (?:refreshed|synced)\b/.test(normalized)
  );
}

function isTrustPolicyPrompt(normalized: string): boolean {
  return /\b(move my money|transfer my money|sell my data|train on my data|training data|who can see my data|plaid|financial advice|ai calculate|pay my bill|can pip pay|passwords?|tokens?)\b/.test(normalized);
}

function isSpendableDefinitionPrompt(normalized: string): boolean {
  return /\b(what is spendable cash|what does .*spendable cash.*mean|how does pip work|tell me how pip works|what makes it go up or down|what is spendable cash today)\b/.test(normalized);
}

function isPaydayImpactPrompt(normalized: string): boolean {
  return /\b(payday|paycheck|deposit|income)\b.{0,32}\b(affect|impact|change|changed)\b/.test(normalized);
}

function isSpendableFactorsPrompt(normalized: string): boolean {
  return /\b(factors? affect|what affects today|influences?|what changes spendable cash|which factors affect)\b/.test(normalized);
}

function isPatternAssumptionsPrompt(normalized: string): boolean {
  return /\b(pattern|baseline|assumptions|normal room|confidence)\b/.test(normalized);
}

function isRecentSpendingPressurePrompt(normalized: string): boolean {
  return (
    /\brecent spending\b.{0,40}\b(affect|pressure|hurt|hurting|pace)\b/.test(normalized) ||
    /\b(ahead of pace|under pattern|over pattern|spending pressure)\b/.test(normalized)
  );
}

function isAffirmativeFollowUp(normalized: string): boolean {
  return /^(yes|yeah|yep|ok|okay|sure|do that|yes do that|show me|yes show me|please do|that)$/.test(normalized);
}

function getOfferedFollowUpIntentId(normalizedAssistantMessage: string): string | null {
  if (/\b(forecast|trend line|daily amounts|tomorrow|next week|next few days|7 days|14 days)\b/.test(normalizedAssistantMessage)) {
    return "spendable.forecast";
  }

  if (/\b(recurring|repeat(?:ing)? items?|subscriptions?|upcoming bills?|bills? coming up)\b/.test(normalizedAssistantMessage)) {
    return "recurring.activity";
  }

  if (/\b(spending breakdown|breakdown|categories|merchants|card payments?|income sources?)\b/.test(normalizedAssistantMessage)) {
    return "spending.breakdown";
  }

  if (/\b(recent charges?|recent transactions?|recent purchases?|recent activity)\b/.test(normalizedAssistantMessage)) {
    return "transactions.recent";
  }

  if (/\b(show math|math breakdown|calculation|formula)\b/.test(normalizedAssistantMessage)) {
    return "math.breakdown";
  }

  return null;
}

function isPurchaseSimulationAmountPrompt(normalized: string): boolean {
  return (
    /\b(can|could|should|would|do you think|is|was)\b.{0,48}\b(spend|buy|purchase|order|afford|pay)\b/.test(normalized) ||
    /\b(spend|buy|purchase|order|afford|pay)\b.{0,48}\b(ok|okay|hurt|fit|fits|allowed|work)\b/.test(normalized) ||
    /\bwhy\b.{0,48}\b(can'?t|cannot|cant)\b.{0,48}\b(spend|buy|purchase|order|afford|pay)\b/.test(normalized) ||
    /\bwhat (?:does|would)\b.{0,32}\b(spending|buying|purchasing|ordering|paying)\b/.test(normalized)
  );
}

function isTransactionHistoryAmountPrompt(normalized: string): boolean {
  return (
    /\bwhat did i (?:spend|buy)\b/.test(normalized) ||
    /\b(show|list|find)\b.{0,32}\b(transactions?|charges?|purchases?|activity)\b/.test(normalized) ||
    /\bspend\b.{0,24}\bon\b/.test(normalized)
  );
}

function scoreCandidate(
  entry: IntentCatalogEntry,
  input: ResolveIntentRouteInput,
  normalized: string,
  slots: IntentSlots,
  mode: IntentRouterMode,
): IntentCandidate {
  const positiveMatches = getPhraseMatches(normalized, entry.positiveExamples);
  const negativeMatches = getPhraseMatches(normalized, entry.negativeExamples);
  const boostMatches = getPhraseMatches(normalized, entry.lexicalBoosts);
  const hardNegativeMatches = getPhraseMatches(normalized, entry.lexicalHardNegatives);
  const tokenScore = getExampleTokenScore(normalized, entry);
  const exactScore = positiveMatches.length > 0 ? 0.42 : 0;
  const boostScore = Math.min(0.38, boostMatches.length * 0.11);
  const slotScore = entry.requiredSlots?.every((slot) => slots[slot] !== undefined) ? 0.18 : 0;
  const negativePenalty = negativeMatches.length * 0.18 + hardNegativeMatches.length * 0.32;
  const priorityScore = entry.priority / 1000;
  const lexicalScore = clamp01(exactScore + boostScore + tokenScore + slotScore + priorityScore - negativePenalty);
  const stateScore = getStateScore(entry, input);
  const embeddingScore = mode === "hybrid" ? scoreIntentEmbedding(normalized, entry).score : null;
  const combinedScore = mode === "hybrid"
    ? clamp01(0.58 * lexicalScore + 0.28 * (embeddingScore ?? 0) + 0.14 * stateScore)
    : clamp01(0.86 * lexicalScore + 0.14 * stateScore);

  return {
    intentId: entry.id,
    lexicalScore,
    embeddingScore,
    stateScore,
    combinedScore,
    matchedPositiveExamples: positiveMatches,
    matchedNegativeExamples: [...negativeMatches, ...hardNegativeMatches],
    matchedLexicalBoosts: boostMatches,
    extractedSlots: slots,
  };
}

function getPhraseMatches(normalized: string, phrases: readonly string[]): string[] {
  return phrases.filter((phrase) => {
    const normalizedPhrase = normalizeIntentText(phrase);

    if (!normalizedPhrase) {
      return false;
    }

    return normalized.includes(normalizedPhrase) || normalizedPhrase.includes(normalized);
  });
}

function getExampleTokenScore(normalized: string, entry: IntentCatalogEntry): number {
  const inputTokens = getMeaningfulTokens(normalized);

  if (inputTokens.size === 0) {
    return 0;
  }

  const exampleScores = entry.positiveExamples.map((example) => {
    const exampleTokens = getMeaningfulTokens(example);
    const intersection = [...inputTokens].filter((token) => exampleTokens.has(token)).length;
    const denominator = Math.max(2, Math.min(inputTokens.size, exampleTokens.size));

    return intersection / denominator;
  });

  return Math.min(0.34, Math.max(0, ...exampleScores) * 0.34);
}

function getMeaningfulTokens(text: string): Set<string> {
  return new Set(
    normalizeIntentText(text)
      .replace(/\$?\d+(?:\.\d+)?/g, "$amount")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stopWords.has(token)),
  );
}

function getStateScore(entry: IntentCatalogEntry, input: ResolveIntentRouteInput): number {
  let score = 0;
  const lastCardType = input.shownCards?.at(-1)?.type;
  const lastToolName = input.lastToolNames?.at(-1);
  const recentAssistant = [...(input.history ?? [])].reverse().find((item) => item.role === "assistant")?.content ?? "";
  const selectedPromptChipId = input.selectedPromptChipId;
  const selectedIntent = selectedPromptChipId
    ? intentCatalog.find((candidate) => candidate.promptChipIds?.includes(selectedPromptChipId))
    : null;

  if (selectedIntent?.id === entry.id) {
    score += 0.9;
  }

  if (lastCardType && entry.cardTypes.includes(lastCardType as AgentCard["type"])) {
    score += 0.22;
  }

  if (lastToolName && entry.toolName === lastToolName) {
    score += 0.18;
  }

  if (entry.followUpParents.some((intentId) => recentAssistantMentionsIntent(recentAssistant, intentId))) {
    score += 0.2;
  }

  return clamp01(score);
}

function recentAssistantMentionsIntent(text: string, intentId: string): boolean {
  const normalized = normalizeIntentText(text);

  if (!normalized) {
    return false;
  }

  if (intentId.includes("forecast")) {
    return /\b(forecast|tomorrow|next week|next few days|trend)\b/.test(normalized);
  }

  if (intentId.includes("recurring")) {
    return /\b(recurring|subscriptions?|bills?|repeat)\b/.test(normalized);
  }

  if (intentId.includes("transactions")) {
    return /\b(transactions?|charges?|purchases?|activity)\b/.test(normalized);
  }

  if (intentId.includes("spending.breakdown")) {
    return /\b(breakdown|categories|merchants)\b/.test(normalized);
  }

  return false;
}

function buildArgs(entry: IntentCatalogEntry, slots: IntentSlots): Record<string, unknown> {
  return stripUndefinedValues({
    ...(entry.defaultArgs ?? {}),
    ...(entry.id === "purchase.simulation" ? { amount_cents: slots.amount_cents } : {}),
    ...(entry.id === "spendable.forecast" ? { horizon_days: slots.horizon_days ?? 14 } : {}),
    ...(entry.id === "provider.repair" ? { institution_name: slots.institution_name } : {}),
    ...(entry.id === "account.selection_update" ? { institution_name: slots.institution_name } : {}),
    ...(entry.id === "institution.remove_request" ? { institution_name: slots.institution_name } : {}),
    ...(entry.id === "institution.remove_confirmed" ? {
      institution_name: slots.institution_name,
      confirmation_text: slots.confirmation_text,
    } : {}),
    ...(entry.id === "data.delete_confirmed" ? { confirmation_text: slots.confirmation_text } : {}),
  });
}

function getRouteThreshold(entry: IntentCatalogEntry): number {
  if (entry.risk === "policy") {
    return 0.44;
  }

  if (entry.surface === "guidance") {
    return 0.48;
  }

  if (entry.id === "account.connected_accounts" || entry.id === "balances.actual_accounts") {
    return 0.52;
  }

  return 0.46;
}

function shouldRequireCard(entry: IntentCatalogEntry): boolean {
  return entry.surface !== "guidance" && entry.cardTypes.length > 0;
}

function getMarginThreshold(entry: IntentCatalogEntry): number {
  if (entry.id === "account.connected_accounts" || entry.id === "balances.actual_accounts") {
    return 0.05;
  }

  if (entry.surface === "policy_answer") {
    return 0.03;
  }

  return 0.04;
}

function buildClarificationQuestion(first: IntentCatalogEntry, second: IntentCatalogEntry | undefined): string {
  if (
    [first.id, second?.id].includes("balances.actual_accounts") &&
    [first.id, second?.id].includes("account.connected_accounts")
  ) {
    return "Do you want actual dollar balances, or the connected-account list?";
  }

  return "Which view do you want me to show?";
}

function getClarificationLabel(intentId: string): string {
  switch (intentId) {
    case "balances.actual_accounts":
      return "Actual balances";
    case "account.connected_accounts":
      return "Connected accounts";
    case "transactions.recent":
      return "Recent transactions";
    case "spending.breakdown":
      return "Spending breakdown";
    case "recurring.activity":
      return "Upcoming repeats";
    case "spendable.forecast":
      return "Forecast";
    default:
      return intentId;
  }
}

function isPolicyQuestion(normalized: string): boolean {
  return /\b(can pip move|move my money|financial advice|plaid|privacy|sell my data|ai calculate|training data)\b/.test(normalized);
}

function stripUndefinedValues(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
