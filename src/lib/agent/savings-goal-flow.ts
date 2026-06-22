import { z } from "zod";
import type {
  AgentCard,
  AgentPendingAction,
  AgentResponse,
  PromptChip,
  SavingsGoalPendingField,
} from "@/lib/agent/card-types";
import { agentResponseSchema } from "@/lib/agent/response-schema";
import {
  getOnboardingPromptChips,
  getSuggestedPrompts,
} from "@/lib/agent/suggested-prompts";
import type { DeterministicAgentToolName } from "@/lib/agent/intent-catalog";
import { fakeSnapshot } from "@/lib/fake-data";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { formatMoney } from "@/lib/money";
import type { RunAiAgentInput } from "@/lib/agent/ai-agent";

export type SavingsGoalToolName = Extract<
  DeterministicAgentToolName,
  | "preview_savings_goal"
  | "create_savings_goal"
  | "list_savings_goals"
  | "update_savings_goal"
>;

export type SavingsGoalForcedTool = {
  toolName: SavingsGoalToolName;
  args: unknown;
  requireCard: boolean;
};

const savingsGoalTargetParameters = z.object({
  goal_id: z.string().min(1).max(120).optional(),
  name: z.string().min(1).max(80).optional(),
});
export const createSavingsGoalParameters = z.object({
  name: z.string().trim().min(1).max(80),
  target_amount_cents: z.number().int().positive().max(100_000_000),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  starting_amount_cents: z.number().int().min(0).max(100_000_000).optional(),
  current_amount_cents: z.number().int().min(0).max(100_000_000).optional(),
  monthly_contribution_cents: z.number().int().min(0).max(100_000_000).optional(),
  include_in_spendable_cash: z.boolean().optional(),
});
export const updateSavingsGoalParameters = savingsGoalTargetParameters.extend({
  target_amount_cents: z.number().int().positive().max(100_000_000).optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  current_amount_cents: z.number().int().min(0).max(100_000_000).optional(),
  monthly_contribution_cents: z.number().int().min(0).max(100_000_000).optional(),
  include_in_spendable_cash: z.boolean().optional(),
  status: z.enum(["active", "paused", "completed", "archived"]).optional(),
});
export function createDeterministicUnavailableActionResponse(input: RunAiAgentInput): AgentResponse | null {
  const forcedTool = getSavingsGoalForcedTool(input.message.trim(), normalizePrompt(input.message.trim()));

  if (!forcedTool || !isSavingsGoalToolName(forcedTool.toolName)) {
    return null;
  }

  if (hasSavingsGoalAction(input, forcedTool.toolName)) {
    return null;
  }

  const onboardingState = input.onboardingState ?? {
    status: "ready" as const,
    hasFinancialData: false,
  };
  const message = onboardingState.status === "guest"
    ? "I can help set that up after you sign in."
    : onboardingState.status === "needs-consent"
      ? "Finish setup first, then I can help with savings goals."
      : "Savings goals are not available yet.";

  return agentResponseSchema.parse({
    message,
    cards: [],
    promptChips: getOnboardingPromptChips(onboardingState),
    usedTools: [forcedTool.toolName],
    responseMode: "chat_only",
    audit: {
      toolNames: [forcedTool.toolName],
      usedModel: false,
    },
  });
}

export async function createDeterministicSavingsGoalResponse(input: RunAiAgentInput): Promise<AgentResponse | null> {
  const normalized = normalizePrompt(input.message);
  const pendingAction = input.conversationState?.pendingAction;
  const forcedTool = getSavingsGoalForcedTool(input.message.trim(), normalized);

  if (pendingAction?.type === "create_savings_goal") {
    return createSavingsGoalDraftResponse(input, pendingAction);
  }

  if (forcedTool?.toolName === "update_savings_goal") {
    return updateSavingsGoalDeterministically(input, forcedTool.args);
  }

  if (isSavingsGoalContextProgressPrompt(normalized)) {
    return listSavingsGoalsDeterministically(input);
  }

  if (!isSavingsGoalPrompt(normalized)) {
    return null;
  }

  if (isSavingsGoalListPrompt(normalized)) {
    return listSavingsGoalsDeterministically(input);
  }

  if (!isSavingsGoalCreatePrompt(normalized)) {
    return null;
  }

  return createSavingsGoalDraftResponse(input, undefined);
}

