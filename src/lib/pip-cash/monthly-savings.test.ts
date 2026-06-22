import { describe, expect, it } from "vitest";
import { resolveUnifiedMonthlySavings } from "@/lib/pip-cash/monthly-savings";

describe("resolveUnifiedMonthlySavings", () => {
  it("uses the user's monthly savings when it already covers active goals", () => {
    expect(
      resolveUnifiedMonthlySavings({
        userMonthlySavingsCents: 30000,
        savingsGoalMonthlyCents: 28600,
      }),
    ).toEqual({
      monthlySavingsPolicyVersion: "unified_monthly_savings_v1",
      userMonthlySavingsCents: 30000,
      savingsGoalMonthlyCents: 28600,
      totalMonthlySavingsCents: 30000,
      goalAmountCoveredByUserMonthlySavingsCents: 28600,
      goalAmountAboveUserMonthlySavingsCents: 0,
    });
  });

  it("raises monthly savings when active goals need more than the user's amount", () => {
    expect(
      resolveUnifiedMonthlySavings({
        userMonthlySavingsCents: 30000,
        savingsGoalMonthlyCents: 43000,
      }),
    ).toEqual({
      monthlySavingsPolicyVersion: "unified_monthly_savings_v1",
      userMonthlySavingsCents: 30000,
      savingsGoalMonthlyCents: 43000,
      totalMonthlySavingsCents: 43000,
      goalAmountCoveredByUserMonthlySavingsCents: 30000,
      goalAmountAboveUserMonthlySavingsCents: 13000,
    });
  });

  it("uses active goals as monthly savings when the user amount is zero", () => {
    expect(
      resolveUnifiedMonthlySavings({
        userMonthlySavingsCents: 0,
        savingsGoalMonthlyCents: 28600,
      }).totalMonthlySavingsCents,
    ).toBe(28600);
  });
});
