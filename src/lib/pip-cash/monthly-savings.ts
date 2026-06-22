export const PIP_MONTHLY_SAVINGS_POLICY_VERSION = "unified_monthly_savings_v1" as const;

export type UnifiedMonthlySavingsInput = {
  userMonthlySavingsCents: number;
  savingsGoalMonthlyCents: number;
};

export type UnifiedMonthlySavingsResolution = {
  monthlySavingsPolicyVersion: typeof PIP_MONTHLY_SAVINGS_POLICY_VERSION;
  userMonthlySavingsCents: number;
  savingsGoalMonthlyCents: number;
  totalMonthlySavingsCents: number;
  goalAmountCoveredByUserMonthlySavingsCents: number;
  goalAmountAboveUserMonthlySavingsCents: number;
};

export function resolveUnifiedMonthlySavings(
  input: UnifiedMonthlySavingsInput,
): UnifiedMonthlySavingsResolution {
  const userMonthlySavingsCents = Math.max(0, input.userMonthlySavingsCents);
  const savingsGoalMonthlyCents = Math.max(0, input.savingsGoalMonthlyCents);
  const totalMonthlySavingsCents = Math.max(
    userMonthlySavingsCents,
    savingsGoalMonthlyCents,
  );

  return {
    monthlySavingsPolicyVersion: PIP_MONTHLY_SAVINGS_POLICY_VERSION,
    userMonthlySavingsCents,
    savingsGoalMonthlyCents,
    totalMonthlySavingsCents,
    goalAmountCoveredByUserMonthlySavingsCents: Math.min(
      userMonthlySavingsCents,
      savingsGoalMonthlyCents,
    ),
    goalAmountAboveUserMonthlySavingsCents: Math.max(
      0,
      savingsGoalMonthlyCents - userMonthlySavingsCents,
    ),
  };
}