async function updateSavingsGoalDeterministically(
  input: RunAiAgentInput,
  args: SavingsGoalForcedTool["args"],
): Promise<AgentResponse | null> {
  if (!input.actions?.updateSavingsGoal) {
    return null;
  }

  const toolInput = updateSavingsGoalParameters.parse(args);
  const result = await input.actions.updateSavingsGoal({
    goalId: toolInput.goal_id,
    name: toolInput.name,
    targetAmountCents: toolInput.target_amount_cents,
    targetDate: toolInput.target_date,
    currentAmountCents: toolInput.current_amount_cents,
    monthlyContributionCents: toolInput.monthly_contribution_cents,
    includeInSpendableCash: toolInput.include_in_spendable_cash,
    status: toolInput.status,
  });
  const cards = result.cards ?? [];

  return agentResponseSchema.parse({
    message: result.ok
      ? getSavingsGoalUpdatedMessage(cards)
      : result.message ?? "I could not update that savings goal yet.",
    cards,
    promptChips: createDeterministicTrustPromptChips(input),
    usedTools: ["update_savings_goal"],
    responseMode: cards.length > 0 ? "show_card" : "chat_only",
    ...(result.clientAction ? { clientAction: result.clientAction } : {}),
    audit: {
      toolNames: ["update_savings_goal"],
      usedModel: false,
    },
  });
}

async function createSavingsGoalDraftResponse(
  input: RunAiAgentInput,
  pendingAction: Extract<AgentPendingAction, { type: "create_savings_goal" }> | undefined,
): Promise<AgentResponse> {
  const draft = mergeSavingsGoalDraft(input.message, pendingAction);
  const missing = getMissingSavingsGoalFields(draft);
  const onboardingState = input.onboardingState ?? {
    status: "ready" as const,
    hasFinancialData: false,
  };
  const hasPendingDraft = Boolean(pendingAction);

  if (hasPendingDraft && isSavingsGoalCancelPrompt(input.message)) {
    return agentResponseSchema.parse({
      message: "No problem. I will leave that savings goal uncreated.",
      cards: [],
      promptChips: createDeterministicTrustPromptChips(input),
      usedTools: [],
      responseMode: "chat_only",
      audit: {
        toolNames: [],
        usedModel: false,
      },
    });
  }

  if (missing.includes("target_amount")) {
    return agentResponseSchema.parse({
      message: `How much do you want to save for ${formatSavingsGoalNameForPrompt(draft.name)}?`,
      cards: [],
      promptChips: createDeterministicTrustPromptChips(input),
      usedTools: [],
      responseMode: "clarify",
      pendingAction: {
        ...draft,
        missing,
      },
      audit: {
        toolNames: [],
        usedModel: false,
      },
    });
  }

  const hasCompletePendingDraft = hasPendingDraft && missing.length === 0;

  if (onboardingState.status === "guest" && !input.actions?.createSavingsGoal) {
    return agentResponseSchema.parse({
      message: "I can help set that up after you sign in.",
      cards: [],
      promptChips: getOnboardingPromptChips(onboardingState),
      usedTools: ["create_savings_goal"],
      responseMode: "chat_only",
      pendingAction: {
        ...draft,
        missing: [],
      },
      audit: {
        toolNames: ["create_savings_goal"],
        usedModel: false,
      },
    });
  }

  if (!input.actions?.createSavingsGoal) {
    return agentResponseSchema.parse({
      message: "Savings goals are not available yet. I kept the goal details here so we can try again.",
      cards: [],
      promptChips: getOnboardingPromptChips(onboardingState),
      usedTools: ["create_savings_goal"],
      responseMode: "chat_only",
      pendingAction: {
        ...draft,
        missing: [],
      },
      audit: {
        toolNames: ["create_savings_goal"],
        usedModel: false,
      },
    });
  }

  if (hasCompletePendingDraft && !isSavingsGoalConfirmationPrompt(input.message)) {
    return agentResponseSchema.parse({
      message: `I can create ${formatSavingsGoalNameForPrompt(draft.name)} for ${formatMoney(draft.targetAmountCents ?? 0)}. Create it now?`,
      cards: [],
      promptChips: createDeterministicTrustPromptChips(input),
      usedTools: [],
      responseMode: "clarify",
      pendingAction: {
        ...draft,
        missing: [],
      },
      audit: {
        toolNames: [],
        usedModel: false,
      },
    });
  }

  const targetAmountCents = draft.targetAmountCents;

  if (!targetAmountCents) {
    return agentResponseSchema.parse({
      message: `How much do you want to save for ${formatSavingsGoalNameForPrompt(draft.name)}?`,
      cards: [],
      promptChips: createDeterministicTrustPromptChips(input),
      usedTools: [],
      responseMode: "clarify",
      pendingAction: {
        ...draft,
        missing: ["target_amount"],
      },
      audit: {
        toolNames: [],
        usedModel: false,
      },
    });
  }

  const result = await input.actions.createSavingsGoal({
    name: draft.name,
    targetAmountCents,
    targetDate: draft.targetDate,
    startingAmountCents: draft.startingAmountCents,
    currentAmountCents: draft.currentAmountCents,
    monthlyContributionCents: draft.monthlyContributionCents,
    includeInSpendableCash: draft.includeInSpendableCash,
  });

  if (!result.ok) {
    return agentResponseSchema.parse({
      message: result.message ?? "I could not save that goal yet. I kept the details so we can try again.",
      cards: result.cards ?? [],
      promptChips: getOnboardingPromptChips(onboardingState),
      usedTools: ["create_savings_goal"],
      responseMode: result.cards?.length ? "show_card" : "chat_only",
      pendingAction: {
        ...draft,
        missing: [],
      },
      audit: {
        toolNames: ["create_savings_goal"],
        usedModel: false,
      },
    });
  }

  const cards = result.cards ?? [];

  return agentResponseSchema.parse({
    message: getSavingsGoalCreatedMessage(cards, draft),
    cards,
    promptChips: getOnboardingPromptChips(onboardingState),
    usedTools: ["create_savings_goal"],
    responseMode: cards.length > 0 ? "show_card" : "chat_only",
    ...(result.clientAction ? { clientAction: result.clientAction } : {}),
    audit: {
      toolNames: ["create_savings_goal"],
      usedModel: false,
    },
  });
}

