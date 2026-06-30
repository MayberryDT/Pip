import { getCalendarDate } from "@/lib/date/calendar";

export const DEFAULT_APP_TIME_ZONE = "America/Denver";

export function getCurrentAppDate(
  now = new Date(),
  timeZone = process.env.PIP_APP_TIME_ZONE ?? DEFAULT_APP_TIME_ZONE,
): string {
  return getCalendarDate(now, { timeZone });
}
