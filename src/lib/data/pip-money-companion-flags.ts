type FeatureFlagEnv = Record<string, string | undefined>;

export type PipMoneyCompanionFlags = {
  dailyMoneyV2: boolean;
  activeSavingsGoalsV2: boolean;
  recurringObligationRules: boolean;
  appOpenRefreshV2: boolean;
  openingBubblePlannerV2: boolean;
  companionResponseV2: boolean;
};

export function getPipMoneyCompanionFlags(
  env: FeatureFlagEnv = process.env,
): PipMoneyCompanionFlags {
  return {
    dailyMoneyV2: parseBoolean(env.PIP_DAILY_MONEY_V2),
    activeSavingsGoalsV2: parseBoolean(env.PIP_ACTIVE_SAVINGS_GOALS_V2),
    recurringObligationRules: parseBoolean(env.PIP_RECURRING_OBLIGATION_RULES),
    appOpenRefreshV2: parseBoolean(env.PIP_APP_OPEN_REFRESH_V2),
    openingBubblePlannerV2: parseBoolean(env.PIP_OPENING_BUBBLE_PLANNER_V2),
    companionResponseV2: parseBoolean(env.PIP_COMPANION_RESPONSE_V2),
  };
}

function parseBoolean(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
