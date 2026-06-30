import { describe, expect, it } from "vitest";
import { getPipMoneyCompanionFlags } from "@/lib/data/pip-money-companion-flags";

describe("getPipMoneyCompanionFlags", () => {
  it("defaults companion rebuild flags off", () => {
    expect(getPipMoneyCompanionFlags({})).toEqual({
      dailyMoneyV2: false,
      activeSavingsGoalsV2: false,
      recurringObligationRules: false,
      appOpenRefreshV2: false,
      openingBubblePlannerV2: false,
      companionResponseV2: false,
    });
  });

  it("parses explicit truthy companion rebuild flags", () => {
    expect(
      getPipMoneyCompanionFlags({
        PIP_DAILY_MONEY_V2: "true",
        PIP_ACTIVE_SAVINGS_GOALS_V2: "1",
        PIP_RECURRING_OBLIGATION_RULES: "yes",
        PIP_APP_OPEN_REFRESH_V2: "on",
        PIP_OPENING_BUBBLE_PLANNER_V2: "TRUE",
        PIP_COMPANION_RESPONSE_V2: " true ",
      }),
    ).toEqual({
      dailyMoneyV2: true,
      activeSavingsGoalsV2: true,
      recurringObligationRules: true,
      appOpenRefreshV2: true,
      openingBubblePlannerV2: true,
      companionResponseV2: true,
    });
  });
});
