import { getDisplayedSpendableCashTodayCents } from "@/lib/pip-cash/spendable-cash-today";
import type { Database } from "@/lib/supabase/database.types";
import type {
  PipCashResult,
  SpendableCashConfidence,
  SpendableCashTodayResult,
  SpendableCashTodayState,
} from "@/lib/types";

export type PipReactionTrigger = Database["public"]["Enums"]["pip_reaction_trigger"];
export type PipReactionType = Database["public"]["Enums"]["pip_reaction_type"];

export type PipReactionComparison = {
  previousState: SpendableCashTodayState | null;
  currentState: SpendableCashTodayState;
  previousConfidence: SpendableCashConfidence | null;
  currentConfidence: SpendableCashConfidence | null;
  spendableDeltaCents: number;
  behaviorAdjustmentDeltaCents: number;
  shortfallDeltaCents: number;
  cashRealityAdjustmentDeltaCents: number;
  confidenceChange: string | null;
  materialDailyChangeCents: number;
  previous?: SpendableCashTodayResult;
  current?: SpendableCashTodayResult;
};

export type RecentPipReaction = {
  reactionType: PipReactionType;
  intensity: number;
  createdAt: string;
};

export type PipReactionDecision = {
  reactionType: PipReactionType;
  trigger: PipReactionTrigger;
  currentState: SpendableCashTodayState;
  previousState: SpendableCashTodayState | null;
  spendableDeltaCents: number;
  behaviorAdjustmentDeltaCents: number;
  shortfallDeltaCents: number;
  cashRealityAdjustmentDeltaCents: number;
  confidenceChange: string | null;
  intensity: 1 | 2 | 3;
  summary: string;
};

const FALLBACK_MATERIAL_DAILY_CHANGE_CENTS = 500;

const reactionPriority = {
  shortfall: 100,
  recovered: 90,
  data_issue: 80,
  low_confidence: 70,
  cash_tight: 60,
  big_drop: 50,
  big_lift: 45,
  small_drop: 40,
  small_lift: 35,
  connection_repaired: 30,
} satisfies Record<PipReactionType, number>;

const reactionSummary = {
  small_lift: "You spent lightly lately, so today has more room.",
  big_lift: "You spent lightly lately, so today has more room.",
  small_drop: "Recent spending lowered today's room.",
  big_drop: "Recent spending lowered today's room.",
  shortfall: "No extra room today. Essentials first.",
  recovered: "You're back on track.",
  data_issue: "I need cleaner data to trust this.",
  connection_repaired: "You're back on track.",
  cash_tight: "There's room, but not much.",
  low_confidence: "I need cleaner data to trust this.",
} satisfies Record<PipReactionType, string>;

export function comparePipCashResults(
  previousResult: PipCashResult | null | undefined,
  currentResult: PipCashResult,
): PipReactionComparison {
  const previous = previousResult?.spendableCashToday;
  const current = currentResult.spendableCashToday;
  const previousSpendableCents = previous
    ? previous.spendableCashTodayCents
    : previousResult
      ? getDisplayedSpendableCashTodayCents(previousResult)
      : null;
  const currentSpendableCents = current
    ? current.spendableCashTodayCents
    : getDisplayedSpendableCashTodayCents(currentResult);
  const previousState = previous?.state ?? null;
  const currentState = current?.state ?? inferLegacyState(currentSpendableCents);
  const previousConfidence = previous?.confidence ?? null;
  const currentConfidence = current?.confidence ?? null;

  return {
    previousState,
    currentState,
    previousConfidence,
    currentConfidence,
    spendableDeltaCents:
      previousSpendableCents === null ? 0 : currentSpendableCents - previousSpendableCents,
    behaviorAdjustmentDeltaCents:
      (current?.behaviorAdjustmentCents ?? 0) - (previous?.behaviorAdjustmentCents ?? 0),
    shortfallDeltaCents: (current?.shortfallCents ?? 0) - (previous?.shortfallCents ?? 0),
    cashRealityAdjustmentDeltaCents:
      (current?.cashRealityAdjustmentCents ?? 0) - (previous?.cashRealityAdjustmentCents ?? 0),
    confidenceChange:
      previousConfidence && currentConfidence && previousConfidence !== currentConfidence
        ? `${previousConfidence}->${currentConfidence}`
        : null,
    materialDailyChangeCents:
      current?.materialDailyChangeCents ?? FALLBACK_MATERIAL_DAILY_CHANGE_CENTS,
    ...(previous ? { previous } : {}),
    ...(current ? { current } : {}),
  };
}

