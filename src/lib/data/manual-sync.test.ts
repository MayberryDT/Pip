import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertManualSyncAllowed,
  MANUAL_SYNC_RATE_LIMIT_MS,
  ManualSyncRateLimitError,
} from "@/lib/data/manual-sync";
import type { Database } from "@/lib/supabase/database.types";

describe("manual sync rate limiting", () => {
  it("allows sync when the user has never synced", async () => {
    await expect(
      assertManualSyncAllowed(createSyncRunsClient(null), {
        userId: "user-1",
        provider: "plaid",
        now: new Date("2026-06-05T12:00:00.000Z"),
      }),
    ).resolves.toBeUndefined();
  });

  it("allows sync after the manual sync interval has elapsed", async () => {
    await expect(
      assertManualSyncAllowed(
        createSyncRunsClient("2026-06-05T11:58:00.000Z"),
        {
          userId: "user-1",
          provider: "plaid",
          now: new Date("2026-06-05T12:00:00.000Z"),
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects sync inside the manual sync interval", async () => {
    await expect(
      assertManualSyncAllowed(
        createSyncRunsClient(
          new Date(new Date("2026-06-05T12:00:00.000Z").getTime() - MANUAL_SYNC_RATE_LIMIT_MS / 2).toISOString(),
        ),
        {
          userId: "user-1",
          provider: "plaid",
          now: new Date("2026-06-05T12:00:00.000Z"),
        },
      ),
    ).rejects.toMatchObject({
      name: "ManualSyncRateLimitError",
      retryAfterSeconds: 30,
    } satisfies Partial<ManualSyncRateLimitError>);
  });

  it("checks the latest sync for the requested provider only", async () => {
    const conditions: Array<[string, unknown]> = [];

    await assertManualSyncAllowed(
      createSyncRunsClient(null, conditions),
      {
        userId: "user-1",
        provider: "teller",
        now: new Date("2026-06-05T12:00:00.000Z"),
      },
    );

    expect(conditions).toEqual([
      ["user_id", "user-1"],
      ["provider", "teller"],
    ]);
  });
});

function createSyncRunsClient(
  startedAt: string | null,
  conditions: Array<[string, unknown]> = [],
): SupabaseClient<Database> {
  return {
    from(tableName: string) {
      expect(tableName).toBe("sync_runs");

      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          conditions.push([column, value]);
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return Promise.resolve({
            data: startedAt ? [{ started_at: startedAt }] : [],
            error: null,
          });
        },
      };

      return query;
    },
  } as unknown as SupabaseClient<Database>;
}
