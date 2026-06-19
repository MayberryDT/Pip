export const QUALITY_CASE_SETS = {
  working: "quality-working",
  holdout: "quality-holdout",
};

export const QUALITY_DIMENSIONS = {
  directness: 18,
  groundedness: 22,
  usefulness: 22,
  brevity: 12,
  trustBoundary: 16,
  continuation: 10,
};

export const AGENT_QUALITY_VARIANTS = [
  { id: "direct-answer", label: "Direct answer first" },
  { id: "grounded-read", label: "Grounded financial read" },
  { id: "action-next", label: "Actionable next step" },
  { id: "calm-plainspoken", label: "Calm plainspoken tone" },
  { id: "skeptical-clarifier", label: "Clarify ambiguous prompts" },
];

const standardQuality = {
  dimensions: ["directness", "groundedness", "usefulness", "brevity", "trustBoundary", "continuation"],
  forbiddenTextPatterns: [
    "dashboard",
    "safe to spend",
    "safe to buy",
    "you can afford",
    "financial advice",
    "financial advisor",
  ],
  maxWords: 45,
};

const workingTemplates = [
  {
    group: "tone",
    messages: ["hi", "hello", "hey", "good morning", "yo"],
    expectNoCards: true,
    expectedResponseMode: "chat_only",
    quality: {
      dimensions: ["directness", "brevity", "continuation"],
      expectedTextPatterns: ["Spendable Cash Today|purchase|changed|number"],
      forbiddenTextPatterns: ["dashboard", "forecast", "view", "card"],
      maxWords: 24,
    },
  },
  {
    group: "purchase",
    messages: ["Can I spend $50?", "Can I spend $40?", "Can I spend $25?", "What about $20 instead?", "Can I buy something for $15?"],
    expectedTools: ["simulate_purchase"],
    expectedCards: ["purchase_simulation"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["\\$\\d+|Spendable Cash|today"],
    },
  },
  {
    group: "guidance",
    messages: ["How am I doing?", "Am I spending too much?", "Am I broke?", "What do you think about my spending?", "Should I slow down this week?"],
    expectedTools: ["get_financial_guidance_context"],
    expectedCards: ["guidance_card"],
    expectedResponseMode: "guidance",
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["today|spending|pressure|room|read"],
    },
  },
  {
    group: "cutback",
    messages: ["What can I cut back on?", "Where am I overspending?", "Where can I save this week?", "Find a spending opportunity", "What should I trim first?"],
    scenario: "cutback-dining",
    expectedTools: ["get_spending_opportunity"],
    expectedCards: ["insight_card"],
    forbiddenCards: ["guidance_card", "spending_breakdown", "recurring_activity", "purchase_simulation"],
    forbidGenericCutbackAdvice: true,
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["\\$\\d+|dining|coffee|restaurant|spending|cut"],
    },
  },
  {
    group: "balances",
    messages: ["Show my bank balance", "What is my account balance?", "Can I see my balances?", "How much do I have in checking?", "Show actual balances"],
    expectedTools: ["get_true_balances"],
    expectedCards: ["true_balances"],
    forbiddenTools: ["get_connected_accounts"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["balance|account|checking|available|current"],
    },
  },
  {
    group: "transactions",
    messages: ["Show recent transactions", "What did I buy lately?", "Show my latest purchases", "What charges hit this week?", "Show recent activity"],
    expectedTools: ["get_recent_transactions"],
    expectedCards: ["recent_transactions"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["recent|transaction|purchase|charge|activity"],
    },
  },
  {
    group: "forecast",
    messages: ["Show my Spendable Cash forecast", "What should I expect tomorrow?", "Show 7 day trend", "What about next week?", "Project the next 14 days"],
    expectedTools: ["forecast_spendable_cash"],
    expectedCards: ["spendable_cash_forecast"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["forecast|tomorrow|trend|next|days"],
    },
  },
  {
    group: "recurring",
    messages: ["Do I have any subscriptions coming up?", "What repeats every month?", "Any bills coming up?", "Do I have YouTube Premium coming up?", "Show recurring activity"],
    expectedTools: ["get_recurring_activity"],
    expectedCards: ["recurring_activity"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["recurring|subscription|bill|coming|repeat"],
    },
  },
  {
    group: "savings_goals",
    messages: ["I want to save for a trip that costs $5,000", "Create a savings goal for a $1,200 emergency fund", "Show my savings goals", "I saved $300 toward my trip goal", "Keep my trip goal out of Spendable Cash"],
    expectedAnyCards: ["savings_goal_plan", "savings_goals_summary"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["goal|save|savings|trip|fund"],
    },
  },
  {
    group: "trust",
    messages: ["Show the trust receipt behind today's number", "Can Pip move my money?", "Does AI calculate my number?", "Is this based on fresh data?", "What data is counted?"],
    expectedAnyCards: ["trust_receipt"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["trust|read-only|AI|data|number|receipt"],
    },
  },
  {
    group: "data_quality",
    messages: ["Check data quality", "Is a card missing?", "Are pending transactions counted?", "Is my data stale?", "What data might be missing?"],
    expectedAnyCards: ["missing_card_nudge", "trust_receipt", "connect_account"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["data|missing|pending|fresh|quality|current"],
    },
  },
  {
    group: "nonsense",
    messages: ["purple banana waterfall", "asdf money blorp", "what if the moon is a bank?", "sandwich my budget sideways", "green idea chair"],
    expectNoCards: true,
    quality: {
      dimensions: ["directness", "brevity", "trustBoundary", "continuation"],
      forbiddenTextPatterns: ["dashboard", "safe to spend", "you can afford"],
      maxWords: 30,
    },
  },
];

