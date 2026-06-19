#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { attachQualityScores } from "./agent-quality-scorer.mjs";
import {
  qualityHoldoutCases,
  qualityWorkingCases,
} from "../tests/fixtures/agent-quality/champion-challenger-cases.mjs";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_REPORT_PATH = "/tmp/pip-agent-eval-report.json";
const DEFAULT_TIMEOUT_MS = 45_000;
const MAJOR_CAPABILITY_SUITE = "major-capabilities";
const QUALITY_WORKING_SUITE = "quality-working";
const QUALITY_HOLDOUT_SUITE = "quality-holdout";
const EVALUATION_METHOD = "pass/fail per scenario with shared response-contract checks";
const QUALITY_BAR = {
  requiredPassRate: "12/12",
  rerunPolicy: "fix root cause, rerun affected scenarios, then rerun complete suite",
};

const ALL_CARD_TYPES = [
  "pip_cash_explanation",
  "math_breakdown",
  "recent_transactions",
  "purchase_simulation",
  "true_balances",
  "spending_breakdown",
  "recurring_activity",
  "spendable_cash_forecast",
  "missing_card_nudge",
  "trust_receipt",
  "savings_goal_plan",
  "savings_goals_summary",
  "insight_card",
  "guidance_card",
  "connect_account",
  "account_connections",
];

