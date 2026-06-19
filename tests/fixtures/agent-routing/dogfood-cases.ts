import type { AgentCard } from "@/lib/agent/card-types";
import type { ConversationJob } from "@/lib/agent/conversation-state";
import type { DeterministicAgentToolName } from "@/lib/agent/intent-catalog";

export type AgentRouterDogfoodCase = {
  id: string;
  message: string;
  expectedDecision: "route" | "abstain";
  expectedIntentId?: string;
  expectedToolName?: DeterministicAgentToolName;
  expectedCardTypes?: AgentCard["type"][];
  forbiddenIntentIds?: string[];
  forbiddenToolNames?: DeterministicAgentToolName[];
  expectedConversationJob?: ConversationJob;
  family: string;
  risk: "positive" | "sibling_confuser" | "open_set" | "action_safety" | "policy" | "follow_up";
  source: "catalog" | "manual" | "incident" | "generated";
  liveSample?: boolean;
  notes?: string;
};

type RouteSpec = {
  family: string;
  intentId: string;
  toolName: DeterministicAgentToolName;
  cardTypes?: AgentCard["type"][];
  conversationJob?: ConversationJob;
  phrases: string[];
  forbiddenIntentIds?: string[];
  forbiddenToolNames?: DeterministicAgentToolName[];
  risk?: AgentRouterDogfoodCase["risk"];
  source?: AgentRouterDogfoodCase["source"];
  liveSample?: boolean;
  variantMode?: "imperative" | "question" | "exact";
};

export const DOGFOOD_MIN_CASE_COUNT = 300;

