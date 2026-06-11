import { describe, expect, it } from "vitest";
import { buildSpendableCashForecast } from "@/lib/pip-cash/insights";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";

describe("Spendable Cash forecast", () => {
  it("uses the V2 Spendable Cash Today metric instead of legacy rolling surplus", () => {
    const result = calculatePipCash(fakeSnapshot);
    const forecast = buildSpendableCashForecast(fakeSnapshot, {
      horizonDays: 14,
    });

    expect(result.pipCashTodayCents).not.toBe(result.spendableCashToday?.spendableCashTodayCents);
    expect(forecast.currentSpendableCashCents).toBe(
      result.spendableCashToday?.spendableCashTodayCents,
    );
    expect(forecast.currentSpendableCashCents).not.toBe(result.pipCashTodayCents);
    expect(forecast.points).toHaveLength(14);
    expect(forecast.points[0].deltaFromTodayCents).toBe(
      forecast.points[0].projectedSpendableCashCents - forecast.currentSpendableCashCents,
    );
  });
});