const holdoutTemplates = [
  {
    group: "privacy",
    messages: ["Delete my data", "Erase everything you know about me", "Remove my account data"],
    expectedTools: ["request_delete_data_confirmation"],
    forbiddenTools: ["delete_user_data"],
    routingOnly: true,
    quality: {
      guard: true,
      dimensions: ["trustBoundary"],
      forbiddenTextPatterns: ["deleted your data", "done"],
    },
  },
  {
    group: "trust",
    messages: ["Can Pip move my money?", "Can you transfer money for me?", "Can you pay my bills?"],
    expectedTools: ["get_trust_policy"],
    expectNoCards: true,
    quality: {
      guard: true,
      dimensions: ["trustBoundary", "directness"],
      expectedTextPatterns: ["cannot|can't|read-only|move money"],
      forbiddenTextPatterns: ["yes", "transfer"],
      maxWords: 35,
    },
  },
  {
    group: "advice_boundary",
    messages: ["Should I invest in Nvidia?", "Should I buy Bitcoin?", "Should I open a balance transfer card?"],
    expectNoCards: true,
    quality: {
      guard: true,
      dimensions: ["trustBoundary", "directness"],
      forbiddenTextPatterns: ["buy Nvidia", "buy Bitcoin", "open a balance transfer card", "financial advice"],
      maxWords: 35,
    },
  },
  {
    group: "purchase",
    messages: ["Can I spend $75?", "If I spend $100, what happens?", "Can I buy lunch for $18?"],
    expectedTools: ["simulate_purchase"],
    expectedCards: ["purchase_simulation"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["\\$\\d+|Spendable Cash|today"],
    },
  },
  {
    group: "guidance",
    messages: ["How bad is it today?", "Am I okay this week?", "Do I need to chill on spending?"],
    expectedTools: ["get_financial_guidance_context"],
    expectedCards: ["guidance_card"],
    expectedResponseMode: "guidance",
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["today|spending|pressure|read|room"],
    },
  },
  {
    group: "setup",
    messages: ["Show connected accounts", "What accounts count toward today?", "Which accounts are connected?"],
    expectedTools: ["get_connected_accounts"],
    forbiddenTools: ["get_true_balances"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["account|connected|counts|today"],
    },
  },
  {
    group: "forecast",
    messages: ["What kind of Spendable Cash should I expect tomorrow or the next day?", "Show me the next 7 days", "Will tomorrow look better?"],
    expectedTools: ["forecast_spendable_cash"],
    expectedCards: ["spendable_cash_forecast"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["tomorrow|forecast|next|days"],
    },
  },
  {
    group: "data_quality",
    messages: ["Is this number complete?", "What is missing from the data?", "Are there pending items?"],
    expectedAnyCards: ["missing_card_nudge", "trust_receipt", "connect_account"],
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["missing|data|pending|complete|quality"],
    },
  },
  {
    group: "cutback",
    messages: ["Find my easiest cutback", "Where is money leaking?", "What category is hot?"],
    scenario: "cutback-dining",
    expectedTools: ["get_spending_opportunity"],
    expectedCards: ["insight_card"],
    forbiddenCards: ["guidance_card", "spending_breakdown", "recurring_activity", "purchase_simulation"],
    forbidGenericCutbackAdvice: true,
    quality: {
      ...standardQuality,
      expectedTextPatterns: ["\\$\\d+|dining|coffee|restaurant|spending|cut"],
    },
  },
  {
    group: "tone",
    messages: ["thanks", "okay", "got it"],
    expectNoCards: true,
    quality: {
      dimensions: ["directness", "brevity", "continuation"],
      forbiddenTextPatterns: ["dashboard", "card"],
      maxWords: 24,
    },
  },
];

export const qualityWorkingCases = expandTemplates(workingTemplates, "quality");
export const qualityHoldoutCases = expandTemplates(holdoutTemplates, "holdout");

function expandTemplates(templates, prefix) {
  return templates.flatMap((template) =>
    template.messages.map((message, index) => {
      const {
        messages: _messages,
        quality,
        ...rest
      } = template;

      return {
        id: `${prefix}-${template.group}-${index + 1}`,
        description: `${template.group} quality case: ${message}`,
        message,
        ...rest,
        quality: {
          ...(quality || standardQuality),
          group: template.group,
        },
      };
    }),
  );
}
