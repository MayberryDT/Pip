import type { AgentCard, PromptChip } from "@/lib/agent/card-types";
import { resolveIntentConversationJob } from "@/lib/agent/intent-router";
import type { SyncStatus } from "@/lib/data/sync-status";
import { getSpendableCashTodayState } from "@/lib/pip-cash/spendable-cash-today";
import type { PipCashResult } from "@/lib/types";

export type ConversationHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type ConversationJob =
  | "home"
  | "explain_number"
  | "purchase_test"
  | "forecast"
  | "recurring_activity"
  | "recent_transactions"
  | "spending_breakdown"
  | "math"
  | "true_balances"
  | "data_quality"
  | "financial_guidance"
  | "savings_goal"
  | "definition"
  | "setup"
  | "broad_chat"
  | "duplicate_follow_up";

export type ConversationStateInput = {
  message: string;
  history?: ConversationHistoryItem[];
  shownCards?: Array<{
    type: AgentCard["type"] | string;
    title?: string;
  }>;
  lastToolNames?: string[];
  promptChips?: PromptChip[];
  selectedPromptChipId?: string;
  responseCards?: AgentCard[];
  responseToolNames?: string[];
  result?: PipCashResult | null;
  syncStatus?: SyncStatus | null;
  onboardingState?: {
    status: "guest" | "needs-consent" | "ready";
    hasFinancialData: boolean;
  };
};

export type ConversationStateSummary = {
  currentJob: ConversationJob;
  lastAnsweredJob: ConversationJob | null;
  lastCardType: AgentCard["type"] | string | null;
  lastToolName: string | null;
  selectedPromptChipId: string | null;
  duplicateFollowUp: boolean;
  repeatedJob: boolean;
  repeatedTool: boolean;
  repeatedCard: boolean;
  recentJobs: ConversationJob[];
  recentChipKeys: string[];
  recentAssistantMessage: string | null;
  onboardingStatus: "guest" | "needs-consent" | "ready" | null;
  hasFinancialResult: boolean;
  isNegativeSpendableCash: boolean;
  hasMissingCardWarning: boolean;
  hasPendingDataState: boolean;
  hasStaleSync: boolean;
};

const cardJobByType: Partial<Record<AgentCard["type"], ConversationJob>> = {
  pip_cash_explanation: "explain_number",
  insight_card: "explain_number",
  guidance_card: "financial_guidance",
  purchase_simulation: "purchase_test",
  spendable_cash_forecast: "forecast",
  recurring_activity: "recurring_activity",
  recent_transactions: "recent_transactions",
  spending_breakdown: "spending_breakdown",
  math_breakdown: "math",
  true_balances: "true_balances",
  trust_receipt: "data_quality",
  missing_card_nudge: "data_quality",
  connect_account: "data_quality",
  savings_goal_plan: "savings_goal",
  savings_goals_summary: "savings_goal",
};

const toolJobByName: Record<string, ConversationJob> = {
  get_pip_cash_snapshot: "explain_number",
  get_financial_guidance_context: "financial_guidance",
  get_pip_cash_drivers: "explain_number",
  compose_insight_card: "explain_number",
  get_pattern_assumptions: "explain_number",
  get_recent_spending_pressure: "explain_number",
  simulate_purchase: "purchase_test",
  forecast_spendable_cash: "forecast",
  get_recurring_activity: "recurring_activity",
  get_recent_transactions: "recent_transactions",
  get_spending_breakdown: "spending_breakdown",
  get_pip_cash_math: "math",
  get_true_balances: "true_balances",
  get_data_quality: "data_quality",
  get_sync_status: "data_quality",
  get_trust_receipt: "data_quality",
  get_trust_policy: "data_quality",
  get_spendable_cash_definition: "definition",
  get_onboarding_state: "setup",
  get_connected_accounts: "setup",
  start_google_oauth: "setup",
  save_protected_savings: "setup",
  start_plaid_link: "setup",
  start_new_account_connection: "setup",
  repair_account_connection: "setup",
  start_account_selection_update: "setup",
  set_account_inclusion: "setup",
  set_account_protected_savings: "setup",
  request_remove_institution_confirmation: "setup",
  remove_institution: "setup",
  create_savings_goal: "savings_goal",
  list_savings_goals: "savings_goal",
  update_savings_goal: "savings_goal",
  set_savings_goal_protection: "savings_goal",
  refresh_financial_data: "setup",
  request_delete_data_confirmation: "setup",
  delete_user_data: "setup",
};

