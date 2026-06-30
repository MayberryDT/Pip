import type { RollingWindow } from "@/lib/types";

type DateParts = {
  year: number;
  month: number;
  day: number;
};

export function parseDateParts(date: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Expected YYYY-MM-DD date, received ${date}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function formatDateParts(parts: DateParts): string {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function subtractOneCalendarMonth(date: string): string {
  const parts = parseDateParts(date);
  let targetYear = parts.year;
  let targetMonth = parts.month - 1;

  if (targetMonth === 0) {
    targetMonth = 12;
    targetYear -= 1;
  }

  const targetDay = Math.min(parts.day, daysInMonth(targetYear, targetMonth));

  return formatDateParts({
    year: targetYear,
    month: targetMonth,
    day: targetDay,
  });
}

export function dateToUtc(date: string): number {
  const parts = parseDateParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function addDays(date: string, dayDelta: number): string {
  const next = new Date(dateToUtc(date));
  next.setUTCDate(next.getUTCDate() + dayDelta);

  return formatDateParts({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  });
}

export function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = dateToUtc(startDate);
  const end = dateToUtc(endDate);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  if (end < start) {
    throw new Error(`Window end ${endDate} is before start ${startDate}`);
  }

  return Math.floor((end - start) / millisecondsPerDay) + 1;
}

export function isWithinInclusiveWindow(date: string, window: RollingWindow): boolean {
  return date >= window.startDate && date <= window.endDate;
}

export function buildRollingCalendarWindow(asOfDate: string): RollingWindow {
  const startDate = addDays(subtractOneCalendarMonth(asOfDate), 1);
  const dayCount = inclusiveDayCount(startDate, asOfDate);

  return {
    startDate,
    endDate: asOfDate,
    dayCount,
    daysElapsed: dayCount,
    daysRemaining: 0,
  };
}