async function listSavingsGoalsDeterministically(input: RunAiAgentInput): Promise<AgentResponse | null> {
  if (!input.actions?.listSavingsGoals) {
    return null;
  }

  const result = await input.actions.listSavingsGoals();
  const cards = result.cards ?? [];

  return agentResponseSchema.parse({
    message: result.ok
      ? getSavingsGoalListMessage(cards)
      : result.message ?? "I do not see a saved savings goal yet. Tell me what you want to save for and the target amount.",
    cards,
    promptChips: createDeterministicTrustPromptChips(input),
    usedTools: ["list_savings_goals"],
    responseMode: cards.length > 0 ? "show_card" : "chat_only",
    ...(result.clientAction ? { clientAction: result.clientAction } : {}),
    audit: {
      toolNames: ["list_savings_goals"],
      usedModel: false,
    },
  });
}

function mergeSavingsGoalDraft(
  message: string,
  pendingAction: Extract<AgentPendingAction, { type: "create_savings_goal" }> | undefined,
): Extract<AgentPendingAction, { type: "create_savings_goal" }> {
  const normalized = normalizePrompt(message);
  const pendingTargetAmountCents = pendingAction?.targetAmountCents;
  const updatedTargetAmountCents =
    extractSavingsGoalAmountCents(message) ??
    (pendingAction ? extractBareSavingsGoalAmountCents(message) : null);
  const targetAmountCents = updatedTargetAmountCents ?? pendingTargetAmountCents;
  const monthlyContributionCents = extractMonthlyContributionCents(message) ?? pendingAction?.monthlyContributionCents;
  const targetDate = parseSavingsGoalTargetDate(message, getAgentAsOfDate()) ?? pendingAction?.targetDate;
  const inferredName = inferSavingsGoalName(message, normalized);
  const name = pendingAction?.name && pendingAction.name !== "Savings goal"
    ? pendingAction.name
    : inferredName;

  return {
    type: "create_savings_goal",
    name,
    ...(targetAmountCents === undefined || targetAmountCents === null ? {} : { targetAmountCents }),
    ...(targetDate ? { targetDate } : {}),
    ...(pendingAction?.startingAmountCents === undefined ? {} : { startingAmountCents: pendingAction.startingAmountCents }),
    ...(pendingAction?.currentAmountCents === undefined ? {} : { currentAmountCents: pendingAction.currentAmountCents }),
    ...(monthlyContributionCents === undefined || monthlyContributionCents === null ? {} : { monthlyContributionCents }),
    includeInSpendableCash: pendingAction?.includeInSpendableCash ?? true,
  };
}

function getMissingSavingsGoalFields(
  draft: Extract<AgentPendingAction, { type: "create_savings_goal" }>,
): SavingsGoalPendingField[] {
  return draft.targetAmountCents ? [] : ["target_amount"];
}

function getSavingsGoalCreatedMessage(
  cards: AgentCard[],
  draft: Extract<AgentPendingAction, { type: "create_savings_goal" }>,
): string {
  const planCard = cards.find((card): card is Extract<AgentCard, { type: "savings_goal_plan" }> =>
    card.type === "savings_goal_plan"
  );

  if (!planCard) {
    return `I saved ${formatMoney(draft.targetAmountCents ?? 0)} for ${formatSavingsGoalNameForPrompt(draft.name)}.`;
  }

  return `I saved the ${planCard.name} savings goal. ${formatMoney(planCard.remainingCents)} left to track in Pip.`;
}

