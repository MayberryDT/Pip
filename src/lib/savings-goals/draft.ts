import { buildSavingsGoalPlan } from "@/lib/savings-goals/plan";
import type { AgentPendingAction } from "@/lib/agent/card-types";
import type { SavingsGoal, SavingsGoalPlan } from "@/lib/savings-goals/types";

export type SavingsGoalDraftMissingField = "name" | "target_amount" | "target_date";
export type SavingsGoalDraftFollowUpIntent = "progress_calculation";

export type SavingsGoalDraft = {
  name?: string;
  targetAmountCents?: number;
  targetDate?: string;
  startingAmountCents?: number;
  currentAmountCents?: number;
  monthlyContributionCents?: number;
  includeInSpendableCash?: boolean;
  followUpIntent?: SavingsGoalDraftFollowUpIntent;
};

export type ParseSavingsGoalDraftOptions = {
  asOfDate: string;
  existingDraft?: SavingsGoalDraft | null;
};

export type SavingsGoalDraftPendingAction = Extract<AgentPendingAction, { type: "create_savings_goal" }>;

const monthNumbers = new Map([
  ["january", 1],
  ["jan", 1],
  ["february", 2],
  ["feb", 2],
  ["march", 3],
  ["mar", 3],
  ["april", 4],
  ["apr", 4],
  ["may", 5],
  ["june", 6],
  ["jun", 6],
  ["july", 7],
  ["jul", 7],
  ["august", 8],
  ["aug", 8],
  ["september", 9],
  ["sep", 9],
  ["sept", 9],
  ["october", 10],
  ["oct", 10],
  ["november", 11],
  ["nov", 11],
  ["december", 12],
  ["dec", 12],
]);

export function parseSavingsGoalDraftFromMessage(
  message: string,
  options: ParseSavingsGoalDraftOptions,
): SavingsGoalDraft | null {
  const normalized = normalizeMessage(message);

  if (!normalized || isBareAffirmative(normalized)) {
    return null;
  }

  if (isCalculationFollowUp(normalized)) {
    return options.existingDraft ? { followUpIntent: "progress_calculation" } : null;
  }

  const draft: SavingsGoalDraft = {};
  const name = inferSavingsGoalName(message);
  const targetAmountCents = parseTargetAmountCents(message);
  const targetDate = parseTargetDate(message, options.asOfDate);

  if (name) {
    draft.name = name;
  }

  if (targetAmountCents !== null) {
    draft.targetAmountCents = targetAmountCents;
  }

  if (targetDate) {
    draft.targetDate = targetDate;
  }

  return Object.keys(draft).length > 0 ? draft : null;
}

export function mergeSavingsGoalDraft(
  existingDraft?: SavingsGoalDraft | null,
  nextDraft?: SavingsGoalDraft | null,
): SavingsGoalDraft {
  const merged: SavingsGoalDraft = { ...(existingDraft ?? {}) };

  if (!nextDraft) {
    return merged;
  }

  assignDefined(merged, "name", nextDraft.name);
  assignDefined(merged, "targetAmountCents", nextDraft.targetAmountCents);
  assignDefined(merged, "targetDate", nextDraft.targetDate);
  assignDefined(merged, "startingAmountCents", nextDraft.startingAmountCents);
  assignDefined(merged, "currentAmountCents", nextDraft.currentAmountCents);
  assignDefined(merged, "monthlyContributionCents", nextDraft.monthlyContributionCents);
  assignDefined(merged, "includeInSpendableCash", nextDraft.includeInSpendableCash);
  assignDefined(merged, "followUpIntent", nextDraft.followUpIntent);

  return merged;
}

export function isCompleteSavingsGoalDraft(draft?: SavingsGoalDraft | null): boolean {
  return getSavingsGoalMissingFields(draft).length === 0;
}

export function getSavingsGoalMissingFields(
  draft?: SavingsGoalDraft | null,
): SavingsGoalDraftMissingField[] {
  const missing: SavingsGoalDraftMissingField[] = [];

  if (!draft?.name?.trim()) {
    missing.push("name");
  }

  if (!Number.isInteger(draft?.targetAmountCents) || (draft?.targetAmountCents ?? 0) <= 0) {
    missing.push("target_amount");
  } else if (!draft?.targetDate) {
    missing.push("target_date");
  }

  return missing;
}

export function buildSavingsGoalPendingAction(
  draft?: SavingsGoalDraft | null,
): SavingsGoalDraftPendingAction {
  const missingFields = getSavingsGoalMissingFields(draft);
  const action: SavingsGoalDraftPendingAction = {
    type: "create_savings_goal",
    name: draft?.name?.trim() || "Savings goal",
    missing: toPendingActionMissingFields(missingFields),
  };

  if (draft?.targetAmountCents !== undefined) {
    action.targetAmountCents = draft.targetAmountCents;
  }

  if (draft?.targetDate !== undefined) {
    action.targetDate = draft.targetDate;
  }

  if (draft?.startingAmountCents !== undefined) {
    action.startingAmountCents = draft.startingAmountCents;
  }

  if (draft?.currentAmountCents !== undefined) {
    action.currentAmountCents = draft.currentAmountCents;
  }

  if (draft?.monthlyContributionCents !== undefined) {
    action.monthlyContributionCents = draft.monthlyContributionCents;
  }

  if (draft?.includeInSpendableCash !== undefined) {
    action.includeInSpendableCash = draft.includeInSpendableCash;
  }

  return action;
}

