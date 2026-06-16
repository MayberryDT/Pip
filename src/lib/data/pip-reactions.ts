import type { SupabaseClient } from "@supabase/supabase-js";
import { recordProductEvent } from "@/lib/data/product-events";
import type { PipReactionDecision, RecentPipReaction } from "@/lib/pip/reactions";
import type { Database } from "@/lib/supabase/database.types";

type PipReactionRow = Database["public"]["Tables"]["pip_reaction_events"]["Row"];

export type PipReactionApiEvent = {
  id: string;
  reactionType: PipReactionRow["reaction_type"];
  trigger: PipReactionRow["trigger"];
  previousState?: string;
  currentState: string;
  spendableDeltaCents: number;
  behaviorAdjustmentDeltaCents: number;
  shortfallDeltaCents: number;
  intensity: 1 | 2 | 3;
  summary?: string;
  createdAt: string;
};

export async function loadLatestUnseenPipReactionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PipReactionApiEvent | null> {
  const { data, error } = await supabase
    .from("pip_reaction_events")
    .select("*")
    .eq("user_id", userId)
    .is("seen_at", null)
    .order("intensity", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const row = data?.[0];

  return row ? mapReactionRow(row) : null;
}

export async function loadRecentPipReactionEventsForUser(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    now?: Date;
  },
): Promise<RecentPipReaction[]> {
  const now = input.now ?? new Date();
  const dayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const { data, error } = await supabase
    .from("pip_reaction_events")
    .select("reaction_type, intensity, created_at")
    .eq("user_id", input.userId)
    .gte("created_at", dayStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    reactionType: row.reaction_type,
    intensity: row.intensity,
    createdAt: row.created_at,
  }));
}

export async function createPipReactionEventForUser(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    decision: PipReactionDecision;
  },
): Promise<PipReactionApiEvent> {
  const { data, error } = await supabase
    .from("pip_reaction_events")
    .insert({
      user_id: input.userId,
      previous_state: input.decision.previousState,
      current_state: input.decision.currentState,
      spendable_delta_cents: input.decision.spendableDeltaCents,
      behavior_adjustment_delta_cents: input.decision.behaviorAdjustmentDeltaCents,
      shortfall_delta_cents: input.decision.shortfallDeltaCents,
      cash_reality_adjustment_delta_cents:
        input.decision.cashRealityAdjustmentDeltaCents,
      confidence_change: input.decision.confidenceChange,
      trigger: input.decision.trigger,
      reaction_type: input.decision.reactionType,
      intensity: input.decision.intensity,
      summary: input.decision.summary,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const reaction = mapReactionRow(data);

  await recordProductEvent(supabase, input.userId, "pip_reaction_created", {
    reactionType: reaction.reactionType,
    trigger: reaction.trigger,
    previousState: reaction.previousState,
    currentState: reaction.currentState,
    intensity: reaction.intensity,
    spendableDeltaCents: reaction.spendableDeltaCents,
    behaviorAdjustmentDeltaCents: reaction.behaviorAdjustmentDeltaCents,
    shortfallDeltaCents: reaction.shortfallDeltaCents,
  });

  return reaction;
}

export async function markPipReactionSeenForUser(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    reactionId: string;
    now?: Date;
  },
): Promise<PipReactionApiEvent | null> {
  const now = input.now ?? new Date();
  const { data, error } = await supabase
    .from("pip_reaction_events")
    .update({
      seen_at: now.toISOString(),
    })
    .eq("user_id", input.userId)
    .eq("id", input.reactionId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const reaction = mapReactionRow(data);

  await recordProductEvent(supabase, input.userId, "pip_reaction_seen", {
    reactionId: reaction.id,
    reactionType: reaction.reactionType,
    intensity: reaction.intensity,
    ageMs: Math.max(0, now.getTime() - new Date(reaction.createdAt).getTime()),
    screen: "home",
  });

  return reaction;
}

function mapReactionRow(row: PipReactionRow): PipReactionApiEvent {
  return {
    id: row.id,
    reactionType: row.reaction_type,
    trigger: row.trigger,
    ...(row.previous_state ? { previousState: row.previous_state } : {}),
    currentState: row.current_state,
    spendableDeltaCents: row.spendable_delta_cents,
    behaviorAdjustmentDeltaCents: row.behavior_adjustment_delta_cents,
    shortfallDeltaCents: row.shortfall_delta_cents,
    intensity: toApiIntensity(row.intensity),
    ...(row.summary ? { summary: row.summary } : {}),
    createdAt: row.created_at,
  };
}

function toApiIntensity(intensity: number): 1 | 2 | 3 {
  if (intensity >= 3) {
    return 3;
  }

  return intensity >= 2 ? 2 : 1;
}
