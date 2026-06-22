import { describe, expect, it } from "vitest";
import { agentResponseSchema } from "@/lib/agent/response-schema";

describe("agentResponseSchema", () => {
  it("accepts savings goal previews with unified Monthly Savings fields", () => {
    expect(() =>
      agentResponseSchema.parse({
        message: "Japan fits inside your current Monthly Savings.",
        cards: [
          {
            type: "savings_goal_preview",
            title: "Savings Goal Preview",
            name: "Japan",
            targetAmountCents: 300000,
            currentAmountCents: 0,
            remainingCents: 300000,
            monthlyContributionCents: 28600,
            includeInSpendableCash: true,
            monthlySavingsAfterGoalCents: 30000,
            monthlySavingsIncreaseCents: 0,
            currentSpendableCashTodayCents: 1200,
            spendableCashTodayAfterGoalCents: 1200,
            currentBaselineDailyAllowanceCents: 3000,
            baselineDailyAllowanceAfterGoalCents: 3000,
            dailyRoomDeltaCents: 0,
            warningLevel: "ok",
            summary: "Japan would need $286/month and fits inside your current Monthly Savings.",
          },
        ],
        promptChips: [],
        usedTools: ["preview_savings_goal"],
        responseMode: "show_card",
        audit: {
          toolNames: ["preview_savings_goal"],
          usedModel: true,
        },
      }),
    ).not.toThrow();
  });
});