const routeSpecs: RouteSpec[] = [
  {
    family: "balances",
    intentId: "balances.actual_accounts",
    toolName: "get_true_balances",
    cardTypes: ["true_balances"],
    conversationJob: "true_balances",
    forbiddenIntentIds: ["account.connected_accounts"],
    forbiddenToolNames: ["get_connected_accounts"],
    source: "incident",
    liveSample: true,
    variantMode: "question",
    phrases: [
      "show my bank balance",
      "what is my account balance",
      "what is my bank account balance",
      "what is my current account balance",
      "what is my available balance",
      "can I see my balances",
      "how much do I have in checking",
      "how much money is in my account",
      "pull up my accounts and balances",
      "you can't show my bank account balance",
    ],
  },
  {
    family: "account_management",
    intentId: "account.connected_accounts",
    toolName: "get_connected_accounts",
    cardTypes: ["account_connections"],
    conversationJob: "setup",
    forbiddenIntentIds: ["balances.actual_accounts"],
    forbiddenToolNames: ["get_true_balances"],
    risk: "sibling_confuser",
    liveSample: true,
    variantMode: "question",
    phrases: [
      "show connected accounts",
      "show connected banks",
      "what banks are linked",
      "which accounts are connected",
      "what accounts count toward today",
      "what is Pip using",
      "show accounts you can see",
      "which accounts are used",
    ],
  },
  {
    family: "transactions",
    intentId: "transactions.recent",
    toolName: "get_recent_transactions",
    cardTypes: ["recent_transactions"],
    conversationJob: "recent_transactions",
    forbiddenIntentIds: ["spending.breakdown", "recurring.activity"],
    forbiddenToolNames: ["get_spending_breakdown", "get_recurring_activity"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "show recent transactions",
      "what did I buy lately",
      "show my latest purchases",
      "what charges hit this week",
      "where did my money go yesterday",
      "show recent activity",
      "what did I spend lately",
      "what did I buy recently",
    ],
  },
  {
    family: "spending_breakdown",
    intentId: "spending.breakdown",
    toolName: "get_spending_breakdown",
    cardTypes: ["spending_breakdown"],
    conversationJob: "spending_breakdown",
    forbiddenIntentIds: ["transactions.recent", "recurring.activity"],
    forbiddenToolNames: ["get_recent_transactions", "get_recurring_activity"],
    liveSample: true,
    variantMode: "imperative",
    phrases: [
      "show my spending breakdown",
      "break down my spending",
      "where is my money going by category",
      "show spending by category",
      "which merchants am I spending with",
      "show card payments in the last window",
      "give me a complete breakdown",
      "where is my money going",
    ],
  },
  {
    family: "recurring",
    intentId: "recurring.activity",
    toolName: "get_recurring_activity",
    cardTypes: ["recurring_activity"],
    conversationJob: "recurring_activity",
    forbiddenIntentIds: ["transactions.recent", "spendable.forecast"],
    forbiddenToolNames: ["get_recent_transactions", "forecast_spendable_cash"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "what bills are coming up",
      "show likely recurring bills and income",
      "what repeats every month",
      "show likely repeat items",
      "do I have YouTube Premium coming up",
      "what subscriptions are coming up",
      "show upcoming bills",
      "what monthly charges are coming up",
    ],
  },
  {
    family: "forecast",
    intentId: "spendable.forecast",
    toolName: "forecast_spendable_cash",
    cardTypes: ["spendable_cash_forecast"],
    conversationJob: "forecast",
    forbiddenIntentIds: ["recurring.activity", "purchase.simulation"],
    forbiddenToolNames: ["get_recurring_activity", "simulate_purchase"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "show my Spendable Cash forecast",
      "what about tomorrow",
      "where is Spendable headed",
      "how does next week look",
      "where will I be in a few days",
      "will this improve soon",
      "show 7 day trend",
      "what happens in the next few days",
    ],
  },
  {
    family: "purchase_simulation",
    intentId: "purchase.simulation",
    toolName: "simulate_purchase",
    cardTypes: ["purchase_simulation"],
    conversationJob: "purchase_test",
    forbiddenIntentIds: ["transactions.recent", "guidance.financial_read"],
    forbiddenToolNames: ["get_recent_transactions", "get_financial_guidance_context"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "can I spend $50",
      "would a $120 grocery trip hurt",
      "is $35 okay today",
      "what about $20 instead",
      "how would a $40 purchase affect this",
      "can I buy lunch for $18",
      "what does spending $75 do",
      "could I afford a $25 ride",
    ],
  },
  {
    family: "explanation",
    intentId: "spendable.explanation",
    toolName: "get_pip_cash_drivers",
    cardTypes: ["pip_cash_explanation"],
    conversationJob: "explain_number",
    forbiddenIntentIds: ["math.breakdown"],
    forbiddenToolNames: ["get_pip_cash_math"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "why this number",
      "why is it this amount today",
      "show the biggest drivers behind today's number",
      "what changed in my money",
      "why did it drop",
      "what is driving today",
      "why is Spendable Cash low",
      "explain today's number",
    ],
  },
  {
    family: "math",
    intentId: "math.breakdown",
    toolName: "get_pip_cash_math",
    cardTypes: ["math_breakdown"],
    conversationJob: "math",
    forbiddenIntentIds: ["spendable.explanation"],
    forbiddenToolNames: ["get_pip_cash_drivers"],
    liveSample: true,
    variantMode: "imperative",
    phrases: [
      "show the math",
      "show the formula",
      "how did you calculate this",
      "what numbers went into this",
      "show calculation details",
      "show how the math works",
    ],
  },
  {
    family: "data_quality",
    intentId: "data.quality",
    toolName: "get_data_quality",
    cardTypes: ["missing_card_nudge", "connect_account"],
    conversationJob: "data_quality",
    forbiddenIntentIds: ["data.refresh", "trust.receipt"],
    forbiddenToolNames: ["refresh_financial_data", "get_trust_receipt"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "check data quality",
      "is a card missing from Spendable Cash Today",
      "could this be missing something",
      "what is still pending",
      "why does this look incomplete",
      "is everything counted",
      "what data is missing from this number",
      "what data might be missing",
    ],
  },
  {
    family: "trust_receipt",
    intentId: "trust.receipt",
    toolName: "get_trust_receipt",
    cardTypes: ["trust_receipt"],
    conversationJob: "data_quality",
    forbiddenIntentIds: ["data.refresh", "policy.trust"],
    forbiddenToolNames: ["refresh_financial_data", "get_trust_policy"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "show the trust receipt behind today's number",
      "is this number current",
      "is my Spendable Cash Today up to date",
      "can I trust this number",
      "what data is counted",
      "what does this include",
      "when was this updated",
      "is my data stale",
    ],
  },
  {
    family: "cutback",
    intentId: "spending.cutback_opportunity",
    toolName: "get_spending_opportunity",
    cardTypes: ["insight_card"],
    conversationJob: "explain_number",
    forbiddenIntentIds: ["spending.breakdown", "transactions.recent"],
    forbiddenToolNames: ["get_spending_breakdown", "get_recent_transactions"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "what can I cut back on",
      "what can I do to save more money",
      "where am I overspending",
      "where can I save this week",
      "how do I reduce expenses",
      "find waste in my spending",
      "find a spending opportunity",
      "what should I stop buying",
      "what costs should I cut",
    ],
  },
  {
    family: "guidance",
    intentId: "guidance.financial_read",
    toolName: "get_financial_guidance_context",
    cardTypes: ["guidance_card"],
    conversationJob: "financial_guidance",
    forbiddenIntentIds: ["spending.cutback_opportunity", "math.breakdown"],
    forbiddenToolNames: ["get_spending_opportunity", "get_pip_cash_math"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "how am I doing",
      "what do you think",
      "what should I do",
      "am I okay",
      "am I spending too much",
      "give me the read",
      "what's your read",
      "should I lower my cushion",
      "should I slow down this week",
    ],
  },
  {
    family: "sync_status",
    intentId: "sync.status",
    toolName: "get_sync_status",
    conversationJob: "data_quality",
    forbiddenIntentIds: ["data.refresh"],
    forbiddenToolNames: ["refresh_financial_data"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "did you refresh",
      "did you refresh my data",
      "why is this not updating",
      "when did this last sync",
      "what is the refresh status",
      "what is the sync status",
      "when was this last refreshed",
    ],
  },
  {
    family: "policy",
    intentId: "policy.trust",
    toolName: "get_trust_policy",
    conversationJob: "data_quality",
    risk: "policy",
    forbiddenIntentIds: ["data.delete_request", "account.connected_accounts"],
    forbiddenToolNames: ["request_delete_data_confirmation", "get_connected_accounts"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "can Pip move my money",
      "does AI calculate my number",
      "does Pip sell my data",
      "how does Plaid work",
      "is this financial advice",
      "does Pip train on my data",
      "can Pip transfer my money",
      "who can see my data",
    ],
  },
  {
    family: "definition",
    intentId: "definition.spendable_cash",
    toolName: "get_spendable_cash_definition",
    conversationJob: "definition",
    forbiddenIntentIds: ["math.breakdown", "balances.actual_accounts"],
    forbiddenToolNames: ["get_pip_cash_math", "get_true_balances"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "what is Spendable Cash",
      "what does my Spendable Cash number mean",
      "how does Pip work",
      "what makes it go up or down",
      "what is Spendable Cash Today",
      "tell me how Pip works",
    ],
  },
  {
    family: "payday_insight",
    intentId: "insight.payday_impact",
    toolName: "compose_insight_card",
    cardTypes: ["insight_card"],
    conversationJob: "explain_number",
    liveSample: true,
    variantMode: "question",
    phrases: [
      "how did payday affect this",
      "how does payday affect my money",
      "how did my paycheck affect today",
      "did my deposit change the number",
      "how did income affect this",
    ],
  },
  {
    family: "spendable_factors",
    intentId: "insight.spendable_factors",
    toolName: "compose_insight_card",
    cardTypes: ["insight_card"],
    conversationJob: "explain_number",
    liveSample: true,
    variantMode: "question",
    phrases: [
      "what factors affect today's Spendable Cash",
      "what affects today",
      "what influences today's number",
      "which factors affect my number",
      "what changes Spendable Cash Today",
    ],
  },
  {
    family: "pattern_assumptions",
    intentId: "spendable.pattern_assumptions",
    toolName: "get_pattern_assumptions",
    cardTypes: ["insight_card"],
    conversationJob: "explain_number",
    liveSample: true,
    variantMode: "imperative",
    phrases: [
      "show the pattern assumptions behind this number",
      "what pattern are you using",
      "what baseline are you using",
      "how confident is this pattern",
      "show normal room assumptions",
    ],
  },
  {
    family: "spending_pressure",
    intentId: "spending.recent_pressure",
    toolName: "get_recent_spending_pressure",
    cardTypes: ["insight_card"],
    conversationJob: "explain_number",
    liveSample: true,
    variantMode: "question",
    phrases: [
      "how is recent spending affecting this",
      "show recent spending pressure",
      "am I ahead of pace",
      "am I under pattern",
      "is recent spending hurting today",
    ],
  },
  {
    family: "provider_connect",
    intentId: "provider.connect",
    toolName: "start_new_account_connection",
    conversationJob: "setup",
    risk: "action_safety",
    forbiddenIntentIds: ["balances.actual_accounts", "account.connected_accounts"],
    forbiddenToolNames: ["get_true_balances", "get_connected_accounts"],
    liveSample: true,
    variantMode: "imperative",
    phrases: [
      "add another bank",
      "connect another card",
      "add a credit card",
      "connect a new account",
      "link my bank",
      "connect my Chase account",
    ],
  },
  {
    family: "provider_repair",
    intentId: "provider.repair",
    toolName: "repair_account_connection",
    conversationJob: "setup",
    risk: "action_safety",
    forbiddenIntentIds: ["provider.connect", "balances.actual_accounts"],
    forbiddenToolNames: ["start_new_account_connection", "get_true_balances"],
    liveSample: true,
    variantMode: "imperative",
    phrases: [
      "repair my bank connection",
      "reconnect Wise",
      "fix my Plaid connection",
      "restore my bank",
      "reconnect Chase",
    ],
  },
  {
    family: "account_selection",
    intentId: "account.selection_update",
    toolName: "start_account_selection_update",
    conversationJob: "setup",
    risk: "action_safety",
    forbiddenIntentIds: ["balances.actual_accounts", "account.connected_accounts"],
    forbiddenToolNames: ["get_true_balances", "get_connected_accounts"],
    liveSample: true,
    variantMode: "imperative",
    phrases: [
      "change selected accounts",
      "forgot to select an account",
      "remove checking from today's number",
      "add savings from today's number",
      "change which accounts count",
    ],
  },
  {
    family: "account_inclusion",
    intentId: "account.inclusion",
    toolName: "set_account_inclusion",
    conversationJob: "setup",
    risk: "action_safety",
    forbiddenIntentIds: ["institution.remove_request", "balances.actual_accounts"],
    forbiddenToolNames: ["request_remove_institution_confirmation", "get_true_balances"],
    variantMode: "imperative",
    phrases: [
      "exclude my business checking",
      "ignore that account",
      "hide this account",
      "stop using shared checking",
      "use my checking account again",
      "include this card",
    ],
  },
  {
    family: "protected_savings",
    intentId: "account.protected_savings",
    toolName: "set_account_protected_savings",
    conversationJob: "setup",
    risk: "action_safety",
    forbiddenIntentIds: ["balances.actual_accounts"],
    forbiddenToolNames: ["get_true_balances"],
    variantMode: "imperative",
    phrases: [
      "make savings protected savings",
      "mark this account as protected savings",
      "set my savings as protected savings",
      "stop treating savings as protected",
      "do not treat this as protected",
    ],
  },
  {
    family: "institution_remove_request",
    intentId: "institution.remove_request",
    toolName: "request_remove_institution_confirmation",
    conversationJob: "setup",
    risk: "action_safety",
    forbiddenIntentIds: ["institution.remove_confirmed", "account.selection_update"],
    forbiddenToolNames: ["remove_institution", "start_account_selection_update"],
    liveSample: true,
    variantMode: "imperative",
    phrases: [
      "remove Wise",
      "disconnect Chase",
      "unlink my bank",
      "remove this institution",
      "disconnect my bank connection",
    ],
  },
  {
    family: "data_refresh",
    intentId: "data.refresh",
    toolName: "refresh_financial_data",
    conversationJob: "setup",
    risk: "action_safety",
    forbiddenIntentIds: ["sync.status", "data.quality"],
    forbiddenToolNames: ["get_sync_status", "get_data_quality"],
    liveSample: true,
    variantMode: "imperative",
    phrases: [
      "refresh my connected data",
      "sync now",
      "update my account data",
      "reload my data",
      "refresh connected data",
    ],
  },
  {
    family: "data_delete_request",
    intentId: "data.delete_request",
    toolName: "request_delete_data_confirmation",
    conversationJob: "setup",
    risk: "action_safety",
    forbiddenIntentIds: ["data.delete_confirmed", "policy.trust"],
    forbiddenToolNames: ["delete_user_data", "get_trust_policy"],
    liveSample: true,
    variantMode: "question",
    phrases: [
      "delete my data",
      "erase my financial data",
      "remove my stored data",
      "delete stored financial data",
    ],
  },
];

