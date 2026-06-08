#!/usr/bin/env node

import { writeFileSync } from "node:fs";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_REPORT_PATH = "/tmp/spendable-agent-eval-report.json";
const DEFAULT_TIMEOUT_MS = 45_000;

const ALL_CARD_TYPES = [
  "free_cash_explanation",
  "math_breakdown",
  "recent_transactions",
  "purchase_simulation",
  "true_balances",
  "spending_breakdown",
  "recurring_activity",
  "spendable_cash_forecast",
];

export const agentEvalCases = [
  {
    id: "greeting",
    description: "Friendly greeting should feel conversational and should not create a card.",
    message: "hi",
    expectNoCards: true,
    expectedResponseMode: "chat_only",
  },
  {
    id: "nonsense",
    description: "Nonsense input should be handled conversationally without fake data.",
    message: "purple banana waterfall",
    expectNoCards: true,
  },
  {
    id: "why-number",
    description: "Core explanation should use the drivers tool and show the drivers card.",
    message: "Why this number?",
    expectedTools: ["get_free_cash_drivers"],
    expectedCards: ["free_cash_explanation"],
  },
  {
    id: "math",
    description: "Math prompt should use deterministic math and show the math card.",
    message: "Show the math",
    expectedTools: ["get_free_cash_math"],
    expectedCards: ["math_breakdown"],
  },
  {
    id: "recent-transactions",
    description: "Recent transactions prompt should use the transaction tool and card.",
    message: "Show recent transactions",
    expectedTools: ["get_recent_transactions"],
    expectedCards: ["recent_transactions"],
  },
  {
    id: "spending-breakdown",
    description: "Breakdown prompt should use grouped deterministic spending facts.",
    message: "Show my spending breakdown",
    expectedTools: ["get_spending_breakdown"],
    expectedCards: ["spending_breakdown"],
  },
  {
    id: "card-payments-breakdown",
    description: "Card payment wording should route to the spending breakdown card.",
    message: "Show card payments in the last window",
    expectedTools: ["get_spending_breakdown"],
    expectedCards: ["spending_breakdown"],
  },
  {
    id: "spend-50",
    description: "Specific spend question should simulate the purchase.",
    message: "Can I spend $50?",
    expectedTools: ["simulate_purchase"],
    expectedCards: ["purchase_simulation"],
  },
  {
    id: "spend-followup-20",
    description: "Follow-up amount should use conversation history and simulate again.",
    message: "What about $20 instead?",
    history: [
      { role: "user", content: "Can I spend $50?" },
      { role: "assistant", content: "I can test that amount against your Spendable Cash." },
    ],
    expectedTools: ["simulate_purchase"],
    expectedCards: ["purchase_simulation"],
  },
  {
    id: "spend-no-amount",
    description: "Spend question without an amount should clarify instead of pretending.",
    message: "Can I spend money today?",
    expectNoCards: true,
    forbiddenTools: ["simulate_purchase"],
    forbiddenCards: ["purchase_simulation"],
  },
  {
    id: "negative-spendable",
    description: "Negative Spendable Cash questions should stay simple and avoid hard permission language.",
    message: "Since it is negative, can I spend any money?",
    scenario: "negative",
    forbiddenCards: ["purchase_simulation"],
  },
  {
    id: "forecast",
    description: "Forecast prompt should return a forecast card.",
    message: "Show my Spendable Cash forecast",
    expectedTools: ["forecast_spendable_cash"],
    expectedCards: ["spendable_cash_forecast"],
  },
  {
    id: "tomorrow",
    description: "Tomorrow/next-day prompt should return the deterministic forecast card.",
    message: "What kind of Spendable Cash should I expect tomorrow or the next day?",
    expectedTools: ["forecast_spendable_cash"],
    expectedCards: ["spendable_cash_forecast"],
  },
  {
    id: "seven-day-trend",
    description: "Trend language should not be answered with a card-less promise.",
    message: "Show 7 day trend",
    expectedTools: ["forecast_spendable_cash"],
    expectedCards: ["spendable_cash_forecast"],
  },
  {
    id: "forecast-affirmative-followup",
    description: "Affirmative follow-up after trend talk should resolve to a forecast card.",
    message: "yes do that",
    history: [
      { role: "user", content: "Can we talk about my spending trend?" },
      {
        role: "assistant",
        content: "We can talk it through, or I can show daily amounts for the next 14 days.",
      },
    ],
    expectedTools: ["forecast_spendable_cash"],
    expectedCards: ["spendable_cash_forecast"],
  },
  {
    id: "subscriptions",
    description: "Subscription prompt should use recurring activity detection.",
    message: "Do I have any subscriptions coming up?",
    expectedTools: ["get_recurring_activity"],
    expectedCards: ["recurring_activity"],
  },
  {
    id: "youtube-premium",
    description: "Merchant-specific recurring prompt should still use recurring activity.",
    message: "Do I have YouTube Premium coming up?",
    expectedTools: ["get_recurring_activity"],
    expectedCards: ["recurring_activity"],
  },
  {
    id: "credit-cards-general",
    description: "Broad finance discussion should be chat-only and should not invent app views.",
    message: "Let's talk about credit cards",
    expectNoCards: true,
    expectedResponseMode: "chat_only",
  },
  {
    id: "lower-spending-general",
    description: "General spending advice should stay short and conversational.",
    message: "How do I lower my spending without feeling miserable?",
    expectNoCards: true,
    expectedResponseMode: "chat_only",
  },
  {
    id: "how-it-works",
    description: "Product explanation should not say Free Cash or point to screens.",
    message: "Tell me how Pip works",
    expectNoCards: true,
  },
];

