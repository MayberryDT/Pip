import type { FreeCashResult } from "@/lib/types";
import { formatMoney } from "@/lib/money";

export function summarizeFreeCash(result: FreeCashResult): string {
  const freeCash = formatMoney(result.freeCashTodayCents);
  const income = formatMoney(result.incomeTotalCents);
  const spending = formatMoney(-result.spendingTotalCents);
  const savings = formatMoney(-result.protectedSavingsMonthlyCents);

  return `${freeCash} comes from ${income} income, ${spending} spending, and ${savings} protected savings across the rolling calendar-month window.`;
}

export function getPrimaryDriver(result: FreeCashResult): string {
  const spendingDriver = result.drivers.find((driver) => driver.id === "spending");
  const rentDriver = result.drivers.find((driver) => driver.id === "rent");

  if (rentDriver) {
    return "Rent is inside the current rolling window.";
  }

  if (spendingDriver && Math.abs(spendingDriver.amountCents) > 0) {
    return "Spending in the current window is the biggest pressure on Free Cash.";
  }

  return "Income is carrying the current Free Cash number.";
}