export function choosePipReaction(input: {
  comparison: PipReactionComparison;
  trigger: PipReactionTrigger;
  recentEvents?: RecentPipReaction[];
  now?: Date;
}): PipReactionDecision | null {
  const now = input.now ?? new Date();
  const decision = chooseRawReaction(input.comparison, input.trigger);

  if (!decision) {
    return null;
  }

  if (isSuppressedByCooldown(decision, input.recentEvents ?? [], now)) {
    return null;
  }

  return decision;
}

function chooseRawReaction(
  comparison: PipReactionComparison,
  trigger: PipReactionTrigger,
): PipReactionDecision | null {
  const { previousState, currentState, current, previous, materialDailyChangeCents } = comparison;

  if (previousState === null && currentState !== "shortfall" && currentState !== "missing_data") {
    return null;
  }

  if (currentState === "shortfall" && previousState !== "shortfall") {
    return toDecision("shortfall", 2, comparison, trigger);
  }

  if (
    previousState === "shortfall" &&
    (currentState === "normal" || currentState === "healthy")
  ) {
    return toDecision("recovered", 2, comparison, trigger);
  }

  if (currentState === "missing_data") {
    return toDecision("data_issue", 1, comparison, trigger);
  }

  if (currentState === "low_confidence" || current?.confidence === "low") {
    return toDecision("low_confidence", 1, comparison, trigger);
  }

  if (
    current?.cashGuardrailApplied &&
    (!previous?.cashGuardrailApplied ||
      comparison.cashRealityAdjustmentDeltaCents >= materialDailyChangeCents)
  ) {
    return toDecision(
      "cash_tight",
      comparison.cashRealityAdjustmentDeltaCents >= materialDailyChangeCents * 2 ? 2 : 1,
      comparison,
      trigger,
    );
  }

  if (comparison.spendableDeltaCents <= -materialDailyChangeCents * 3) {
    return toDecision("big_drop", 2, comparison, trigger);
  }

  if (comparison.spendableDeltaCents >= materialDailyChangeCents * 3) {
    return toDecision("big_lift", 2, comparison, trigger);
  }

  if (comparison.spendableDeltaCents <= -materialDailyChangeCents) {
    return toDecision("small_drop", 1, comparison, trigger);
  }

  if (comparison.spendableDeltaCents >= materialDailyChangeCents) {
    return toDecision("small_lift", 1, comparison, trigger);
  }

  return null;
}

function toDecision(
  reactionType: PipReactionType,
  intensity: 1 | 2 | 3,
  comparison: PipReactionComparison,
  trigger: PipReactionTrigger,
): PipReactionDecision {
  return {
    reactionType,
    trigger,
    currentState: comparison.currentState,
    previousState: comparison.previousState,
    spendableDeltaCents: comparison.spendableDeltaCents,
    behaviorAdjustmentDeltaCents: comparison.behaviorAdjustmentDeltaCents,
    shortfallDeltaCents: comparison.shortfallDeltaCents,
    cashRealityAdjustmentDeltaCents: comparison.cashRealityAdjustmentDeltaCents,
    confidenceChange: comparison.confidenceChange,
    intensity,
    summary: reactionSummary[reactionType],
  };
}

function isSuppressedByCooldown(
  decision: PipReactionDecision,
  recentEvents: RecentPipReaction[],
  now: Date,
): boolean {
  const todayEvents = recentEvents.filter((event) => isSameUtcDate(event.createdAt, now));
  const sameReactionToday = todayEvents.some(
    (event) => event.reactionType === decision.reactionType,
  );

  if (
    sameReactionToday &&
    (decision.reactionType === "shortfall" || decision.reactionType === "data_issue")
  ) {
    return true;
  }

  if (decision.intensity < 2) {
    return false;
  }

  return todayEvents.some(
    (event) =>
      event.intensity >= 2 &&
      reactionPriority[event.reactionType] >= reactionPriority[decision.reactionType],
  );
}

function isSameUtcDate(createdAt: string, now: Date): boolean {
  return createdAt.slice(0, 10) === now.toISOString().slice(0, 10);
}

function inferLegacyState(spendableCashTodayCents: number): SpendableCashTodayState {
  if (spendableCashTodayCents < 0) {
    return "shortfall";
  }

  return "normal";
}
