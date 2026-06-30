import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ProductEventRow = Pick<
  Database["public"]["Tables"]["product_events"]["Row"],
  "event_name" | "created_at"
>;
type SyncRunRow = Pick<
  Database["public"]["Tables"]["sync_runs"]["Row"],
  "status" | "started_at"
>;

export type UsageCounters = {
  periodStart: string;
  pipCashViewCount: number;
  promptChipSelectionCount: number;
  aiQuestionCount: number;
  agentFollowUpCount: number;
  estimatedModelCallCount: number;
  purchaseSimulationCount: number;
  trueBalanceRevealCount: number;
  missingCardNudgeShownCount: number;
  missingCardSuppressionCount: number;
  negativePipCashFollowUpCount: number;
  providerSyncCount: number;
  partialProviderSyncCount: number;
  failedProviderSyncCount: number;
};

export async function loadUsageCountersForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  now = new Date(),
): Promise<UsageCounters> {
  const periodStart = getMonthStartIso(now);
  const [eventsResult, syncRunsResult] = await Promise.all([
    supabase
      .from("product_events")
      .select("event_name, created_at")
      .eq("user_id", userId)
      .gte("created_at", periodStart),
    supabase
      .from("sync_runs")
      .select("status, started_at")
      .eq("user_id", userId)
      .gte("started_at", periodStart),
  ]);

  if (eventsResult.error) {
    throw eventsResult.error;
  }

  if (syncRunsResult.error) {
    throw syncRunsResult.error;
  }

  return summarizeUsageCounters({
    periodStart,
    events: eventsResult.data ?? [],
    syncRuns: syncRunsResult.data ?? [],
  });
}

export function summarizeUsageCounters(input: {
  periodStart: string;
  events: ProductEventRow[];
  syncRuns: SyncRunRow[];
}): UsageCounters {
  const aiQuestionCount = countEvents(input.events, "agent_question_asked");

  return {
    periodStart: input.periodStart,
    pipCashViewCount: countEvents(input.events, "pip_cash_viewed"),
    promptChipSelectionCount: countEvents(input.events, "prompt_chip_selected"),
    aiQuestionCount,
    agentFollowUpCount: countEvents(input.events, "agent_follow_up_asked"),
    estimatedModelCallCount: aiQuestionCount * 2,
    purchaseSimulationCount: countEvents(input.events, "purchase_simulation_requested"),
    trueBalanceRevealCount: countEvents(input.events, "true_balances_revealed"),
    missingCardNudgeShownCount: countEvents(input.events, "missing_card_nudge_shown"),
    missingCardSuppressionCount: countEvents(input.events, "missing_card_nudge_suppressed"),
    negativePipCashFollowUpCount: countEvents(input.events, "negative_pip_cash_follow_up"),
    providerSyncCount: input.syncRuns.length,
    partialProviderSyncCount: input.syncRuns.filter((run) => run.status === "partial").length,
    failedProviderSyncCount: input.syncRuns.filter((run) => run.status === "failed").length,
  };
}

export function getMonthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function countEvents(events: ProductEventRow[], eventName: string): number {
  return events.filter((event) => event.event_name === eventName).length;
}
