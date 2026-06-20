import { afterEach, describe, expect, it, vi } from "vitest";
import { agentFinalOutputSchema, agentMessageMaxChars, agentResponseSchema, cardSchema } from "@/lib/agent/response-schema";
import {
  PIP_AI_MODEL,
  NETLIFY_AI_GATEWAY_MODEL,
  AgentUnavailableError,
  getPipAiTransport,
  getPipAiModel,
  getOpenAIClientConfig,
  getOpenAIApiKeyForSdk,
  runAIAgent,
  type PipAgentActions,
  toAgentErrorPayload,
  __agentTestHooks,
} from "@/lib/agent/ai-agent";
import type { AgentCard } from "@/lib/agent/card-types";
import { createMockModelClient } from "../../../tests/helpers/mock-agent-runtime";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { buildFinancialGuidanceContext } from "@/lib/pip-cash/guidance-context";
import { fakeSnapshot, getFakeSnapshot } from "@/lib/fake-data";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runAIAgent", () => {
  it("answers greetings conversationally without forcing a tool or card", async () => {
    for (const message of ["hi", "yo"]) {
      const response = await runAIAgent(
        { message },
        createMockModelClient(),
      );

      expect(response.audit.usedModel).toBe(false);
      expect(response.usedTools).toEqual([]);
      expect(response.audit.toolNames).toEqual([]);
      expect(response.responseMode).toBe("chat_only");
      expect(response.cards).toHaveLength(0);
      expect(response.message.toLowerCase()).not.toContain("dashboard");
      expect(response.message.toLowerCase()).toMatch(/spendable cash today|purchase|number|changed/);
    }
  });

  it("forces model-labeled guidance greetings back to chat-only when no guidance surface exists", () => {
    expect(
      __agentTestHooks.selectFinalResponseMode({
        requestKind: "chat",
        parsedResponseMode: "guidance",
        message: "hi",
        cards: [],
        usedTools: [],
        forcedToolRequiresCard: false,
      }),
    ).toBe("chat_only");
  });

  it("treats simple greetings as no-tool chat-only prompts", () => {
    expect(__agentTestHooks.isNoToolChatOnlyPrompt("hi")).toBe(true);
    expect(__agentTestHooks.getForcedAgentTool({ message: "yo" })).toBeUndefined();
  });


  it("shows the Spendable Cash explanation card the first time the user asks why", async () => {
    const response = await runAIAgent(
      { message: "Why this number?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_pip_cash_drivers"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]?.type).toBe("pip_cash_explanation");
  });

  it("does not repeat the same explanation card for an immediate vague follow-up", async () => {
    const response = await runAIAgent(
      {
        message: "But why?",
        conversationState: {
          shownCards: [
            {
              type: "pip_cash_explanation",
              title: "Why this number changed",
            },
          ],
          lastToolNames: ["get_pip_cash_drivers"],
        },
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual([]);
    expect(response.responseMode).toBe("chat_only");
    expect(response.cards).toHaveLength(0);
  });

  it("calls the purchase simulation tool when the user asks about a specific spend", async () => {
    const result = calculatePipCash(fakeSnapshot);
    const response = await runAIAgent(
      { message: "Can I spend $40?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["simulate_purchase", "get_financial_guidance_context"]);
    expect(response.cards[0]).toMatchObject({
      type: "purchase_simulation",
      amountCents: 4000,
      beforeCents: result.spendableCashToday?.spendableCashTodayCents,
      todayRemainingCents: (result.spendableCashToday?.spendableCashTodayCents ?? 0) - 4000,
      todayOverageCents: Math.max(0, 4000 - (result.spendableCashToday?.spendableCashTodayCents ?? 0)),
      afterTodayCents: expect.any(Number),
      dailyEffectCents: expect.any(Number),
    });
    expect(response.audit.guidance).toMatchObject({
      validationOutcome: "context_built",
      guidanceSource: "none",
      metricVersion: "v2",
    });
  });

  it("treats thinking-of-spending phrasing as a purchase simulation", async () => {
    const response = await runAIAgent(
      { message: "I am thinking of spending $25 at Starbucks. How would that affect me?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["simulate_purchase"]);
    expect(response.cards[0]).toMatchObject({
      type: "purchase_simulation",
      amountCents: 2500,
    });
    expect(response.message).toContain("Spendable Cash Today");
  });

  it("answers financial read prompts with guidance context and a validated guidance card", async () => {
    const response = await runAIAgent(
      { message: "How am I doing?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_financial_guidance_context"]);
    expect(response.responseMode).toBe("guidance");
    expect(response.cards[0]).toMatchObject({
      type: "guidance_card",
      title: "My read",
    });
    expect(response.message.toLowerCase()).toContain("my read");
    expect(response.audit.guidance).toMatchObject({
      validationOutcome: "shown",
      guidanceSource: "model_draft",
      metricVersion: "v2",
      state: expect.any(String),
      evidenceIds: expect.arrayContaining(["spendable-today"]),
    });
  });

  it("returns a deterministic guidance card when the model omits a guidance card draft", () => {
    const selection = __agentTestHooks.selectGuidanceCard(
      {
        message: "My read: you look steady with the main holds already counted.",
        responseMode: "guidance",
        promptChips: [],
      },
      createGuidanceSelectorContext(),
    );

    expect(selection.card).toMatchObject({
      type: "guidance_card",
      title: "My read",
    });
    expect(selection.rejectionReason).toBeNull();
    expect(selection.guidanceSource).toBe("deterministic_fallback");
  });

  it("uses deterministic guidance cards for fallback final output", () => {
    const selection = __agentTestHooks.selectGuidanceCard(
      {
        message: "My read: I used the reliable fallback read.",
        responseMode: "guidance",
        promptChips: [],
      },
      createGuidanceSelectorContext({ fallbackFinalOutput: true }),
    );

    expect(selection.card).toMatchObject({
      type: "guidance_card",
      title: "My read",
    });
    expect(selection.rejectionReason).toBeNull();
    expect(selection.guidanceSource).toBe("deterministic_fallback");
  });

  it("uses deterministic visible guidance text when the guidance card falls back", () => {
    const visibleOutput = __agentTestHooks.selectVisibleModelOutput(
      {
        message:
          "I found $104 today. Your normal room is $69.27, driven by normal spending and recent lighter spending. Watch data quality; I'd stay cautious about big purchases.",
        responseMode: "guidance",
        promptChips: [],
      },
      createGuidanceSelectorContext(),
      { guidanceSource: "deterministic_fallback" },
    );

    expect(visibleOutput.message).toMatch(/^My read:/);
    expect(visibleOutput.message).not.toContain("big purchases");
    expect(visibleOutput.message).not.toContain("driven by");
  });

  it("combines purchase simulation with guidance context for bank-balance assumption prompts", async () => {
    const response = await runAIAgent(
      { message: "I have $900 in checking, why can't I spend $300?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["simulate_purchase", "get_financial_guidance_context"]);
    expect(response.cards[0]).toMatchObject({
      type: "purchase_simulation",
      amountCents: 30000,
    });
    expect(response.message.toLowerCase()).toContain("my read");
  });

  it("uses history to treat a short amount follow-up as another purchase simulation", async () => {
    const response = await runAIAgent(
      {
        message: "What about $20 instead?",
        history: [
          {
            role: "user",
            content: "Can I spend $50?",
          },
          {
            role: "assistant",
            content: "That would move Spendable Cash from $43 to -$7 today.",
          },
        ],
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["simulate_purchase"]);
    expect(response.cards[0]).toMatchObject({
      type: "purchase_simulation",
      amountCents: 2000,
      todayRemainingCents: expect.any(Number),
      todayOverageCents: expect.any(Number),
      afterTodayCents: expect.any(Number),
      dailyEffectCents: expect.any(Number),
    });
  });

  it("handles broad negative Spendable Cash spending questions conversationally", async () => {
    const response = await runAIAgent(
      {
        message: "so since its negative i cant spend any money?",
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_pip_cash_snapshot"]);
    expect(response.responseMode).toBe("chat_only");
    expect(response.cards).toHaveLength(0);
    expect(response.message.toLowerCase()).toContain("not a hard limit");
    expect(response.message.toLowerCase()).not.toContain("what amount");
    expect(response.message.toLowerCase()).not.toContain("you can spend");
    expect(response.message.length).toBeLessThanOrEqual(agentMessageMaxChars);
    expect(response.message.trim().split(/\s+/).length).toBeLessThanOrEqual(35);
  });

  it("calls the recent transactions tool when the user asks for activity", async () => {
    const response = await runAIAgent(
      { message: "Show recent transactions" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_recent_transactions"]);
    expect(response.cards[0]).toMatchObject({
      type: "recent_transactions",
    });
  });

  it("calls the forecast tool when the user asks for a 7-day trend", async () => {
    const response = await runAIAgent(
      { message: "Show 7 day trend" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["forecast_spendable_cash"]);
    expect(response.cards[0]).toMatchObject({
      type: "spendable_cash_forecast",
      horizonDays: 7,
      disclaimer: "Forecast only; not guaranteed.",
    });
  });

  it("calls the forecast tool when the user asks about tomorrow or the next day", async () => {
    const response = await runAIAgent(
      { message: "What kind of Spendable Cash should I expect tomorrow or the next day?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["forecast_spendable_cash"]);
    expect(response.cards[0]).toMatchObject({
      type: "spendable_cash_forecast",
    });
  });

  it("treats an affirmative follow-up after trend talk as a forecast request", async () => {
    const response = await runAIAgent(
      {
        message: "Yes do that",
        history: [
          {
            role: "user",
            content: "See spend trend",
          },
          {
            role: "assistant",
            content: "We can discuss the trend, or I can show daily amounts for the next 14 days.",
          },
        ],
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["forecast_spendable_cash"]);
    expect(response.cards[0]).toMatchObject({
      type: "spendable_cash_forecast",
      horizonDays: 14,
    });
  });

  it("treats affirmative follow-ups after offered branches as the matching card request", async () => {
    const breakdownResponse = await runAIAgent(
      {
        message: "show me",
        history: [
          {
            role: "assistant",
            content: "I can show a spending breakdown or recent charges.",
          },
        ],
      },
      createMockModelClient(),
    );
    const recurringResponse = await runAIAgent(
      {
        message: "yes do that",
        history: [
          {
            role: "assistant",
            content: "I can show recurring items next.",
          },
        ],
      },
      createMockModelClient(),
    );
    const recentResponse = await runAIAgent(
      {
        message: "sure",
        history: [
          {
            role: "assistant",
            content: "I can show recent charges.",
          },
        ],
      },
      createMockModelClient(),
    );
    const mathResponse = await runAIAgent(
      {
        message: "ok",
        history: [
          {
            role: "assistant",
            content: "I can show math behind today's number.",
          },
        ],
      },
      createMockModelClient(),
    );

    expect(breakdownResponse.usedTools).toEqual(["get_spending_breakdown"]);
    expect(breakdownResponse.cards[0]?.type).toBe("spending_breakdown");
    expect(recurringResponse.usedTools).toEqual(["get_recurring_activity"]);
    expect(recurringResponse.cards[0]?.type).toBe("recurring_activity");
    expect(recentResponse.usedTools).toEqual(["get_recent_transactions"]);
    expect(recentResponse.cards[0]?.type).toBe("recent_transactions");
    expect(mathResponse.usedTools).toEqual(["get_pip_cash_math"]);
    expect(mathResponse.cards[0]?.type).toBe("math_breakdown");
  });

  it("routes affirmative follow-ups through the real forced-tool classifier", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "show me",
        history: [
          {
            role: "assistant",
            content: "I can show a spending breakdown or recent charges.",
          },
        ],
      }),
    ).toMatchObject({
      toolName: "get_spending_breakdown",
      requireCard: true,
    });
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "yes do that",
        history: [
          {
            role: "assistant",
            content: "I can show recurring items next.",
          },
        ],
      }),
    ).toMatchObject({
      toolName: "get_recurring_activity",
      requireCard: true,
    });
  });

  it("calls the recurring activity tool when the user asks about a subscription coming up", async () => {
    const response = await runAIAgent(
      { message: "Do I have YouTube Premium coming up?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_recurring_activity"]);
    expect(response.cards[0]).toMatchObject({
      type: "recurring_activity",
    });
  });

  it("calls the spending breakdown tool for complete breakdown requests", async () => {
    const response = await runAIAgent(
      { message: "Give me a complete breakdown" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_spending_breakdown"]);
    expect(response.cards[0]).toMatchObject({
      type: "spending_breakdown",
    });
  });

  it("calls the spending opportunity tool for cutback prompts", async () => {
    const response = await runAIAgent(
      {
        message: "What can I cut back on?",
        snapshot: getFakeSnapshot("cutback-dining"),
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_spending_opportunity"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "insight_card",
      title: "Cutback opportunity",
    });
    expect(response.message).toContain("cutback opportunity");
  });

  it("calls the spending opportunity tool for save-more prompts", async () => {
    const response = await runAIAgent(
      {
        message: "What can I do to save more money?",
        snapshot: getFakeSnapshot("cutback-dining"),
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_spending_opportunity"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "insight_card",
      title: "Cutback opportunity",
    });
    expect(response.message.toLowerCase()).toContain("cutback opportunity");
  });

  it("calls the spending opportunity tool for spending-opportunity prompts", async () => {
    const response = await runAIAgent(
      {
        message: "Find a spending opportunity",
        snapshot: getFakeSnapshot("cutback-dining"),
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_spending_opportunity"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "insight_card",
      title: "Cutback opportunity",
    });
  });

  it("uses an insight card for payday impact questions", async () => {
    const response = await runAIAgent(
      { message: "How does payday affect my money?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["compose_insight_card"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "insight_card",
      title: "Payday impact",
    });

    if (response.cards[0]?.type !== "insight_card") {
      throw new Error("Expected insight card.");
    }

    expect(response.cards[0].rows.map((row) => row.id)).toEqual(
      expect.arrayContaining(["income-average", "bills", "savings", "today"]),
    );
  });

  it("uses an insight card for factor questions without replacing why-this-number", async () => {
    const response = await runAIAgent(
      { message: "What factors affect today's Spendable Cash?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["compose_insight_card"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "insight_card",
      title: "What affects today",
    });

    const whyResponse = await runAIAgent(
      { message: "Why this number?" },
      createMockModelClient(),
    );

    expect(whyResponse.usedTools).toEqual(["get_pip_cash_drivers"]);
    expect(whyResponse.cards[0]).toMatchObject({
      type: "pip_cash_explanation",
    });
  });

  it("routes insight prompts through the real forced-tool classifier", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "How does payday affect my money?",
      }),
    ).toMatchObject({
      toolName: "compose_insight_card",
      args: {
        topic: "payday_impact",
      },
      requireCard: true,
    });
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "What factors affect today's Spendable Cash?",
      }),
    ).toMatchObject({
      toolName: "compose_insight_card",
      args: {
        topic: "spendable_factors",
      },
      requireCard: true,
    });
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Why this number?",
      }),
    ).toMatchObject({
      toolName: "get_pip_cash_drivers",
      requireCard: true,
    });
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Show the biggest drivers behind today's number",
      }),
    ).toMatchObject({
      toolName: "get_pip_cash_drivers",
      requireCard: true,
    });
  });

  it("routes guidance prompts through the real forced-tool classifier", () => {
    for (const message of [
      "How am I doing?",
      "What do you think?",
      "What should I do?",
      "Am I spending too much?",
      "Should I lower my cushion?",
      "Should I slow down this week?",
    ]) {
      expect(
        __agentTestHooks.getForcedAgentTool({
          message,
        }),
      ).toMatchObject({
        toolName: "get_financial_guidance_context",
        requireCard: false,
      });
    }

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Show my transactions",
      }),
    ).toMatchObject({
      toolName: "get_recent_transactions",
    });
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Show card payments in the last window",
      }),
    ).toMatchObject({
      toolName: "get_spending_breakdown",
      requireCard: true,
    });
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Show the math",
      }),
    ).toMatchObject({
      toolName: "get_pip_cash_math",
    });
  });

  it("routes cutback prompts through the real forced-tool classifier", () => {
    for (const message of [
      "What can I cut back on?",
      "What can I do to save more money?",
      "Where am I overspending?",
      "Where can I save this week?",
      "How do I reduce expenses?",
      "How can I save money this week?",
      "Find waste in my spending",
      "Find a spending opportunity",
      "What should I stop buying?",
      "What costs should I cut?",
    ]) {
      expect(
        __agentTestHooks.getForcedAgentTool({
          message,
        }),
      ).toMatchObject({
        toolName: "get_spending_opportunity",
        requireCard: true,
      });
    }

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Am I spending too much?",
      }),
    ).toMatchObject({
      toolName: "get_financial_guidance_context",
    });

    for (const message of [
      "Set my savings cushion",
      "Use $200 savings cushion",
      "Save my account settings",
    ]) {
      expect(
        __agentTestHooks.getForcedAgentTool({
          message,
        })?.toolName,
      ).not.toBe("get_spending_opportunity");
    }
  });

  it("routes missing-data prompts through the real forced-tool classifier", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "What data might be missing?",
      }),
    ).toMatchObject({
      toolName: "get_data_quality",
      requireCard: true,
    });
  });

  it("answers stale-data prompts with the trust receipt card", async () => {
    const response = await runAIAgent(
      {
        message: "Is my data stale?",
        snapshot: getFakeSnapshot("default"),
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_trust_receipt"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "trust_receipt",
      title: "Trust receipt",
    });
  });

  it("answers missing-data prompts with a supported data-quality card", async () => {
    const response = await runAIAgent(
      {
        message: "What data might be missing?",
        snapshot: getFakeSnapshot("default"),
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_data_quality"]);
    expect(response.responseMode).toBe("show_card");
    expect(["missing_card_nudge", "connect_account"]).toContain(response.cards[0]?.type);
  });

  it("routes savings goal prompts through the real forced-tool classifier", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "I want to save for a trip that costs $5,000",
      }),
    ).toMatchObject({
      toolName: "create_savings_goal",
      args: {
        name: "Trip",
        target_amount_cents: 500000,
      },
      requireCard: true,
    });

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Show my savings goals",
      }),
    ).toMatchObject({
      toolName: "list_savings_goals",
      requireCard: true,
    });

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Keep my trip goal out of Spendable Cash at $300/month",
      }),
    ).toMatchObject({
      toolName: "set_savings_goal_protection",
      args: {
        name: "Trip",
        include_in_spendable_cash: true,
        monthly_contribution_cents: 30000,
      },
      requireCard: true,
    });

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "How can I save money this week?",
      }),
    ).toMatchObject({
      toolName: "get_spending_opportunity",
      requireCard: true,
    });
  });

  it("starts a savings goal draft for a big purchase without turning it into cutback advice", async () => {
    const response = await runAIAgent({
      message: "I want to save money for a big purchase",
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
      actions: createSavingsGoalActions(),
    });

    expect(response.usedTools).toEqual([]);
    expect(response.responseMode).toBe("clarify");
    expect(response.pendingAction).toMatchObject({
      type: "create_savings_goal",
      name: "Big purchase",
      missing: ["target_amount"],
    });
    expect(response.message).toContain("How much");
  });

  it("keeps savings goal setup deterministic when no savings action is available", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    const response = await runAIAgent({
      message: "I want to save for a trip that costs $5,000",
      onboardingState: {
        status: "guest",
        hasFinancialData: false,
      },
    });

    expect(response.usedTools).toEqual(["create_savings_goal"]);
    expect(response.audit.usedModel).toBe(false);
    expect(response.responseMode).toBe("chat_only");
    expect(response.cards).toEqual([]);
    expect(response.message.toLowerCase()).toContain("sign in");
  });

  it("keeps the Japan savings goal setup deterministic through creation and progress", async () => {
    const actions = createSavingsGoalActions();
    let pendingAction;

    const first = await runAIAgent(
      {
        message: "I need to save for a trip to Japan",
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        actions,
      },
    );

    expect(first.usedTools).toEqual([]);
    expect(first.responseMode).toBe("clarify");
    expect(first.pendingAction).toMatchObject({
      type: "create_savings_goal",
      name: expect.stringMatching(/japan/i),
      missing: ["target_amount"],
    });
    pendingAction = first.pendingAction;

    const second = await runAIAgent(
      {
        message: "Yes",
        conversationState: { pendingAction },
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        actions,
      },
    );

    expect(second.usedTools).toEqual([]);
    expect(second.responseMode).toBe("clarify");
    expect(second.pendingAction).toMatchObject({
      type: "create_savings_goal",
      name: expect.stringMatching(/japan/i),
      missing: ["target_amount"],
    });
    pendingAction = second.pendingAction;

    const third = await runAIAgent(
      {
        message: "Set the savings goal",
        conversationState: { pendingAction },
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        actions,
      },
    );

    expect(third.usedTools).toEqual([]);
    expect(third.responseMode).toBe("clarify");
    expect(third.pendingAction).toMatchObject({
      type: "create_savings_goal",
      name: expect.stringMatching(/japan/i),
      missing: ["target_amount"],
    });
    pendingAction = third.pendingAction;

    const fourth = await runAIAgent(
      {
        message: "$3000 by December 1st",
        conversationState: { pendingAction },
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        actions,
      },
    );

    expect(fourth.usedTools).toEqual(["create_savings_goal"]);
    expect(fourth.responseMode).toBe("show_card");
    expect(fourth.pendingAction).toBeUndefined();
    expect(fourth.cards).toEqual([
      expect.objectContaining({
        type: "savings_goal_plan",
        name: expect.stringMatching(/japan/i),
        targetAmountCents: 300000,
        targetDate: "2026-12-01",
      }),
    ]);
    expect(fourth.message).not.toMatch(/\b(can|could|would) set\b/i);

    const fifth = await runAIAgent(
      {
        message: "How much do I need to hit that goal?",
        conversationState: {
          shownCards: fourth.cards.map((card) => ({
            type: card.type,
            title: card.title,
          })),
          lastToolNames: fourth.usedTools,
        },
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        actions,
      },
    );

    expect(fifth.usedTools).toEqual(["list_savings_goals"]);
    expect(fifth.responseMode).toBe("show_card");
    expect(fifth.cards).toEqual([
      expect.objectContaining({
        type: "savings_goals_summary",
        goals: [
          expect.objectContaining({
            name: expect.stringMatching(/japan/i),
            targetAmountCents: 300000,
            remainingCents: 300000,
            targetDate: "2026-12-01",
          }),
        ],
      }),
    ]);
  });

  it("updates savings goal progress deterministically from saved-toward wording", async () => {
    const actions = createSavingsGoalActions();

    await runAIAgent({
      message: "I want to save for a trip that costs $5,000",
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
      actions,
    });

    const response = await runAIAgent({
      message: "I saved $300 toward my trip goal",
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
      actions,
    });

    expect(response.usedTools).toEqual(["update_savings_goal"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards).toEqual([
      expect.objectContaining({
        type: "savings_goal_plan",
        name: "Trip",
        currentAmountCents: 30000,
        remainingCents: 470000,
      }),
    ]);
  });

  it("updates savings goal protection deterministically from spendable-cash wording", async () => {
    const actions = createSavingsGoalActions();

    await runAIAgent({
      message: "I want to save for a trip that costs $5,000",
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
      actions,
    });

    const response = await runAIAgent({
      message: "Keep my trip goal out of Spendable Cash",
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
      actions,
    });

    expect(response.usedTools).toEqual(["set_savings_goal_protection"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards).toEqual([
      expect.objectContaining({
        type: "savings_goal_plan",
        name: "Trip",
        includeInSpendableCash: true,
      }),
    ]);
  });

  it("routes currentness prompts to the trust receipt", () => {
    for (const message of [
      "Is this number current?",
      "Is my Spendable Cash Today up to date?",
      "Can I trust this number?",
    ]) {
      expect(
        __agentTestHooks.getForcedAgentTool({
          message,
        }),
      ).toMatchObject({
        toolName: "get_trust_receipt",
        requireCard: true,
      });
    }

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "What data is missing from this number?",
      }),
    ).toMatchObject({
      toolName: "get_data_quality",
      requireCard: true,
    });
  });

  it("routes natural card requests through the catalog router", () => {
    const cases = [
      ["show my bank balance", "get_true_balances"],
      ["what is my account balance", "get_true_balances"],
      ["what is my bank account balance", "get_true_balances"],
      ["what is my current account balance", "get_true_balances"],
      ["you can't show my bank account balance?", "get_true_balances"],
      ["how much do I have in checking", "get_true_balances"],
      ["show my bank accounts", "get_connected_accounts"],
      ["what did I buy lately", "get_recent_transactions"],
      ["what charges hit this week", "get_recent_transactions"],
      ["where is my money going by category", "get_spending_breakdown"],
      ["what repeats every month", "get_recurring_activity"],
      ["where will I be in a few days", "forecast_spendable_cash"],
      ["how did you calculate this", "get_pip_cash_math"],
    ] as const;

    for (const [message, toolName] of cases) {
      expect(
        __agentTestHooks.getForcedAgentTool({
          message,
        }),
      ).toMatchObject({
        toolName,
        requireCard: true,
      });
    }
  });

  it("shows connected accounts deterministically without model configuration", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    const response = await runAIAgent({
      message: "Show my bank accounts",
      actions: {
        getConnectedAccounts: async () => ({
          ok: true,
          status: "connected_accounts",
          cards: [accountConnectionsCard()],
        }),
      } satisfies Partial<PipAgentActions>,
    });

    expect(response.audit.usedModel).toBe(false);
    expect(response.usedTools).toEqual(["get_connected_accounts"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "account_connections",
      title: "Connected accounts",
    });
  });

  it("routes delete-data requests to confirmation before policy fallback", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Delete my data",
      }),
    ).toMatchObject({
      toolName: "request_delete_data_confirmation",
      requireCard: false,
    });
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "DELETE DATA",
      }),
    ).toMatchObject({
      toolName: "delete_user_data",
      requireCard: false,
    });
  });

  it("routes update-status prompts to sync status", () => {
    for (const message of [
      "Did you refresh?",
      "Did you refresh my data?",
      "Why is this not updating?",
      "When did this last sync?",
    ]) {
      expect(
        __agentTestHooks.getForcedAgentTool({
          message,
        }),
      ).toMatchObject({
        toolName: "get_sync_status",
        requireCard: false,
      });
    }

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Refresh my connected data",
      }),
    ).not.toMatchObject({
      toolName: "get_sync_status",
    });
  });

  it("answers trust policy prompts without model-invented card data", async () => {
    const response = await runAIAgent(
      { message: "Can Pip move my money?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_trust_policy"]);
    expect(response.cards).toHaveLength(0);
    expect(response.message).toContain("cannot move money");
    expect(response.message).toContain("read-only");
  });

  it("answers Android pricing prompts without web prices or pricing links", async () => {
    const response = await runAIAgent(
      {
        message: "How much does Pip cost?",
        platform: "android_webview",
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_trust_policy"]);
    expect(response.message).toBe("Purchases and subscriptions are not available in this Android build.");
    expect(response.message).not.toMatch(/\$2\.99|\$7\.99|pricing/i);
  });

  it("answers Android cost prompts even when the user asks from web", async () => {
    const response = await runAIAgent({ message: "What does Android cost?" });

    expect(response.usedTools).toEqual(["get_trust_policy"]);
    expect(response.message).toBe("Purchases and subscriptions are not available in this Android build.");
    expect(response.message).not.toMatch(/\$2\.99|\$7\.99|pricing/i);
  });

  it("routes AI calculation prompts to trust policy", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Does AI calculate my number?",
      }),
    ).toMatchObject({
      toolName: "get_trust_policy",
      requireCard: false,
    });
  });

  it("shows a trust receipt card for receipt prompts", async () => {
    const response = await runAIAgent(
      { message: "Show the trust receipt behind today's number" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_trust_receipt"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "trust_receipt",
      title: "Trust receipt",
    });
    expect(response.message).toContain("receipt");
  });

  it("routes brand-new bank prompts to connect instead of repair", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Add another brand new bank with Plaid. Do not repair the existing bank.",
      }),
    ).toMatchObject({
      toolName: "start_new_account_connection",
      requireCard: false,
    });

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Repair my bank connection",
      }),
    ).toMatchObject({
      toolName: "repair_account_connection",
      requireCard: false,
    });
  });

  it("routes natural add-card account requests to Plaid connect", () => {
    for (const message of [
      "I need to add a credit card",
      "No I want to add a credit card account",
      "add a card",
      "connect another card",
    ]) {
      expect(
        __agentTestHooks.getForcedAgentTool({
          message,
        }),
      ).toMatchObject({
        toolName: "start_new_account_connection",
        requireCard: false,
      });
    }
  });

  it("routes named institution remove and reconnect requests", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Remove Wise (US)",
      }),
    ).toMatchObject({
      toolName: "request_remove_institution_confirmation",
      args: {
        institution_name: "wise (us)",
      },
      requireCard: false,
    });

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Reconnect Wise (US)",
      }),
    ).toMatchObject({
      toolName: "repair_account_connection",
      args: {
        institution_name: "wise (us)",
      },
      requireCard: false,
    });
  });

  it("routes the manage accounts prompt chip straight to connected accounts", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Show connected accounts",
        selectedPromptChipId: "manage-accounts",
      }),
    ).toMatchObject({
      toolName: "get_connected_accounts",
      requireCard: true,
    });
  });

  it("can discuss broad finance topics without pretending to show a card", async () => {
    const response = await runAIAgent(
      { message: "Let's talk about credit cards" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual([]);
    expect(response.responseMode).toBe("chat_only");
    expect(response.cards).toHaveLength(0);
    expect(response.message.toLowerCase()).not.toContain("dashboard");
    expect(response.message.toLowerCase()).not.toContain("here is");
  });

  it("does not answer explicit prompt-chip actions without model configuration", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    await expect(runAIAgent({ message: "Show recent transactions" })).rejects.toMatchObject({
      code: "missing-openai-config",
    });
  });

  it("does not answer Spendable Cash explanation prompts without the model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    await expect(runAIAgent({ message: "Why this number?" })).rejects.toMatchObject({
      code: "missing-openai-config",
    });
  });

  it("calls the balances tool when the user asks for actual balances", async () => {
    const response = await runAIAgent(
      { message: "What are my real balances?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_true_balances"]);
    expect(response.cards[0]).toMatchObject({
      type: "true_balances",
    });
  });

  it("keeps model card guesses out of the final structured output boundary", () => {
    expect(
      agentFinalOutputSchema.parse({
        message: "This card shows what changed.",
        cards: [
          {
            type: "invented_card",
            title: "Nope",
          },
        ],
        responseMode: "show_card",
        promptChips: [
          {
            id: "ai-why",
            label: "Why changed?",
            prompt: "Why did it change?",
          },
        ],
      }),
    ).toEqual({
      message: "This card shows what changed.",
      responseMode: "show_card",
      promptChips: [
        {
          id: "ai-why",
          label: "Why changed?",
          prompt: "Why did it change?",
        },
      ],
    });
  });

  it("allows omitted model prompt chips at the JSON-schema-compatible final output boundary", () => {
    expect(
      agentFinalOutputSchema.parse({
        message: "My read: things look stable.",
        responseMode: "guidance",
      }).promptChips,
    ).toBeUndefined();
  });

  it("allows null optional model fields without failing final output parsing", () => {
    expect(
      agentFinalOutputSchema.parse({
        message: "I found the useful basic.",
        support: null,
        responseMode: "chat_only",
        guidanceCardDraft: null,
        promptChips: null,
      }),
    ).toEqual({
      message: "I found the useful basic.",
      support: null,
      responseMode: "chat_only",
      guidanceCardDraft: null,
      promptChips: null,
    });
  });

  it("rejects oversized model guidance drafts at the final output boundary", () => {
    expect(() =>
      agentFinalOutputSchema.parse({
        message: "My read: the rows need trimming.",
        responseMode: "guidance",
        guidanceCardDraft: {
          title: "My read",
          stance: "watch",
          summary: "Recent spending is running hot.",
          rows: Array.from({ length: 4 }, (_, index) => ({
            label: `Row ${index + 1}`,
            detail: "Recent everyday spending is ahead of pace.",
            tone: "warning",
            evidenceIds: ["recent-spending-hot"],
          })),
        },
        promptChips: [],
      }),
    ).toThrow();
  });

  it("allows model-authored guidance card drafts only through the typed draft field", () => {
    expect(
      agentFinalOutputSchema.parse({
        message: "My read: recent spending is running hot.",
        responseMode: "guidance",
        guidanceCardDraft: {
          title: "My read",
          stance: "watch",
          summary: "Recent spending is running hot.",
          rows: [
            {
              label: "Main pressure",
              detail: "Recent everyday spending is ahead of pace.",
              tone: "warning",
              evidenceIds: ["recent-spending-hot"],
            },
          ],
        },
        promptChips: [],
      }).guidanceCardDraft?.stance,
    ).toBe("watch");
  });

  it("rejects invalid insight cards at the response schema boundary", () => {
    expect(() =>
      cardSchema.parse({
        type: "insight_card",
        title: "Too small",
        summary: "This does not have enough rows.",
        rows: [
          {
            id: "income",
            label: "Income",
            amountCents: 10000,
            tone: "positive",
          },
          {
            id: "today",
            label: "Today",
            amountCents: 4300,
            tone: "positive",
          },
        ],
      }),
    ).toThrow();
  });

  it("filters retired default prompt chips and falls back to deterministic ready-state chips", () => {
    const plan = __agentTestHooks.selectPromptChips(
      {
        message: "I can help.",
        responseMode: "chat_only",
        promptChips: [
          {
            id: "ai-why",
            label: "Why this number?",
            prompt: "Why this number?",
          },
          {
            id: "ai-spend",
            label: "Can I spend $50?",
            prompt: "Can I spend $50?",
          },
          {
            id: "ai-changed",
            label: "What changed?",
            prompt: "What changed?",
          },
        ],
      },
      {
        conversationState: {
          shownCards: [],
          lastToolNames: [],
          promptChips: [
            {
              id: "why",
              label: "Why this number?",
              prompt: "Why this number?",
            },
            {
              id: "spend-50",
              label: "Can I spend $50?",
              prompt: "Can I spend $50?",
            },
            {
              id: "what-changed",
              label: "What changed?",
              prompt: "What changed?",
            },
          ],
        },
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        snapshot: fakeSnapshot,
      } as never,
      createNormalReadyResult(),
      {
        input: {
          message: "I can help.",
        },
        cards: [],
        usedTools: [],
      },
    );

    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-why-today",
      "ai-cutback-opportunity",
      "ai-next-few-days",
    ]);
  });

  it("uses deterministic ready-state chips before model-generated supplements", () => {
    const plan = __agentTestHooks.selectPromptChips(
      {
        message: "I can help.",
        responseMode: "chat_only",
        promptChips: [
          {
            id: "ai-behind",
            label: "Main drivers",
            prompt: "Show drivers behind this number",
          },
          {
            id: "ai-bills",
            label: "Upcoming bills",
            prompt: "What bills are coming up?",
          },
          {
            id: "ai-payday",
            label: "Payday impact",
            prompt: "How did payday affect today?",
          },
        ],
      },
      {
        conversationState: {
          shownCards: [],
          lastToolNames: [],
          promptChips: [],
        },
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        snapshot: fakeSnapshot,
      } as never,
      createNormalReadyResult(),
      {
        input: {
          message: "I can help.",
        },
        cards: [],
        usedTools: [],
      },
    );

    expect(plan.chips.map((chip) => chip.label)).toEqual([
      "Why is it $104 today?",
      "What can I cut back on?",
      "What happens in the next few days?",
    ]);
    expect(plan.chips[0]?.prompt).toBe("Show the biggest drivers behind today's number");
    expect(plan.chips[1]?.prompt).toBe("What can I cut back on from my recent spending?");
  });

  it("keeps prompt-chip refreshes populated when every generated chip repeats recent history", () => {
    const recentPromptChips = [
      {
        id: "ai-bills",
        label: "Upcoming bills",
        prompt: "What bills are coming up?",
      },
      {
        id: "ai-payday",
        label: "Payday impact",
        prompt: "How did payday affect today?",
      },
      {
        id: "ai-trend",
        label: "Show my trend",
        prompt: "Show my Spendable Cash trend",
      },
    ];
    const plan = __agentTestHooks.selectPromptChips(
      {
        message: "Ready.",
        responseMode: "chat_only",
        promptChips: recentPromptChips,
      },
      {
        requestKind: "prompt_chips",
        conversationState: {
          shownCards: [],
          lastToolNames: [],
          promptChips: recentPromptChips,
        },
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        snapshot: fakeSnapshot,
      } as never,
      createNormalReadyResult(),
      {
        input: {
          message: "Create prompt chips for the current Pip screen.",
          requestKind: "prompt_chips",
        },
        cards: [],
        usedTools: [],
      },
    );

    expect(plan.chips).toHaveLength(3);
    expect(plan.chips.map((chip) => chip.label)).toEqual([
      "Why is it $104 today?",
      "What can I cut back on?",
      "What happens in the next few days?",
    ]);
  });

  it("accepts longer human-facing prompt chip labels at the schema boundary", () => {
    const parsed = agentFinalOutputSchema.parse({
      message: "I can answer that.",
      responseMode: "chat_only",
      promptChips: [
        {
          id: "ai-spending-basic",
          label: "How should I think about spending?",
          prompt: "How should I think about spending?",
        },
      ],
    });
    const firstChip = (parsed.promptChips ?? [])[0];

    expect(typeof firstChip === "object" ? firstChip.label : firstChip).toBe(
      "How should I think about spending?",
    );
  });

  it("keeps broad personal-finance education chat-only", async () => {
    const response = await runAIAgent(
      { message: "What is cash flow?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual([]);
    expect(response.responseMode).toBe("chat_only");
    expect(response.cards).toHaveLength(0);
  });

  it("repairs detached metric openings instead of throwing a visible error", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage("Spendable Cash Today is below zero right now."),
    ).toBe("I found Spendable Cash Today below zero right now.");
  });

  it("allows suggestion-menu replies that mention possible future card topics", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "You can ask about why it changed, forecast hints, or to see a quick breakdown. Pick a chip or tell me a dollar amount.",
      ),
    ).toBe("You can ask about why it changed, possible pattern hints, or to talk through a quick summary. Pick a chip or tell me a dollar amount.");
  });

  it("allows suggestion-menu replies that mention transactions without returning a card", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "You could ask to see recent transactions, check upcoming bills, or test a purchase amount.",
      ),
    ).toBe("You could ask to talk through recent activity, check bills that may repeat, or test a spending amount.");
  });

  it("repairs recurring activity display promises without a recurring card", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "Here are the subscriptions I found: YouTube Premium may repeat soon.",
      ),
    ).toBe("I can talk through likely repeats: YouTube Premium may repeat soon.");
  });

  it("allows long model drafts but still rejects long visible final responses", () => {
    expect(
      agentFinalOutputSchema.parse({
        message: "x".repeat(agentMessageMaxChars + 1),
        responseMode: "chat_only",
        promptChips: [],
      }).message.length,
    ).toBe(agentMessageMaxChars + 1);

    expect(() =>
      agentResponseSchema.parse({
        message: "x".repeat(agentMessageMaxChars + 1),
        cards: [],
        promptChips: [],
        usedTools: [],
        responseMode: "chat_only",
        audit: {
          toolNames: [],
          usedModel: true,
        },
      }),
    ).toThrow();
  });

  it("maps model output validation failures to a 502 agent-output error", () => {
    const payload = toAgentErrorPayload(
      new AgentUnavailableError({
        code: "model-returned-invalid-final-output",
        message: "AI returned an invalid final response.",
        status: 502,
        detail: "message: too_big, maximum 260 characters",
      }),
    );

    expect(payload).toMatchObject({
      code: "invalid-agent-output",
      error: "AI returned an invalid response.",
      status: 502,
    });
  });

  it("does not label SDK model-output validation failures as service outages", () => {
    const payload = toAgentErrorPayload(
      new Error("Final output schema validation failed: message too_big, maximum 260 characters"),
    );

    expect(payload).toMatchObject({
      code: "invalid-agent-output",
      error: "AI returned an invalid response.",
      status: 502,
    });
  });

  it("has deterministic broad-chat fallbacks for service-failure recovery", () => {
    expect(
      __agentTestHooks.createBroadChatFallbackFinalOutput({
        message: "How do I lower my spending without feeling miserable?",
      }),
    ).toMatchObject({
      message: "Start with one small spending rule: choose one category, set a weekly cap, and keep one low-cost thing you still enjoy.",
      responseMode: "chat_only",
    });

    expect(
      __agentTestHooks.createBroadChatFallbackFinalOutput({
        message: "Should I buy Bitcoin?",
      }),
    ).toMatchObject({
      message: "I can’t pick crypto, but I can help test how a purchase amount would affect today.",
      responseMode: "chat_only",
    });
  });

  it("allows extra raw model prompt chips for deterministic replanning", () => {
    const parsed = agentFinalOutputSchema.parse({
      message: "Short draft.",
      responseMode: "chat_only",
      promptChips: Array.from({ length: 5 }, (_, index) => ({
        id: `chip-${index}`,
        label: `Chip ${index}`,
        prompt: `Prompt ${index}`,
      })),
    });

    expect(parsed.promptChips).toHaveLength(5);
  });

  it("allows string prompt chip mistakes at the raw model boundary", () => {
    const parsed = agentFinalOutputSchema.parse({
      message: "Short draft.",
      responseMode: "chat_only",
      promptChips: ["Teach me one useful money basic"],
    });

    expect(parsed.promptChips).toEqual(["Teach me one useful money basic"]);
    expect(__agentTestHooks.normalizeAgentFinalOutput(parsed).promptChips).toEqual([]);
  });

  it("drops non-string support mistakes at the raw model boundary", () => {
    const parsed = agentFinalOutputSchema.parse({
      message: "Short draft.",
      support: {
        text: "This should have been a string.",
      },
      responseMode: "chat_only",
      promptChips: [],
    });

    expect(parsed.support).toEqual({
      text: "This should have been a string.",
    });
    expect(__agentTestHooks.normalizeAgentFinalOutput(parsed).support).toBeUndefined();
  });

  it("allows long raw support text for visible-answer composition", () => {
    const parsed = agentFinalOutputSchema.parse({
      message: "Short draft.",
      support: "x".repeat(300),
      responseMode: "chat_only",
      promptChips: [],
    });

    expect(parsed.support).toHaveLength(300);
  });

  it("repairs summary display promises without a card", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "This is the short driver summary. I can show the full summary if you’d like.",
      ),
    ).toBe("This is the short driver summary. I can talk through the full summary if you’d like.");
  });

  it("repairs forecast display promises without a forecast card", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "I can show how this affects the next 7 days.",
      ),
    ).toBe("I can talk through how this affects the next stretch.");
  });

  it("repairs breakdown display promises without a breakdown card", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "I can show your spending breakdown in more detail.",
      ),
    ).toBe("I can talk through your spending summary in more detail.");
  });

  it("repairs cardless driver display language", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "I see my main drivers: normal room, bills held back, and protected savings.",
      ),
    ).toBe("The same main drivers still apply: normal room, bills held back, and protected savings.");
  });

  it("repairs blocked-advice replies that promise cardless follow-up views", () => {
    const message =
      "I don’t give investment advice. I see you have $104 Spendable Cash Today with missing-data signals. I’d treat Nvidia as a high-risk, nonessential purchase today. If you want, I can simulate a small purchase to show impact or pull up the latest drivers.";
    const repaired = __agentTestHooks.repairUnsupportedCardPromises(message, []);

    expect(repaired).toContain("I don’t give investment advice.");
    expect(repaired?.trim().split(/\s+/).length).toBeLessThanOrEqual(45);
    expect(__agentTestHooks.getUnsupportedCardPromise(repaired ?? "", [])).toBeNull();
    expect(repaired).not.toMatch(/\b(show|see|pull|view|here is|here are)\b/i);
    expect(__agentTestHooks.guardVisibleFinalMessage(message)).toBe(repaired);

    const cashPictureMessage =
      "I’d treat this as a question about your money today. I can’t give investment advice. Nvidia isn’t in my feed here. If you want, I can pull up today’s cash picture and show how a purchase would affect it.";
    const repairedCashPicture = __agentTestHooks.repairUnsupportedCardPromises(cashPictureMessage, []);

    expect(__agentTestHooks.getUnsupportedCardPromise(cashPictureMessage, [])).not.toBeNull();
    expect(repairedCashPicture).toContain("I can’t give investment advice.");
    expect(repairedCashPicture?.trim().split(/\s+/).length).toBeLessThanOrEqual(45);
    expect(__agentTestHooks.getUnsupportedCardPromise(repairedCashPicture ?? "", [])).toBeNull();
    expect(repairedCashPicture).not.toMatch(/\b(show|see|pull|view|here is|here are)\b/i);
    expect(__agentTestHooks.guardVisibleFinalMessage(cashPictureMessage)).toBe(repairedCashPicture);
  });

  it("repairs generic no-card display offers", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "Note: one data card may be missing, but you still have room today.",
      ),
    ).toBe("Note: one data source may be missing, but you still have room today.");

    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "Want to see the details card or adjust protection?",
      ),
    ).toBe("Want to talk through the details or adjust protection?");

    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "I can show what is driving today if you like.",
      ),
    ).toBe("I can talk through what is driving today if you like.");
  });

  it("allows broad money basics that mention lists or credit cards without promising UI cards", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "One useful basic: make a short list before bigger purchases, so the plan beats the impulse.",
      ),
    ).toContain("short list");

    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "One useful basic: pay attention to credit card timing, because purchases can feel delayed.",
      ),
    ).toContain("credit card timing");
  });

  it("rejects when OpenAI is not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    await expect(runAIAgent({ message: "Can I spend $50?" })).rejects.toMatchObject({
      code: "missing-openai-config",
    });
  });
});

