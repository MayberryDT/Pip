export function isSavingsGoalsEnabled() {
  return process.env.PIP_SAVINGS_GOALS_ENABLED === "true";
}

export function isSavingsGoalsClientEnabled() {
  return process.env.NEXT_PUBLIC_SAVINGS_GOALS_ENABLED === "true";
}