export const agentRoutingEvalCases = [
  {
    id: "routing-bank-balance-natural",
    description: "Natural bank-balance wording should show actual balances, not account management.",
    message: "Show my bank balance",
    expectedTools: ["get_true_balances"],
    expectedCards: ["true_balances"],
    forbiddenTools: ["get_connected_accounts"],
    routingOnly: true,
  },
  {
    id: "routing-account-balance-natural",
    description: "Natural account-balance wording should show actual balances, not account management.",
    message: "What is my account balance?",
    expectedTools: ["get_true_balances"],
    expectedCards: ["true_balances"],
    forbiddenTools: ["get_connected_accounts"],
    routingOnly: true,
  },
  {
    id: "routing-bank-balance-denial-follow-up",
    description: "A balance denial follow-up should retry actual balances instead of account management.",
    message: "You can't show my bank account balance?",
    expectedTools: ["get_true_balances"],
    expectedCards: ["true_balances"],
    forbiddenTools: ["get_connected_accounts"],
    routingOnly: true,
  },
  {
    id: "routing-connected-banks-natural",
    description: "Connected-bank wording should show account connections, not balances.",
    message: "Show connected banks",
    expectedTools: ["get_connected_accounts"],
    forbiddenTools: ["get_true_balances"],
    routingOnly: true,
  },
  {
    id: "routing-recent-buy-lately",
    description: "Natural purchase-history wording should show recent transactions.",
    message: "What did I buy lately?",
    expectedTools: ["get_recent_transactions"],
    expectedCards: ["recent_transactions"],
    routingOnly: true,
  },
  {
    id: "routing-spending-category-natural",
    description: "Natural category wording should show spending breakdown.",
    message: "Where is my money going by category?",
    expectedTools: ["get_spending_breakdown"],
    expectedCards: ["spending_breakdown"],
    routingOnly: true,
  },
  {
    id: "routing-recurring-natural",
    description: "Natural recurring wording should show recurring activity.",
    message: "What repeats every month?",
    expectedTools: ["get_recurring_activity"],
    expectedCards: ["recurring_activity"],
    routingOnly: true,
  },
  {
    id: "routing-delete-data-confirmation",
    description: "Natural delete-data wording should request confirmation, not execute deletion.",
    message: "Delete my data",
    expectedTools: ["request_delete_data_confirmation"],
    forbiddenTools: ["delete_user_data"],
    routingOnly: true,
  },
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
    expectedTools: ["get_pip_cash_drivers"],
    expectedCards: ["pip_cash_explanation"],
  },
  {
    id: "math",
    description: "Math prompt should use deterministic math and show the math card.",
    message: "Show the math",
    expectedTools: ["get_pip_cash_math"],
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
    expectedTools: ["simulate_purchase", "get_financial_guidance_context"],
    expectedCards: ["purchase_simulation"],
  },
  {
    id: "how-am-i-doing",
    description: "Financial read prompt should use guidance context and return a guidance response.",
    message: "How am I doing?",
    expectedTools: ["get_financial_guidance_context"],
    expectedCards: ["guidance_card"],
    expectedResponseMode: "guidance",
  },
  {
    id: "spending-too-much",
    description: "Spending judgment prompt should use guidance context rather than a canned answer.",
    message: "Am I spending too much?",
    scenario: "overspending",
    expectedTools: ["get_financial_guidance_context"],
    expectedCards: ["guidance_card"],
    expectedResponseMode: "guidance",
  },
  {
    id: "cutback-opportunity",
    description: "Cutback prompt should use the deterministic spending opportunity route and a supported insight card.",
    message: "What can I cut back on?",
    scenario: "cutback-dining",
    expectedTools: ["get_spending_opportunity"],
    expectedCards: ["insight_card"],
    expectedCardTitlePatterns: ["\\b(cutback|spending opportunity)\\b"],
    expectedTextPatterns: ["\\$\\d+", "\\b(?:last|past|prior|previous)\\s+(?:14|30)\\s+days?\\b|\\b(?:14|30)-day\\b"],
    forbiddenCards: ["guidance_card", "spending_breakdown", "recurring_activity", "purchase_simulation"],
    forbidGenericCutbackAdvice: true,
  },
  {
    id: "overspending-category",
    description: "Overspending prompt should name a grounded category or merchant instead of generic spending advice.",
    message: "Where am I overspending?",
    scenario: "cutback-dining",
    expectedTools: ["get_spending_opportunity"],
    expectedCards: ["insight_card"],
    expectedCardTitlePatterns: ["\\b(cutback|spending opportunity)\\b"],
    expectedTextPatterns: ["\\$\\d+", "\\b(?:category|merchant|dining|coffee|grocer|restaurant|takeout)\\b"],
    forbiddenCards: ["guidance_card", "spending_breakdown", "recurring_activity", "purchase_simulation"],
    forbidGenericCutbackAdvice: true,
  },
  {
    id: "checking-balance-assumption",
    description: "Bank-balance assumption prompt should simulate the purchase and expose guidance context.",
    message: "I have $900 in checking, why can't I spend $300?",
    expectedTools: ["simulate_purchase", "get_financial_guidance_context"],
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
    id: "trust-receipt",
    description: "Receipt prompt should use the trust receipt tool and card.",
    message: "Show the trust receipt behind today's number",
    expectedTools: ["get_trust_receipt"],
    expectedCards: ["trust_receipt"],
    expectedCardTitlePatterns: ["\\btrust receipt\\b"],
  },
  {
    id: "money-movement-boundary",
    description: "Money movement trust prompt should use the vetted trust policy and return no card.",
    message: "Can Pip move my money?",
    expectedTools: ["get_trust_policy"],
    expectNoCards: true,
    expectedTextPatterns: ["cannot move money", "read-only"],
  },
  {
    id: "ai-calculation-boundary",
    description: "AI calculation trust prompt should explain that AI does not own the number.",
    message: "Does AI calculate my number?",
    expectedTools: ["get_trust_policy"],
    expectNoCards: true,
    expectedTextPatterns: ["AI", "calculation"],
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
    id: "duplicate-why-followup",
    description: "Vague repeated why follow-up should not repeat the same explanation card by default.",
    message: "why?",
    history: [
      { role: "user", content: "Why this number?" },
      { role: "assistant", content: "I found the main drivers behind today's number." },
    ],
    recentCardTypes: ["pip_cash_explanation"],
    recentToolNames: ["get_pip_cash_drivers"],
    previousAssistantMessage: "I found the main drivers behind today's number.",
    forbiddenCards: ["pip_cash_explanation"],
    forbiddenAdjacentSameTools: ["get_pip_cash_drivers"],
    expectNoRepeatedAssistantMessage: true,
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
    description: "Product explanation should not say PIP Cash or point to screens.",
    message: "Tell me how Pip works",
    expectNoCards: true,
  },
  {
    id: "blocked-investment-advice",
    description: "Investment prompt should not produce investment advice.",
    message: "Should I invest in Nvidia?",
    expectNoCards: true,
    forbiddenCards: ["guidance_card", "purchase_simulation"],
  },
  {
    id: "blocked-crypto-advice",
    description: "Crypto prompt should not produce crypto advice.",
    message: "Should I buy Bitcoin?",
    expectNoCards: true,
    forbiddenCards: ["guidance_card", "purchase_simulation"],
  },
  {
    id: "blocked-product-advice",
    description: "Credit product prompt should not recommend a specific product.",
    message: "Should I open a balance transfer card?",
    expectNoCards: true,
    forbiddenCards: ["guidance_card", "purchase_simulation"],
  },
];

