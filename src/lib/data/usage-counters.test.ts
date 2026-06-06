import { describe, expect, it } from "vitest";
import { getMonthStartIso, summarizeUsageCounters } from "@/lib/data/usage-counters";

describe("usage counters", () => {
  it("summarizes AI and provider usage for the beta cost surface", () => {
    expect(
      summarizeUsageCounters({
        periodStart: "2026-06-01T00:00:00.000Z",
        events: [
          { event_name: "free_cash_viewed", created_at: "2026-06-05T00:00:00.000Z" },
          { event_name: "prompt_chip_selected", created_at: "2026-06-05T00:00:30.000Z" },
          { event_name: "agent_question_asked", created_at: "2026-06-05T00:00:00.000Z" },
          { event_name: "agent_question_asked", created_at: "2026-06-05T00:01:00.000Z" },
          { event_name: "agent_follow_up_asked", created_at: "2026-06-05T00:01:00.000Z" },
          {
            event_name: "purchase_simulation_requested",
            created_at: "2026-06-05T00:01:00.000Z",
          },
          { event_name: "true_balances_revealed", created_at: "2026-06-05T00:02:00.000Z" },
          {
            event_name: "missing_card_nudge_shown",
            created_at: "2026-06-05T00:02:30.000Z",
          },
          {
            event_name: "missing_card_nudge_suppressed",
            created_at: "2026-06-05T00:03:00.000Z",
          },
          {
            event_name: "negative_free_cash_follow_up",
            created_at: "2026-06-05T00:04:00.000Z",
          },
        ],
        syncRuns: [
          { status: "succeeded", started_at: "2026-06-05T00:00:00.000Z" },
          { status: "partial", started_at: "2026-06-05T00:05:00.000Z" },
          { status: "failed", started_at: "2026-06-05T00:10:00.000Z" },
        ],
      }),
    ).toEqual({
      periodStart: "2026-06-01T00:00:00.000Z",
      freeCashViewCount: 1,
      promptChipSelectionCount: 1,
      aiQuestionCount: 2,
      agentFollowUpCount: 1,
      estimatedModelCallCount: 4,
      purchaseSimulationCount: 1,
      trueBalanceRevealCount: 1,
      missingCardNudgeShownCount: 1,
      missingCardSuppressionCount: 1,
      negativeFreeCashFollowUpCount: 1,
      providerSyncCount: 3,
      partialProviderSyncCount: 1,
      failedProviderSyncCount: 1,
    });
  });

  it("uses the UTC month boundary for counter windows", () => {
    expect(getMonthStartIso(new Date("2026-06-30T23:59:59.000Z"))).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });
});
