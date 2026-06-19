import type { AgentRoutingCase } from "./catalog-derived-cases";

export const multiTurnRoutingCases: AgentRoutingCase[] = [
  {
    id: "multi-turn-purchase-amount-followup",
    message: "what about $20 instead",
    history: [
      { role: "user", content: "Can I spend $50?" },
      { role: "assistant", content: "I can test that amount against your Spendable Cash." },
    ],
    expectedDecision: "route",
    expectedIntentId: "purchase.simulation",
    expectedToolName: "simulate_purchase",
    expectedCardTypes: ["purchase_simulation"],
    requiredSlots: {
      amount_cents: 2000,
    },
    risk: "multi_turn",
    source: "manual",
  },
  {
    id: "multi-turn-forecast-yes",
    message: "yes show me",
    history: [
      { role: "assistant", content: "I can show a forecast for the next few days." },
    ],
    expectedDecision: "route",
    expectedIntentId: "spendable.forecast",
    expectedToolName: "forecast_spendable_cash",
    expectedCardTypes: ["spendable_cash_forecast"],
    risk: "multi_turn",
    source: "manual",
  },
];
