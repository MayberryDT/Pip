import type { AgentCard } from "@/lib/agent/card-types";
import {
  getSavingsGoalPreviewMissingFields,
  type SavingsGoalPreviewDraft,
} from "@/lib/agent/pending-actions";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { getDisplayedSpendableCashTodayCents } from "@/lib/pip-cash/spendable-cash-today";
import type { FinancialSnapshot } from "@/lib/types";
import type { SavingsGoal } from "@/lib/savings-goals/types";
import { formatMoney } from "@/lib/money";

const DAYS_PER_MONTH = 30.44;

export type SavingsGoalPreviewResult = {
  missing: ReturnType<typeof getSavingsGoalPreviewMissingFields>;
  card: Extract<AgentCard, { type: "savings_goal_preview" }> | null;
};

export function buildSavingsGoalPreview(input: {
  snapshot: FinancialSnapshot;
  draft: SavingsGoalPreviewDraft;
  asOfDate?: string;
}): SavingsGoalPreviewResult {
  const missing = getSavingsGoalPreviewMissingFields(input.draft);

  if (missing.length > 0 || !input.draft.targetAmountCents) {
    return {
      missing,
      card: null,
    };
  }

  const currentAmountCents = input.draft.currentAmountCents ?? input.draft.startingAmountCents ?? 0;
  const remainingCents = Math.max(0, input.draft.targetAmountCents - currentAmountCents);
  const monthlyContributionCents =
    input.draft.monthlyContributionCents ??
    calculateMonthlyContributionFromTargetDate({
      remainingCents,
      targetDate: input.draft.targetDate,
      asOfDate: input.asOfDate ?? input.snapshot.settings.asOfDate,
    });

  if (!monthlyContributionCents || monthlyContributionCents <= 0) {
    return {
      missing: ["target_date_or_monthly_contribution"],
      card: null,
    };
  }

  const currentResult = calculatePipCash(input.snapshot);
  const previewSnapshot = appendPreviewGoal(input.snapshot, {
    draft: input.draft,
    monthlyContributionCents,
    currentAmountCents,
  });
  const previewResult = calculatePipCash(previewSnapshot);
  const currentSpendableCashTodayCents = getDisplayedSpendableCashTodayCents(currentResult);
  const spendableCashTodayAfterGoalCents = getDisplayedSpendableCashTodayCents(previewResult);
  const currentBaselineDailyAllowanceCents =
    currentResult.spendableCashToday?.baselineDailyAllowanceCents ?? currentResult.pipCashTodayCents;
  const baselineDailyAllowanceAfterGoalCents =
    previewResult.spendableCashToday?.baselineDailyAllowanceCents ?? previewResult.pipCashTodayCents;
  const usualDailySpendCents = currentResult.spendableCashToday
    ? Math.round(currentResult.spendableCashToday.averageMonthlyEverydaySpendCents / DAYS_PER_MONTH)
    : undefined;
  const warningLevel = getWarningLevel({
    spendableCashTodayAfterGoalCents,
    baselineDailyAllowanceAfterGoalCents,
    usualDailySpendCents,
  });

  return {
    missing: [],
    card: {
      type: "savings_goal_preview",
      title: "Savings Goal Preview",
      name: input.draft.name,
      targetAmountCents: input.draft.targetAmountCents,
      currentAmountCents,
      remainingCents,
      ...(input.draft.targetDate ? { targetDate: input.draft.targetDate } : {}),
      monthlyContributionCents,
      includeInSpendableCash: true,
      currentSpendableCashTodayCents,
      spendableCashTodayAfterGoalCents,
      currentBaselineDailyAllowanceCents,
      baselineDailyAllowanceAfterGoalCents,
      ...(usualDailySpendCents === undefined ? {} : { usualDailySpendCents }),
      dailyRoomDeltaCents: spendableCashTodayAfterGoalCents - currentSpendableCashTodayCents,
      warningLevel,
      summary: buildPreviewSummary({
        name: input.draft.name,
        monthlyContributionCents,
        spendableCashTodayAfterGoalCents,
        usualDailySpendCents,
        warningLevel,
      }),
    },
  };
}

