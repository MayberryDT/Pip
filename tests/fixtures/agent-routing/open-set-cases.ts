import type { AgentRoutingCase } from "./catalog-derived-cases";

export const openSetRoutingCases: AgentRoutingCase[] = [
  {
    id: "open-set-stock-advice",
    message: "should I buy Nvidia stock",
    expectedDecision: "abstain",
    forbiddenToolNames: ["get_financial_guidance_context", "get_spending_opportunity"],
    risk: "open_set",
    source: "manual",
  },
  {
    id: "open-set-credit-score",
    message: "show my credit score",
    expectedDecision: "abstain",
    forbiddenToolNames: ["get_true_balances", "get_connected_accounts"],
    risk: "open_set",
    source: "manual",
  },
  {
    id: "open-set-money-movement",
    message: "move $200 to savings",
    expectedDecision: "abstain",
    forbiddenToolNames: ["simulate_purchase"],
    risk: "open_set",
    source: "manual",
  },
];
