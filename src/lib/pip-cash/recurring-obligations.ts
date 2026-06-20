import type {
  FinancialSnapshot,
  RecurringObligationModel,
  RecurringObligationRule,
  RecurringObligationSuggestion,
} from "@/lib/types";

export function buildRecurringObligations(input: {
  snapshot: FinancialSnapshot;
  rules: RecurringObligationRule[];
}): RecurringObligationModel {
  const ignoredMerchantKeys = input.rules
    .filter((rule) => rule.status === "ignored")
    .map((rule) => rule.merchantKey)
    .sort();
  const ignored = new Set(ignoredMerchantKeys);
  const confirmed = input.rules
    .filter((rule) => rule.status === "active" && rule.source === "user_confirmed")
    .filter((rule) => !ignored.has(rule.merchantKey))
    .map((rule) => ({
      merchantKey: rule.merchantKey,
      label: rule.label,
      expectedAmountCents: rule.expectedAmountCents,
      expectedDay: rule.expectedDay,
    }));
  const confirmedKeys = new Set(confirmed.map((obligation) => obligation.merchantKey));
  const suggestions = buildAutomaticSuggestions(input.snapshot)
    .filter((suggestion) => !confirmedKeys.has(suggestion.merchantKey))
    .filter((suggestion) => !ignored.has(suggestion.merchantKey));

  return {
    confirmed,
    suggestions,
    ignoredMerchantKeys,
  };
}

export function normalizeRecurringMerchantKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildAutomaticSuggestions(
  snapshot: FinancialSnapshot,
): RecurringObligationSuggestion[] {
  const byMerchant = new Map<string, {
    label: string;
    amounts: number[];
    days: number[];
  }>();

  for (const transaction of snapshot.transactions) {
    if (transaction.amountCents >= 0) {
      continue;
    }

    const label = transaction.merchantName ?? transaction.description;
    const merchantKey = normalizeRecurringMerchantKey(label);
    const bucket = byMerchant.get(merchantKey) ?? {
      label,
      amounts: [],
      days: [],
    };
    bucket.amounts.push(Math.max(0, -transaction.amountCents));
    bucket.days.push(Number(transaction.date.slice(8, 10)));
    byMerchant.set(merchantKey, bucket);
  }

  return Array.from(byMerchant.entries())
    .filter(([, bucket]) => bucket.amounts.length >= 3)
    .map(([merchantKey, bucket]) => ({
      merchantKey,
      label: bucket.label,
      expectedAmountCents: median(bucket.amounts),
      expectedDay: median(bucket.days),
      transactionCount: bucket.amounts.length,
      source: "auto_detected" as const,
    }))
    .sort((left, right) => left.merchantKey.localeCompare(right.merchantKey));
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}