function appendPreviewGoal(
  snapshot: FinancialSnapshot,
  input: {
    draft: SavingsGoalPreviewDraft;
    monthlyContributionCents: number;
    currentAmountCents: number;
  },
): FinancialSnapshot {
  const now = new Date().toISOString();
  const goal: SavingsGoal = {
    id: "__preview_savings_goal__",
    userId: "preview",
    name: input.draft.name,
    targetAmountCents: input.draft.targetAmountCents ?? 0,
    ...(input.draft.targetDate ? { targetDate: input.draft.targetDate } : {}),
    startingAmountCents: input.draft.startingAmountCents ?? 0,
    currentAmountCents: input.currentAmountCents,
    monthlyContributionCents: input.monthlyContributionCents,
    includeInSpendableCash: true,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...snapshot,
    savingsGoals: [
      ...(snapshot.savingsGoals ?? []).filter((item) => item.id !== goal.id),
      goal,
    ],
  };
}

function calculateMonthlyContributionFromTargetDate(input: {
  remainingCents: number;
  targetDate?: string;
  asOfDate: string;
}): number | undefined {
  if (!input.targetDate) {
    return undefined;
  }

  const monthsRemaining = getMonthsRemaining(input.asOfDate, input.targetDate);

  if (monthsRemaining <= 0) {
    return undefined;
  }

  return Math.ceil(input.remainingCents / monthsRemaining);
}

function getMonthsRemaining(asOfDate: string, targetDate: string): number {
  const start = parseDate(asOfDate);
  const end = parseDate(targetDate);
  const dayDiff = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);

  if (dayDiff <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(dayDiff / DAYS_PER_MONTH));
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function getWarningLevel(input: {
  spendableCashTodayAfterGoalCents: number;
  baselineDailyAllowanceAfterGoalCents: number;
  usualDailySpendCents?: number;
}): Extract<AgentCard, { type: "savings_goal_preview" }>["warningLevel"] {
  if (input.spendableCashTodayAfterGoalCents <= 500) {
    return "too_tight";
  }

  if (
    input.spendableCashTodayAfterGoalCents <= 2000 ||
    (
      input.usualDailySpendCents !== undefined &&
      input.baselineDailyAllowanceAfterGoalCents < Math.round(input.usualDailySpendCents * 0.5)
    )
  ) {
    return "tight";
  }

  if (
    input.usualDailySpendCents !== undefined &&
    input.baselineDailyAllowanceAfterGoalCents < input.usualDailySpendCents
  ) {
    return "watch";
  }

  return "ok";
}

function buildPreviewSummary(input: {
  name: string;
  monthlyContributionCents: number;
  spendableCashTodayAfterGoalCents: number;
  usualDailySpendCents?: number;
  warningLevel: Extract<AgentCard, { type: "savings_goal_preview" }>["warningLevel"];
}): string {
  if (input.warningLevel === "too_tight") {
    return `${input.name} would need ${formatMoney(input.monthlyContributionCents)}/month, but that looks difficult because it leaves only ${formatMoney(input.spendableCashTodayAfterGoalCents)} for today.`;
  }

  if (input.warningLevel === "tight") {
    return `${input.name} would need ${formatMoney(input.monthlyContributionCents)}/month and would leave ${formatMoney(input.spendableCashTodayAfterGoalCents)} for today. That looks tight.`;
  }

  if (input.warningLevel === "watch" && input.usualDailySpendCents !== undefined) {
    return `${input.name} would need ${formatMoney(input.monthlyContributionCents)}/month. Your usual daily spending is around ${formatMoney(input.usualDailySpendCents)}, so watch the room closely.`;
  }

  return `${input.name} would need ${formatMoney(input.monthlyContributionCents)}/month and is counted in Spendable Cash Today.`;
}
