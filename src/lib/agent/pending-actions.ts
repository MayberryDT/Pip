import type {
  AgentPendingAction,
  SavingsGoalPendingField,
} from "@/lib/agent/card-types";

export type SavingsGoalPreviewDraft = Extract<AgentPendingAction, { type: "preview_savings_goal" }>;
export type OrdinaryPendingAction = Extract<AgentPendingAction, { type: "ordinary_write" }>;
export type SensitivePendingAction = Extract<AgentPendingAction, { type: "sensitive_confirmation" }>;
export type ConfirmablePendingAction = OrdinaryPendingAction | SensitivePendingAction;

export function buildSavingsGoalDraft(input: {
  message: string;
  pendingAction?: SavingsGoalPreviewDraft;
  asOfDate?: string;
}): SavingsGoalPreviewDraft {
  const normalized = normalizePrompt(input.message);
  const pending = input.pendingAction;
  const explicitAmountCents = extractSavingsGoalAmountCents(input.message) ??
    (pending ? extractBareSavingsGoalAmountCents(input.message) : null);
  const monthlyContributionCents = extractMonthlyContributionCents(input.message) ??
    pending?.monthlyContributionCents;
  const targetDate = parseSavingsGoalTargetDate(
    input.message,
    input.asOfDate ?? getAgentAsOfDate(),
  ) ?? pending?.targetDate;
  const inferredName = inferSavingsGoalName(input.message, normalized);
  const name = pending?.name && pending.name !== "Savings goal"
    ? pending.name
    : inferredName;
  const targetAmountCents = explicitAmountCents ?? pending?.targetAmountCents;

  return {
    type: "preview_savings_goal",
    name,
    ...(targetAmountCents === undefined || targetAmountCents === null ? {} : { targetAmountCents }),
    ...(targetDate ? { targetDate } : {}),
    ...(pending?.startingAmountCents === undefined ? {} : { startingAmountCents: pending.startingAmountCents }),
    ...(pending?.currentAmountCents === undefined ? {} : { currentAmountCents: pending.currentAmountCents }),
    ...(monthlyContributionCents === undefined || monthlyContributionCents === null ? {} : { monthlyContributionCents }),
    includeInSpendableCash: true,
  };
}

export function getSavingsGoalPreviewMissingFields(
  draft: SavingsGoalPreviewDraft,
): SavingsGoalPendingField[] {
  const missing: SavingsGoalPendingField[] = [];

  if (!draft.targetAmountCents) {
    missing.push("target_amount");
  }

  if (!draft.targetDate && !draft.monthlyContributionCents) {
    missing.push("target_date_or_monthly_contribution");
  }

  return missing;
}

export function createOrdinaryPendingAction(input: {
  action: string;
  summary: string;
  payload?: Record<string, unknown>;
  now?: Date;
  ttlMs?: number;
}): OrdinaryPendingAction {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? 5 * 60 * 1000));

  return {
    type: "ordinary_write",
    action: input.action,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    confirmationKind: "contextual",
    summary: input.summary,
    ...(input.payload ? { payload: input.payload } : {}),
  };
}

export function createSensitivePendingAction(input: {
  action: string;
  exactConfirmation: string;
  summary: string;
  payload?: Record<string, unknown>;
  now?: Date;
  ttlMs?: number;
}): SensitivePendingAction {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? 5 * 60 * 1000));

  return {
    type: "sensitive_confirmation",
    action: input.action,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    confirmationKind: "exact",
    exactConfirmation: input.exactConfirmation,
    summary: input.summary,
    ...(input.payload ? { payload: input.payload } : {}),
  };
}

