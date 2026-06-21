import type { AgentResponse } from "@/lib/agent/card-types";

export type ModelFirstRequestKind = "chat" | "prompt_chips" | "opening_bubble";

export type DeterministicVisibleException =
  | "hard_outage"
  | "validation_error"
  | "silent_prompt_chips"
  | "system_ready";

export type ModelFirstViolation = {
  code:
    | "deterministic_visible_response"
    | "unsupported_finance_answer";
  message: string;
};

export function getModelFirstViolation(input: {
  requestKind?: ModelFirstRequestKind;
  userMessage: string;
  response: AgentResponse;
  deterministicException?: DeterministicVisibleException;
}): ModelFirstViolation | null {
  if (isAllowedDeterministicException(input)) {
    return null;
  }

  if (isNormalVisibleResponse(input.requestKind, input.response) && !input.response.audit.usedModel) {
    return {
      code: "deterministic_visible_response",
      message: "Normal visible Pip responses must be model-written.",
    };
  }

  if (
    (input.requestKind ?? "chat") === "chat" &&
    isKnownPersonalFinanceIntent(input.userMessage) &&
    isUnsupportedFinanceResponse(input.userMessage, input.response)
  ) {
    return {
      code: "unsupported_finance_answer",
      message: "Known finance intents need a tool, card, client action, or structured clarification.",
    };
  }

  return null;
}

export function assertModelFirstResponse(input: {
  requestKind?: ModelFirstRequestKind;
  userMessage: string;
  response: AgentResponse;
  deterministicException?: DeterministicVisibleException;
}) {
  const violation = getModelFirstViolation(input);

  if (!violation) {
    return;
  }

  throw new Error(`${violation.code}: ${violation.message}`);
}

export function isNormalVisibleResponse(
  requestKind: ModelFirstRequestKind | undefined,
  response: AgentResponse,
): boolean {
  if (requestKind === "prompt_chips") {
    return false;
  }

  if (response.clientAction && response.clientAction.type !== "none") {
    return false;
  }

  return Boolean(response.message.trim());
}

export function isKnownPersonalFinanceIntent(message: string): boolean {
  const normalized = normalizePrompt(message);

  if (!normalized) {
    return false;
  }

  if (isGeneralEducationPrompt(normalized)) {
    return false;
  }

  return (
    /\b(spendable cash|cash today|today'?s number|this number|my number|why.*number|what changed)\b/.test(normalized) ||
    /\b(can i|could i|should i|what if i)\b.{0,40}\b(spend|buy|purchase|pay|afford)\b/.test(normalized) ||
    /\b(spend|buy|purchase|pay|afford)\b.{0,24}(?:\$|usd\b|\d+(?:,\d{3})*(?:\.\d{1,2})?\s*(?:dollars?|bucks?))/.test(normalized) ||
    /\b(save|saving|savings goal|goal|trip fund|emergency fund)\b/.test(normalized) ||
    /\b(bill|bills|subscription|subscriptions|recurring|monthly charge|rent|utilities|phone bill)\b/.test(normalized) ||
    /\b(transaction|transactions|charge|charges|purchase|purchases|activity|spent|spending breakdown)\b/.test(normalized) ||
    /\b(account|accounts|bank|card|institution|plaid|connect|connected|reconnect|repair|remove)\b/.test(normalized) ||
    /\b(refresh|sync|updated|current|fresh|stale)\b.{0,40}\b(data|bank|account|number|transactions?)\b/.test(normalized) ||
    /\b(balance|balances|checking|savings)\b/.test(normalized)
  );
}

function isUnsupportedFinanceResponse(message: string, response: AgentResponse): boolean {
  if (
    isSavingsGoalIntent(message) &&
    response.responseMode === "clarify" &&
    response.usedTools.length === 0 &&
    response.cards.length === 0 &&
    isSavingsClarificationWithoutState(response)
  ) {
    return true;
  }

  return response.usedTools.length === 0 &&
    response.cards.length === 0 &&
    !response.pendingAction &&
    !(response.clientAction && response.clientAction.type !== "none") &&
    response.responseMode !== "clarify";
}

function isSavingsClarificationWithoutState(response: AgentResponse): boolean {
  const pendingAction = response.pendingAction;

  return !(
    pendingAction?.type === "preview_savings_goal" ||
    pendingAction?.type === "create_savings_goal" ||
    (
      pendingAction?.type === "ordinary_write" &&
      pendingAction.action === "create_savings_goal"
    )
  );
}

function isSavingsGoalIntent(message: string): boolean {
  return /\b(save|saving|savings goal|goal|trip fund|emergency fund)\b/i.test(message);
}

function isAllowedDeterministicException(input: {
  requestKind?: ModelFirstRequestKind;
  response: AgentResponse;
  deterministicException?: DeterministicVisibleException;
}): boolean {
  if (input.requestKind === "prompt_chips") {
    return true;
  }

  return Boolean(input.deterministicException);
}

function isGeneralEducationPrompt(normalized: string): boolean {
  return /\b(teach me|explain|what is)\b.{0,24}\b(money basic|budgeting|credit score|interest|apr|compound interest)\b/.test(normalized);
}

function normalizePrompt(message: string): string {
  return message
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