const exactRouteCases: AgentRouterDogfoodCase[] = [
  {
    id: "exact-delete-data-confirmed",
    message: "DELETE DATA",
    expectedDecision: "route",
    expectedIntentId: "data.delete_confirmed",
    expectedToolName: "delete_user_data",
    forbiddenIntentIds: ["data.delete_request"],
    forbiddenToolNames: ["request_delete_data_confirmation"],
    expectedConversationJob: "setup",
    family: "data_delete_confirmed",
    risk: "action_safety",
    source: "manual",
    liveSample: true,
  },
  {
    id: "exact-remove-institution-confirmed",
    message: "REMOVE WISE",
    expectedDecision: "route",
    expectedIntentId: "institution.remove_confirmed",
    expectedToolName: "remove_institution",
    forbiddenIntentIds: ["institution.remove_request"],
    forbiddenToolNames: ["request_remove_institution_confirmation"],
    expectedConversationJob: "setup",
    family: "institution_remove_confirmed",
    risk: "action_safety",
    source: "manual",
  },
];

const openSetMessages = [
  "show my credit score",
  "should I buy Bitcoin",
  "should I buy Nvidia stock",
  "move $200 to savings",
  "transfer money to my bank",
  "pay my electric bill",
  "what is my routing number",
  "wire money to Chase",
  "file my taxes",
  "should I get a mortgage",
  "dispute this charge",
  "buy Ethereum for me",
  "which ETF should I buy",
  "open a payday loan",
  "show my bank password",
  "can you make a payment",
  "send money to my landlord",
  "apply for insurance",
  "declare bankruptcy",
  "trade stocks for me",
];

