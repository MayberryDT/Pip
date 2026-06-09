import { describe, expect, it } from "vitest";
import { buildSpendableCashForecast } from "@/lib/free-cash/insights";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";

describe("Spendable Cash forecast", () => {
  it("uses the V2 Spendable Cash Today metric instead of legacy rolling surplus", () => {
    const result = calculateFreeCash(fakeSnapshot);
    const forecast = buildSpendableCashForecast(fakeSnapshot, {
      horizonDays: 14,
    });

    expect(result.freeCashTodayCents).not.toBe(result.spendableCashToday?.spendableCashTodayCents);
    expect(forecast.currentSpendableCashCents).toBe(
      result.spendableCashToday?.spendableCashTodayCents,
    );
    expect(forecast.currentSpendableCashCents).not.toBe(result.freeCashTodayCents);
    expect(forecast.points).toHaveLength(14);
    expect(forecast.points[0].deltaFromTodayCents).toBe(
      forecast.points[0].projectedSpendableCashCents - forecast.currentSpendableCashCents,
    );
  });
});