function getSavingsGoalListMessage(cards: AgentCard[]): string {
  const summaryCard = cards.find((card): card is Extract<AgentCard, { type: "savings_goals_summary" }> =>
    card.type === "savings_goals_summary"
  );

  if (!summaryCard) {
    return "I checked your savings goals.";
  }

  if (summaryCard.activeGoalCount === 0) {
    return "I do not see a saved savings goal yet. Tell me what you want to save for and the target amount.";
  }

  const goal = summaryCard.goals[0];

  if (!goal) {
    return "I checked your savings goals.";
  }

  return `${goal.name}: ${formatMoney(goal.remainingCents)} left to track in Pip.`;
}

function getSavingsGoalUpdatedMessage(cards: AgentCard[]): string {
  const planCard = cards.find((card): card is Extract<AgentCard, { type: "savings_goal_plan" }> =>
    card.type === "savings_goal_plan"
  );

  if (!planCard) {
    return "I updated the savings goal.";
  }

  return `${planCard.name}: ${formatMoney(planCard.remainingCents)} left to track in Pip.`;
}

function formatSavingsGoalNameForPrompt(name: string): string {
  return name.trim() || "that goal";
}

function parseSavingsGoalTargetDate(message: string, asOfDate: string): string | null {
  const monthPattern =
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i;
  const monthMatch = monthPattern.exec(message);

  if (monthMatch) {
    const year = monthMatch[3] ? Number(monthMatch[3]) : undefined;

    return buildFutureDate(Number(monthNameToMonthNumber(monthMatch[1])), Number(monthMatch[2]), asOfDate, year);
  }

  const numericMatch = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(message);

  if (numericMatch) {
    const month = Number(numericMatch[1]);
    const day = Number(numericMatch[2]);
    const year = numericMatch[3] ? normalizeYear(Number(numericMatch[3])) : undefined;

    return buildFutureDate(month, day, asOfDate, year);
  }

  const monthYearMatch =
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{4})\b/i.exec(message);

  if (monthYearMatch) {
    return buildMonthEndDate(Number(monthNameToMonthNumber(monthYearMatch[1])), Number(monthYearMatch[2]), asOfDate);
  }

  const bareMonthMatch =
    /\b(?:by|in|before|around)?\s*(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b(?!\s+\d)/i.exec(message);

  if (bareMonthMatch) {
    return buildFutureMonthEndDate(monthNameToMonthNumber(bareMonthMatch[1]), asOfDate);
  }

  const yearEndMatch = /\b(?:by\s+)?end of\s+(\d{4})\b/i.exec(message) ?? /\bby\s+(\d{4})\b/i.exec(message);

  if (yearEndMatch) {
    return buildYearEndDate(Number(yearEndMatch[1]), asOfDate);
  }

  const relativeMatch = /\bin\s+(\d{1,2})\s+(days?|weeks?|months?|years?)\b/i.exec(message);

  if (relativeMatch) {
    return buildRelativeFutureDate(Number(relativeMatch[1]), relativeMatch[2], asOfDate);
  }

  return null;
}

function monthNameToMonthNumber(value: string): number {
  const normalized = value.toLowerCase();
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.findIndex((month) => normalized.startsWith(month));

  return index + 1;
}

function normalizeYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function buildFutureDate(month: number, day: number, asOfDate: string, explicitYear?: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const asOf = parseDateParts(asOfDate);
  let year = explicitYear ?? asOf.year;
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  if (!explicitYear && candidate.getTime() < Date.UTC(asOf.year, asOf.month - 1, asOf.day)) {
    year += 1;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildMonthEndDate(month: number, year: number, asOfDate: string): string | null {
  if (month < 1 || month > 12 || year < 1900 || year > 2100) {
    return null;
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return buildFutureDate(month, lastDay, asOfDate, year);
}

function buildFutureMonthEndDate(month: number, asOfDate: string): string | null {
  const asOf = parseDateParts(asOfDate);
  const currentYearEnd = buildMonthEndDate(month, asOf.year, asOfDate);

  if (!currentYearEnd) {
    return null;
  }

  return Date.parse(`${currentYearEnd}T00:00:00.000Z`) < Date.UTC(asOf.year, asOf.month - 1, asOf.day)
    ? buildMonthEndDate(month, asOf.year + 1, asOfDate)
    : currentYearEnd;
}

function buildYearEndDate(year: number, asOfDate: string): string | null {
  if (year < 1900 || year > 2100) {
    return null;
  }

  return buildFutureDate(12, 31, asOfDate, year);
}

function buildRelativeFutureDate(amount: number, unit: string, asOfDate: string): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const asOf = parseDateParts(asOfDate);
  const date = new Date(Date.UTC(asOf.year, asOf.month - 1, asOf.day));
  const normalizedUnit = unit.toLowerCase();

  if (normalizedUnit.startsWith("day")) {
    date.setUTCDate(date.getUTCDate() + amount);
  } else if (normalizedUnit.startsWith("week")) {
    date.setUTCDate(date.getUTCDate() + amount * 7);
  } else if (normalizedUnit.startsWith("month")) {
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + amount);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  } else if (normalizedUnit.startsWith("year")) {
    date.setUTCFullYear(date.getUTCFullYear() + amount);
  } else {
    return null;
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function parseDateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return { year, month, day };
}

function getAgentAsOfDate(): string {
  return process.env.PIP_APP_DATE || "2026-06-19";
}

function isSavingsGoalContextProgressPrompt(normalized: string): boolean {
  if (/\b(save|saving|set up|start|create|add|track)\b/.test(normalized)) {
    return false;
  }

  return /\b(how much|what|show|update|progress|on track|left|remaining|need)\b/.test(normalized) &&
    /\b(that goal|the goal|my goal|goal|savings goal|japan|trip|vacation|big purchase)\b/.test(normalized);
}

export function isSavingsGoalToolName(toolName: DeterministicAgentToolName): boolean {
  return [
    "preview_savings_goal",
    "create_savings_goal",
    "list_savings_goals",
    "update_savings_goal",
  ].includes(toolName);
}

export function hasSavingsGoalAction(input: RunAiAgentInput, toolName: DeterministicAgentToolName): boolean {
  switch (toolName) {
    case "preview_savings_goal":
      return true;
    case "create_savings_goal":
      return Boolean(input.actions?.createSavingsGoal);
    case "list_savings_goals":
      return Boolean(input.actions?.listSavingsGoals);
    case "update_savings_goal":
      return Boolean(input.actions?.updateSavingsGoal);
    default:
      return false;
  }
}

export function createDeterministicTrustPromptChips(input: RunAiAgentInput): PromptChip[] {
  const snapshot = input.snapshot ?? (input.onboardingState ? undefined : fakeSnapshot);

  if (snapshot) {
    return getSuggestedPrompts(calculatePipCash(snapshot));
  }

  return getOnboardingPromptChips(input.onboardingState ?? {
    status: "ready",
    hasFinancialData: false,
  });
}

export function getSavingsGoalForcedTool(
  message: string,
  normalized: string,
): SavingsGoalForcedTool | undefined {
  if (!isSavingsGoalPrompt(normalized)) {
    return undefined;
  }

  const targetAmountCents = extractSavingsGoalAmountCents(message);
  const progressAmountCents = isSavingsGoalProgressPrompt(normalized)
    ? extractSavingsGoalProgressAmountCents(message)
    : null;
  const monthlyContributionCents = extractMonthlyContributionCents(message);
  const targetDate = parseSavingsGoalTargetDate(message, getAgentAsOfDate());
  const name = inferSavingsGoalName(message, normalized);

  if (isSavingsGoalListPrompt(normalized)) {
    return {
      toolName: "list_savings_goals",
      args: {},
      requireCard: true,
    };
  }

  if (isSavingsGoalProgressPrompt(normalized) && progressAmountCents !== null) {
    return {
      toolName: "update_savings_goal",
      args: {
        name,
        current_amount_cents: progressAmountCents,
      },
      requireCard: true,
    };
  }

  if (isSavingsGoalTargetUpdatePrompt(normalized) && targetAmountCents !== null) {
    return {
      toolName: "update_savings_goal",
      args: {
        name,
        target_amount_cents: targetAmountCents,
      },
      requireCard: true,
    };
  }

  if (isSavingsGoalCreatePrompt(normalized)) {
    return {
      toolName: "preview_savings_goal",
      args: {
        name,
        ...(targetAmountCents === null ? {} : { target_amount_cents: targetAmountCents }),
        ...(targetDate ? { target_date: targetDate } : {}),
        ...(monthlyContributionCents === null ? {} : { monthly_contribution_cents: monthlyContributionCents }),
        include_in_spendable_cash: true,
      },
      requireCard: targetAmountCents !== null && Boolean(targetDate || monthlyContributionCents),
    };
  }

  return undefined;
}

export function isSavingsGoalPrompt(normalized: string): boolean {
  if (/\bbill\b/.test(normalized) && !/\bsavings? goals?\b/.test(normalized)) {
    return false;
  }

  return /\bsavings? goals?\b/.test(normalized) ||
    /\bwhat goals am i tracking\b/.test(normalized) ||
    /\bgoal progress\b/.test(normalized) ||
    /\btrip fund\b.{0,32}\bdoing\b/.test(normalized) ||
    /\bsave\b.{0,32}\b(for|toward|towards)\b/.test(normalized) ||
    /\b(emergency fund|computer|laptop|phone|car|trip|vacation|travel|big purchase)\b.{0,48}(?:\$|usd\b|\d+(?:,\d{3})*(?:\.\d{1,2})?\s*(?:dollars?|bucks?))/.test(normalized) ||
    /(?:\$|usd\b|\b\d+(?:,\d{3})*(?:\.\d{1,2})?\s*(?:dollars?|bucks?)).{0,48}\b(emergency fund|computer|laptop|phone|car|trip|vacation|travel|big purchase)\b/.test(normalized) ||
    /\b(for|toward|towards)\b.{0,32}\b(trip|vacation|travel|car|house|home|wedding|emergency fund|big purchase)\b/.test(normalized) ||
    /\b(trip|vacation|travel|car|house|home|wedding|emergency fund|big purchase)\b.{0,40}\b(cost|costs|goal|save|saving|target)\b/.test(normalized);
}

function isSavingsGoalCreatePrompt(normalized: string): boolean {
  if (isSavingsGoalTargetUpdatePrompt(normalized)) {
    return false;
  }

  return /\b(create|start|set up|make|add|track|want|need|help|put|contribute)\b/.test(normalized) ||
    /\bset (?:a|an|new) savings? goals?\b/.test(normalized) ||
    /\bsave\b.{0,32}\b(for|toward|towards)\b/.test(normalized) ||
    /\b(emergency fund|computer|laptop|phone|car|trip|vacation|travel|big purchase)\b.{0,48}(?:\$|usd\b|\d+(?:,\d{3})*(?:\.\d{1,2})?\s*(?:dollars?|bucks?))/.test(normalized) ||
    /(?:\$|usd\b|\b\d+(?:,\d{3})*(?:\.\d{1,2})?\s*(?:dollars?|bucks?)).{0,48}\b(emergency fund|computer|laptop|phone|car|trip|vacation|travel|big purchase)\b/.test(normalized);
}

function isSavingsGoalTargetUpdatePrompt(normalized: string): boolean {
  return /\b(set|change|update|make)\b.{0,32}\b(goal|savings? goal)\b.{0,32}\btarget\b/.test(normalized) ||
    /\b(goal|savings? goal)\b.{0,32}\btarget\b.{0,32}\b(to|at)\b/.test(normalized);
}

function isSavingsGoalListPrompt(normalized: string): boolean {
  return /\b(show|list|what|which|update|progress|how are)\b.{0,32}\bsavings? goals?\b/.test(normalized) ||
    /\bwhat goals am i tracking\b/.test(normalized) ||
    /\bshow goal progress\b/.test(normalized) ||
    /\btrip fund\b.{0,32}\bdoing\b/.test(normalized) ||
    /^savings? goals?$/.test(normalized);
}

function isSavingsGoalProgressPrompt(normalized: string): boolean {
  return /\b(saved|have|already have|tracked|progress|current)\b.{0,32}\b\$?\d/.test(normalized) &&
    /\b(goal|savings? goal|toward|towards|for)\b/.test(normalized);
}

function extractSavingsGoalAmountCents(message: string): number | null {
  const candidates = extractMoneyAmountCandidates(message, 100_000_000).filter(
    (candidate) => scoreBareSavingsGoalAmountCandidate(message, candidate.index, candidate.length) >= 0,
  );

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score || right.index - left.index);

  return candidates[0].amountCents;
}

function extractSavingsGoalProgressAmountCents(message: string): number | null {
  const candidates = extractMoneyAmountCandidates(message, 100_000_000);

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score || right.index - left.index);

  return candidates[0].amountCents;
}

