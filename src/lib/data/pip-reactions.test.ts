import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const reactionMocks = vi.hoisted(() => ({
  recordProductEventSafely: vi.fn(),
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: reactionMocks.recordProductEventSafely,
}));

import {
  createPipReactionEventForUser,
  markPipReactionSeenForUser,
} from "@/lib/data/pip-reactions";

afterEach(() => {
  vi.clearAllMocks();
});

describe("Pip reaction event logging", () => {
  it("records product analytics when creating a reaction", async () => {
    const supabase = createPipReactionsClient();

    await expect(
      createPipReactionEventForUser(supabase.client, {
        userId: "user-1",
        decision: {
          reactionType: "small_lift",
          trigger: "manual_refresh",
          previousState: "tight",
          currentState: "normal",
          spendableDeltaCents: 2400,
          behaviorAdjustmentDeltaCents: 700,
          shortfallDeltaCents: -500,
          cashRealityAdjustmentDeltaCents: 1200,
          confidenceChange: "higher",
          intensity: 2,
          summary: "Spendable cash improved.",
        },
      }),
    ).resolves.toMatchObject({
      id: "reaction-1",
      reactionType: "small_lift",
      intensity: 2,
    });

    expect(supabase.inserts[0]).toMatchObject({
      user_id: "user-1",
      reaction_type: "small_lift",
      trigger: "manual_refresh",
      previous_state: "tight",
      current_state: "normal",
    });
    expect(reactionMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase.client,
      "user-1",
      "pip_reaction_created",
      {
        reactionType: "small_lift",
        trigger: "manual_refresh",
        previousState: "tight",
        currentState: "normal",
        intensity: 2,
        spendableDeltaCents: 2400,
        behaviorAdjustmentDeltaCents: 700,
        shortfallDeltaCents: -500,
      },
    );
  });

  it("records product analytics when a reaction is seen", async () => {
    const now = new Date("2026-06-05T12:00:00.000Z");
    const supabase = createPipReactionsClient();

    await expect(
      markPipReactionSeenForUser(supabase.client, {
        userId: "user-1",
        reactionId: "reaction-1",
        now,
      }),
    ).resolves.toMatchObject({
      id: "reaction-1",
      reactionType: "small_lift",
    });

    expect(supabase.updates[0]).toEqual({
      seen_at: "2026-06-05T12:00:00.000Z",
    });
    expect(reactionMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase.client,
      "user-1",
      "pip_reaction_seen",
      {
        reactionId: "reaction-1",
        reactionType: "small_lift",
        intensity: 2,
        ageMs: 30_000,
        screen: "home",
      },
    );
  });
});

function createPipReactionsClient() {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const client = {
    from(tableName: string) {
      if (tableName !== "pip_reaction_events") {
        throw new Error(`Unexpected table ${tableName}`);
      }

      return {
        insert(row: unknown) {
          inserts.push(row);

          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: reactionRow(),
                    error: null,
                  });
                },
              };
            },
          };
        },
        update(row: unknown) {
          updates.push(row);
          const builder = {
            eq() {
              return builder;
            },
            select() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: reactionRow(),
                    error: null,
                  });
                },
              };
            },
          };

          return builder;
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  return {
    client,
    inserts,
    updates,
  };
}

function reactionRow() {
  return {
    id: "reaction-1",
    reaction_type: "small_lift",
    trigger: "manual_refresh",
    previous_state: "tight",
    current_state: "normal",
    spendable_delta_cents: 2400,
    behavior_adjustment_delta_cents: 700,
    shortfall_delta_cents: -500,
    cash_reality_adjustment_delta_cents: 1200,
    confidence_change: "higher",
    intensity: 2,
    summary: "Spendable cash improved.",
    created_at: "2026-06-05T11:59:30.000Z",
    seen_at: null,
    user_id: "user-1",
  };
}
