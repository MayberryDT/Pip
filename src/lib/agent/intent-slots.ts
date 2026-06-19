export type IntentSlots = {
  amount_cents?: number;
  horizon_days?: number;
  institution_name?: string;
  account_name?: string;
  include_in_pip_cash?: boolean;
  is_protected_savings?: boolean;
  confirmation_text?: string;
};

export function normalizeIntentText(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/[^a-z0-9$.\s'()/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractIntentSlots(message: string): IntentSlots {
  const normalized = normalizeIntentText(message);
  const amountCents = extractPurchaseAmountCents(message);
  const horizonDays = extractForecastHorizonDays(normalized);
  const institutionName = extractInstitutionTarget(normalized);
  const accountName = extractAccountTarget(normalized);
  const exactRemoveTarget = extractExactRemoveConfirmationTarget(message);

  return {
    ...(amountCents === null ? {} : { amount_cents: amountCents }),
    ...(horizonDays === null ? {} : { horizon_days: horizonDays }),
    ...(institutionName ? { institution_name: institutionName } : {}),
    ...(accountName ? { account_name: accountName } : {}),
    ...(exactRemoveTarget ? {
      institution_name: exactRemoveTarget,
      confirmation_text: message.trim(),
    } : {}),
    ...(message.trim() === "DELETE DATA" ? { confirmation_text: "DELETE DATA" } : {}),
  };
}

export function extractPurchaseAmountCents(message: string): number | null {
  const candidates: Array<{ amountCents: number; index: number; score: number }> = [];
  const amountPattern =
    /(?:\$|usd\s*)\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)/gi;
  const normalized = message.toLowerCase();

  for (const match of message.matchAll(amountPattern)) {
    const rawAmount = match[1] ?? match[2];
    const amount = Number(rawAmount.replaceAll(",", ""));

    if (!Number.isFinite(amount)) {
      continue;
    }

    const amountCents = Math.round(amount * 100);

    if (amountCents <= 0 || amountCents > 1_000_000) {
      continue;
    }

    const index = match.index ?? 0;
    candidates.push({
      amountCents,
      index,
      score: scorePurchaseAmountCandidate(normalized, index),
    });
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score || right.index - left.index);

  return candidates[0].amountCents;
}

export function extractForecastHorizonDays(normalized: string): number | null {
  const match = normalized.match(/\b(\d{1,2})\s*-?\s*days?\b/);

  if (!match) {
    if (/\b(tomorrow|next day)\b/.test(normalized)) {
      return 1;
    }

    if (/\b(next week|7 day|7-day|week)\b/.test(normalized)) {
      return 7;
    }

    if (/\b(forecast|project|projection|trend|next few days|coming days|headed|improve soon)\b/.test(normalized)) {
      return 14;
    }

    return null;
  }

  return Math.min(Math.max(Number(match[1]), 1), 14);
}

export function extractExactRemoveConfirmationTarget(message: string): string | null {
  const trimmed = message.trim();
  const match = /^REMOVE\s+(.+)$/.exec(trimmed);

  if (!match || trimmed !== trimmed.toUpperCase()) {
    return null;
  }

  return match[1].trim();
}

export function extractInstitutionTarget(normalized: string): string | undefined {
  const patterns = [
    /\b(?:reconnect|repair|fix|restore|remove|disconnect|unlink)\s+(.+)$/,
    /\bchange\b.{0,20}\b(.+?)\s+accounts\b/,
    /\bfrom\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);

    if (match?.[1]) {
      return cleanupRouteTarget(match[1]);
    }
  }

  return undefined;
}

export function extractAccountTarget(normalized: string): string | undefined {
  const exclusionMatch = /^(ignore|exclude|hide|stop using|don'?t use|do not use)\s+(.+)$/.exec(normalized);

  if (exclusionMatch?.[2]) {
    return cleanupRouteTarget(exclusionMatch[2]);
  }

  const inclusionMatch = /^(use|include|start using)\s+(.+?)(?: again)?$/.exec(normalized);

  if (inclusionMatch?.[2]) {
    return cleanupRouteTarget(inclusionMatch[2]);
  }

  const protectedMatch = /^(?:make|mark|set|stop|don'?t|do not)\s+(.+?)\s+(?:as |my )?protected savings/.exec(normalized);

  if (protectedMatch?.[1]) {
    return cleanupRouteTarget(protectedMatch[1]);
  }

  return undefined;
}

export function cleanupRouteTarget(value: string): string {
  return value
    .replace(/\bpip\b/g, "")
    .replace(/\bcan see\b/g, "")
    .replace(/\bfrom today'?s number\b/g, "")
    .replace(/\bin today'?s number\b/g, "")
    .replace(/\bgoing forward\b/g, "")
    .replace(/\bagain\b/g, "")
    .replace(/\bmy\b/g, "")
    .replace(/\bthat account\b/g, "")
    .replace(/\bthis account\b/g, "")
    .trim();
}

function scorePurchaseAmountCandidate(message: string, index: number): number {
  const before = message.slice(Math.max(0, index - 56), index);
  const after = message.slice(index, index + 56);
  let score = 0;

  if (/\b(spend(?:ing)?|buy(?:ing)?|purchase|purchasing|order(?:ing)?|afford|pay(?:ing)?|cost)\b/.test(before)) {
    score += 8;
  }

  if (/\b(what about|how about|instead|rather|does|do to|leave|would|hurt|okay|ok)\b/.test(before)) {
    score += 5;
  }

  if (/\b(spend(?:ing)?|buy(?:ing)?|purchase|purchasing|order(?:ing)?|afford|pay(?:ing)?|cost|instead|today|hurt|okay|ok)\b/.test(after)) {
    score += 3;
  }

  if (/\b(balance|paycheck|income|deposit|have|left)\b/.test(before)) {
    score -= 4;
  }

  if (/\b(balance|paycheck|income|deposit)\b/.test(after)) {
    score -= 4;
  }

  return score;
}
