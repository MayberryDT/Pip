import { describe, expect, it } from "vitest";
import type { AgentResponse } from "@/lib/agent/card-types";
import {
  getModelFirstViolation,
  isKnownPersonalFinanceIntent,
} from "@/lib/agent/model-first-policy";

describe("model-first policy", () => {
  it("rejects deterministic normal chat responses", () => {
    const response = createResponse({
      message: "Ask me about your number, what changed, or a purchase.",
      usedModel: false,
    });

    expect(getModelFirstViolation({
      requestKind: "chat",
      userMessage: "hi",
      response,
    })).toMatchObject({
      code: "deterministic_visible_response",
    });
  });

  it("allows deterministic hard outage exceptions only when explicitly marked", () => {
    const response = createResponse({
      message: "I can’t reach the answer service right now. Try again in a moment.",
      usedModel: false,
    });

    expect(getModelFirstViolation({
      requestKind: "chat",
      userMessage: "why did my number change?",
      response,
      deterministicException: "hard_outage",
    })).toBeNull();
  });

  it("rejects finance answers that do not use tools, cards, or a structured clarification", () => {
    const response = createResponse({
      message: "That sounds fine to me.",
      usedModel: true,
    });

    expect(getModelFirstViolation({
      requestKind: "chat",
      userMessage: "Can I spend $80 tonight?",
      response,
    })).toMatchObject({
      code: "unsupported_finance_answer",
    });
  });

  it("rejects savings clarifications that do not preserve pending goal state", () => {
    const response = createResponse({
      message: "What do you want to save for?",
      usedModel: true,
      responseMode: "clarify",
    });

    expect(getModelFirstViolation({
      requestKind: "chat",
      userMessage: "I want to set a savings goal",
      response,
    })).toMatchObject({
      code: "unsupported_finance_answer",
    });
  });

  it("allows model-written savings previews when backed by a tool, card, and pending action", () => {
    const response = createResponse({
      message: "Emergency Fund would need about $833/month. Want me to create it?",
      usedModel: true,
      usedTools: ["preview_savings_goal"],
      responseMode: "show_card",
      cards: [
        {
          type: "savings_goal_preview",
          title: "Savings goal preview",
          name: "Emergency Fund",
          targetAmountCents: 500000,
          currentAmountCents: 0,
          remainingCents: 500000,
          monthlyContributionCents: 83334,
          includeInSpendableCash: true,
          currentSpendableCashTodayCents: 10400,
          spendableCashTodayAfterGoalCents: 7622,
          currentBaselineDailyAllowanceCents: 3032,
          baselineDailyAllowanceAfterGoalCents: 254,
          dailyRoomDeltaCents: -2778,
          warningLevel: "tight",
          summary: "This goal would reduce Spendable Cash Today.",
        },
      ],
      pendingAction: {
        type: "ordinary_write",
        action: "create_savings_goal",
        createdAt: "2026-06-20T12:00:00.000Z",
        expiresAt: "2026-06-20T12:05:00.000Z",
        confirmationKind: "contextual",
        summary: "Create Emergency Fund savings goal",
      },
    });

    expect(getModelFirstViolation({
      requestKind: "chat",
      userMessage: "Emergency fund $5000 in 6 months",
      response,
    })).toBeNull();
  });

  it("treats savings, bills, transactions, accounts, and refresh as finance intents", () => {
    expect(isKnownPersonalFinanceIntent("Help me save $2,000 for Japan")).toBe(true);
    expect(isKnownPersonalFinanceIntent("Is Netflix a monthly bill?")).toBe(true);
    expect(isKnownPersonalFinanceIntent("Show my recent transactions")).toBe(true);
    expect(isKnownPersonalFinanceIntent("What accounts are connected?")).toBe(true);
    expect(isKnownPersonalFinanceIntent("Refresh my bank data")).toBe(true);
    expect(isKnownPersonalFinanceIntent("Teach me a money basic")).toBe(false);
  });
});

function createResponse(input: {
  message: string;
  usedModel: boolean;
  usedTools?: string[];
  cards?: AgentResponse["cards"];
  responseMode?: AgentResponse["responseMode"];
  pendingAction?: AgentResponse["pendingAction"];
}): AgentResponse {
  const usedTools = input.usedTools ?? [];

  return {
    message: input.message,
    cards: input.cards ?? [],
    promptChips: [],
    usedTools,
    responseMode: input.responseMode ?? "chat_only",
    ...(input.pendingAction ? { pendingAction: input.pendingAction } : {}),
    audit: {
      toolNames: usedTools,
      usedModel: input.usedModel,
    },
  };
}
