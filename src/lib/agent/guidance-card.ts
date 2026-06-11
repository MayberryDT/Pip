import { z } from "zod";
import type { AgentCard } from "@/lib/agent/card-types";
import type { FinancialGuidanceContext } from "@/lib/pip-cash/guidance-context";

export type GuidanceCardDraft = {
  title: string;
  stance: "stable" | "watch" | "tight" | "shortfall" | "uncertain";
  summary: string;
  rows: Array<{
    label: string;
    detail: string;
    tone: "positive" | "negative" | "neutral" | "warning";
    evidenceIds: string[];
  }>;
  footer?: string;
};

export type GuidanceCardValidationResult =
  | {
      ok: true;
      card: Extract<AgentCard, { type: "guidance_card" }>;
    }
  | {
      ok: false;
      reason: string;
    };

const guidanceToneSchema = z.enum(["positive", "negative", "neutral", "warning"]);
const guidanceStanceSchema = z.enum(["stable", "watch", "tight", "shortfall", "uncertain"]);

export const guidanceCardDraftSchema = z.object({
  title: z.string().min(1).max(48),
  stance: guidanceStanceSchema,
  summary: z.string().min(1).max(220),
  rows: z.array(z.object({
    label: z.string().min(1).max(48),
    detail: z.string().min(1).max(180),
    tone: guidanceToneSchema,
    evidenceIds: z.array(z.string().min(1).max(80)).min(1).max(4),
  })).min(1).max(3),
  footer: z.string().min(1).max(140).optional(),
});

export function validateGuidanceCardDraft(
  draft: unknown,
  context: FinancialGuidanceContext,
): GuidanceCardValidationResult {
  const parsed = guidanceCardDraftSchema.safeParse(draft);

  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid guidance card shape",
    };
  }

  const evidenceIds = new Set(context.evidence.map((item) => item.id));
  const cardText = getDraftText(parsed.data);
  const blockedLanguage = getBlockedGuidanceLanguage(cardText);

  if (blockedLanguage) {
    return {
      ok: false,
      reason: `blocked guidance language: ${blockedLanguage}`,
    };
  }

  const blockedDomain = getBlockedGuidanceDomain(cardText);

  if (blockedDomain) {
    return {
      ok: false,
      reason: `blocked guidance domain: ${blockedDomain}`,
    };
  }

  const unsupportedAmount = getUnsupportedAmountClaim(cardText, context);

  if (unsupportedAmount) {
    return {
      ok: false,
      reason: `unsupported dollar amount: ${unsupportedAmount}`,
    };
  }

  for (const row of parsed.data.rows) {
    const invalidEvidenceId = row.evidenceIds.find((id) => !evidenceIds.has(id));

    if (invalidEvidenceId) {
      return {
        ok: false,
        reason: `unknown evidence id: ${invalidEvidenceId}`,
      };
    }
  }

  return {
    ok: true,
    card: {
      type: "guidance_card",
      ...parsed.data,
    },
  };
}

export function getBlockedGuidanceLanguage(text: string): string | null {
  const normalized = normalizeText(text);
  const guaranteedSpendingPhrase = ["safe", "to", "spend"].join(" ");
  const patterns: Array<[RegExp, string]> = [
    [new RegExp(`\\b${guaranteedSpendingPhrase}\\b`), guaranteedSpendingPhrase],
    [/\bsafe to buy\b/, "safe to buy"],
    [/\byou can afford\b/, "you can afford"],
    [/\bi recommend\b/, "i recommend"],
    [/\bmy recommendation\b/, "my recommendation"],
    [/\bfinancial advice\b/, "financial advice"],
    [/\bfinancial advisor\b/, "financial advisor"],
    [/\bguaranteed\b/, "guaranteed"],
    [/\brisk-free\b/, "risk-free"],
    [/\bskip rent\b/, "skip rent"],
    [/\bwrite this off\b/, "write this off"],
  ];

  for (const [pattern, reason] of patterns) {
    if (pattern.test(normalized)) {
      return reason;
    }
  }

  return null;
}

