import type { AgentCard } from "@/lib/agent/card-types";
import { AgentUnavailableError } from "@/lib/agent/agent-errors";

export type VisibleResponseSurface = "bridge" | "companion" | "openingBubble" | "correction";

export type VisibleResponseLimits = {
  maxWords: number;
  maxChars: number;
};

export const visibleResponseSurfaceLimits: Record<VisibleResponseSurface, VisibleResponseLimits> = {
  bridge: { maxWords: 45, maxChars: 260 },
  companion: { maxWords: 85, maxChars: 520 },
  openingBubble: { maxWords: 38, maxChars: 220 },
  correction: { maxWords: 70, maxChars: 420 },
};

export function getVisibleResponseSurfaceLimits(
  surface: VisibleResponseSurface = "bridge",
): VisibleResponseLimits {
  return visibleResponseSurfaceLimits[surface];
}

export function guardVisibleFinalMessage(
  message: string,
  cards: AgentCard[] = [],
  options: { surface?: VisibleResponseSurface } = {},
): string {
  const limits = getVisibleResponseSurfaceLimits(options.surface);
  const possessionRepairedMessage = repairUserMoneyPossessives(message);

  if (possessionRepairedMessage !== message) {
    message = possessionRepairedMessage;
  }

  const artifactRepairedMessage = repairVisibleModelArtifacts(message, cards);

  if (artifactRepairedMessage !== message) {
    message = artifactRepairedMessage;
  }

  if (!fitsVisibleLimits(message, limits)) {
    throw new AgentUnavailableError({
      code: "model-returned-too-long-final-message",
      message: "AI returned a response that was too long for Pip.",
      status: 502,
      detail: `Visible ${options.surface ?? "bridge"} replies must be ${limits.maxWords} words and ${limits.maxChars} characters or fewer.`,
    });
  }

  const disallowedLanguage = getDisallowedFinalLanguageDetail(message);

  if (disallowedLanguage) {
    const repairedMessage = repairDisallowedFinalLanguageText(message, disallowedLanguage);

    if (
      repairedMessage &&
      fitsVisibleLimits(repairedMessage, limits) &&
      !getDisallowedFinalLanguageDetail(repairedMessage) &&
      !getUnsupportedCardPromise(repairedMessage, cards)
    ) {
      return repairedMessage;
    }

    throw new AgentUnavailableError({
      code: "model-returned-disallowed-final-message",
      message: "AI returned a response that violates Pip language rules.",
      status: 502,
      detail: disallowedLanguage,
    });
  }

  const unsupportedPromise = getUnsupportedCardPromise(message, cards);

  if (shouldRemoveTrailingQuestion(message, cards)) {
    const repairedMessage = removeTrailingQuestionSentence(message);

    if (
      repairedMessage &&
      fitsVisibleLimits(repairedMessage, limits) &&
      !getDisallowedFinalLanguageDetail(repairedMessage) &&
      !getUnsupportedCardPromise(repairedMessage, cards)
    ) {
      return repairedMessage;
    }

    throw new AgentUnavailableError({
      code: "model-returned-disallowed-final-message",
      message: "AI returned a response that violates Pip language rules.",
      status: 502,
      detail: "Card replies should not end with a follow-up question.",
    });
  }

  if (unsupportedPromise) {
    const repairedMessage = repairUnsupportedCardPromises(message, cards);

    if (
      repairedMessage &&
      fitsVisibleLimits(repairedMessage, limits) &&
      !getDisallowedFinalLanguageDetail(repairedMessage) &&
      !getUnsupportedCardPromise(repairedMessage, cards)
    ) {
      return repairedMessage;
    }

    throw new AgentUnavailableError({
      code: "model-promised-unsupported-card",
      message: "AI promised a card or view that Pip did not return.",
      status: 502,
      detail: unsupportedPromise,
    });
  }

  return message;
}