const disallowedTextChecks = [
  { label: "Free Cash", pattern: /\bfree cash\b/i },
  { label: "dashboard", pattern: /\bdashboard\b/i },
  { label: "safe to spend", pattern: /\bsafe to spend\b/i },
  { label: "safe to buy", pattern: /\bsafe to buy\b/i },
  { label: "you can afford", pattern: /\byou can afford\b/i },
  { label: "financial advice", pattern: /\bfinancial advice\b/i },
  { label: "financial advisor", pattern: /\bfinancial advisor\b/i },
  { label: "third-person Pip self-reference", pattern: /\bpip\s+(?:is|does|can|will|would|helps?|shows?|uses?|turns|stores|needs|calculates?|explains?|answers?)\b/i },
  { label: "detached metric opening", pattern: /^spendable cash today is\b/i },
  { label: "money shorthand", pattern: /-?\$\d+(?:\.\d+)?k\b/i },
];

const showPromisePattern =
  /\b(?:show|showing|shown|list|listing|pull|view|card|cards|trend view|here is|here are|here's)\b/i;
const cardWordExclusionPattern = /\b(?:credit cards?|debit cards?)\b/i;

const promiseCapabilities = [
  {
    label: "forecast",
    pattern: /\b(?:forecast|trend|projection|projected|tomorrow|next day|next 7|7 day|7-day|next 14|14 day|14-day|daily amounts)\b/i,
    cards: ["spendable_cash_forecast"],
  },
  {
    label: "breakdown",
    pattern: /\b(?:breakdown|break down|category|categories|merchants|card payments?|complete breakdown)\b/i,
    cards: ["spending_breakdown", "free_cash_explanation", "math_breakdown", "spendable_cash_forecast"],
  },
  {
    label: "transactions",
    pattern: /\b(?:transactions?|charges?|purchases?|recent items|activity)\b/i,
    cards: ["recent_transactions", "spending_breakdown", "recurring_activity"],
  },
  {
    label: "balances",
    pattern: /\b(?:balances?|real balances?|true balances?)\b/i,
    cards: ["true_balances"],
  },
  {
    label: "math",
    pattern: /\b(?:math|formula|calculation|calculated)\b/i,
    cards: ["math_breakdown"],
  },
  {
    label: "recurring",
    pattern: /\b(?:recurring|subscriptions?|coming up|repeat(?:ing)?|bills? coming up|upcoming bills?)\b/i,
    cards: ["recurring_activity", "spendable_cash_forecast"],
  },
];

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getResponseMessage(response) {
  return typeof response?.message === "string" ? response.message : "";
}

function getCardTypes(response) {
  return uniq(asArray(response?.cards).map((card) => (typeof card?.type === "string" ? card.type : "")));
}

function getUsedTools(response) {
  return uniq(asArray(response?.usedTools).map((toolName) => String(toolName)));
}

function getPromptChips(response) {
  return asArray(response?.promptChips);
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function includesAny(values, wanted) {
  return wanted.some((value) => values.includes(value));
}

function validateVisibleText({ label, text, failures }) {
  if (!text) return;

  for (const check of disallowedTextChecks) {
    if (check.pattern.test(text)) {
      failures.push(`${label} contains banned wording: ${check.label}`);
    }
  }

  if (wordCount(text) > 45) {
    failures.push(`${label} is too long for the short Pip voice (${wordCount(text)} words).`);
  }

  if (text.length > 260) {
    failures.push(`${label} is too long for the compact chat UI (${text.length} characters).`);
  }
}

function validateDisplayPromise({ label, text, cardTypes, failures }) {
  if (!text || cardWordExclusionPattern.test(text)) return;
  const promisesDisplay = showPromisePattern.test(text);

  for (const capability of promiseCapabilities) {
    if (promisesDisplay && capability.pattern.test(text) && !includesAny(cardTypes, capability.cards)) {
      failures.push(
        `${label} promises ${capability.label} detail without a matching card (${capability.cards.join(", ")}).`,
      );
    }
  }

  if (
    /\b(?:card|cards|view|trend view|this card|the card|the view)\b/i.test(text) &&
    !cardWordExclusionPattern.test(text) &&
    cardTypes.length === 0 &&
    !isSupportedDiscussionLanguage(text)
  ) {
    failures.push(`${label} uses show/list/view language but returned no cards.`);
  }
}

function isSupportedDiscussionLanguage(text) {
  return /\b(?:we can talk|talk through|discuss|i can explain|i can help|i can walk through|let's talk)\b/i.test(text);
}

function isSupportedDisplayChip(text) {
  if (!showPromisePattern.test(text) || cardWordExclusionPattern.test(text)) return true;

  return (
    /\b(?:why this number|what changed|drivers?)\b/i.test(text) ||
    /\b(?:math|formula|calculation)\b/i.test(text) ||
    /\b(?:transactions?|recent items|charges?)\b/i.test(text) ||
    /\b(?:breakdown|categories|merchants|refunds?|card payments?)\b/i.test(text) ||
    /\b(?:forecast|trend|tomorrow|next day|daily amounts|daily view|7 day|14 day|next 14 days?|upcoming bills?)\b/i.test(text) ||
    /\b(?:recurring|subscriptions?|bills?|coming up)\b/i.test(text) ||
    /\b(?:balances?)\b/i.test(text) ||
    /\b(?:connect data|get signed up|google|protected savings|delete data|refresh)\b/i.test(text)
  );
}

function validatePromptChips({ promptChips, failures }) {
  if (promptChips.length > 3) {
    failures.push(`response returned too many prompt chips (${promptChips.length}).`);
  }

  for (const chip of promptChips) {
    const chipText = [chip?.label, chip?.prompt].filter((value) => typeof value === "string").join(" ");
    validateVisibleText({ label: "prompt chip", text: chipText, failures });
    if (!isSupportedDisplayChip(chipText)) {
      failures.push(`prompt chip promises an unsupported display action: ${chipText}`);
    }
  }
}

export function evaluateAgentResponse({ caseDef, response, httpStatus = 200, httpOk = true, error = null }) {
  const failures = [];
  const message = getResponseMessage(response);
  const cardTypes = getCardTypes(response);
  const usedTools = getUsedTools(response);
  const promptChips = getPromptChips(response);
  const responseMode = typeof response?.responseMode === "string" ? response.responseMode : "";

  if (!httpOk) {
    failures.push(`HTTP ${httpStatus}`);
  }

  if (error) {
    failures.push(error);
  }

  if (response?.error) {
    failures.push(`agent error: ${response.error}`);
  }

  if (httpOk && !response?.error && !message.trim()) {
    failures.push("assistant message is empty.");
  }

  validateVisibleText({ label: "assistant message", text: message, failures });
  validateDisplayPromise({ label: "assistant message", text: message, cardTypes, failures });
  if (cardTypes.length > 0 && /\?\s*$/.test(message.trim())) {
    failures.push("assistant message ends with a follow-up question after returning a card.");
  }
  validatePromptChips({ promptChips, failures });

  for (const toolName of asArray(caseDef.expectedTools)) {
    if (!usedTools.includes(toolName)) {
      failures.push(`expected tool not used: ${toolName}`);
    }
  }

  for (const cardType of asArray(caseDef.expectedCards)) {
    if (!cardTypes.includes(cardType)) {
      failures.push(`expected card not returned: ${cardType}`);
    }
  }

  for (const toolName of asArray(caseDef.forbiddenTools)) {
    if (usedTools.includes(toolName)) {
      failures.push(`forbidden tool used: ${toolName}`);
    }
  }

  for (const cardType of asArray(caseDef.forbiddenCards)) {
    if (cardTypes.includes(cardType)) {
      failures.push(`forbidden card returned: ${cardType}`);
    }
  }

  if (caseDef.expectNoCards && cardTypes.length > 0) {
    failures.push(`expected no cards but got: ${cardTypes.join(", ")}`);
  }

  if (caseDef.expectedResponseMode && responseMode !== caseDef.expectedResponseMode) {
    failures.push(`expected responseMode ${caseDef.expectedResponseMode} but got ${responseMode || "none"}.`);
  }

  for (const cardType of cardTypes) {
    if (!ALL_CARD_TYPES.includes(cardType)) {
      failures.push(`unknown card type returned: ${cardType}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    message,
    responseMode,
    usedTools,
    cardTypes,
    promptChips: promptChips.map((chip) => ({
      id: chip?.id,
      label: chip?.label,
      prompt: chip?.prompt,
    })),
  };
}

function buildRequestBody(caseDef, conversationId) {
  const providedState = caseDef.conversationState ?? {};

  return {
    message: caseDef.message,
    scenario: caseDef.scenario ?? "default",
    selectedPromptChipId: caseDef.selectedPromptChipId,
    history: caseDef.history ?? [],
    conversationState: {
      shownCards:
        providedState.shownCards ??
        (caseDef.recentCardTypes ?? []).map((type) => ({
          type,
        })),
      lastToolNames: providedState.lastToolNames ?? caseDef.recentToolNames ?? [],
    },
    conversationId,
  };
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function runAgentEval({
  baseUrl = process.env.SPENDABLE_AGENT_EVAL_BASE_URL || DEFAULT_BASE_URL,
  reportPath = process.env.SPENDABLE_AGENT_EVAL_REPORT || DEFAULT_REPORT_PATH,
  cases = agentEvalCases,
  caseIds = process.env.SPENDABLE_AGENT_EVAL_CASE_IDS,
  fetchImpl = globalThis.fetch,
  timeoutMs = Number(process.env.SPENDABLE_AGENT_EVAL_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  conversationPrefix = process.env.SPENDABLE_AGENT_EVAL_CONVERSATION_PREFIX || `eval-${Date.now()}`,
  log = console.log,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation is available.");
  }

  const startedAt = new Date().toISOString();
  const agentUrl = new URL("/api/agent", baseUrl).toString();
  const selectedCases = selectEvalCases(cases, caseIds);
  const results = [];

  log(`Running ${selectedCases.length} Pip agent eval cases against ${agentUrl}`);

  for (const caseDef of selectedCases) {
    const caseStart = Date.now();
    const conversationId = `${conversationPrefix}-${caseDef.id}`;
    const requestBody = buildRequestBody(caseDef, conversationId);

    let payload = null;
    let httpStatus = 0;
    let httpOk = false;
    let networkError = null;

    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        agentUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
        timeoutMs,
      );
      httpStatus = response.status;
      httpOk = response.ok;
      payload = await readJson(response);
    } catch (error) {
      networkError = error instanceof Error ? error.message : String(error);
    }

    const evaluation = evaluateAgentResponse({
      caseDef,
      response: payload,
      httpStatus,
      httpOk,
      error: networkError,
    });

    const result = {
      id: caseDef.id,
      description: caseDef.description,
      message: caseDef.message,
      scenario: requestBody.scenario,
      selectedPromptChipId: requestBody.selectedPromptChipId,
      httpStatus,
      durationMs: Date.now() - caseStart,
      ...evaluation,
      rawResponse: payload,
    };

    results.push(result);
    log(`${result.ok ? "PASS" : "FAIL"} ${caseDef.id}${result.ok ? "" : ` - ${result.failures.join("; ")}`}`);
  }

  const failureCount = results.filter((result) => !result.ok).length;
  const report = {
    status: failureCount === 0 ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    startedAt,
    baseUrl,
    agentUrl,
    caseCount: results.length,
    failureCount,
    cases: results,
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  log(`Wrote Pip agent eval report to ${reportPath}`);

  return report;
}

function selectEvalCases(cases, caseIds) {
  if (!caseIds) {
    return cases;
  }

  const wantedIds = String(caseIds)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const knownIds = new Set(cases.map((caseDef) => caseDef.id));
  const unknownIds = wantedIds.filter((id) => !knownIds.has(id));

  if (unknownIds.length > 0) {
    throw new Error(`Unknown eval case id(s): ${unknownIds.join(", ")}`);
  }

  return cases.filter((caseDef) => wantedIds.includes(caseDef.id));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAgentEval()
    .then((report) => {
      process.exitCode = report.failureCount === 0 ? 0 : 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