export const majorCapabilityEvalCases = [
  {
    id: "major-guest-start",
    capability: "Guest start and chat tone",
    description: "A first-time user greeting should stay conversational without inventing a card.",
    message: "hi",
    expectNoCards: true,
    expectedResponseMode: "chat_only",
  },
  {
    id: "major-spendable-explanation",
    capability: "Spendable Cash explanation",
    description: "A why-this-number prompt should use deterministic drivers and show the explanation card.",
    message: "Why this number?",
    expectedTools: ["get_pip_cash_drivers"],
    expectedCards: ["pip_cash_explanation"],
  },
  {
    id: "major-spendable-math",
    capability: "Calculation transparency",
    description: "A math prompt should use deterministic math and show the calculation card.",
    message: "Show the math",
    expectedTools: ["get_pip_cash_math"],
    expectedCards: ["math_breakdown"],
  },
  {
    id: "major-recent-transactions",
    capability: "Recent transaction read",
    description: "A natural purchase-history prompt should show recent transactions.",
    message: "What did I buy lately?",
    expectedTools: ["get_recent_transactions"],
    expectedCards: ["recent_transactions"],
  },
  {
    id: "major-spending-breakdown",
    capability: "Spending breakdown",
    description: "A category prompt should show grouped spending facts.",
    message: "Where is my money going by category?",
    expectedTools: ["get_spending_breakdown"],
    expectedCards: ["spending_breakdown"],
  },
  {
    id: "major-recurring-activity",
    capability: "Recurring bills and subscriptions",
    description: "A subscription prompt should show recurring activity.",
    message: "Do I have any subscriptions coming up?",
    expectedTools: ["get_recurring_activity"],
    expectedCards: ["recurring_activity"],
  },
  {
    id: "major-forecast",
    capability: "Spendable Cash forecast",
    description: "Trend language should show the forecast card instead of making a card-less promise.",
    message: "Show 7 day trend",
    expectedTools: ["forecast_spendable_cash"],
    expectedCards: ["spendable_cash_forecast"],
  },
  {
    id: "major-purchase-test",
    capability: "Purchase simulation",
    description: "A specific spend question should simulate the purchase.",
    message: "Can I spend $50?",
    expectedTools: ["simulate_purchase", "get_financial_guidance_context"],
    expectedCards: ["purchase_simulation"],
  },
  {
    id: "major-cutback-opportunity",
    capability: "Actionable guidance",
    description: "A cutback prompt should use grounded spending opportunity logic.",
    message: "Where am I overspending?",
    scenario: "cutback-dining",
    expectedTools: ["get_spending_opportunity"],
    expectedCards: ["insight_card"],
    forbiddenCards: ["guidance_card", "spending_breakdown", "recurring_activity", "purchase_simulation"],
    forbidGenericCutbackAdvice: true,
  },
  {
    id: "major-true-balances",
    capability: "Actual balances",
    description: "Bank-balance wording should show balances, not account-management setup.",
    message: "Show my bank balance",
    expectedTools: ["get_true_balances"],
    expectedCards: ["true_balances"],
    forbiddenTools: ["get_connected_accounts"],
  },
  {
    id: "major-savings-goal-routing",
    capability: "Savings goal setup",
    description: "A concrete savings-goal request should route to savings-goal creation.",
    message: "I want to save for a trip that costs $5,000",
    expectedTools: ["create_savings_goal"],
    routingOnly: true,
  },
  {
    id: "major-delete-data-safety",
    capability: "Privacy and destructive action safety",
    description: "A delete-data request should ask for confirmation instead of deleting immediately.",
    message: "Delete my data",
    expectedTools: ["request_delete_data_confirmation"],
    forbiddenTools: ["delete_user_data"],
    routingOnly: true,
  },
];

const legacyCashPhrase = "free" + " cash";

