import { normalizeIntentText } from "@/lib/agent/intent-slots";

export function redactRoutingText(text: string): string {
  return normalizeIntentText(text)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "EMAIL")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "CARD_NUMBER")
    .replace(/\b(?:account|acct|card)\s*(?:ending\s*)?(?:in\s*)?\d{4}\b/gi, "ACCOUNT LAST4")
    .replace(/(?:\$|usd\s*)\s*\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?/gi, "$AMOUNT")
    .replace(/\b\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:dollars?|bucks?)\b/gi, "$AMOUNT")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, "DATE")
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b/gi, "DATE")
    .replace(/\s+/g, " ")
    .trim();
}

export function routingTemplateHash(text: string): string {
  const redacted = redactRoutingText(text);
  let hash = 5381;

  for (let index = 0; index < redacted.length; index += 1) {
    hash = ((hash << 5) + hash) ^ redacted.charCodeAt(index);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
