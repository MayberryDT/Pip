import type { AgentCard } from "@/lib/agent/card-types";
import type { DeterministicAgentToolName } from "@/lib/agent/intent-catalog";

export type AgentRoutingCase = {
  id: string;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  expectedDecision: "route" | "clarify" | "abstain" | "confirm";
  expectedIntentId?: string;
  expectedToolName?: DeterministicAgentToolName;
  expectedCardTypes?: AgentCard["type"][];
  forbiddenIntentIds?: string[];
  forbiddenToolNames?: DeterministicAgentToolName[];
  requiredSlots?: Record<string, unknown>;
  risk: "normal" | "sibling_confuser" | "open_set" | "action_safety" | "multi_turn";
  source: "catalog" | "manual" | "telemetry" | "regression";
  notes?: string;
};

export const catalogDerivedRoutingCases: AgentRoutingCase[] = [
  {
    id: "catalog-balances-bank-balance",
    message: "show my bank balance",
    expectedDecision: "route",
    expectedIntentId: "balances.actual_accounts",
    expectedToolName: "get_true_balances",
    expectedCardTypes: ["true_balances"],
    risk: "normal",
    source: "catalog",
  },
  {
    id: "catalog-balances-account-balance",
    message: "what is my account balance",
    expectedDecision: "route",
    expectedIntentId: "balances.actual_accounts",
    expectedToolName: "get_true_balances",
    expectedCardTypes: ["true_balances"],
    risk: "normal",
    source: "regression",
  },
  {
    id: "catalog-transactions-buy-lately",
    message: "what did i buy lately",
    expectedDecision: "route",
    expectedIntentId: "transactions.recent",
    expectedToolName: "get_recent_transactions",
    expectedCardTypes: ["recent_transactions"],
    risk: "normal",
    source: "catalog",
  },
  {
    id: "catalog-math-calculate-this",
    message: "how did you calculate this",
    expectedDecision: "route",
    expectedIntentId: "math.breakdown",
    expectedToolName: "get_pip_cash_math",
    expectedCardTypes: ["math_breakdown"],
    risk: "normal",
    source: "catalog",
  },
];