function extractBareSavingsGoalAmountCents(message: string): number | null {
  const candidates: Array<{ amountCents: number; index: number; raw: string; score: number }> = [];

  const bareAmountPattern = /\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{3,7}(?:\.\d{1,2})?)\b/g;

  for (const match of message.matchAll(bareAmountPattern)) {
    const raw = match[1];
    const amount = Number(raw.replaceAll(",", ""));

    if (!Number.isFinite(amount)) {
      continue;
    }

    const amountCents = Math.round(amount * 100);

    if (
      amountCents > 0 &&
      amountCents <= 100_000_000 &&
      !isLikelyMonthlyAmountToken(message, match.index ?? 0, raw.length) &&
      !isLikelyDurationToken(message, match.index ?? 0, raw.length)
    ) {
      candidates.push({
        amountCents,
        index: match.index ?? 0,
        raw,
        score: scoreBareSavingsGoalAmountCandidate(message, match.index ?? 0, raw.length),
      });
    }
  }

  const rankedCandidates = candidates.filter(
    (candidate) => !isLikelyDateYearToken(message, candidate.raw, candidate.index),
  );

  rankedCandidates.sort((left, right) => right.score - left.score || right.index - left.index);

  const candidate = rankedCandidates[0];

  return candidate && candidate.score >= 0 ? candidate.amountCents : null;
}