export function resolvePendingActionConfirmation(input: {
  message: string;
  pendingAction: ConfirmablePendingAction;
  now?: Date;
}): { ok: true; reason: "contextual_confirmation" | "exact_confirmation" } | {
  ok: false;
  reason: "not_confirmation" | "expired" | "exact_confirmation_required";
} {
  const now = input.now ?? new Date();

  if (input.pendingAction.expiresAt && Date.parse(input.pendingAction.expiresAt) < now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  if (input.pendingAction.confirmationKind === "exact") {
    return input.message.trim() === input.pendingAction.exactConfirmation
      ? { ok: true, reason: "exact_confirmation" }
      : { ok: false, reason: "exact_confirmation_required" };
  }

  return isContextualConfirmation(input.message)
    ? { ok: true, reason: "contextual_confirmation" }
    : { ok: false, reason: "not_confirmation" };
}

export function isContextualConfirmation(message: string): boolean {
  return /^(yes|yeah|yep|ok|okay|sure|do it|do that|create it|save it|confirm|looks good|that works|yes please)(?:,?\s+(?:please\s+)?(?:create|save|do)\s+(?:it|that))?([.! ]*)$/i.test(
    message.trim(),
  );
}

export function isCancellationPrompt(message: string): boolean {
  return /^(cancel|never mind|nevermind|stop|do not|don't|dont|no)$/i.test(message.trim());
}

function extractSavingsGoalAmountCents(message: string): number | null {
  const normalized = message.toLowerCase();
  const candidates: Array<{ amountCents: number; index: number; score: number }> = [];
  const amountPattern =
    /(?:\$|usd\s*)\s*(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)/gi;

  for (const match of message.matchAll(amountPattern)) {
    const rawAmount = match[1] ?? match[2];
    const amount = Number(rawAmount.replaceAll(",", ""));

    if (!Number.isFinite(amount)) {
      continue;
    }

    const amountCents = Math.round(amount * 100);

    if (amountCents <= 0 || amountCents > 100_000_000) {
      continue;
    }

    const index = match.index ?? 0;
    const around = normalized.slice(Math.max(0, index - 60), index + 80);
    let score = 0;

    if (/\b(save|saving|goal|target|cost|costs|need|for|toward|towards)\b/.test(around)) {
      score += 8;
    }

    if (/\b(month|monthly|per month|\/mo|\/month)\b/.test(around)) {
      score -= 6;
    }

    candidates.push({ amountCents, index, score });
  }

  candidates.sort((left, right) => right.score - left.score || left.index - right.index);

  return candidates[0]?.amountCents ?? null;
}

function extractBareSavingsGoalAmountCents(message: string): number | null {
  const match = /^\s*(?:\$|usd\s*)?\s*(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)?\s*(?:by\b.*)?$/i.exec(message);

  if (!match) {
    return null;
  }

  const amount = Number(match[1].replaceAll(",", ""));

  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return null;
  }

  return Math.round(amount * 100);
}

function extractMonthlyContributionCents(message: string): number | null {
  const match =
    /(?:\$|usd\s*)\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:\/|per\s+)?(?:mo|month|monthly)\b|(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)\s*(?:\/|per\s+)?(?:mo|month|monthly)\b/i.exec(message);

  if (!match) {
    return null;
  }

  const rawAmount = match[1] ?? match[2];
  const amount = Number(rawAmount.replaceAll(",", ""));

  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) {
    return null;
  }

  return Math.round(amount * 100);
}

function parseSavingsGoalTargetDate(message: string, asOfDate: string): string | null {
  const monthPattern =
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i;
  const monthMatch = monthPattern.exec(message);

  if (monthMatch) {
    const year = monthMatch[3] ? Number(monthMatch[3]) : undefined;

    return buildFutureDate(monthNameToMonthNumber(monthMatch[1]), Number(monthMatch[2]), asOfDate, year);
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
    return buildMonthEndDate(monthNameToMonthNumber(monthYearMatch[1]), Number(monthYearMatch[2]), asOfDate);
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

  const relativeMatch = /\bin\s+(\d{1,2}|six|twelve)\s+(days?|weeks?|months?|years?)\b/i.exec(message);

  if (relativeMatch) {
    return buildRelativeFutureDate(parseSmallNumber(relativeMatch[1]), relativeMatch[2], asOfDate);
  }

  return null;
}

function inferSavingsGoalName(message: string, normalized: string): string {
  const directPatterns = [
    /\bsave\s+(?:up\s+)?(?:for|toward|towards)\s+(.+?)(?:\s+(?:by|in|at|for)\s+(?:\$|\d)|$)/i,
    /\b(?:goal|fund)\s+(?:for|toward|towards)\s+(.+?)(?:\s+(?:by|in|at|for)\s+(?:\$|\d)|$)/i,
    /\bfor\s+(.+?)(?:\s+(?:by|in|at)\s+(?:\$|\d|january|february|march|april|may|june|july|august|september|october|november|december)|$)/i,
  ];

  for (const pattern of directPatterns) {
    const cleaned = cleanGoalName(pattern.exec(message)?.[1]);

    if (cleaned) {
      return cleaned;
    }
  }

  const knownGoal = [
    "emergency fund",
    "computer",
    "laptop",
    "phone",
    "car",
    "japan",
    "trip",
    "vacation",
    "travel",
    "wedding",
    "house",
    "home",
    "big purchase",
  ].find((candidate) => normalized.includes(candidate));

  if (knownGoal) {
    return toTitleCase(knownGoal);
  }

  return "Savings goal";
}

function cleanGoalName(value: string | undefined): string | null {
  const cleaned = value
    ?.replace(/\$\s*\d[\d,.]*/g, " ")
    .replace(/\b\d+(?:\.\d{1,2})?\s*(?:dollars?|bucks?|months?|weeks?|years?|days?)\b/gi, " ")
    .replace(/\b(that costs?|costs?|target|goal|new|a|an|the|my)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 2) {
    return null;
  }

  return toTitleCase(cleaned.slice(0, 80));
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

function parseSmallNumber(value: string): number {
  if (value.toLowerCase() === "six") {
    return 6;
  }

  if (value.toLowerCase() === "twelve") {
    return 12;
  }

  return Number(value);
}

function getAgentAsOfDate(): string {
  return process.env.PIP_APP_DATE || "2026-06-20";
}

function normalizePrompt(message: string): string {
  return message
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  );
}
