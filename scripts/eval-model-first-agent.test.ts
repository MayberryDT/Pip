// @ts-nocheck
import { describe, expect, it } from "vitest";
import {
  PASS_THRESHOLD,
  scoreModelFirstAgentCase,
  scoreModelFirstAgentCases,
} from "./eval-model-first-agent.mjs";

describe("model-first agent gate fixture", () => {
  it("exports at least 120 unique cases across the required product surfaces", async () => {
    const { modelFirstAgentGateCases } = await import("../tests/fixtures/model-first-agent-gate.mjs");
    const requiredCategories = [
      "savings",
      "spendable_cash",
      "transactions",
      "bills_recurring",
      "accounts",
      "settings_delete_confirmation",
      "refresh",
      "opening_bubble",
      "prompt_chips",
      "general_education",
      "blocked_advice",
    ];

    expect(modelFirstAgentGateCases.length).toBeGreaterThanOrEqual(120);
    expect(new Set(modelFirstAgentGateCases.map((testCase) => testCase.id)).size).toBe(modelFirstAgentGateCases.length);
    expect(modelFirstAgentGateCases.map((testCase) => testCase.order)).toEqual(
      Array.from({ length: modelFirstAgentGateCases.length }, (_, index) => index + 1),
    );

    for (const category of requiredCategories) {
      expect(modelFirstAgentGateCases.some((testCase) => testCase.category === category)).toBe(true);
    }
  });
});

describe("model-first agent scorer", () => {
  it("passes a model-composed financial response with grounded product evidence", () => {
    const result = scoreModelFirstAgentCase({
      id: "SCT-PASS",
      category: "spendable_cash",
      expected: {
        visible: true,
        requiresModel: true,
        requiresFinancialGrounding: true,
      },
      mockResponse: {
        usedModel: true,
        message: "You have about $42 left for today after the Target purchase.",
        usedTools: ["get_spendable_cash_context"],
        cards: [{ type: "spendable_cash_summary" }],
      },
    });

    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("fails a normal visible response that bypasses the model", () => {
    const result = scoreModelFirstAgentCase({
      id: "NO-MODEL",
      category: "general_education",
      expected: {
        visible: true,
        requiresModel: true,
      },
      mockResponse: {
        usedModel: false,
        message: "Budgets work best when you check them daily.",
      },
    });

    expect(result.score).toBeLessThan(PASS_THRESHOLD);
    expect(result.violations).toContain("visible_response_missing_model");
  });

  it("fails a finance intent without a tool, card, pending action, client action, or clarify path", () => {
    const result = scoreModelFirstAgentCase({
      id: "NO-GROUNDING",
      category: "transactions",
      expected: {
        visible: true,
        requiresModel: true,
        requiresFinancialGrounding: true,
      },
      mockResponse: {
        usedModel: true,
        message: "The restaurant charge is the main reason today got tighter.",
      },
    });

    expect(result.score).toBeLessThan(PASS_THRESHOLD);
    expect(result.violations).toContain("finance_intent_missing_product_grounding");
  });

  it("requires savings setup to preview before create", () => {
    const result = scoreModelFirstAgentCase({
      id: "SAVE-NO-PREVIEW",
      category: "savings",
      expected: {
        visible: true,
        requiresModel: true,
        requiresFinancialGrounding: true,
        requiresSavingsPreviewBeforeCreate: true,
      },
      mockResponse: {
        usedModel: true,
        message: "I created the vacation goal.",
        usedTools: ["create_savings_goal"],
        cards: [{ type: "savings_goal_confirmation" }],
      },
    });

    expect(result.score).toBeLessThan(PASS_THRESHOLD);
    expect(result.violations).toContain("savings_setup_missing_preview");
  });

  it("requires savings confirmation to carry pending context", () => {
    const result = scoreModelFirstAgentCase({
      id: "SAVE-NO-PENDING",
      category: "savings",
      expected: {
        visible: true,
        requiresModel: true,
        requiresFinancialGrounding: true,
        requiresPendingContext: true,
      },
      mockResponse: {
        usedModel: true,
        message: "Confirmed. I saved that goal.",
        usedTools: ["create_savings_goal"],
        cards: [{ type: "savings_goal_confirmation" }],
      },
    });

    expect(result.score).toBeLessThan(PASS_THRESHOLD);
    expect(result.violations).toContain("savings_confirmation_missing_pending_context");
  });

  it("allowlists prompt chips and hard outage responses without model usage", () => {
    const promptChipResult = scoreModelFirstAgentCase({
      id: "CHIPS-ALLOW",
      category: "prompt_chips",
      expected: {
        visible: true,
        requiresModel: false,
        allowedModelBypass: "prompt_chips",
      },
      mockResponse: {
        usedModel: false,
        kind: "prompt_chips",
        promptChips: [{ id: "why", label: "Why?", prompt: "Why did it change?" }],
      },
    });
    const outageResult = scoreModelFirstAgentCase({
      id: "OUTAGE-ALLOW",
      category: "hard_outage",
      expected: {
        visible: true,
        requiresModel: false,
        allowedModelBypass: "hard_outage",
      },
      mockResponse: {
        usedModel: false,
        kind: "hard_outage",
        hardOutage: true,
        message: "I cannot reach the model right now, so I am keeping this to account actions.",
      },
    });

    expect(promptChipResult.score).toBe(100);
    expect(outageResult.score).toBe(100);
  });

  it("fails the aggregate gate when any case scores under 95", () => {
    const result = scoreModelFirstAgentCases({
      cases: [
        {
          id: "PASS",
          category: "general_education",
          expected: { visible: true, requiresModel: true },
          mockResponse: { usedModel: true, message: "A short model-composed answer." },
        },
        {
          id: "FAIL",
          category: "spendable_cash",
          expected: {
            visible: true,
            requiresModel: true,
            requiresFinancialGrounding: true,
          },
          mockResponse: { usedModel: true, message: "Today looks okay." },
        },
      ],
    });

    expect(result.score).toBeLessThan(100);
    expect(result.failedCases).toHaveLength(1);
    expect(result.passed).toBe(false);
  });
});
