export function getCalendarDate(
  value = new Date(),
  options: {
    timeZone?: string;
  } = {},
): string {
  if (options.timeZone) {
    return getCalendarDateInTimeZone(value, options.timeZone);
  }

  return [
    value.getFullYear().toString().padStart(4, "0"),
    (value.getMonth() + 1).toString().padStart(2, "0"),
    value.getDate().toString().padStart(2, "0"),
  ].join("-");
}

function getCalendarDateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Could not format calendar date for ${timeZone}.`);
  }

  return `${year}-${month}-${day}`;
}