const manualConfuserCases: AgentRouterDogfoodCase[] = [
  routeCase({
    id: "confuser-bank-balance-not-connected-bank",
    message: "what is my bank account balance",
    family: "balances",
    intentId: "balances.actual_accounts",
    toolName: "get_true_balances",
    cardTypes: ["true_balances"],
    conversationJob: "true_balances",
    forbiddenIntentIds: ["account.connected_accounts"],
    forbiddenToolNames: ["get_connected_accounts"],
    risk: "sibling_confuser",
    source: "incident",
    liveSample: true,
  }),
  routeCase({
    id: "confuser-connected-bank-not-balance",
    message: "which bank accounts are connected",
    family: "account_management",
    intentId: "account.connected_accounts",
    toolName: "get_connected_accounts",
    cardTypes: ["account_connections"],
    conversationJob: "setup",
    forbiddenIntentIds: ["balances.actual_accounts"],
    forbiddenToolNames: ["get_true_balances"],
    risk: "sibling_confuser",
    source: "manual",
    liveSample: true,
  }),
  routeCase({
    id: "confuser-refresh-status-not-refresh-action",
    message: "when did this last sync",
    family: "sync_status",
    intentId: "sync.status",
    toolName: "get_sync_status",
    conversationJob: "data_quality",
    forbiddenIntentIds: ["data.refresh"],
    forbiddenToolNames: ["refresh_financial_data"],
    risk: "sibling_confuser",
    source: "manual",
    liveSample: true,
  }),
  routeCase({
    id: "confuser-delete-policy-not-confirmed-delete",
    message: "what happens if I delete my data",
    family: "data_delete_request",
    intentId: "data.delete_request",
    toolName: "request_delete_data_confirmation",
    conversationJob: "setup",
    forbiddenIntentIds: ["data.delete_confirmed"],
    forbiddenToolNames: ["delete_user_data"],
    risk: "action_safety",
    source: "manual",
  }),
];