function toPendingActionMissingFields(
  missingFields: SavingsGoalDraftMissingField[],
): SavingsGoalDraftPendingAction["missing"] {
  const pendingFields = missingFields.filter(
    (field): field is Exclude<SavingsGoalDraftMissingField, "name"> => field !== "name",
  );

  return pendingFields.length > 0 ? pendingFields : ["confirmation"];
}

export function buildSavingsGoalDraftPlan(
  draft: SavingsGoalDraft,
  options: { asOfDate: string },
): SavingsGoalPlan {
  if (!draft.name?.trim()) {
    throw new Error("missing_name");
  }

  if (!draft.targetAmountCents || draft.targetAmountCents <= 0) {
    throw new Error("missing_target_amount");
  }

  return buildSavingsGoalPlan(
    {
      id: "draft",
      userId: "draft-user",
      name: draft.name,
      targetAmountCents: draft.targetAmountCents,
      targetDate: draft.targetDate,
      startingAmountCents: draft.startingAmountCents ?? draft.currentAmountCents ?? 0,
      currentAmountCents: draft.currentAmountCents ?? draft.startingAmountCents ?? 0,
      monthlyContributionCents: draft.monthlyContributionCents ?? 0,
      includeInSpendableCash: draft.includeInSpendableCash ?? false,
      status: "active",
      createdAt: `${options.asOfDate}T00:00:00.000Z`,
      updatedAt: `${options.asOfDate}T00:00:00.000Z`,
    } satisfies SavingsGoal,
    options.asOfDate,
  );
}

function inferSavingsGoalName(message: string): string | undefined {
  const tripMatch = message.match(/\b(?:trip|vacation)\s+(?:to|for)\s+([a-z][a-z\s'-]{1,60})/i);

  if (tripMatch?.[1]) {
    const destination = cleanGoalName(tripMatch[1]);

    return destination ? `${titleCase(destination)} trip` : undefined;
  }

  const saveForMatch = message.match(
    /\bsave(?: money)?\s+for\s+(?:a|an|the)?\s*(?:\$[\d,]+(?:\.\d{1,2})?\s*)?([a-z][a-z\s'-]{1,60})/i,
  );

  if (!saveForMatch?.[1]) {
    return undefined;
  }

  const name = cleanGoalName(saveForMatch[1]);

  return name ? titleCase(name) : undefined;
}

function parseTargetAmountCents(message: string): number | null {
  const currencyMatch = message.match(/\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/);

  if (currencyMatch) {
    return parseMoneyMatch(currencyMatch);
  }

  const dollarsMatch = message.match(
    /\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars?|bucks|usd)\b/i,
  );

  return dollarsMatch ? parseMoneyMatch(dollarsMatch) : null;
}

function parseMoneyMatch(match: RegExpMatchArray): number | null {
  const dollars = Number.parseInt(match[1].replace(/,/g, ""), 10);
  const cents = Number.parseInt((match[2] ?? "0").padEnd(2, "0"), 10);

  if (!Number.isFinite(dollars) || dollars <= 0 || !Number.isFinite(cents)) {
    return null;
  }

  return dollars * 100 + cents;
}

function parseTargetDate(message: string, asOfDate: string): string | null {
  const isoMatch = message.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);

  if (isoMatch) {
    const year = Number.parseInt(isoMatch[1], 10);
    const month = Number.parseInt(isoMatch[2], 10);
    const day = Number.parseInt(isoMatch[3], 10);

    return isValidDateParts(year, month, day) ? formatIsoDate(year, month, day) : null;
  }

  const naturalMatch = message.match(
    /\b(?:by|before|on)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i,
  );

  if (!naturalMatch) {
    return null;
  }

  const month = monthNumbers.get(naturalMatch[1].toLowerCase());
  const day = Number.parseInt(naturalMatch[2], 10);
  const explicitYear = naturalMatch[3] ? Number.parseInt(naturalMatch[3], 10) : undefined;

  if (!month) {
    return null;
  }

  let year = explicitYear ?? parseUtcDate(asOfDate).getUTCFullYear();

  if (!isValidDateParts(year, month, day)) {
    return null;
  }

  if (!explicitYear) {
    const asOf = parseUtcDate(asOfDate);
    const candidate = new Date(Date.UTC(year, month - 1, day));

    if (candidate.getTime() <= asOf.getTime()) {
      year += 1;
    }
  }

  return formatIsoDate(year, month, day);
}

function isCalculationFollowUp(normalized: string): boolean {
  return (
    /\bhow much\b/.test(normalized) &&
    /\b(goal|hit|reach|need|save|monthly|month|daily|day)\b/.test(normalized)
  );
}

function isBareAffirmative(normalized: string): boolean {
  return /^(yes|yeah|yep|sure|ok|okay)$/.test(normalized);
}

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanGoalName(value: string): string {
  return value
    .replace(/\$[\d,]+(?:\.\d{1,2})?/g, "")
    .replace(/\b(?:by|before|on)\b.*$/i, "")
    .replace(/\b(?:that costs?|please)\b.*$/i, "")
    .replace(/[.,!?]+$/g, "")
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function assignDefined<Key extends keyof SavingsGoalDraft>(
  draft: SavingsGoalDraft,
  key: Key,
  value: SavingsGoalDraft[Key] | undefined,
) {
  if (value !== undefined) {
    draft[key] = value;
  }
}

function parseUtcDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