describe("AI model configuration", () => {
  it("uses the direct OpenAI default unless Netlify AI Gateway is configured", () => {
    expect(getPipAiModel({})).toBe(PIP_AI_MODEL);
  });

  it("uses a Netlify AI Gateway supported default when OPENAI_BASE_URL is present", () => {
    expect(
      getPipAiModel({
        OPENAI_BASE_URL: "https://example.netlify.app/.netlify/ai",
      }),
    ).toBe(NETLIFY_AI_GATEWAY_MODEL);
  });

  it("uses a Netlify AI Gateway supported default when Netlify injects gateway env", () => {
    expect(
      getPipAiModel({
        NETLIFY_AI_GATEWAY_BASE_URL: "https://api.netlify.com/ai/v1",
        NETLIFY_AI_GATEWAY_KEY: "netlify-key",
      }),
    ).toBe(NETLIFY_AI_GATEWAY_MODEL);
  });

  it("lets an explicit PIP_AI_MODEL override either deployment default", () => {
    expect(
      getPipAiModel({
        OPENAI_BASE_URL: "https://example.netlify.app/.netlify/ai",
        PIP_AI_MODEL: "custom-model",
      }),
    ).toBe("custom-model");
  });

  it("uses a harmless SDK placeholder key when Netlify AI Gateway supplies only a base URL", () => {
    expect(
      getOpenAIApiKeyForSdk({
        OPENAI_BASE_URL: "https://example.netlify.app/.netlify/ai",
      }),
    ).toBe("netlify-ai-gateway");
  });

  it("classifies OpenAI base URL env as Netlify AI Gateway by default", () => {
    expect(
      getOpenAIClientConfig({
        OPENAI_API_KEY: "auto-netlify-key",
        OPENAI_BASE_URL: "https://api.netlify.com/ai/v1/openai",
      }),
    ).toEqual({
      apiKey: "auto-netlify-key",
      baseURL: "https://api.netlify.com/ai/v1/openai",
      transport: "netlify-ai-gateway",
    });
  });

  it("allows an explicit custom OpenAI-compatible transport override", () => {
    expect(
      getOpenAIClientConfig({
        OPENAI_API_KEY: "custom-key",
        OPENAI_BASE_URL: "https://llm-gateway.example",
        PIP_AI_TRANSPORT: "custom-openai-compatible",
      }),
    ).toEqual({
      apiKey: "custom-key",
      baseURL: "https://llm-gateway.example",
      transport: "custom-openai-compatible",
    });
  });

  it("prefers explicit Netlify AI Gateway env over a direct OpenAI key in Netlify runtimes", () => {
    expect(
      getOpenAIClientConfig({
        OPENAI_API_KEY: "direct-openai-key",
        NETLIFY_AI_GATEWAY_BASE_URL: "https://api.netlify.com/ai/v1",
        NETLIFY_AI_GATEWAY_KEY: "netlify-key",
      }),
    ).toEqual({
      apiKey: "netlify-key",
      baseURL: "https://api.netlify.com/ai/v1",
      transport: "netlify-ai-gateway",
    });
    expect(
      getPipAiTransport({
        OPENAI_API_KEY: "direct-openai-key",
        NETLIFY_AI_GATEWAY_BASE_URL: "https://api.netlify.com/ai/v1",
        NETLIFY_AI_GATEWAY_KEY: "netlify-key",
      }),
    ).toBe("netlify-ai-gateway");
  });
});