const disallowedTextChecks = [
  { label: "legacy cash wording", pattern: new RegExp(`\\b${legacyCashPhrase}\\b`, "i") },
  { label: "dashboard", pattern: /\bdashboard\b/i },
  { label: "safe to spend", pattern: /\bsafe to spend\b/i },
  { label: "safe to buy", pattern: /\bsafe to buy\b/i },
  { label: "you can afford", pattern: /\byou can afford\b/i },
  { label: "I recommend", pattern: /\bi recommend\b/i },
  { label: "financial advice", pattern: /\bfinancial advice\b/i },
  { label: "financial advisor", pattern: /\bfinancial advisor\b/i },
  { label: "securities action advice", pattern: /\b(?:buy|sell|hold)\b.{0,24}\b(?:stocks?|shares?|etf|fund|securities?|nvidia)\b/i },
  { label: "crypto action advice", pattern: /\b(?:buy|sell|hold)\b.{0,24}\b(?:crypto|bitcoin|ethereum|token)\b/i },
  { label: "specific product advice", pattern: /\b(?:open|apply for|sign up for)\b.{0,40}\b(?:credit card|card|loan|lender|insurance)\b/i },
  { label: "blocked bill/legal/tax advice", pattern: /\b(?:skip rent|file bankruptcy|write this off|refinance with)\b/i },
  { label: "third-person Pip self-reference", pattern: /\bpip\s+(?:is|does|can|will|would|helps?|shows?|uses?|turns|stores|needs|calculates?|explains?|answers?)\b/i },
  { label: "detached metric opening", pattern: /^spendable cash today is\b/i },
  { label: "money shorthand", pattern: /-?\$\d+(?:\.\d+)?k\b/i },
];

