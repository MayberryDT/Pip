export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const dollars = Math.round(Math.abs(cents) / 100);
  return `${sign}$${dollars.toLocaleString("en-US")}`;
}

export function formatMoneyWithCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100);
  const remainingCents = absolute % 100;

  return `${sign}$${dollars.toLocaleString("en-US")}.${String(remainingCents).padStart(2, "0")}`;
}

export function parseDollarAmount(input: string): number | null {
  const match = input.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);

  if (!match) {
    return null;
  }

  return Math.round(Number(match[1]) * 100);
}
