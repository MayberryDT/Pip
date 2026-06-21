import { describe, expect, it } from "vitest";
import {
  buildSavingsGoalDraft,
  getSavingsGoalPreviewMissingFields,
  resolvePendingActionConfirmation,
} from "@/lib/agent/pending-actions";

describe("pending action helpers", () => {
  it("requires savings goal amount plus either target date or monthly contribution", () => {
    expect(getSavingsGoalPreviewMissingFields(buildSavingsGoalDraft({
      message: "Help me save for Japan",
    }))).toEqual(expect.arrayContaining(["target_amount", "target_date_or_monthly_contribution"]));

    expect(getSavingsGoalPreviewMissingFields(buildSavingsGoalDraft({
      message: "Help me save $2,400 for Japan",
    }))).toEqual(["target_date_or_monthly_contribution"]);

    expect(getSavingsGoalPreviewMissingFields(buildSavingsGoalDraft({
      message: "Help me save $2,400 for Japan by December 2026",
    }))).toEqual([]);

    expect(getSavingsGoalPreviewMissingFields(buildSavingsGoalDraft({
      message: "Help me save $2,400 for Japan at $200/month",
    }))).toEqual([]);
  });

  it("merges a multi-turn savings goal draft without writing visible copy", () => {
    const first = buildSavingsGoalDraft({
      message: "I want to save for Japan",
    });
    const second = buildSavingsGoalDraft({
      message: "$2,400 by December 2026",
      pendingAction: {
        type: "preview_savings_goal",
        name: first.name,
        missing: getSavingsGoalPreviewMissingFields(first),
      },
    });

    expect(second).toMatchObject({
      name: "Japan",
      targetAmountCents: 240000,
      targetDate: "2026-12-31",
      includeInSpendableCash: true,
    });
    expect(getSavingsGoalPreviewMissingFields(second)).toEqual([]);
  });

  it("understands a bare target month while continuing a pending savings goal", () => {
    const draft = buildSavingsGoalDraft({
      message: "$5,000 for a new computer in December",
      asOfDate: "2026-06-20",
      pendingAction: {
        type: "preview_savings_goal",
        name: "Savings goal",
        missing: ["target_amount", "target_date_or_monthly_contribution"],
      },
    });

    expect(draft).toMatchObject({
      name: "Computer",
      targetAmountCents: 500000,
      targetDate: "2026-12-31",
      includeInSpendableCash: true,
    });
    expect(getSavingsGoalPreviewMissingFields(draft)).toEqual([]);
  });

  it("accepts contextual confirmation only for the current ordinary pending action", () => {
    const pendingAction = {
      type: "ordinary_write" as const,
      action: "create_savings_goal",
      createdAt: "2026-06-20T12:00:00.000Z",
      expiresAt: "2026-06-20T12:05:00.000Z",
      confirmationKind: "contextual" as const,
      summary: "Create Japan savings goal",
    };

    expect(resolvePendingActionConfirmation({
      message: "yes, create it",
      pendingAction,
      now: new Date("2026-06-20T12:01:00.000Z"),
    })).toEqual({ ok: true, reason: "contextual_confirmation" });

    expect(resolvePendingActionConfirmation({
      message: "yes",
      pendingAction,
      now: new Date("2026-06-20T12:10:00.000Z"),
    })).toEqual({ ok: false, reason: "expired" });
  });

  it("requires exact confirmation for sensitive pending actions", () => {
    const pendingAction = {
      type: "sensitive_confirmation" as const,
      action: "delete_user_data",
      createdAt: "2026-06-20T12:00:00.000Z",
      expiresAt: "2026-06-20T12:05:00.000Z",
      confirmationKind: "exact" as const,
      exactConfirmation: "DELETE DATA",
      summary: "Delete stored data",
    };

    expect(resolvePendingActionConfirmation({
      message: "yes",
      pendingAction,
      now: new Date("2026-06-20T12:01:00.000Z"),
    })).toEqual({ ok: false, reason: "exact_confirmation_required" });

    expect(resolvePendingActionConfirmation({
      message: "DELETE DATA",
      pendingAction,
      now: new Date("2026-06-20T12:01:00.000Z"),
    })).toEqual({ ok: true, reason: "exact_confirmation" });
  });
});
