import type { IntentCatalogEntry } from "@/lib/agent/intent-catalog";
import { getIntentById } from "@/lib/agent/intent-catalog";
import {
  extractExactRemoveConfirmationTarget,
  extractInstitutionTarget,
  normalizeIntentText,
  type IntentSlots,
} from "@/lib/agent/intent-slots";

export type ActionRouteDecision =
  | {
      kind: "route";
      intent: IntentCatalogEntry;
      args: Record<string, unknown>;
      confidence: number;
      reason: string;
    }
  | {
      kind: "none";
    };

export function resolveActionIntent(message: string, slots: IntentSlots): ActionRouteDecision {
  const normalized = normalizeIntentText(message);
  const actionText = stripPoliteActionPrefix(normalized);
  const exactRemoveTarget = extractExactRemoveConfirmationTarget(message);

  if (message.trim() === "DELETE DATA") {
    return route("data.delete_confirmed", { confirmation_text: "DELETE DATA" }, 1, "exact delete confirmation");
  }

  if (exactRemoveTarget) {
    return route(
      "institution.remove_confirmed",
      {
        institution_name: exactRemoveTarget,
        confirmation_text: message.trim(),
      },
      1,
      "exact remove confirmation",
    );
  }

  if (isDeleteDataRequest(actionText)) {
    return route("data.delete_request", {}, 0.98, "delete-data request");
  }

  if (isRefreshActionPrompt(actionText)) {
    return route("data.refresh", {}, 0.94, "refresh action");
  }

  if (isRepairConnectionPrompt(actionText)) {
    return route(
      "provider.repair",
      {
        institution_name: slots.institution_name ?? extractInstitutionTarget(actionText),
      },
      0.95,
      "repair provider connection",
    );
  }

  if (isAddAccountConnectionPrompt(actionText)) {
    return route("provider.connect", {}, 0.95, "connect new provider");
  }

  if (isAccountSelectionPrompt(actionText)) {
    return route(
      "account.selection_update",
      {
        institution_name: slots.institution_name ?? extractInstitutionTarget(actionText),
      },
      0.91,
      "account selection update",
    );
  }

  const inclusionIntent = getAccountInclusionIntent(actionText);

  if (inclusionIntent) {
    return route(
      "account.inclusion",
      {
        account_name: inclusionIntent.accountName,
        include_in_pip_cash: inclusionIntent.include,
      },
      0.93,
      "account inclusion update",
    );
  }

  const protectedSavingsIntent = getProtectedSavingsAccountIntent(actionText);

  if (protectedSavingsIntent) {
    return route(
      "account.protected_savings",
      {
        account_name: protectedSavingsIntent.accountName,
        is_protected_savings: protectedSavingsIntent.protected,
      },
      0.93,
      "protected savings account update",
    );
  }

  if (isRemoveInstitutionRequest(actionText)) {
    return route(
      "institution.remove_request",
      {
        institution_name: slots.institution_name ?? extractInstitutionTarget(actionText),
      },
      0.96,
      "institution removal request",
    );
  }

  return { kind: "none" };
}