function scoreBareSavingsGoalAmountCandidate(message: string, index: number, length: number): number {
  const normalized = message.toLowerCase();
  const before = normalized.slice(Math.max(0, index - 64), index);
  const after = normalized.slice(index + length, index + length + 64);
  let score = 0;

  if (/\b(target|goal|cost|costs|need|save|saving|toward|towards|for)\b/.test(before)) {
    score += 4;
  }

  if (/\b(actually|make it|change it to|set it to|to)\s*$/.test(before)) {
    score += 6;
  }

  if (/^\s*(target|goal|cost|costs)\b/.test(after) || /\b(target|goal|cost|costs)\b/.test(after.slice(0, 24))) {
    score += 8;
  }

  if (/\b(from)\s*$/.test(before)) {
    score -= 4;
  }

  if (
    /\b(already have|have already|already saved|saved so far|currently saved|current|progress|starting|started with)\b/.test(before) ||
    /\bsaved\s*$/.test(before) ||
    /^\s*(current|progress|already saved|already have)\b/.test(after) ||
    /^\s*saved\b(?!\s+(for|toward|towards|by)\b)/.test(after)
  ) {
    score -= 12;
  }

  return score;
}

function isSavingsGoalConfirmationPrompt(message: string): boolean {
  const normalized = normalizePrompt(message).replace(/’/g, "'").replace(/,/g, "");

  return /^(yes|yeah|yep|ok|okay|sure|do it|create it|create it now|yes do it|please do|go ahead|sounds good|looks good|that works|works for me)( please)?$/.test(normalized) ||
    /^(yes|yeah|yep|ok|okay|sure)\s+(please\s+)?(create it|do it|go ahead)( now)?( please)?$/.test(normalized) ||
    /^go ahead( and)?\s+(create it|do it)( now)?$/.test(normalized) ||
    /^please\s+(create it|do it)( now)?$/.test(normalized);
}