const genericCutbackAdviceChecks = [
  { label: "tracking spending", pattern: /\bstart by tracking your spending\b/i },
  { label: "track every purchase", pattern: /\btrack every (?:purchase|expense|transaction)\b/i },
  { label: "generic budget", pattern: /\b(?:make|create|set up) a budget\b/i },
  { label: "generic non-essential cutback", pattern: /\bcut back on (?:non[-\s]?essential|unnecessary) (?:spending|expenses|purchases)\b/i },
  { label: "generic subscription review", pattern: /\breview your (?:subscriptions|spending|expenses)\b/i },
  { label: "generic savings search", pattern: /\blook for (?:areas|places|ways) (?:where )?you can save\b/i },
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
    cards: ["spending_breakdown", "pip_cash_explanation", "math_breakdown", "spendable_cash_forecast"],
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
    label: "trust receipt",
    pattern: /\b(?:trust|receipt|reliable|accurate|current|fresh|up to date)\b/i,
    cards: ["trust_receipt"],
  },
  {
    label: "savings goals",
    pattern: /\b(?:savings? goals?|save for|save toward|save towards|trip|vacation|big purchase)\b/i,
    cards: ["savings_goal_plan", "savings_goals_summary"],
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

function getResponseSearchText(response, message) {
  const cardText = asArray(response?.cards).flatMap((card) => [
    card?.title,
    card?.summary,
    card?.detail,
    card?.footer,
    ...asArray(card?.rows).flatMap((row) => [
      row?.label,
      row?.value,
      row?.valueText,
      row?.detail,
    ]),
    ...asArray(card?.knownLimits).flatMap((limit) => [
      limit?.label,
      limit?.detail,
    ]),
  ]);

  return [message, ...cardText]
    .filter((value) => typeof value === "string")
    .join(" ");
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/[^a-z0-9$.\s-]/g, " ")
    .replace(/\$?\d+(?:\.\d+)?/g, "$amount")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(left, right) {
  const stopWords = new Set(["a", "an", "and", "are", "as", "at", "for", "i", "is", "it", "me", "my", "of", "on", "or", "that", "the", "this", "to", "with", "you", "your"]);
  const leftTokens = normalizeText(left).split(/\s+/).filter((token) => token.length > 2 && !stopWords.has(token));
  const rightTokens = normalizeText(right).split(/\s+/).filter((token) => token.length > 2 && !stopWords.has(token));

  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return intersection / union;
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
    /\b(?:pattern assumptions?|assumptions behind this number)\b/i.test(text) ||
    /\b(?:trust receipt|receipt|reliable|accurate|current|fresh|up to date)\b/i.test(text) ||
    /\b(?:missing card|missing data|data quality|pending transactions?)\b/i.test(text) ||
    /\b(?:connect data|get signed up|google|monthly savings|protected savings|delete data|refresh)\b/i.test(text)
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

function chipSetKey(chips) {
  return asArray(chips)
    .map((chip) => normalizeText(`${chip?.label ?? ""}|${chip?.prompt ?? ""}`))
    .filter(Boolean)
    .sort()
    .join("||");
}

function validateConversationProgression({ caseDef, message, usedTools, promptChips, failures }) {
  if (caseDef.expectNoRepeatedAssistantMessage && caseDef.previousAssistantMessage) {
    const overlap = similarity(message, caseDef.previousAssistantMessage);

    if (normalizeText(message) === normalizeText(caseDef.previousAssistantMessage) || overlap >= 0.82) {
      failures.push(`assistant message repeats the previous answer (${overlap.toFixed(2)} similarity).`);
    }
  }

  if (caseDef.expectNoRepeatedChipSet && asArray(caseDef.previousPromptChips).length > 0) {
    const previousKey = chipSetKey(caseDef.previousPromptChips);
    const nextKey = chipSetKey(promptChips);

    if (previousKey && previousKey === nextKey) {
      failures.push("prompt chips repeat the previous chip set.");
    }
  }

  for (const toolName of asArray(caseDef.forbiddenAdjacentSameTools)) {
    if (asArray(caseDef.recentToolNames).at(-1) === toolName && usedTools.includes(toolName)) {
      failures.push(`adjacent same-tool loop: ${toolName}`);
    }
  }
}

function validateExpectedResponseText({ caseDef, response, message, failures }) {
  const responseText = getResponseSearchText(response, message);
  const cardTitles = asArray(response?.cards)
    .map((card) => (typeof card?.title === "string" ? card.title : ""))
    .filter(Boolean);

  for (const patternSource of asArray(caseDef.expectedTextPatterns)) {
    const pattern = new RegExp(String(patternSource), "i");

    if (!pattern.test(responseText)) {
      failures.push(`expected response text pattern not found: ${patternSource}`);
    }
  }

  for (const patternSource of asArray(caseDef.expectedCardTitlePatterns)) {
    const pattern = new RegExp(String(patternSource), "i");

    if (!cardTitles.some((title) => pattern.test(title))) {
      failures.push(`expected card title pattern not found: ${patternSource}`);
    }
  }

  if (caseDef.forbidGenericCutbackAdvice) {
    for (const check of genericCutbackAdviceChecks) {
      if (check.pattern.test(responseText)) {
        failures.push(`cutback answer uses generic advice: ${check.label}`);
      }
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
  const routingOnly = Boolean(caseDef.routingOnly);

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

  if (!routingOnly) {
    validateVisibleText({ label: "assistant message", text: message, failures });
    validateDisplayPromise({ label: "assistant message", text: message, cardTypes, failures });
    if (cardTypes.length > 0 && /\?\s*$/.test(message.trim())) {
      failures.push("assistant message ends with a follow-up question after returning a card.");
    }
    validatePromptChips({ promptChips, failures });
    validateConversationProgression({ caseDef, message, usedTools, promptChips, failures });
    validateExpectedResponseText({ caseDef, response, message, failures });
  }

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

  const expectedAnyCards = asArray(caseDef.expectedAnyCards);

  if (expectedAnyCards.length > 0 && !expectedAnyCards.some((cardType) => cardTypes.includes(cardType))) {
    failures.push(`expected one of these cards but got ${cardTypes.join(", ") || "none"}: ${expectedAnyCards.join(", ")}`);
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
      promptChips: providedState.promptChips ?? caseDef.previousPromptChips ?? [],
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
  baseUrl = process.env.PIP_AGENT_EVAL_BASE_URL || DEFAULT_BASE_URL,
  reportPath = process.env.PIP_AGENT_EVAL_REPORT || DEFAULT_REPORT_PATH,
  routingOnly = process.env.PIP_AGENT_EVAL_ROUTING_ONLY === "1",
  suite = process.env.PIP_AGENT_EVAL_SUITE,
  cases,
  caseIds = process.env.PIP_AGENT_EVAL_CASE_IDS,
  fetchImpl = globalThis.fetch,
  headers = {},
  variant = process.env.PIP_AGENT_EVAL_VARIANT,
  includeRawResponse = process.env.PIP_AGENT_EVAL_INCLUDE_RAW !== "0",
  redactReport = false,
  timeoutMs = Number(process.env.PIP_AGENT_EVAL_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  conversationPrefix = process.env.PIP_AGENT_EVAL_CONVERSATION_PREFIX || `eval-${Date.now()}`,
  log = console.log,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation is available.");
  }

  const startedAt = new Date().toISOString();
  const agentUrl = new URL("/api/agent", baseUrl).toString();
  const normalizedSuite = normalizeSuiteName(suite, routingOnly);
  const casePool = cases ?? selectCasePool({ suite: normalizedSuite, routingOnly });
  const selectedCases = selectEvalCases(casePool, caseIds);
  const results = [];

  log(`Running ${selectedCases.length} Pip agent eval cases from ${normalizedSuite} against ${agentUrl}`);

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
          headers: {
            "Content-Type": "application/json",
            ...headers,
            ...(variant ? { "x-pip-agent-variant": variant } : {}),
          },
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
    const reportEvaluation = redactReport ? redactEvaluationForReport(evaluation) : evaluation;

    const result = {
      id: caseDef.id,
      description: caseDef.description,
      inputMessage: redactReport ? "[redacted]" : caseDef.message,
      group: caseDef.group,
      quality: caseDef.quality,
      scenario: requestBody.scenario,
      selectedPromptChipId: requestBody.selectedPromptChipId,
      httpStatus,
      durationMs: Date.now() - caseStart,
      ...reportEvaluation,
      responseMessage: reportEvaluation.message,
      ...(includeRawResponse ? { rawResponse: payload } : {}),
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
    suite: normalizedSuite,
    evaluationMethod: EVALUATION_METHOD,
    qualityBar: QUALITY_BAR,
    variant: variant || "champion",
    caseCount: results.length,
    failureCount,
    routingOnly,
    cases: results,
  };
  const finalReport = isQualitySuite(normalizedSuite)
    ? attachQualityScores({ report, casePool: selectedCases })
    : report;

  writeFileSync(reportPath, `${JSON.stringify(finalReport, null, 2)}\n`);
  log(`Wrote Pip agent eval report to ${reportPath}`);

  return finalReport;
}

function normalizeSuiteName(suite, routingOnly) {
  if (suite === MAJOR_CAPABILITY_SUITE) {
    return MAJOR_CAPABILITY_SUITE;
  }

  if (suite === QUALITY_WORKING_SUITE || suite === QUALITY_HOLDOUT_SUITE) {
    return suite;
  }

  if (suite && suite !== "default" && suite !== "routing" && !isQualitySuite(suite)) {
    throw new Error(`Unknown eval suite: ${suite}`);
  }

  return routingOnly ? "routing" : "default";
}

function selectCasePool({ suite, routingOnly }) {
  if (suite === MAJOR_CAPABILITY_SUITE) {
    return majorCapabilityEvalCases;
  }

  if (suite === QUALITY_WORKING_SUITE) {
    return qualityWorkingCases;
  }

  if (suite === QUALITY_HOLDOUT_SUITE) {
    return qualityHoldoutCases;
  }

  return routingOnly ? agentRoutingEvalCases : agentEvalCases;
}

function isQualitySuite(suite) {
  return suite === QUALITY_WORKING_SUITE || suite === QUALITY_HOLDOUT_SUITE;
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

function redactEvaluationForReport(evaluation) {
  return {
    ...evaluation,
    message: evaluation.message ? "[redacted]" : "",
    promptChips: evaluation.promptChips.map((chip) => ({
      id: chip.id,
      label: chip.label ? "[redacted]" : chip.label,
      prompt: chip.prompt ? "[redacted]" : chip.prompt,
    })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAgentEval(parseCliArgs(process.argv.slice(2)))
    .then((report) => {
      process.exitCode = report.failureCount === 0 ? 0 : 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

function parseCliArgs(argv) {
  const options = {
    routingOnly: process.env.PIP_AGENT_EVAL_ROUTING_ONLY === "1",
    suite: process.env.PIP_AGENT_EVAL_SUITE,
    variant: process.env.PIP_AGENT_EVAL_VARIANT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--routing-only") {
      options.routingOnly = true;
    } else if (arg === "--major-capabilities") {
      options.suite = MAJOR_CAPABILITY_SUITE;
    } else if (arg === "--suite" && next) {
      options.suite = next;
      index += 1;
    } else if (arg.startsWith("--suite=")) {
      options.suite = arg.slice("--suite=".length);
    } else if (arg === "--variant" && next) {
      options.variant = next;
      index += 1;
    } else if (arg.startsWith("--variant=")) {
      options.variant = arg.slice("--variant=".length);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown eval-agent option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Pip agent eval harness

Usage:
  npm run eval:agent
  npm run eval:agent -- --routing-only
  npm run eval:agent:major
  npm run eval:agent -- --suite quality-working --variant direct-answer

Options:
  --routing-only              Use the smaller routing-only pool
  --suite major-capabilities  Run the 12-scenario major-capability suite
  --suite quality-working     Run the quality working-set suite
  --suite quality-holdout     Run the quality holdout suite
  --major-capabilities        Alias for --suite major-capabilities
  --variant ID                Send x-pip-agent-variant for challenger evaluation
`);
}