const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "for",
  "i",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
  "you",
  "your",
]);

export function summarizeConversationState(
  input: ConversationStateInput,
): ConversationStateSummary {
  const responseJob = inferJobFromResponse(input.responseCards, input.responseToolNames);
  const messageJob = inferConversationJob(input.message, input.history);
  const currentJob = responseJob ?? messageJob;
  const lastCardType = input.shownCards?.at(-1)?.type ?? null;
  const lastToolName = input.lastToolNames?.at(-1) ?? null;
  const lastAnsweredJob = inferJobFromCardType(lastCardType) ?? inferJobFromToolName(lastToolName);
  const nextToolName = input.responseToolNames?.at(-1) ?? null;
  const nextCardType = input.responseCards?.at(-1)?.type ?? null;
  const duplicateFollowUp = isDuplicateFollowUp(input.message, input.history, lastAnsweredJob);
  const addsNewInformation = messageAddsNewInformation(input.message);

  const spendableState = input.result ? getSpendableCashTodayState(input.result) : null;
  const warnings = [
    ...(input.result?.warnings ?? []),
    ...(input.result?.spendableCashToday?.warnings ?? []),
  ];
  const dataStates = [
    ...(input.result?.dataStates ?? []),
    ...(input.result?.spendableCashToday?.dataStates ?? []),
  ];

  return {
    currentJob,
    lastAnsweredJob,
    lastCardType,
    lastToolName,
    selectedPromptChipId: input.selectedPromptChipId ?? null,
    duplicateFollowUp,
    repeatedJob: Boolean(lastAnsweredJob && currentJob === lastAnsweredJob && !addsNewInformation),
    repeatedTool: Boolean(nextToolName && nextToolName === lastToolName && !addsNewInformation),
    repeatedCard: Boolean(nextCardType && nextCardType === lastCardType && !explicitlyRequestsRepeat(input.message)),
    recentJobs: getRecentJobs(input),
    recentChipKeys: (input.promptChips ?? []).flatMap((chip) => [
      normalizeText(chip.id),
      normalizeText(chip.label),
      normalizeText(chip.prompt),
    ]),
    recentAssistantMessage: getRecentAssistantMessage(input.history),
    onboardingStatus: input.onboardingState?.status ?? null,
    hasFinancialResult: Boolean(input.result),
    isNegativeSpendableCash: spendableState === "shortfall",
    hasMissingCardWarning: warnings.some((warning) => warning.id === "missing-card"),
    hasPendingDataState: dataStates.some((state) => state.id === "pending-transactions"),
    hasStaleSync: Boolean(input.syncStatus?.hasStaleInstitution || input.syncStatus?.latestSyncRun?.status === "failed"),
  };
}

export function inferConversationJob(
  message: string,
  history?: ConversationHistoryItem[],
): ConversationJob {
  const normalized = normalizeText(message);

  if (!normalized) {
    return "home";
  }

  const catalogJob = resolveIntentConversationJob(message, history);

  if (catalogJob) {
    return catalogJob;
  }

  if (isSetupPrompt(normalized)) {
    return "setup";
  }

  if (isDataQualityPrompt(normalized)) {
    return "data_quality";
  }

  if (isMathPrompt(normalized)) {
    return "math";
  }

  if (isBalancesPrompt(normalized)) {
    return "true_balances";
  }

  if (isTransactionsPrompt(normalized)) {
    return "recent_transactions";
  }

  if (isRecurringPrompt(normalized)) {
    return "recurring_activity";
  }

  if (isForecastPrompt(normalized)) {
    return "forecast";
  }

  if (isSpendingBreakdownPrompt(normalized)) {
    return "spending_breakdown";
  }

  if (isPurchasePrompt(normalized, history)) {
    return "purchase_test";
  }

  if (isSavingsGoalPrompt(normalized)) {
    return "savings_goal";
  }

  if (isFinancialGuidancePrompt(normalized)) {
    return "financial_guidance";
  }

  if (isDefinitionPrompt(normalized)) {
    return "definition";
  }

  if (isExplainNumberPrompt(normalized)) {
    return "explain_number";
  }

  if (isShortDuplicateFollowUp(normalized)) {
    return "duplicate_follow_up";
  }

  return "broad_chat";
}