function isSavingsGoalCancelPrompt(message: string): boolean {
  const normalized = normalizePrompt(message).replace(/’/g, "'");

  return /^(no|nope|not now|cancel|stop|never mind|nevermind|no thanks|no thank you|don't|dont|do not)$/.test(normalized) ||
    /^no,?\s+(thanks|thank you|don'?t|dont|do not|cancel|stop|not now)\b/.test(normalized) ||
    /\b(don'?t|dont|do not)\s+(create|save|add|make)\b/.test(normalized);
}

function isLikelyDateYearToken(message: string, raw: string, index: number): boolean {
  if (!isPlausibleYearToken(raw)) {
    return false;
  }

  const before = message.slice(Math.max(0, index - 24), index).toLowerCase();
  const after = message.slice(index + raw.length, index + raw.length + 12).toLowerCase();
  const monthNameBeforeYear =
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s*$/.test(before);
  const monthDayBeforeYear =
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+\d{1,2}(?:st|nd|rd|th)?,?\s*$/.test(before);

  return /[/-]\s*$|\b(by|on|until|before|after|in|during|through|end of|by end of)\s*$/.test(before) ||
    monthNameBeforeYear ||
    monthDayBeforeYear ||
    /^\s*[/-]/.test(after);
}

function isPlausibleYearToken(raw: string): boolean {
  if (!/^\d{4}$/.test(raw)) {
    return false;
  }

  const year = Number(raw);

  return year >= 1900 && year <= 2100;
}

function isLikelyMonthlyAmountToken(message: string, index: number, length: number): boolean {
  const before = message.slice(Math.max(0, index - 18), index).toLowerCase();
  const after = message.slice(index + length, index + length + 18).toLowerCase();

  return /\b(?:monthly|per\s+month|a\s+month)\s*(?:\$|usd\s*)?$/.test(before) ||
    /^\s*(?:\/\s*|per\s+|a\s+)?(?:monthly|month|mo)\b/.test(after);
}

function isLikelyDurationToken(message: string, index: number, length: number): boolean {
  const after = message.slice(index + length, index + length + 18).toLowerCase();

  return /^\s*(?:-\s*)?(?:days?|weeks?|months?|years?)\b/.test(after);
}

function extractMonthlyContributionCents(message: string): number | null {
  const monthlyPattern =
    /(?:\$|usd\s*)\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:\/\s*|per\s+|a\s+)?(?:monthly|month|mo)\b|\b(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)?\s*(?:\/\s*|per\s+|a\s+)?(?:monthly|month|mo)\b|\b(?:monthly|per\s+month|a\s+month)\s*(?:\$|usd\s*)?\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\b/gi;

  for (const match of message.matchAll(monthlyPattern)) {
    const rawAmount = match[1] ?? match[2] ?? match[3];
    const amount = Number(rawAmount.replaceAll(",", ""));

    if (!Number.isFinite(amount)) {
      continue;
    }

    const amountCents = Math.round(amount * 100);

    if (amountCents > 0 && amountCents <= 100_000_000) {
      return amountCents;
    }
  }

  return null;
}

function extractMoneyAmountCandidates(message: string, maxCents: number) {
  const amountPattern =
    /(?:\$|usd\s*)\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)/gi;
  const normalized = message.toLowerCase();
  const candidates: Array<{ amountCents: number; index: number; length: number; score: number }> = [];

  for (const match of message.matchAll(amountPattern)) {
    const rawAmount = match[1] ?? match[2];
    const amount = Number(rawAmount.replaceAll(",", ""));

    if (!Number.isFinite(amount)) {
      continue;
    }

    const amountCents = Math.round(amount * 100);

    if (amountCents <= 0 || amountCents > maxCents) {
      continue;
    }

    const index = match.index ?? 0;
    if (isLikelyMonthlyAmountToken(message, index, match[0].length)) {
      continue;
    }

    candidates.push({
      amountCents,
      index,
      length: match[0].length,
      score: scoreSavingsGoalAmountCandidate(normalized, index),
    });
  }

  return candidates;
}

function scoreSavingsGoalAmountCandidate(message: string, index: number): number {
  const before = message.slice(Math.max(0, index - 64), index);
  const after = message.slice(index, index + 64);
  let score = 0;

  if (/\b(goal|target|cost|costs|save|saving|trip|vacation|travel|car|computer|laptop|phone|home|house|wedding|emergency fund|big purchase)\b/.test(before)) {
    score += 8;
  }

  if (/\b(goal|target|cost|costs|save|saving|trip|vacation|travel|car|computer|laptop|phone|home|house|wedding|emergency fund|big purchase)\b/.test(after)) {
    score += 6;
  }

  if (/\bper month|\/month|a month\b/.test(after)) {
    score -= 4;
  }

  return score;
}

function inferSavingsGoalName(message: string, normalized: string): string {
  const saveForMatch = /\bsave\b.{0,16}\b(?:for|toward|towards)\s+(?:a |an |the |my )?([^,.?]+?)(?:\s+(?:that|which|and|but|for|by|with|it'?s|it's|it is|costs?|will|would)\b|$)/i.exec(message);

  if (saveForMatch?.[1]) {
    return cleanSavingsGoalName(saveForMatch[1]);
  }

  if (/\b(emergency fund)\b/.test(normalized)) {
    return "Emergency fund";
  }

  if (/\b(vacation|travel|trip)\b/.test(normalized)) {
    return "Trip";
  }

  if (/\b(car)\b/.test(normalized)) {
    return "Car";
  }

  if (/\b(computer|laptop)\b/.test(normalized)) {
    return "Computer";
  }

  if (/\b(phone)\b/.test(normalized)) {
    return "Phone";
  }

  if (/\b(wedding)\b/.test(normalized)) {
    return "Wedding";
  }

  if (/\b(house|home)\b/.test(normalized)) {
    return "Home";
  }

  if (/\bbig purchase\b/.test(normalized)) {
    return "Big purchase";
  }

  return "Savings goal";
}

function cleanSavingsGoalName(value: string): string {
  const cleaned = value
    .replace(/\b(it'?s|it is|that'?s|that is)\b.*$/i, "")
    .replace(/\b(costs?|will cost|would cost|for)\b.*$/i, "")
    .replace(/\$\s*\d[\d,]*(?:\.\d{1,2})?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const trimmed = cleaned || "Savings goal";

  return trimmed
    .slice(0, 80)
    .replace(/^./, (char) => char.toUpperCase());
}

function normalizePrompt(message: string): string {
  return message
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