function createGuidanceSelectorContext(
  options: { fallbackFinalOutput?: boolean } = {},
) {
  return {
    inputMessage: "How am I doing?",
    requestKind: "chat",
    onboardingState: { status: "ready", hasFinancialData: true },
    conversationState: { shownCards: [], lastToolNames: [], promptChips: [] },
    forcedTool: {
      toolName: "get_financial_guidance_context",
      args: {},
      requireCard: true,
    },
    usedTools: ["get_financial_guidance_context"],
    availableCards: [],
    availablePromptChips: [],
    guidanceContext: buildFinancialGuidanceContext(calculatePipCash(fakeSnapshot)),
    fallbackFinalOutput: options.fallbackFinalOutput,
  } as unknown as Parameters<typeof __agentTestHooks.selectGuidanceCard>[1];
}

function createNormalReadyResult() {
  const result = calculatePipCash(fakeSnapshot);

  if (!result.spendableCashToday) {
    return result;
  }

  return {
    ...result,
    warnings: [],
    dataStates: [],
    spendableCashToday: {
      ...result.spendableCashToday,
      state: "normal" as const,
      confidence: "high" as const,
      warnings: [],
      dataStates: [],
    },
  };
}

function accountConnectionsCard(): AgentCard {
  return {
    type: "account_connections",
    title: "Connected accounts",
    institutions: [
      {
        institutionId: "mock-bank",
        institutionName: "Mock Bank",
        provider: "mock",
        status: "mocked",
        lastSuccessfulSyncAt: "2026-06-19T12:00:00.000Z",
        accounts: [
          {
            accountId: "checking-1",
            name: "Checking",
            kind: "checking",
            lastFour: "1234",
            includedInPipCash: true,
            isProtectedSavings: false,
            active: true,
            roleLabel: "Spendable Cash",
          },
        ],
        actions: [],
      },
    ],
  };
}

