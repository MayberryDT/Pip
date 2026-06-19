import { describe, expect, it } from "vitest";
import { pendingActionSchema } from "@/lib/agent/response-schema";
import {
  buildSavingsGoalDraftPlan,
  buildSavingsGoalPendingAction,
  getSavingsGoalMissingFields,
  isCompleteSavingsGoalDraft,
  mergeSavingsGoalDraft,
  parseSavingsGoalDraftFromMessage,
} from "@/lib/savings-goals/draft";

const asOfDate = "2026-06-19";

describe("savings goal draft helpers", () => {
  it("starts a Japan trip draft without inventing a target amount", () => {
    const draft = parseSavingsGoalDraftFromMessage("I need to save for a trip to Japan", {
      asOfDate,
    });

    expect(draft).toMatchObject({
      name: "Japan trip",
    });
    expect(draft?.targetAmountCents).toBeUndefined();
    expect(getSavingsGoalMissingFields(draft)).toEqual(["target_amount"]);
    expect(isCompleteSavingsGoalDraft(draft)).toBe(false);
    expect(buildSavingsGoalPendingAction(draft)).toMatchObject({
      type: "create_savings_goal",
      name: "Japan trip",
      missing: ["target_amount"],
    });
    expect(pendingActionSchema.safeParse(buildSavingsGoalPendingAction(draft)).success).toBe(true);
  });

  it("does not let a bare yes invent amount or date fields", () => {
    const existingDraft = { name: "Japan trip" };
    const parsed = parseSavingsGoalDraftFromMessage("Yes", {
      asOfDate,
      existingDraft,
    });

    expect(parsed).toBeNull();
    expect(mergeSavingsGoalDraft(existingDraft, parsed)).toEqual(existingDraft);
    expect(getSavingsGoalMissingFields(existingDraft)).toEqual(["target_amount"]);
  });

  it("merges a target amount and deterministic future target date into an existing draft", () => {
    const amountOnly = mergeSavingsGoalDraft(
      { name: "Japan trip" },
      parseSavingsGoalDraftFromMessage("$3000", {
        asOfDate,
        existingDraft: { name: "Japan trip" },
      }),
    );
    const parsed = parseSavingsGoalDraftFromMessage("$3000 by December 1st", {
      asOfDate,
      existingDraft: { name: "Japan trip" },
    });
    const merged = mergeSavingsGoalDraft({ name: "Japan trip" }, parsed);

    expect(amountOnly).toMatchObject({
      name: "Japan trip",
      targetAmountCents: 300000,
    });
    expect(getSavingsGoalMissingFields(amountOnly)).toEqual(["target_date"]);
    expect(isCompleteSavingsGoalDraft(amountOnly)).toBe(false);
    expect(parsed).toMatchObject({
      targetAmountCents: 300000,
      targetDate: "2026-12-01",
    });
    expect(merged).toMatchObject({
      name: "Japan trip",
      targetAmountCents: 300000,
      targetDate: "2026-12-01",
    });
    expect(
      parseSavingsGoalDraftFromMessage("$3000 by January 5", {
        asOfDate: "2026-12-20",
        existingDraft: { name: "Japan trip" },
      }),
    ).toMatchObject({
      targetDate: "2027-01-05",
    });
    expect(getSavingsGoalMissingFields(merged)).toEqual([]);
    expect(isCompleteSavingsGoalDraft(merged)).toBe(true);
    expect(buildSavingsGoalPendingAction(merged)).toMatchObject({
      type: "create_savings_goal",
      name: "Japan trip",
      targetAmountCents: 300000,
      targetDate: "2026-12-01",
      missing: ["confirmation"],
    });
    expect(pendingActionSchema.safeParse(buildSavingsGoalPendingAction(merged)).success).toBe(true);
  });

  it("uses the savings goal planner for draft monthly and daily math", () => {
    const plan = buildSavingsGoalDraftPlan(
      {
        name: "Japan trip",
        targetAmountCents: 300000,
        targetDate: "2026-12-01",
      },
      { asOfDate },
    );

    expect(plan.remainingCents).toBe(300000);
    expect(plan.recommendedMonthlyContributionCents).toBeGreaterThan(0);
    expect(plan.recommendedDailyContributionCents).toBeGreaterThan(0);
  });

  it("recognizes calculation follow-ups only against an existing draft", () => {
    const existingDraft = { name: "Japan trip" };

    expect(
      parseSavingsGoalDraftFromMessage("How much do I need to hit that goal?", {
        asOfDate,
      }),
    ).toBeNull();

    const parsed = parseSavingsGoalDraftFromMessage("How much do I need to hit that goal?", {
      asOfDate,
      existingDraft,
    });
    const merged = mergeSavingsGoalDraft(existingDraft, parsed);

    expect(parsed).toEqual({
      followUpIntent: "progress_calculation",
    });
    expect(merged).toMatchObject({
      name: "Japan trip",
      followUpIntent: "progress_calculation",
    });
    expect(merged.targetAmountCents).toBeUndefined();
    expect(isCompleteSavingsGoalDraft(merged)).toBe(false);
    expect(buildSavingsGoalPendingAction(merged)).toMatchObject({
      type: "create_savings_goal",
      name: "Japan trip",
      missing: ["target_amount"],
    });
    expect(pendingActionSchema.safeParse(buildSavingsGoalPendingAction(merged)).success).toBe(true);
  });
});
