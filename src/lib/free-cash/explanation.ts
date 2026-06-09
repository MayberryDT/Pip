import type { FreeCashResult } from "@/lib/types";
import { formatMoney } from "@/lib/money";

export function summarizeFreeCash(result: FreeCashResult): string {
  if (result.spendableCashToday) {
    const metric = result.spendableCashToday;
    const spendable = formatMoney(metric.spendableCashTodayCents);
    const baseline = formatMoney(metric.baselineDailyAllowanceCents);
    const adjustment = formatMoney(metric.behaviorAdjustmentCents);
    const bills = formatMoney(metric.averageMonthlyRecurringObligationsCents);
    const savings = formatMoney(metric.protectedSavingsMonthlyCents);

    if (metric.shortfallCents > 0) {
      return `I found ${spendable} for today. Your normal room is ${baseline}, but you’re ${formatMoney(metric.shortfallCents)} over pattern after bills, savings, and cash guardrails.`;
    }

    if (Math.abs(metric.behaviorAdjustmentCents) > 0) {
      return `I found ${spendable} for today. Your normal room is ${baseline}/day, with ${adjustment}/day from recent spending pace, plus ${bills} bills and ${savings} savings held back.`;
    }

    return `I found ${spendable} for today. Your normal room is ${baseline}/day after bills, protected savings, and a small cushion are already held back.`;
  }

  const freeCash = formatMoney(result.freeCashTodayCents);
  const income = formatMoney(result.incomeTotalCents);
  const spending = formatMoney(-result.spendingTotalCents);
  const savings = formatMoney(-result.protectedSavingsMonthlyCents);

  return `Spendable Cash is ${freeCash} today after ${income} income, ${spending} spending, and ${savings} protected savings.`;
}

export function getPrimaryDriver(result: FreeCashResult): string {
  if (result.spendableCashToday?.drivers[0]) {
    return result.spendableCashToday.drivers[0].detail;
  }

  const spendingDriver = result.drivers.find((driver) => driver.id === "spending");
  const rentDriver = result.drivers.find((driver) => driver.id === "rent");

  if (rentDriver) {
    return "Rent is inside the current rolling window.";
  }

  if (spendingDriver && Math.abs(spendingDriver.amountCents) > 0) {
    return "Spending in the current window is the biggest pressure on Spendable Cash Today.";
  }

  return "Income is carrying the current Spendable Cash Today number.";
}