function createSavingsGoalActions(): PipAgentActions {
  let savedGoal:
    | {
        goalId: string;
        name: string;
        targetAmountCents: number;
        currentAmountCents: number;
        remainingCents: number;
        targetDate?: string;
        monthlyContributionCents: number;
        includeInSpendableCash: boolean;
        onTrack?: boolean;
      }
    | undefined;

  return {
    async createSavingsGoal(input) {
      savedGoal = {
        goalId: "goal-japan",
        name: input.name,
        targetAmountCents: input.targetAmountCents,
        currentAmountCents: input.currentAmountCents ?? 0,
        remainingCents: input.targetAmountCents - (input.currentAmountCents ?? 0),
        targetDate: input.targetDate,
        monthlyContributionCents: input.monthlyContributionCents ?? 0,
        includeInSpendableCash: input.includeInSpendableCash ?? false,
      };

      return {
        ok: true,
        status: "savings_goal_created",
        cards: [
          {
            type: "savings_goal_plan" as const,
            title: "Savings goal",
            ...savedGoal,
            summary: `$${Math.round(savedGoal.remainingCents / 100).toLocaleString()} left for ${savedGoal.name}. Tracked in Pip. No money is moved.`,
          },
        ],
      };
    },
    async listSavingsGoals() {
      return {
        ok: true,
        status: "savings_goals_loaded",
        cards: [
          {
            type: "savings_goals_summary" as const,
            title: "Savings goals",
            summary: savedGoal
              ? `${savedGoal.name}: $${Math.round(savedGoal.remainingCents / 100).toLocaleString()} remaining.`
              : "No savings goals yet.",
            activeGoalCount: savedGoal ? 1 : 0,
            protectedMonthlyContributionCents: 0,
            goals: savedGoal ? [savedGoal] : [],
          },
        ],
      };
    },
    async setSavingsGoalProtection(input) {
      if (!savedGoal) {
        return {
          ok: false,
          status: "savings_goal_not_found",
          message: "I do not see a saved savings goal yet.",
        };
      }

      savedGoal = {
        ...savedGoal,
        includeInSpendableCash: input.includeInSpendableCash,
        monthlyContributionCents: input.monthlyContributionCents ?? savedGoal.monthlyContributionCents,
      };

      return {
        ok: true,
        status: input.includeInSpendableCash
          ? "savings_goal_protection_enabled"
          : "savings_goal_protection_disabled",
        cards: [
          {
            type: "savings_goal_plan" as const,
            title: "Savings goal",
            ...savedGoal,
            summary: `$${Math.round(savedGoal.remainingCents / 100).toLocaleString()} left for ${savedGoal.name}. Tracked in Pip. No money is moved.`,
          },
        ],
      };
    },
    async updateSavingsGoal(input) {
      if (!savedGoal) {
        return {
          ok: false,
          status: "savings_goal_not_found",
          message: "I do not see a saved savings goal yet.",
        };
      }

      savedGoal = {
        ...savedGoal,
        currentAmountCents: input.currentAmountCents ?? savedGoal.currentAmountCents,
        remainingCents: savedGoal.targetAmountCents - (input.currentAmountCents ?? savedGoal.currentAmountCents),
        targetAmountCents: input.targetAmountCents ?? savedGoal.targetAmountCents,
        monthlyContributionCents: input.monthlyContributionCents ?? savedGoal.monthlyContributionCents,
        includeInSpendableCash: input.includeInSpendableCash ?? savedGoal.includeInSpendableCash,
      };

      return {
        ok: true,
        status: "savings_goal_updated",
        cards: [
          {
            type: "savings_goal_plan" as const,
            title: "Savings goal",
            ...savedGoal,
            summary: `$${Math.round(savedGoal.remainingCents / 100).toLocaleString()} left for ${savedGoal.name}. Tracked in Pip. No money is moved.`,
          },
        ],
      };
    },
  };
}
