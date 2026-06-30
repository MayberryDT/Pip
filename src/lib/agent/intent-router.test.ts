import { describe, expect, it } from "vitest";
import { resolveIntentRoute } from "@/lib/agent/intent-router";
import { actionSafetyRoutingCases } from "../../../tests/fixtures/agent-routing/action-safety-cases";
import type { AgentRoutingCase } from "../../../tests/fixtures/agent-routing/catalog-derived-cases";
import { catalogDerivedRoutingCases } from "../../../tests/fixtures/agent-routing/catalog-derived-cases";
import { highRiskRoutingCases } from "../../../tests/fixtures/agent-routing/high-risk-cases";
import { multiTurnRoutingCases } from "../../../tests/fixtures/agent-routing/multi-turn-cases";
import { openSetRoutingCases } from "../../../tests/fixtures/agent-routing/open-set-cases";

function route(caseOrMessage: AgentRoutingCase | string) {
  const message = typeof caseOrMessage === "string" ? caseOrMessage : caseOrMessage.message;

  return resolveIntentRoute({
    message,
    history: typeof caseOrMessage === "string" ? undefined : caseOrMessage.history,
    hasSnapshot: true,
    mode: "hybrid",
  });
}

describe("intent router", () => {
  it.each([
    ...catalogDerivedRoutingCases,
    ...highRiskRoutingCases,
    ...actionSafetyRoutingCases,
    ...multiTurnRoutingCases,
  ])("satisfies routing fixture $id", (caseDef) => {
    const decision = route(caseDef);

    expect(decision.kind).toBe("route");
    expect(decision).toMatchObject({
      intentId: caseDef.expectedIntentId,
      toolName: caseDef.expectedToolName,
    });

    if (caseDef.expectedCardTypes?.length && decision.kind === "route") {
      expect(decision.cardTypes).toEqual(expect.arrayContaining(caseDef.expectedCardTypes));
    }

    if (decision.kind === "route") {
      for (const [slotName, slotValue] of Object.entries(caseDef.requiredSlots ?? {})) {
        expect(decision.args[slotName]).toBe(slotValue);
      }

      for (const intentId of caseDef.forbiddenIntentIds ?? []) {
        expect(decision.intentId).not.toBe(intentId);
      }

      for (const toolName of caseDef.forbiddenToolNames ?? []) {
        expect(decision.toolName).not.toBe(toolName);
      }
    }
  });

  it.each(openSetRoutingCases)("satisfies open-set fixture $id", (caseDef) => {
    expect(route(caseDef.message)).toMatchObject({
      kind: "abstain",
    });
  });

  it.each([
    ["show my bank balance", "balances.actual_accounts", "get_true_balances"],
    ["what is my account balance", "balances.actual_accounts", "get_true_balances"],
    ["what is my bank account balance", "balances.actual_accounts", "get_true_balances"],
    ["what is my current account balance", "balances.actual_accounts", "get_true_balances"],
    ["you can't show my bank account balance?", "balances.actual_accounts", "get_true_balances"],
    ["how much do I have in checking", "balances.actual_accounts", "get_true_balances"],
    ["what did I buy lately", "transactions.recent", "get_recent_transactions"],
    ["what have I been buying?", "transactions.recent", "get_recent_transactions"],
    ["what charges hit this week", "transactions.recent", "get_recent_transactions"],
    ["where is my money going by category", "spending.breakdown", "get_spending_breakdown"],
    ["what repeats every month", "recurring.activity", "get_recurring_activity"],
    ["where will I be in a few days", "spendable.forecast", "forecast_spendable_cash"],
    ["how did you calculate this", "math.breakdown", "get_pip_cash_math"],
    ["what can I cut back on", "spending.cutback_opportunity", "get_spending_opportunity"],
    ["find a spending opportunity", "spending.cutback_opportunity", "get_spending_opportunity"],
    ["how am I doing", "guidance.financial_read", "get_financial_guidance_context"],
    ["should I slow down this week", "guidance.financial_read", "get_financial_guidance_context"],
    ["is my data stale", "trust.receipt", "get_trust_receipt"],
    ["what data might be missing", "data.quality", "get_data_quality"],
    ["can Pip move my money", "policy.trust", "get_trust_policy"],
    ["does AI calculate my number", "policy.trust", "get_trust_policy"],
  ])("routes natural card request %s", (message, intentId, toolName) => {
    expect(route(message)).toMatchObject({
      kind: "route",
      intentId,
      toolName,
    });
  });

  it.each([
    ["i want to save money", "spending.cutback_opportunity", "get_spending_opportunity"],
    ["help me save money", "spending.cutback_opportunity", "get_spending_opportunity"],
    ["how can I save money", "spending.cutback_opportunity", "get_spending_opportunity"],
    ["how can I save money on car expenses?", "spending.cutback_opportunity", "get_spending_opportunity"],
    ["How did you get the spendable cash today number?", "math.breakdown", "get_pip_cash_math"],
    ["how did you come up with today's number?", "math.breakdown", "get_pip_cash_math"],
    ["what went into this number?", "math.breakdown", "get_pip_cash_math"],
    ["whats the total of these monthly bills?", "recurring.activity", "get_recurring_activity"],
    ["what do these monthly bills add up to?", "recurring.activity", "get_recurring_activity"],
    ["the total of my monthly bills? how much am i spending a month?", "recurring.activity", "get_recurring_activity"],
  ])("routes production failure phrase %s", (message, intentId, toolName) => {
    expect(route(message)).toMatchObject({
      kind: "route",
      intentId,
      toolName,
    });
  });

  it.each([
    "i want to save money for a big purchase",
    "help me save for a vacation",
    "move $200 to savings",
    "transfer money to savings",
  ])("does not misroute savings or money movement phrase %s", (message) => {
    const decision = route(message);

    if (decision.kind === "route") {
      expect(decision.toolName).not.toBe("get_spending_opportunity");
    }
  });

  it.each([
    "what do these charges add up to?",
    "how much did my charges total?",
  ])("does not misroute generic charge total phrase %s to recurring activity", (message) => {
    const decision = route(message);

    if (decision.kind === "route") {
      expect(decision.toolName).not.toBe("get_recurring_activity");
    }
  });

  it("separates actual balances from connected accounts", () => {
    expect(route("show my bank balance")).toMatchObject({
      kind: "route",
      intentId: "balances.actual_accounts",
      toolName: "get_true_balances",
    });
    expect(route("what is my account balance")).toMatchObject({
      kind: "route",
      intentId: "balances.actual_accounts",
      toolName: "get_true_balances",
    });
    expect(route("show connected banks")).toMatchObject({
      kind: "route",
      intentId: "account.connected_accounts",
      toolName: "get_connected_accounts",
    });
  });

  it("routes action requests through the action gate before card routing", () => {
    expect(route("delete my data")).toMatchObject({
      kind: "route",
      intentId: "data.delete_request",
      toolName: "request_delete_data_confirmation",
      source: "action_gate",
    });
    expect(route("DELETE DATA")).toMatchObject({
      kind: "route",
      intentId: "data.delete_confirmed",
      toolName: "delete_user_data",
      source: "action_gate",
    });
    expect(route("repair my bank connection")).toMatchObject({
      kind: "route",
      intentId: "provider.repair",
      toolName: "repair_account_connection",
      source: "action_gate",
    });
  });

  it("abstains for unsupported high-risk domains instead of forcing a card", () => {
    expect(route("Should I buy Nvidia stock?")).toMatchObject({
      kind: "abstain",
      reason: "open_set",
    });
  });

  it("extracts amount and forecast slots into tool args", () => {
    expect(route("would a $120 grocery trip hurt")).toMatchObject({
      kind: "route",
      toolName: "simulate_purchase",
      args: {
        amount_cents: 12000,
      },
    });
    expect(route("show 7 day trend")).toMatchObject({
      kind: "route",
      toolName: "forecast_spendable_cash",
      args: {
        horizon_days: 7,
      },
    });
  });

  it("keeps explicit spend amounts on purchase simulation before guidance", () => {
    expect(route("I have $900 in checking, why can't I spend $300?")).toMatchObject({
      kind: "route",
      intentId: "purchase.simulation",
      toolName: "simulate_purchase",
      args: {
        amount_cents: 30000,
      },
    });
  });
});