function stripPoliteActionPrefix(normalized: string): string {
  return normalized
    .replace(/^(please|can you|could you|i need to|i want to|i'd like to|i would like to)\s+/, "")
    .trim();
}

function route(
  intentId: string,
  args: Record<string, unknown>,
  confidence: number,
  reason: string,
): Extract<ActionRouteDecision, { kind: "route" }> {
  const intent = getIntentById(intentId);

  if (!intent) {
    throw new Error(`Missing action intent catalog entry: ${intentId}`);
  }

  return {
    kind: "route",
    intent,
    args: stripUndefinedValues(args),
    confidence,
    reason,
  };
}

function isDeleteDataRequest(normalized: string): boolean {
  return /\b(delete|erase|remove)\b.{0,24}\b(my )?(stored )?(financial )?data\b/.test(normalized);
}

function isRefreshActionPrompt(normalized: string): boolean {
  if (/\b(did|does|do|when|why|is|are|was|were|status)\b.*\b(refresh|sync|update|updated|updating|refreshed|synced)\b/.test(normalized)) {
    return false;
  }

  return /^(refresh|sync|update|reload)\b/.test(normalized) ||
    /\b(refresh|sync|update|reload)\b.{0,24}\b(my |connected |account |bank )?data\b/.test(normalized) ||
    /\bsync now\b/.test(normalized);
}

function isAddAccountConnectionPrompt(normalized: string): boolean {
  if (/\b(do not|don't|dont|not)\s+(add|connect|link)\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(add|connect|link)\b.{0,40}\b(another|new|second|my|a|an)?\b.{0,20}\b(account|bank|card|credit card|amex|chase|wells fargo|capital one)\b/.test(normalized) ||
    /\b(i need|i want|want|need)\b.{0,24}\b(add|connect|link)\b.{0,40}\b(account|bank|card|credit card|amex|chase|wells fargo|capital one)\b/.test(normalized) ||
    /^(add|connect|link) (an? |my |new |another )?(account|bank|card|credit card)$/.test(normalized)
  );
}

function isRepairConnectionPrompt(normalized: string): boolean {
  if (/\b(do not|don't|dont|not)\s+(reconnect|repair|fix|restore)\b/.test(normalized)) {
    return false;
  }

  if (/\bbalances?\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(reconnect|repair|fix|restore)\b.{0,40}\b(bank|connection|account|institution|chase|wells fargo|capital one|amex)\b/.test(normalized) ||
    /^reconnect\s+.{2,80}$/.test(normalized)
  );
}

function isAccountSelectionPrompt(normalized: string): boolean {
  return (
    /\bchange\b.{0,40}\b(which )?accounts\b/.test(normalized) ||
    /\b(add|select|remove)\b.{0,30}\b(account|card|checking|savings)\b.{0,20}\bfrom\b/.test(normalized) ||
    /\bforgot to select\b/.test(normalized)
  );
}

function getAccountInclusionIntent(normalized: string): { include: boolean; accountName?: string } | null {
  const excludeMatch = /^(ignore|exclude|hide|stop using|don'?t use|do not use)\s+(.+)$/.exec(normalized);

  if (excludeMatch) {
    return {
      include: false,
      accountName: cleanupAccountTarget(excludeMatch[2]),
    };
  }

  const includeMatch = /^(use|include|start using)\s+(.+?)(?: again)?$/.exec(normalized);

  if (includeMatch && /\b(account|checking|savings|card|that|this|business|shared)\b/.test(includeMatch[2])) {
    return {
      include: true,
      accountName: cleanupAccountTarget(includeMatch[2]),
    };
  }

  return null;
}

function getProtectedSavingsAccountIntent(normalized: string): { protected: boolean; accountName?: string } | null {
  const unsetMatch = /^(don'?t|do not|stop)\s+treat(?:ing)?\s+(.+?)\s+as protected/.exec(normalized);

  if (unsetMatch) {
    return {
      protected: false,
      accountName: cleanupAccountTarget(unsetMatch[2]),
    };
  }

  const setMatch = /^(make|mark|set)\s+(.+?)\s+(?:as |my )?protected savings/.exec(normalized);

  if (setMatch) {
    return {
      protected: true,
      accountName: cleanupAccountTarget(setMatch[2]),
    };
  }

  return null;
}

function isRemoveInstitutionRequest(normalized: string): boolean {
  if (/\b(do not|don't|dont|not)\s+(remove|disconnect|unlink)\b/.test(normalized)) {
    return false;
  }

  return (
    (
      /\b(remove|disconnect|unlink)\b.{0,30}\b(bank|institution|connection|chase|wells fargo|capital one|amex)\b/.test(normalized) ||
      /^(remove|disconnect|unlink)\s+.{2,80}$/.test(normalized)
    ) &&
    !/\b(account|checking|savings|card)\b.{0,20}\bfrom\b/.test(normalized) &&
    !/\b(transaction|charge|purchase|merchant|bill|budget|category)\b/.test(normalized)
  );
}

function cleanupAccountTarget(value: string): string {
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

function stripUndefinedValues(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
