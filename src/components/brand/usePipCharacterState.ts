import type { PipCharacterAction, PipCharacterMood, PipCharacterProps } from "@/components/brand/PipCharacter";
import type { PipCashResult, SpendableCashTodayState } from "@/lib/types";

type Freshness = {
  state: "fresh" | "stale" | "syncing" | "failed" | "needs_repair" | "partial";
};

type Reaction = {
  reactionType:
    | "small_lift"
    | "big_lift"
    | "small_drop"
    | "big_drop"
    | "shortfall"
    | "recovered"
    | "data_issue"
    | "connection_repaired"
    | "cash_tight"
    | "low_confidence";
  intensity: 1 | 2 | 3;
};

export function usePipCharacterState(input: {
  result: PipCashResult | null;
  freshness?: Freshness;
  reaction?: Reaction;
  isSending?: boolean;
  isLoading?: boolean;
  hasConversation?: boolean;
}): Required<Pick<PipCharacterProps, "mood" | "action" | "intensity">> {
  if (input.isSending) {
    return {
      mood: "normal",
      action: "talking",
      intensity: 1,
    };
  }

  if (input.isLoading || input.freshness?.state === "syncing") {
    return {
      mood: "normal",
      action: "thinking",
      intensity: 1,
    };
  }

  if (
    input.freshness?.state === "needs_repair" ||
    input.freshness?.state === "failed"
  ) {
    return {
      mood: "uncertain",
      action: "wave",
      intensity: 1,
    };
  }

  if (input.reaction) {
    return reactionToCharacterState(input.reaction);
  }

  return moneyStateToCharacterState(input.result?.spendableCashToday?.state);
}

function reactionToCharacterState(reaction: Reaction): Required<Pick<PipCharacterProps, "mood" | "action" | "intensity">> {
  switch (reaction.reactionType) {
    case "small_lift":
      return state("happy", "celebrate", 1);
    case "big_lift":
      return state("happy", "celebrate", 2);
    case "small_drop":
      return state("careful", "notice", 1);
    case "big_drop":
      return state("careful", "notice", 2);
    case "shortfall":
      return state("concerned", "settle", 2);
    case "recovered":
      return state("happy", "celebrate", 2);
    case "data_issue":
      return state("uncertain", "wave", 1);
    case "connection_repaired":
      return state("happy", "wave", 1);
    case "cash_tight":
      return state("careful", "notice", 1);
    case "low_confidence":
      return state("uncertain", "thinking", 1);
  }
}

function moneyStateToCharacterState(
  moneyState: SpendableCashTodayState | undefined,
): Required<Pick<PipCharacterProps, "mood" | "action" | "intensity">> {
  switch (moneyState) {
    case "healthy":
      return state("happy", "idle", 0);
    case "tight":
      return state("careful", "idle", 0);
    case "overspending":
      return state("careful", "notice", 1);
    case "shortfall":
      return state("concerned", "settle", 1);
    case "low_confidence":
      return state("uncertain", "thinking", 1);
    case "missing_data":
      return state("uncertain", "wave", 1);
    case "normal":
    default:
      return state("normal", "idle", 0);
  }
}

function state(
  mood: PipCharacterMood,
  action: PipCharacterAction,
  intensity: 0 | 1 | 2 | 3,
): Required<Pick<PipCharacterProps, "mood" | "action" | "intensity">> {
  return {
    mood,
    action,
    intensity,
  };
}
