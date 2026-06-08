import { describe, expect, it } from "vitest";
import { getCurrentAppDate } from "@/lib/date/app-date";
import { getCalendarDate } from "@/lib/date/calendar";

describe("app date helpers", () => {
  it("uses the configured app timezone instead of UTC", () => {
    const nearUtcMidnight = new Date("2026-06-08T03:30:00.000Z");

    expect(getCurrentAppDate(nearUtcMidnight, "America/Denver")).toBe("2026-06-07");
    expect(getCurrentAppDate(nearUtcMidnight, "UTC")).toBe("2026-06-08");
  });

  it("can compare browser-local calendar dates with a supplied timezone", () => {
    const previousMountainEvening = new Date("2026-06-08T03:30:00.000Z");

    expect(getCalendarDate(previousMountainEvening, { timeZone: "America/Denver" })).toBe(
      "2026-06-07",
    );
  });
});