export const agentRouterDogfoodCases: AgentRouterDogfoodCase[] = dedupeCases([
  ...routeSpecs.flatMap(expandRouteSpec),
  ...exactRouteCases,
  ...manualConfuserCases,
  ...openSetMessages.map((message, index) => ({
    id: `open-set-${index + 1}-${slugify(message)}`,
    message,
    expectedDecision: "abstain" as const,
    family: "open_set",
    risk: "open_set" as const,
    source: "manual" as const,
    liveSample: index < 8,
  })),
]);

export const forcedToolDogfoodCases = agentRouterDogfoodCases.filter(
  (caseDef) => caseDef.expectedDecision === "route" && caseDef.expectedToolName,
);

export const conversationJobDogfoodCases = agentRouterDogfoodCases.filter(
  (caseDef) => caseDef.expectedDecision === "route" && caseDef.expectedConversationJob,
);

export const liveRouterDogfoodCases = agentRouterDogfoodCases.filter(
  (caseDef) => caseDef.liveSample && caseDef.expectedDecision === "route",
);

function expandRouteSpec(spec: RouteSpec): AgentRouterDogfoodCase[] {
  return spec.phrases.flatMap((phrase, phraseIndex) =>
    phraseVariants(phrase, spec.variantMode ?? "question").map((message, variantIndex) =>
      routeCase({
        id: `${spec.family}-${phraseIndex + 1}-${variantIndex + 1}-${slugify(message)}`,
        message,
        family: spec.family,
        intentId: spec.intentId,
        toolName: spec.toolName,
        cardTypes: spec.cardTypes,
        conversationJob: spec.conversationJob,
        forbiddenIntentIds: spec.forbiddenIntentIds,
        forbiddenToolNames: spec.forbiddenToolNames,
        risk: spec.risk ?? "positive",
        source: variantIndex === 0 ? spec.source ?? "catalog" : "generated",
        liveSample: Boolean(spec.liveSample && variantIndex === 0),
      }),
    ),
  );
}

