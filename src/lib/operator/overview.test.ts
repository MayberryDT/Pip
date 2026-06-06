import { describe, expect, it } from "vitest";
import { summarizeOperatorOverview } from "@/lib/operator/overview";

describe("operator overview", () => {
  it("summarizes stale connections, failed syncs, active users, and product events", () => {
    const now = new Date("2026-06-06T12:00:00.000Z");

    expect(
      summarizeOperatorOverview({
        now,
        periodStart: "2026-05-07T12:00:00.000Z",
        institutions: [
          {
            id: "institution-stale",
            user_id: "user-1",
            provider: "plaid",
            institution_name: "Stale Bank",
            status: "connected",
            last_successful_sync_at: "2026-06-04T12:00:00.000Z",
            stale_after: "2026-06-05T12:00:00.000Z",
            error_code: null,
            error_message: null,
            updated_at: "2026-06-04T12:00:00.000Z",
          },
          {
            id: "institution-failed",
            user_id: "user-2",
            provider: "plaid",
            institution_name: "Failed Bank",
            status: "failed",
            last_successful_sync_at: null,
            stale_after: null,
            error_code: "item-login-required",
            error_message: "Repair required.",
            updated_at: "2026-06-06T10:00:00.000Z",
          },
          {
            id: "institution-good",
            user_id: "user-3",
            provider: "mock",
            institution_name: "Mock Bank",
            status: "mocked",
            last_successful_sync_at: "2026-06-06T11:00:00.000Z",
            stale_after: "2026-06-07T11:00:00.000Z",
            error_code: null,
            error_message: null,
            updated_at: "2026-06-06T11:00:00.000Z",
          },
        ],
        syncRuns: [
          {
            id: "sync-partial",
            user_id: "user-1",
            provider: "plaid",
            status: "partial",
            started_at: "2026-06-06T10:30:00.000Z",
            completed_at: "2026-06-06T10:30:05.000Z",
            duration_ms: 5000,
            account_count: 2,
            transaction_count: 8,
            balance_count: 2,
            error_code: "partial-provider-sync-failure",
            error_message: "1 connected institution could not refresh.",
          },
          {
            id: "sync-failed",
            user_id: "user-2",
            provider: "plaid",
            status: "failed",
            started_at: "2026-06-06T10:00:00.000Z",
            completed_at: "2026-06-06T10:00:05.000Z",
            duration_ms: 5000,
            account_count: 0,
            transaction_count: 0,
            balance_count: 0,
            error_code: "provider-unavailable",
            error_message: "Plaid item requires repair.",
          },
          {
            id: "sync-ok",
            user_id: "user-1",
            provider: "plaid",
            status: "succeeded",
            started_at: "2026-06-06T09:00:00.000Z",
            completed_at: "2026-06-06T09:00:02.000Z",
            duration_ms: 2000,
            account_count: 3,
            transaction_count: 12,
            balance_count: 3,
            error_code: null,
            error_message: null,
          },
        ],
        events: [
          {
            user_id: "user-1",
            event_name: "free_cash_viewed",
            created_at: "2026-06-06T09:00:00.000Z",
          },
          {
            user_id: "user-1",
            event_name: "prompt_chip_selected",
            created_at: "2026-06-06T09:00:30.000Z",
          },
          {
            user_id: "user-1",
            event_name: "purchase_simulation_requested",
            created_at: "2026-06-06T09:01:00.000Z",
          },
          {
            user_id: "user-2",
            event_name: "missing_card_nudge_shown",
            created_at: "2026-06-06T09:01:30.000Z",
          },
          {
            user_id: "user-2",
            event_name: "negative_free_cash_follow_up",
            created_at: "2026-06-06T09:02:00.000Z",
          },
          {
            user_id: "user-2",
            event_name: "missing_card_nudge_suppressed",
            created_at: "2026-06-06T09:03:00.000Z",
          },
        ],
      }),
    ).toMatchObject({
      generatedAt: "2026-06-06T12:00:00.000Z",
      activeUserCount: 2,
      staleConnectionCount: 2,
      failedConnectionCount: 1,
      partialSyncCount: 1,
      failedSyncCount: 1,
      eventCounts: {
        free_cash_viewed: 1,
        prompt_chip_selected: 1,
        purchase_simulation_requested: 1,
        missing_card_nudge_shown: 1,
        negative_free_cash_follow_up: 1,
        missing_card_nudge_suppressed: 1,
      },
      staleConnections: [
        {
          institutionId: "institution-stale",
          userId: "user-1",
          provider: "plaid",
        },
        {
          institutionId: "institution-failed",
          userId: "user-2",
          provider: "plaid",
          errorCode: "item-login-required",
        },
      ],
      latestFailedSyncs: [
        {
          syncRunId: "sync-failed",
          userId: "user-2",
          provider: "plaid",
          errorCode: "provider-unavailable",
        },
      ],
      latestPartialSyncs: [
        {
          syncRunId: "sync-partial",
          userId: "user-1",
          provider: "plaid",
          errorCode: "partial-provider-sync-failure",
        },
      ],
    });
  });
});