export function getVisibleMessageSimilarity(left: string, right: string): number {
  const leftTokens = getMeaningfulTokens(left);
  const rightTokens = getMeaningfulTokens(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return intersection / union;
}

export function isVisibleMessageRepetitive(input: {
  candidate: string;
  history?: ConversationHistoryItem[];
  threshold?: number;
}): boolean {
  const recentAssistantMessage = getRecentAssistantMessage(input.history);

  if (!recentAssistantMessage) {
    return false;
  }

  const candidateKey = normalizeText(input.candidate);
  const recentKey = normalizeText(recentAssistantMessage);

  if (candidateKey === recentKey) {
    return true;
  }

  return getVisibleMessageSimilarity(input.candidate, recentAssistantMessage) >= (input.threshold ?? 0.82);
}

export function normalizeText(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/[^a-z0-9$.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferJobFromResponse(
  cards: AgentCard[] | undefined,
  toolNames: string[] | undefined,
): ConversationJob | null {
  return inferJobFromCardType(cards?.at(-1)?.type ?? null) ?? inferJobFromToolName(toolNames?.at(-1) ?? null);
}

function inferJobFromCardType(cardType: string | null | undefined): ConversationJob | null {
  if (!cardType || !(cardType in cardJobByType)) {
    return null;
  }

  return cardJobByType[cardType as AgentCard["type"]] ?? null;
}

function inferJobFromToolName(toolName: string | null | undefined): ConversationJob | null {
  return toolName ? toolJobByName[toolName] ?? null : null;
}

function getRecentJobs(input: ConversationStateInput): ConversationJob[] {
  const jobs = [
    ...(input.shownCards ?? []).map((card) => inferJobFromCardType(card.type)),
    ...(input.lastToolNames ?? []).map((toolName) => inferJobFromToolName(toolName)),
    ...(input.promptChips ?? []).map((chip) => inferConversationJob(chip.prompt, input.history)),
  ].filter((job): job is ConversationJob => Boolean(job) && job !== "broad_chat");

  return [...new Set(jobs)].slice(-8);
}

function isSetupPrompt(normalized: string): boolean {
  return /\b(sign|signed|signup|start|continue|connect|plaid|google|consent|monthly savings|savings cushion|protected savings|delete data|refresh|sync|reload)\b/.test(normalized);
}

function isDataQualityPrompt(normalized: string): boolean {
  return /\b(missing card|card missing|missing data|data missing|repair data|stale data|data quality|pending transactions?|pending items?)\b/.test(normalized);
}

function isMathPrompt(normalized: string): boolean {
  return /\b(math|formula|calculation|calculated)\b/.test(normalized);
}

function isBalancesPrompt(normalized: string): boolean {
  return /\b(true|real|actual|account)?\s*balances?\b/.test(normalized);
}

function isTransactionsPrompt(normalized: string): boolean {
  return /\b(transactions?|charges?|purchases?|recent activity|recent items?)\b/.test(normalized);
}

function isRecurringPrompt(normalized: string): boolean {
  return /\b(recurring|repeating|repeat|subscriptions?|upcoming bills?|bills? (are )?coming up|monthly charges?)\b/.test(normalized);
}

function isForecastPrompt(normalized: string): boolean {
  return /\b(forecast|project|projection|trend|tomorrow|next day|next week|next few days|next \d+\s*days?|coming days?)\b/.test(normalized);
}

function isSpendingBreakdownPrompt(normalized: string): boolean {
  return /\b(breakdown|categories|merchants|income sources?|card payments?)\b/.test(normalized);
}

function isPurchasePrompt(normalized: string, history: ConversationHistoryItem[] | undefined): boolean {
  if (/\b(spend|buy|purchase|order|afford|pay|cost)\b/.test(normalized)) {
    return true;
  }

  if (!/\b(what about|how about|instead|rather|\$\s*\d|\d+\s*(dollars?|bucks?))\b/.test(normalized)) {
    return false;
  }

  return (history ?? [])
    .slice(-4)
    .some((item) => item.role === "user" && /\b(spend|buy|purchase|order|afford|pay|cost)\b/.test(normalizeText(item.content)));
}

function isSavingsGoalPrompt(normalized: string): boolean {
  return /\bsavings? goals?\b/.test(normalized) ||
    /\bsave\b.{0,32}\b(for|toward|towards)\b/.test(normalized) ||
    /\b(for|toward|towards)\b.{0,32}\b(trip|vacation|travel|car|house|home|wedding|emergency fund|big purchase)\b/.test(normalized) ||
    /\b(trip|vacation|travel|car|house|home|wedding|emergency fund|big purchase)\b.{0,40}\b(cost|costs|goal|save|saving|target)\b/.test(normalized) ||
    /^(trip|vacation|travel|car|house|home|wedding|emergency fund|big purchase)$/.test(normalized);
}

function isFinancialGuidancePrompt(normalized: string): boolean {
  return /\b(what do you think|how am i doing|give me advice|any advice|what should i do|am i okay|is this bad|what would you do|help me fix this|how do i improve|am i spending too much|am i broke|why am i broke|should i lower my monthly savings|should i lower my cushion|should i save more|should i stop spending|what'?s your read|my read)\b/.test(normalized);
}

function isDefinitionPrompt(normalized: string): boolean {
  return /\b(how does pip work|how pip works|what is spendable cash|what does .*spendable cash.*mean|what makes .*go up|what makes .*go down)\b/.test(normalized);
}

function isExplainNumberPrompt(normalized: string): boolean {
  return (
    normalized === "why" ||
    normalized === "but why" ||
    /\b(why|drivers?|factors?|explain|behind|changed|affect|impact)\b/.test(normalized) &&
      /\b(today|number|spendable cash|money|payday|paycheck|deposit|income)\b/.test(normalized)
  );
}

function isShortDuplicateFollowUp(normalized: string): boolean {
  return /^(why|but why|again|same|what about that|what about this|that|yes|yeah|yep|ok|okay|sure|show me)$/.test(normalized);
}

function isDuplicateFollowUp(
  message: string,
  history: ConversationHistoryItem[] | undefined,
  lastAnsweredJob: ConversationJob | null,
): boolean {
  return Boolean(lastAnsweredJob && isShortDuplicateFollowUp(normalizeText(message)) && (history ?? []).length > 0);
}

function messageAddsNewInformation(message: string): boolean {
  return (
    explicitlyRequestsRepeat(message) ||
    /\$?\s*\d+|\b(tomorrow|next week|next few days|transactions?|charges?|balances?|math|bills?|subscriptions?)\b/i.test(message)
  );
}

function explicitlyRequestsRepeat(message: string): boolean {
  return /\b(again|show|resurface|repeat|details?|breakdown|card)\b/i.test(message);
}

function getRecentAssistantMessage(history: ConversationHistoryItem[] | undefined): string | null {
  return (history ?? []).filter((item) => item.role === "assistant").at(-1)?.content ?? null;
}

function getMeaningfulTokens(text: string): Set<string> {
  const normalized = normalizeText(text).replace(/\$?\d+(?:\.\d+)?/g, "$amount");
  const tokens = normalized
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));

  return new Set(tokens);
}
