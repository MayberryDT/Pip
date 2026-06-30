import { describe, expect, it } from "vitest";
import {
  buildRollingCalendarWindow,
  inclusiveDayCount,
  subtractOneCalendarMonth,
} from "@/lib/pip-cash/date-window";

describe("buildRollingCalendarWindow", () => {
  it.each([
    ["2026-03-28", "2026-03-01", 28],
    ["2024-03-29", "2024-03-01", 29],
    ["2026-05-30", "2026-05-01", 30],
    ["2026-05-31", "2026-05-01", 31],
  ])("uses calendar-month windows for %s", (asOfDate, startDate, dayCount) => {
    expect(buildRollingCalendarWindow(asOfDate)).toEqual({
      startDate,
      endDate: asOfDate,
      dayCount,
      daysElapsed: dayCount,
      daysRemaining: 0,
    });
  });

  it("keeps month-end behavior explicit around leap years", () => {
    expect(subtractOneCalendarMonth("2026-03-31")).toBe("2026-02-28");
    expect(subtractOneCalendarMonth("2024-03-31")).toBe("2024-02-29");
  });

  it("counts inclusive month-boundary windows", () => {
    expect(inclusiveDayCount("2026-05-21", "2026-06-20")).toBe(31);
    expect(inclusiveDayCount("2026-06-01", "2026-06-01")).toBe(1);
  });
});
