import { describe, expect, it } from "vitest";
import { usePipCharacterState } from "@/components/brand/usePipCharacterState";
import type { PipCashResult } from "@/lib/types";

describe("usePipCharacterState", () => {
  it("prioritizes active app states over reactions and idle money state", () => {
    expect(
      usePipCharacterState({
        result: result("healthy"),
        reaction: {
          reactionType: "small_lift",
          intensity: 1,
        },
        isSending: true,
      }),
    ).toEqual({
      mood: "normal",
      action: "talking",
      intensity: 1,
    });
    expect(
      usePipCharacterState({
        result: result("healthy"),
        reaction: {
          reactionType: "small_lift",
          intensity: 1,
        },
        freshness: {
          state: "syncing",
        },
      }),
    ).toEqual({
      mood: "normal",
      action: "thinking",
      intensity: 1,
    });
  });

  it("maps reactions before idle money state", () => {
    expect(
      usePipCharacterState({
        result: result("normal"),
        reaction: {
          reactionType: "shortfall",
          intensity: 2,
        },
      }),
    ).toEqual({
      mood: "concerned",
      action: "settle",
      intensity: 2,
    });
  });

  it("maps money state to idle character state", () => {
    expect(usePipCharacterState({ result: result("healthy") })).toMatchObject({
      mood: "happy",
      action: "idle",
    });
    expect(usePipCharacterState({ result: result("shortfall") })).toMatchObject({
      mood: "concerned",
      action: "settle",
    });
  });
});

function result(state: NonNullable<PipCashResult["spendableCashToday"]>["state"]): PipCashResult {
  return {
    pipCashTodayCents: 1000,
    rollingNetCents: 0,
    incomeTotalCents: 0,
    spendingTotalCents: 0,
    refundTotalCents: 0,
    protectedSavingsMonthlyCents: 0,
    window: {
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      dayCount: 30,
      daysElapsed: 11,
      daysRemaining: 19,
    },
    drivers: [],
    warnings: [],
    dataStates: [],
    trueBalances: [],
    spendableCashToday: {
      state,
    } as PipCashResult["spendableCashToday"],
  };
}