function routeCase(input: {
  id: string;
  message: string;
  family: string;
  intentId: string;
  toolName: DeterministicAgentToolName;
  cardTypes?: AgentCard["type"][];
  conversationJob?: ConversationJob;
  forbiddenIntentIds?: string[];
  forbiddenToolNames?: DeterministicAgentToolName[];
  risk?: AgentRouterDogfoodCase["risk"];
  source?: AgentRouterDogfoodCase["source"];
  liveSample?: boolean;
}): AgentRouterDogfoodCase {
  return {
    id: input.id,
    message: input.message,
    expectedDecision: "route",
    expectedIntentId: input.intentId,
    expectedToolName: input.toolName,
    expectedCardTypes: input.cardTypes,
    forbiddenIntentIds: input.forbiddenIntentIds,
    forbiddenToolNames: input.forbiddenToolNames,
    expectedConversationJob: input.conversationJob,
    family: input.family,
    risk: input.risk ?? "positive",
    source: input.source ?? "manual",
    liveSample: input.liveSample,
  };
}

function phraseVariants(phrase: string, mode: RouteSpec["variantMode"]): string[] {
  if (mode === "exact") {
    return [phrase];
  }

  if (mode === "imperative") {
    return [
      phrase,
      `please ${phrase}`,
      `${phrase} please`,
      `can you ${phrase}`,
      `could you ${phrase}`,
      `I need to ${phrase}`,
      `${phrase} for me`,
    ];
  }

  return [
    phrase,
    `${phrase}?`,
    `please tell me ${phrase}`,
    `can you tell me ${phrase}`,
    `I want to know ${phrase}`,
    `${phrase} for me`,
  ];
}

function dedupeCases(cases: AgentRouterDogfoodCase[]): AgentRouterDogfoodCase[] {
  const seen = new Set<string>();
  const result: AgentRouterDogfoodCase[] = [];

  for (const caseDef of cases) {
    const key = `${caseDef.expectedDecision}|${caseDef.expectedIntentId ?? ""}|${caseDef.message.toLowerCase()}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(caseDef);
    }
  }

  return result;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52);
}
