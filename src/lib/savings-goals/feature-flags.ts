export function isSavingsGoalsEnabled() {
  return process.env.PIP_SAVINGS_GOALS_ENABLED !== "false";
}

export function isSavingsGoalsClientEnabled() {
  return process.env.NEXT_PUBLIC_SAVINGS_GOALS_ENABLED !== "false";
}