export function getBlockedGuidanceDomain(text: string): string | null {
  const normalized = normalizeText(text);
  const patterns: Array<[RegExp, string]> = [
    [/\b(bitcoin|crypto|cryptocurrency|ethereum|token)\b/, "crypto"],
    [/\b(buy|sell|hold|invest in)\b.{0,32}\b(nvidia|nvda|tesla|tsla|apple|aapl|microsoft|msft)\b/, "securities"],
    [/\b(buy|sell|hold)\b.{0,32}\b(stocks?|shares?|etf|fund|securities?)\b|\binvest in\b.{0,32}\b(stocks?|shares?|etf|fund|securities?)\b|\bshares? of\b/, "securities"],
    [/\b(tax|taxes|deduct|deduction|write[- ]?off|irs)\b/, "tax"],
    [/\b(legal|lawyer|sue|lawsuit)\b/, "legal"],
    [/\b(bankruptcy|file bankruptcy|chapter 7|chapter 13)\b/, "bankruptcy"],
    [/\b(open|apply for|sign up for)\b.{0,40}\b(card|credit card|loan|refinance|lender|mortgage|insurance)\b/, "specific product"],
    [/\b(balance transfer card|personal loan|payday loan|refinance with|specific lender|insurance policy)\b/, "specific product"],
  ];

  for (const [pattern, reason] of patterns) {
    if (pattern.test(normalized)) {
      return reason;
    }
  }

  return null;
}

function getUnsupportedAmountClaim(
  text: string,
  context: FinancialGuidanceContext,
): string | null {
  const claimedAmounts = extractDollarAmountsCents(text);

  if (claimedAmounts.length === 0) {
    return null;
  }

  const supportedAmounts = new Set<number>();

  for (const evidence of context.evidence) {
    if (typeof evidence.amountCents === "number") {
      supportedAmounts.add(Math.abs(evidence.amountCents));
    }
  }

  [
    context.currentRead.spendableCashTodayCents,
    context.currentRead.shortfallCents,
    context.pattern.baselineDailyAllowanceCents,
    context.pattern.adaptiveDailyAllowanceCents,
    context.pattern.monthlyEverydayPoolCents,
    context.pattern.averageMonthlyIncomeCents,
    context.pattern.averageMonthlyRecurringObligationsCents,
    context.pattern.averageMonthlyEverydaySpendCents,
    context.pattern.protectedSavingsMonthlyCents,
    context.pattern.hiddenCushionCents,
    context.behavior.allowedSoFarThisMonthCents,
    context.behavior.actualEverydaySpendSoFarCents,
    context.behavior.currentMonthVarianceCents,
    context.behavior.behaviorAdjustmentCents,
    context.cash.availableCashGuardrailCents,
    context.cash.pendingCommittedSpendCents,
    context.cash.cashDailyCapCents,
    context.cash.cashRealityAdjustmentCents,
    context.shortfalls.patternShortfallCents,
    context.shortfalls.behaviorShortfallCents,
    context.shortfalls.cashShortfallCents,
    context.shortfalls.totalShortfallCents,
  ].forEach((amount) => supportedAmounts.add(Math.abs(amount)));

  const supportedAmountList = [...supportedAmounts];
  const unsupported = claimedAmounts.find((amount) =>
    !isSupportedAmountClaim(Math.abs(amount), supportedAmountList),
  );

  return unsupported === undefined ? null : `$${(unsupported / 100).toFixed(2)}`;
}

function isSupportedAmountClaim(claimedAmountCents: number, supportedAmounts: number[]): boolean {
  return supportedAmounts.some((supportedAmount) => {
    const normalizedSupported = Math.abs(supportedAmount);

    if (claimedAmountCents === normalizedSupported) {
      return true;
    }

    return claimedAmountCents >= 100 && Math.abs(claimedAmountCents - normalizedSupported) <= 50;
  });
}

function extractDollarAmountsCents(text: string): number[] {
  const matches = text.matchAll(/\$\s*(-?\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/g);
  const amounts: number[] = [];

  for (const match of matches) {
    const amount = Number(match[1]?.replaceAll(",", ""));

    if (Number.isFinite(amount)) {
      amounts.push(Math.round(amount * 100));
    }
  }

  return amounts;
}

function getDraftText(draft: GuidanceCardDraft): string {
  return [
    draft.title,
    draft.stance,
    draft.summary,
    ...draft.rows.flatMap((row) => [row.label, row.detail, row.tone, ...row.evidenceIds]),
    draft.footer,
  ].filter(Boolean).join(" ");
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
}