function repairVisibleModelArtifacts(message: string, cards: AgentCard[]): string {
  const recurringCard = cards.find(
    (card): card is Extract<AgentCard, { type: "recurring_activity" }> =>
      card.type === "recurring_activity",
  );

  if (
    recurringCard &&
    /\bi(?:'|\u2019)?m checking if any data is missing\b.{0,120}\b(?:card|read)\b/i.test(message)
  ) {
    return getRecurringActivityBridge(recurringCard);
  }

  if (recurringCard && isOffTopicRecurringBridge(message)) {
    return getRecurringActivityBridge(recurringCard);
  }

  return trimVisibleArtifacts(message)
    .replace(/\s*(?:here(?:'|\u2019)?s|here is)\s+(?:the\s+)?card:?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getRecurringActivityBridge(
  card: Extract<AgentCard, { type: "recurring_activity" }>,
): string {
  return card.items.length > 0
    ? "I found likely repeat items."
    : "I do not see a clear repeat item yet.";
}

function isOffTopicRecurringBridge(message: string): boolean {
  return (
    /\b(pattern assumptions?|completed months?|baseline|current-month spending|normal room|bills held back|monthly savings)\b/i.test(
      message,
    ) &&
    !/\b(recurring|repeating|repeat items?|subscriptions?|monthly charges?|bills? coming up)\b/i.test(
      message,
    )
  );
}

function trimVisibleArtifacts(message: string): string {
  let candidate = message.trim();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const repaired = candidate
      .replace(/\s*(?:null|\{\})\s*$/i, "")
      .replace(/\s+([.!?])/g, "$1")
      .trim();

    if (repaired === candidate) {
      break;
    }

    candidate = repaired;
  }

  return candidate;
}

function repairUserMoneyPossessives(message: string): string {
  return message
    .replace(/\bmy Spendable Cash Today\b/g, "your Spendable Cash Today")
    .replace(/\bMy Spendable Cash Today\b/g, "Your Spendable Cash Today")
    .replace(/\bmy spendable cash today\b/g, "your Spendable Cash Today")
    .replace(/\bMy spendable cash today\b/g, "Your Spendable Cash Today");
}

export function repairUnsupportedCardPromises(message: string, cards: AgentCard[]): string | null {
  let candidate = message;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const issue = getUnsupportedCardPromise(candidate, cards);

    if (!issue) {
      const shortened = shortenCardlessRepairedMessage(candidate, cards);

      return shortened === message ? null : shortened;
    }

    const repaired = repairUnsupportedCardPromiseText(candidate, issue);

    if (!repaired || repaired === candidate) {
      return repairGenericCardlessDisplayText(candidate, cards);
    }

    candidate = repaired;
  }

  return getUnsupportedCardPromise(candidate, cards)
    ? repairGenericCardlessDisplayText(candidate, cards)
    : shortenCardlessRepairedMessage(candidate, cards);
}

function shortenCardlessRepairedMessage(message: string, cards: AgentCard[]): string {
  if (cards.length > 0 || countWords(message) <= 45) {
    return message;
  }

  const shortened = message
    .replace(/\bIf you want, I can .*$/i, "Ask me to test a dollar amount instead.")
    .replace(/\s+/g, " ")
    .trim();

  if (countWords(shortened) <= 45 && !getUnsupportedCardPromise(shortened, cards)) {
    return shortened;
  }

  return message;
}

function repairGenericCardlessDisplayText(message: string, cards: AgentCard[]): string | null {
  if (cards.length > 0) {
    return null;
  }

  const repaired = message
    .replace(/\bIf you want, I can .*$/i, "Ask me to test a dollar amount instead.")
    .replace(/\bi see\b/gi, "I understand")
    .replace(/\bshow impact\b/gi, "talk through impact")
    .replace(/\bpull up (the )?latest drivers\b/gi, "talk through the latest factors")
    .replace(/\b(show|showing|shown|showed|see|list|listed|pull|pulled|view)( me)?\b/gi, "talk through")
    .replace(/\bsimulate a small purchase\b/gi, "test a spending amount")
    .replace(/\bpurchases?\b/gi, "spending")
    .replace(/\bdrivers?\b/gi, "factors")
    .replace(/\s+/g, " ")
    .trim();

  if (repaired === message || getUnsupportedCardPromise(repaired, cards)) {
    return null;
  }

  return repaired;
}

function repairDisallowedFinalLanguageText(message: string, detail: string): string | null {
  if (detail === "guarantee") {
    const repaired = message
      .replace(/\bguaranteed\b/gi, "promised")
      .replace(/\bguarantees\b/gi, "promises")
      .replace(/\bguarantee\b/gi, "promise")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail === "you can spend") {
    const repaired = message
      .replace(/\byou can spend\s+(\$?-?\d[\d,]*(?:\.\d{1,2})?)\.?/gi, "Testing $1:")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail !== "detached metric opening") {
    return null;
  }

  const repaired = message
    .replace(/^spendable cash today is\s+/i, "I found Spendable Cash Today ")
    .replace(/\s+/g, " ")
    .trim();

  return repaired === message ? null : repaired;
}

function removeTrailingQuestionSentence(message: string): string | null {
  const repaired = message.trim().replace(/\s*[^.!?]*\?\s*$/, "").trim();

  return repaired && repaired !== message.trim() ? repaired : null;
}

function shouldRemoveTrailingQuestion(message: string, cards: AgentCard[]): boolean {
  const normalized = message.trim();

  if (!/\?\s*$/.test(normalized)) {
    return false;
  }

  return (
    cards.length > 0 ||
    /\b(?:want me to|should i|can i|would you like me to)\b.{0,80}\b(?:run|check|test|show|pull|list|view)\b/i.test(
      normalized,
    )
  );
}

function repairUnsupportedCardPromiseText(message: string, detail: string): string | null {
  if (detail === "forecast promised without forecast card") {
    const repaired = message
      .replace(/\b(want me to|should i|can i) forecast\b/gi, "$1 talk through")
      .replace(/\bi can forecast\b/gi, "I can talk through")
      .replace(/\bshow( me)? (a )?forecast\b/gi, "talk through a possible pattern")
      .replace(/\b(show|showing|shown|showed|see|pull|pulled|view)( me)?\b/gi, "talk through")
      .replace(/\b(?:the\s+)?next\s+\d+\s*days?\b/gi, "the next stretch")
      .replace(/\b(?:the\s+)?next\s+(few|couple of)\s+days?\b/gi, "the next stretch")
      .replace(/\bforecast\b/gi, "possible pattern")
      .replace(/\bprojection\b/gi, "possible pattern")
      .replace(/\bprojected\b/gi, "estimated")
      .replace(/\bbreak down\b/gi, "talk through")
      .replace(/\bbreakdown\b/gi, "summary")
      .replace(/\btrend view\b/gi, "trend")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail === "breakdown promised without breakdown card") {
    const repaired = message
      .replace(/\bi see your Spendable Cash Today is/gi, "Your Spendable Cash Today is")
      .replace(/\bi don(?:'|\u2019)?t see a concrete cutback opportunity yet/gi, "I don’t have a concrete cutback opportunity yet")
      .replace(/\bi don(?:'|\u2019)?t have (?:a )?(?:detailed )?breakdown card yet,?\s*but\s*/gi, "")
      .replace(/\bi can pull(?: up)? (?:a )?(?:detailed )?breakdown(?: if)?/gi, "I can talk through the details")
      .replace(/\bi can pull (?:the )?biggest drivers for you\.?/gi, "I can talk through the biggest factors.")
      .replace(/\bshow you today(?:'|\u2019)s spend drivers\b/gi, "talk through today’s spend factors")
      .replace(/\bi see (?:my |the )?main drivers?:?/gi, "The same main drivers still apply:")
      .replace(/\b(show|showing|shown|showed|see|pull|pulled|view|list|listed)( me)?\b/gi, "talk through")
      .replace(/\bbreak down\b/gi, "talk through")
      .replace(/\bbreakdown\b/gi, "summary")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail === "recurring activity promised without recurring card") {
    const repaired = message
      .replace(/\bhere (is|are)\b.{0,24}\b(recurring|repeating|subscriptions?|monthly charges?|upcoming bills?|bills? coming up)\b/gi, "I can talk through likely repeats")
      .replace(/\b(show|showing|shown|showed|list|listed|pull|pulled|view)( me)?\b.{0,28}\b(recurring|repeating|subscriptions?|monthly charges?|upcoming bills?|bills? coming up)\b/gi, "talk through likely repeats")
      .replace(/\b(show|showing|shown|showed|list|listed|pull|pulled|view)( me)?\b/gi, "talk through")
      .replace(/\brecurring activity\b/gi, "likely repeats")
      .replace(/\brecurring\b/gi, "repeating")
      .replace(/\bsubscriptions?\b/gi, "repeat charges")
      .replace(/\bupcoming bills?\b/gi, "bills that may repeat")
      .replace(/\bbills? coming up\b/gi, "bills that may repeat")
      .replace(/\bmonthly charges?\b/gi, "repeat charges")
      .replace(/\blikely repeats i found:/gi, "likely repeats:")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail === "transactions promised without transaction card") {
    const repaired = message
      .replace(/\bwith\s+\d+\s+transactions?\b/gi, "with connected activity")
      .replace(/\b\d+\s+transactions?\b/gi, "connected activity")
      .replace(/\b(the )?app shows\b(.{0,40})\bconnected activity\b/gi, "$1app has$2connected data")
      .replace(/\bbills list,\s*show upcoming charges\b/gi, "bills, talk through upcoming activity")
      .replace(/\bshow upcoming charges\b/gi, "talk through upcoming activity")
      .replace(/\bshow how (?:a )?purchases? would affect it\b/gi, "talk through how spending would affect it")
      .replace(/\b(show|shows|showing|shown|showed|see|list|listed|pull|pulled|view)( me)?\b.{0,28}\b(transactions?|charges?|purchases?|activity)\b/gi, "talk through recent activity")
      .replace(/\btransactions?\b/gi, "activity")
      .replace(/\bcharges?\b/gi, "activity")
      .replace(/\bpurchases?\b/gi, "spending")
      .replace(/\bactivity I found:/gi, "activity:")
      .replace(/\s+/g, " ")
      .trim();

    return repaired === message ? null : repaired;
  }

  if (detail !== "card promised without card") {
    return null;
  }

  const repaired = message
    .replace(/\bpull up (?:today(?:'|\u2019)s )?cash picture\b/gi, "talk through today's cash picture")
    .replace(/\bshow how (?:a )?purchases? would affect it\b/gi, "talk through how spending would affect it")
    .replace(/\bfuller view\b/gi, "fuller picture")
    .replace(/\b(the )?view\b/gi, "$1picture")
    .replace(/\bmissing cards?\b/gi, "missing data source")
    .replace(/\bcards? (are|is|were|was) connected\b/gi, "data sources $1 connected")
    .replace(/\bconnect(?:ed)? (the )?missing cards?\b/gi, "connect $1missing data source")
    .replace(/\bshow( me)? (your )?credit card options\b/gi, "talk through credit card options")
    .replace(/\bshow( me)? (your )?card options\b/gi, "talk through card options")
    .replace(/\bshow( me)? (some )?credit cards\b/gi, "talk through credit cards")
    .replace(/\bshow( me)? (some )?cards\b/gi, "talk through cards")
    .replace(/\bshow( me)? (the )?full summary\b/gi, "talk through the full summary")
    .replace(/\bshow( me)? (more )?(details?|detail)\b/gi, "talk through more detail")
    .replace(/\bview (your )?credit card options\b/gi, "talk through credit card options")
    .replace(/\bview (your )?card options\b/gi, "talk through card options")
    .replace(/\b(show|view|pull|list)( me)? (your )?card (options|choices|types|ideas|offers|details|use|usage)\b/gi, "talk through credit card $4")
    .replace(/\b(show|view|pull|list)( me)? (your )?cards\b/gi, "talk through credit cards")
    .replace(/\bcard (options|choices|types|ideas|offers|details|use|usage)\b/gi, "credit card $1")
    .replace(/\bdata cards?\b/gi, "data source")
    .replace(/\bdetails? cards?\b/gi, "details")
    .replace(/\bquick chart\b/gi, "quick summary")
    .replace(/\b(want to|would you like to|if you want,? i can) see\b/gi, "$1 talk through")
    .replace(/\bi see\b/gi, "I understand")
    .replace(/\b(show|showing|shown|showed|see|list|listed|pull|pulled|view)( me)?\b/gi, "talk through")
    .replace(/\s+/g, " ")
    .trim();

  return repaired === message ? null : repaired;
}

export function getUnsupportedCardPromise(message: string, cards: AgentCard[]): string | null {
  const normalized = message.toLowerCase().replace(/[\u2018\u2019]/g, "'");

  if (cards.length === 0 && /\bpull up (?:today(?:'|\u2019)s )?cash picture\b/.test(normalized)) {
    return "card promised without card";
  }

  if (cards.length === 0 && /\bshow how (?:a )?purchases? would affect it\b/.test(normalized)) {
    return "transactions promised without transaction card";
  }

  if (
    /\b\d+\s+(?:transactions?|charges?|purchases?)\b/.test(normalized) &&
    !hasAnyCard(cards, ["recent_transactions", "spending_breakdown"])
  ) {
    return "transactions promised without transaction card";
  }

  if (!containsDisplayPromise(normalized)) {
    return null;
  }

  if (
    (
      /\bbreakdown card\b.{0,80}\b(?:show|pull|view|list|break ?down)\b/.test(normalized) ||
      /\b(?:show|pull|view|list)(?: up)?\b.{0,40}\b(?:detailed )?breakdown\b/.test(normalized) ||
      /\bshow you today(?:'|\u2019)s spend drivers\b/.test(normalized)
    ) &&
    !hasAnyCard(cards, ["spending_breakdown", "pip_cash_explanation", "math_breakdown", "spendable_cash_forecast", "recent_transactions"])
  ) {
    return "breakdown promised without breakdown card";
  }

  if (
    /\bshow upcoming charges\b/.test(normalized) &&
    !hasAnyCard(cards, ["recent_transactions", "spending_breakdown", "recurring_activity", "purchase_simulation"])
  ) {
    return "transactions promised without transaction card";
  }

  if (isNoDataCardRefusal(normalized)) {
    return null;
  }

  if (isSuggestionMenuResponse(normalized) && !hasSpecificDisplayCapabilityPromise(normalized)) {
    return null;
  }

  if (/\b(forecast|project(?:ion)?|trend|trend view|next \d+\s*days?)\b/.test(normalized)) {
    return hasCard(cards, "spendable_cash_forecast") ? null : "forecast promised without forecast card";
  }

  if (/\b(recurring|repeating|subscription|subscriptions|monthly charges?|bills? (are )?coming up|upcoming bills?)\b/.test(normalized)) {
    return hasAnyCard(cards, ["recurring_activity", "spendable_cash_forecast"])
      ? null
      : "recurring activity promised without recurring card";
  }

  if (/\b(drivers?|breakdown|categories|merchants|card payments?)\b/.test(normalized)) {
    return hasAnyCard(cards, ["spending_breakdown", "pip_cash_explanation", "math_breakdown", "insight_card"])
      ? null
      : "breakdown promised without breakdown card";
  }

  if (/\b(transactions?|charges?|purchases?|activity)\b/.test(normalized)) {
    return hasAnyCard(cards, ["recent_transactions", "spending_breakdown", "recurring_activity", "purchase_simulation"])
      ? null
      : "transactions promised without transaction card";
  }

  if (/\bbalances?\b/.test(normalized)) {
    return hasCard(cards, "true_balances") ? null : "balances promised without balances card";
  }

  if (/\b(math|formula|calculation)\b/.test(normalized)) {
    return hasCard(cards, "math_breakdown") ? null : "math promised without math card";
  }

  const normalizedWithoutCreditCardTopic = normalized.replace(/\b(?:credit|debit) cards?\b/g, "");
  const appCardPromisePattern =
    /\b(?:this|the) cards?\b|\b(?:data|details?) cards?\b|\bcards?\s+(?:view|options|details|data)\b|\b(?:show|view|pull|list)\b.{0,40}\b(?:cards?|full summary|details?)\b|\bcards?\b.{0,20}\b(?:shown|below)\b/;

  if (appCardPromisePattern.test(normalizedWithoutCreditCardTopic)) {
    return cards.length > 0 ? null : "card promised without card";
  }

  if (
    /\b(shows|showing|shown|showed|this card|the card|the view|trend view|fuller view)\b/.test(normalized) ||
    (cards.length === 0 && /\b(missing cards?|cards? (?:are|is|were|was) connected)\b/.test(normalizedWithoutCreditCardTopic))
  ) {
    return cards.length > 0 ? null : "card promised without card";
  }

  if (cards.length === 0 && /\b(show|see|view|pull)( me| you| up)?\b/.test(normalized)) {
    return "card promised without card";
  }

  return null;
}

function isNoDataCardRefusal(normalized: string): boolean {
  const noDataContext =
    /\b(no data|no financial data|not connected|haven't connected|have not connected|data isn't connected|data is not connected|without connected data|until .*connect(?:ed)? data)\b/.test(normalized);
  const refusalVerb =
    /\b(can'?t|cannot|unable|not able|don't|do not|won't|will not)\b.{0,90}\b(show|list|pull|view|forecast|break ?down|simulate|check)\b/.test(normalized);
  const displaySubject =
    /\b(forecast|breakdown|transactions?|subscriptions?|recurring|activity|charges?|purchases?|math|balances?|drivers?|card payments?)\b/.test(normalized);

  return displaySubject && (noDataContext || refusalVerb);
}

function isSuggestionMenuResponse(normalized: string): boolean {
  return /\b(you can ask|you could ask|try asking|ask me about|want to ask|if you want|pick a chip|choose a chip|tap a chip|tell me a dollar amount)\b/.test(normalized);
}

function hasSpecificDisplayCapabilityPromise(normalized: string): boolean {
  return /\b(forecast|project(?:ion)?|trend|trend view|breakdown|transactions?|charges?|purchases?|activity|recurring|repeating|subscriptions?|monthly charges?|upcoming bills?|bills? coming up|balances?|math|formula|calculation|cards?)\b/.test(normalized);
}

function containsDisplayPromise(normalized: string): boolean {
  return /\b(show|shows|showing|shown|showed|see|pull|pulled|view|here is|here are)\b/.test(normalized) ||
    /\btrend view\b/.test(normalized) ||
    /\b(?:this|the|data|details?) cards?\b|\bcards?\b.{0,20}\b(?:shown|below)\b/.test(normalized) ||
    (
      /\b(breakdown|forecast|projection|projected)\b/.test(normalized) &&
      /\b(show|showing|shown|showed|pull|pulled|view|here is|here are)\b/.test(normalized)
    );
}

function hasCard(cards: AgentCard[], cardType: AgentCard["type"]): boolean {
  return cards.some((card) => card.type === cardType);
}

function hasAnyCard(cards: AgentCard[], cardTypes: AgentCard["type"][]): boolean {
  return cardTypes.some((cardType) => hasCard(cards, cardType));
}

export function containsDisallowedFinalLanguage(message: string): boolean {
  return Boolean(getDisallowedFinalLanguageDetail(message));
}

function getDisallowedFinalLanguageDetail(message: string): string | null {
  const normalized = message.toLowerCase();
  const guaranteedSpendingPhrase = ["safe", "to", "spend"].join(" ");
  const disallowedPatterns: Array<[RegExp, string]> = [
    [new RegExp(`\\b${guaranteedSpendingPhrase}\\b`), guaranteedSpendingPhrase],
    [/\bsafe to buy\b/, "safe to buy"],
    [/\byou can spend\b/, "you can spend"],
    [/\byou can afford\b/, "you can afford"],
    [/\bi recommend\b/, "i recommend"],
    [/\bmy recommendation\b/, "my recommendation"],
    [/\bfinancial advice\b/, "financial advice"],
    [/\bfinancial advisor\b/, "financial advisor"],
    [/\byou should (?:buy|spend|purchase|order)\b/, "you should spend"],
    [/\byou shouldn'?t (?:buy|spend|purchase|order)\b/, "you shouldn't spend"],
    [/\b(buy|sell|hold)\b.{0,24}\b(stocks?|shares?|etf|fund|securities?)\b/, "securities advice"],
    [/\binvest in\b.{0,40}\b(stocks?|shares?|etf|fund|securities?|nvidia|tesla|apple|crypto|bitcoin|ethereum)\b/, "investment advice"],
    [/\b(buy|sell|hold)\b.{0,24}\b(crypto|bitcoin|ethereum|token)\b/, "crypto advice"],
    [/\b(open|apply for|sign up for)\b.{0,40}\b(credit card|card|loan|lender|insurance)\b/, "product advice"],
    [/\b(take|choose|get)\b.{0,28}\b(personal loan|payday loan|balance transfer card)\b/, "product advice"],
    [/\b(refinance with|file bankruptcy|skip rent|write this off)\b/, "blocked domain advice"],
    [/\bdashboard\b/, "dashboard"],
    [new RegExp(`\\b${"free" + " cash"}\\b`), "legacy cash wording"],
    [/\bbudget(?:ing)?\b/, "budget"],
    [/\bexpense tracking\b/, "expense tracking"],
    [/\bfinancial planning\b/, "financial planning"],
    [/\bi'?m proud of you\b/, "proud of you"],
    [/\byou'?ve got this\b/, "you've got this"],
    [/\bmoney journey\b/, "money journey"],
    [/\bmindful choice\b/, "mindful choice"],
    [/\bmoney companion\b/, "money companion"],
    [/\bai coach\b/, "AI coach"],
    [/\bpip\s+(?:is|does|can|will|would|helps?|shows?|uses?|turns|stores|needs|calculates?|explains?|answers?)\b/, "third-person Pip self-reference"],
    [/^spendable cash today is\b/, "detached metric opening"],
    [/\bdeterministic\b/, "deterministic"],
    [/-?\$\d+(?:\.\d+)?k\b|\$-?\d+(?:\.\d+)?k\b/i, "money k shorthand"],
    [/\brolling-window pattern\b/, "rolling-window pattern"],
    [/\bliquidity\b/, "liquidity"],
    [/\boptimal\b/, "optimal"],
    [/\bsufficient\b/, "sufficient"],
    [/\b(?:page|tab|section|area)\s+(?:for|with)\b/, "page/tab/section"],
    [/\breview (?:them|it|transactions?|balances?) there\b/, "review it there"],
  ];

  for (const [pattern, detail] of disallowedPatterns) {
    if (pattern.test(normalized)) {
      return detail;
    }
  }

  if (hasDisallowedGuaranteeLanguage(normalized)) {
    return "guarantee";
  }

  return null;
}

function hasDisallowedGuaranteeLanguage(normalized: string): boolean {
  if (!/\bguarantee(?:d|s)?\b/.test(normalized)) {
    return false;
  }

  return !/\b(?:not guaranteed|no guarantee|not a guarantee)\b/.test(normalized);
}

function countWords(message: string): number {
  return message.trim().split(/\s+/).filter(Boolean).length;
}

function fitsVisibleLimits(message: string, limits: VisibleResponseLimits): boolean {
  return message.length <= limits.maxChars && countWords(message) <= limits.maxWords;
}
