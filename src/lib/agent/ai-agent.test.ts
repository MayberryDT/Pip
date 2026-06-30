import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentFinalOutputSchema, agentMessageMaxChars, agentResponseSchema, cardSchema } from "@/lib/agent/response-schema";
import {
  AgentUnavailableError,
  runAIAgent,
  type PipAgentActions,
  toAgentErrorPayload,
  __agentTestHooks,
} from "@/lib/agent/ai-agent";
import {
  PIP_AI_MODEL,
  getOpenAIApiKeyForSdk,
  getOpenAIClientConfig,
  getPipAiModel,
  getPipAiTransport,
} from "@/lib/agent/openai-config";
import type { AgentCard } from "@/lib/agent/card-types";
import {
  buildSavingsGoalDraft,
  createOrdinaryPendingAction,
  getSavingsGoalPreviewMissingFields,
} from "@/lib/agent/pending-actions";
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

      expect(response.audit.usedModel).toBe(true);
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

  it("preserves model visible guidance text when the guidance card falls back", () => {
    const message =
      "I found $104 today. Your normal room is $69.27, driven by normal spending and recent lighter spending. Watch data quality; I'd stay cautious about big purchases.";
    const visibleOutput = __agentTestHooks.selectVisibleModelOutput(
      {
        message,
        responseMode: "guidance",
        promptChips: [],
      },
      createGuidanceSelectorContext(),
      { guidanceSource: "deterministic_fallback" },
    );

    expect(visibleOutput.message).toBe(message);
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

  it("shows recent transactions for present-perfect buying questions", async () => {
    const response = await runAIAgent(
      { message: "what have i been buying?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_recent_transactions"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "recent_transactions",
    });
  });

  it("keeps a current-turn recent transactions card for vague show-me follow-ups", () => {
    const card: AgentCard = {
      type: "recent_transactions",
      title: "Recent transactions",
      transactions: [],
    };

    const cards = __agentTestHooks.selectDeterministicCards(
      {
        message: "I found these recent items.",
        responseMode: "show_card",
        promptChips: [],
      },
      {
        usedTools: ["get_recent_transactions"],
        availableCards: [card],
        conversationState: {
          shownCards: [],
          lastToolNames: [],
          promptChips: [],
        },
      } as unknown as Parameters<typeof __agentTestHooks.selectDeterministicCards>[1],
      {
        message: "show me",
      } as Parameters<typeof __agentTestHooks.selectDeterministicCards>[2],
    );

    expect(cards).toEqual([card]);
  });

  it("re-shows recent transactions for show-me follow-ups without asking the model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    const response = await runAIAgent({
      message: "show me",
      snapshot: fakeSnapshot,
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
      conversationState: {
        shownCards: [
          {
            type: "recent_transactions",
            title: "Recent transactions",
          },
        ],
        lastToolNames: ["get_recent_transactions"],
      },
      history: [
        {
          role: "user",
          content: "what have i been buying?",
        },
        {
          role: "assistant",
          content: "I found recent charges in the current window.",
        },
      ],
    });

    expect(response.audit.usedModel).toBe(false);
    expect(response.usedTools).toEqual(["get_recent_transactions"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.message).toBe("I found recent charges in the current window.");
    expect(response.cards[0]).toMatchObject({
      type: "recent_transactions",
    });
  });

  it("keeps the recent transactions card for a vague show-me follow-up", async () => {
    const response = await runAIAgent(
      {
        message: "show me",
        history: [
          {
            role: "user",
            content: "what have i been buying?",
          },
          {
            role: "assistant",
            content: "I can walk you through recent activity.",
          },
        ],
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_recent_transactions"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "recent_transactions",
    });
  });

  it("uses a short bridge for spending breakdown cards", async () => {
    const response = await runAIAgent(
      {
        message: "Show my spending breakdown",
        selectedPromptChipId: "ai-spending-breakdown",
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_spending_breakdown"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "spending_breakdown",
    });
    expect(response.message).toBe("I grouped the main money flows.");
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

  it("routes plain save-money prompts to a grounded cutback opportunity", async () => {
    const response = await runAIAgent(
      {
        message: "i want to save money",
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

  it("routes how-did-you-get-the-number prompts to the math tool", async () => {
    const response = await runAIAgent(
      {
        message: "How did you get the spendable cash today number?",
        snapshot: getFakeSnapshot("healthy"),
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_pip_cash_math"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "math_breakdown",
    });
  });

  it("answers recurring bill totals without surfacing unsupported finance output", async () => {
    const response = await runAIAgent(
      {
        message: "What's the total of these monthly bills?",
        snapshot: getFakeSnapshot("production-scale"),
        history: [
          { role: "user", content: "What bills are coming up?" },
          { role: "assistant", content: "Here are your upcoming bills." },
        ],
        conversationState: {
          shownCards: [{ type: "recurring_activity", title: "Likely recurring activity" }],
          lastToolNames: ["get_recurring_activity"],
          promptChips: [],
        },
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_recurring_activity"]);
    expect(response.responseMode).toBe("chat_only");
    expect(response.cards).toEqual([]);
    expect(response.message.toLowerCase()).toMatch(/repeat|monthly|bill|total/);
  });

  it("answers recurring bill totals before model execution when only recent recurring context exists", async () => {
    const response = await runAIAgent({
      message: "What's the total of these monthly bills?",
      snapshot: getFakeSnapshot("production-scale"),
      history: [
        { role: "user", content: "What bills are coming up?" },
        { role: "assistant", content: "Here are your upcoming bills." },
      ],
      conversationState: {
        shownCards: [{ type: "recurring_activity", title: "Likely recurring activity" }],
        lastToolNames: ["get_recurring_activity"],
        promptChips: [],
      },
    });

    expect(response.audit.usedModel).toBe(false);
    expect(response.usedTools).toEqual(["get_recurring_activity"]);
    expect(response.responseMode).toBe("chat_only");
    expect(response.cards).toEqual([]);
    expect(response.message).toMatch(/monthly bills add up to \$\d/);
  });

  it("does not answer recurring totals cardlessly without recurring context", async () => {
    const response = await runAIAgent(
      {
        message: "What's the total of these monthly bills?",
        snapshot: getFakeSnapshot("production-scale"),
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_recurring_activity"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "recurring_activity",
    });
  });

  it("routes standalone recurring aggregate questions to the recurring card", () => {
    for (const message of [
      "what is the total of my monthly bills",
      "how much are my recurring bills total",
      "what do my subscriptions add up to",
      "how much am I spending on monthly charges",
      "whats the total of these monthly bills",
      "the total of my monthly bills? how much am i spending a month?",
    ]) {
      expect(
        __agentTestHooks.getForcedAgentTool({
          message,
        }),
      ).toMatchObject({
        toolName: "get_recurring_activity",
        requireCard: true,
      });
    }
  });

  it("routes recurring aggregate follow-ups to data without requiring a card", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "whats the total of these monthly bills",
        history: [
          { role: "user", content: "What bills are coming up?" },
          { role: "assistant", content: "Here are your upcoming bills." },
        ],
        conversationState: {
          shownCards: [{ type: "recurring_activity", title: "Likely recurring activity" }],
          lastToolNames: ["get_recurring_activity"],
          promptChips: [],
        },
      }),
    ).toMatchObject({
      toolName: "get_recurring_activity",
      requireCard: false,
    });
  });

  it.each([
    ["i want to save money", "get_spending_opportunity"],
    ["help me save money", "get_spending_opportunity"],
    ["how can I save money on car expenses?", "get_spending_opportunity"],
    ["How did you get the spendable cash today number?", "get_pip_cash_math"],
    ["how did you come up with today's number?", "get_pip_cash_math"],
    ["whats the total of these monthly bills?", "get_recurring_activity"],
  ])("forces the correct tool for production phrase %s", (message, toolName) => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message,
        snapshot: getFakeSnapshot("healthy"),
      }),
    ).toMatchObject({ toolName });
  });

  it.each([
    "i want to save money for a big purchase",
    "help me save for a vacation",
    "move $200 to savings",
    "transfer money to savings",
  ])("does not force cutback for savings setup or money movement phrase %s", (message) => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message,
        snapshot: getFakeSnapshot("healthy"),
      }),
    ).not.toMatchObject({ toolName: "get_spending_opportunity" });
  });

  it.each([
    "what do these charges add up to?",
    "how much did my charges total?",
  ])("does not force recurring activity for generic charge total phrase %s", (message) => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message,
        history: [
          { role: "user", content: "Show recent transactions" },
          { role: "assistant", content: "I found recent charges." },
        ],
        conversationState: {
          shownCards: [{ type: "recent_transactions", title: "Recent transactions" }],
          lastToolNames: ["get_recent_transactions"],
          promptChips: [],
        },
      }),
    ).not.toMatchObject({ toolName: "get_recurring_activity" });
  });

  it("does not force the recurring activity tool when visible recurring facts can answer an aggregate follow-up", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "What's the total of these monthly bills?",
        history: [
          { role: "user", content: "What bills are coming up?" },
          { role: "assistant", content: "I found likely repeating items." },
        ],
        conversationState: {
          shownCards: [{ type: "recurring_activity", title: "Likely recurring activity" }],
          visibleCardFacts: [
            {
              type: "recurring_activity",
              title: "Likely recurring activity",
              facts: ["Visible recurring expense total: $35.79 across 2 items."],
              values: [
                {
                  id: "visible-1",
                  label: "Google Workspace",
                  amountCents: -1680,
                  confidence: "high",
                },
                {
                  id: "visible-2",
                  label: "Hulu",
                  amountCents: -1899,
                  confidence: "medium",
                },
              ],
            },
          ],
          lastToolNames: ["get_recurring_activity"],
          promptChips: [],
        },
      }),
    ).toBeUndefined();
  });

  it("sends visible card facts to the model for cardless follow-up answers", async () => {
    const visibleCardFacts = [
      {
        type: "recurring_activity" as const,
        title: "Recurring activity",
        facts: [
          "Visible recurring expense total: $18.99.",
          "Visible recurring income total: $0.00.",
        ],
        values: [
          {
            id: "recurring-expense-total",
            label: "Visible recurring expense total",
            amountCents: 1899,
            confidence: "high" as const,
          },
        ],
      },
    ];
    const runtime = {
      run: vi.fn(async () => ({
        message: "I can see the recurring bills currently on the card.",
        cards: [],
        promptChips: [],
        usedTools: ["get_recurring_activity"],
        responseMode: "chat_only" as const,
        audit: {
          toolNames: ["get_recurring_activity"],
          usedModel: true,
          model: "test-model",
          transport: "openai-direct" as const,
        },
      })),
    };

    const response = await runAIAgent(
      {
        message: "Tell me more about these bills",
        history: [
          { role: "user", content: "What bills are coming up?" },
          { role: "assistant", content: "I found recurring activity." },
        ],
        conversationState: {
          visibleCardFacts,
        },
      },
      runtime,
    );

    expect(runtime.run).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Tell me more about these bills",
        history: expect.arrayContaining([
          { role: "user", content: "What bills are coming up?" },
        ]),
        conversationState: expect.objectContaining({
          visibleCardFacts,
        }),
      }),
    );
    expect(response).toMatchObject({
      message: "I can see the recurring bills currently on the card.",
      cards: [],
      responseMode: "chat_only",
      audit: {
        usedModel: true,
      },
    });
  });

  it("answers visible recurring aggregate follow-ups without rerunning the recurring tool", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    const response = await runAIAgent(
      {
        message: "What do these monthly bills add up to?",
        history: [
          { role: "user", content: "What bills are coming up?" },
          { role: "assistant", content: "I found recurring activity." },
        ],
        conversationState: {
          shownCards: [{ type: "recurring_activity", title: "Likely recurring activity" }],
          visibleCardFacts: [
            {
              type: "recurring_activity" as const,
              title: "Likely recurring activity",
              facts: ["Visible recurring expense total: $35.79 across 2 items."],
              values: [
                {
                  id: "visible-1",
                  label: "Google Workspace",
                  amountCents: -1680,
                  confidence: "high" as const,
                },
                {
                  id: "visible-2",
                  label: "Hulu",
                  amountCents: -1899,
                  confidence: "medium" as const,
                },
              ],
            },
          ],
          lastToolNames: ["get_recurring_activity"],
          promptChips: [],
        },
      },
    );

    expect(response).toMatchObject({
      message: "Those monthly bills add up to $35.79 across 2 items.",
      cards: [],
      usedTools: [],
      responseMode: "chat_only",
      audit: {
        usedModel: false,
        toolNames: [],
      },
    });
  });

  it("keeps recent chat history and visible facts in the model input", () => {
    const source = readFileSync(new URL("./ai-agent.ts", import.meta.url), "utf8");
    const inputSource = source.slice(
      source.indexOf("function createAgentInput"),
      source.indexOf("function formatHistoryForModel"),
    );

    expect(inputSource).toContain("...formatHistoryForModel(input.history)");
    expect(inputSource).toContain("recent_visible_card_facts");
    expect(inputSource).toContain("recent_visible_card_context");
  });

  it("shows the recurring card for fresh recurring aggregate questions", async () => {
    const response = await runAIAgent(
      { message: "How much are my recurring bills total?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_recurring_activity"]);
    expect(response.responseMode).toBe("show_card");
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
    expect(response.message).not.toMatch(/\btrust receipt\b/i);
  });

  it("routes savings goal prompts through the real forced-tool classifier", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "I want to save for a trip that costs $5,000",
      }),
    ).toMatchObject({
      toolName: "preview_savings_goal",
      args: {
        name: "Trip",
        target_amount_cents: 500000,
      },
      requireCard: false,
    });

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Save for a big purchase",
      }),
    ).toMatchObject({
      toolName: "preview_savings_goal",
      args: {
        name: "Big purchase",
        include_in_spendable_cash: true,
      },
      requireCard: false,
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
        message: "Set my trip goal target to $6,000",
      })?.toolName,
    ).not.toBe("create_savings_goal");

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Keep my trip goal out of Spendable Cash at $300/month",
      })?.toolName,
    ).not.toBe("set_savings_goal_protection");

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "How can I save money this week?",
      }),
    ).toMatchObject({
      toolName: "get_spending_opportunity",
      requireCard: true,
    });
  });

  it("does not route retired account inclusion or account protected-savings prompts", () => {
    for (const message of [
      "exclude my business checking",
      "include this card again",
      "make savings protected savings",
      "stop treating savings as protected",
    ]) {
      expect(
        __agentTestHooks.getForcedAgentTool({
          message,
        })?.toolName,
      ).not.toEqual(expect.stringMatching(/^set_account_(inclusion|protected_savings)$/));
    }
  });

  it("keeps retired account and savings-goal protection tools out of model-facing prompt and tools", () => {
    const source = readFileSync(new URL("./ai-agent.ts", import.meta.url), "utf8");
    const instructionSource = source.slice(
      source.indexOf("function createPipInstructions"),
      source.indexOf("function createAgentInput"),
    );

    expect(source).not.toContain('name: "set_account_inclusion"');
    expect(source).not.toContain('name: "set_account_protected_savings"');
    expect(source).not.toContain('name: "set_savings_goal_protection"');

    expect(instructionSource).toContain("warm daily money companion");
    expect(instructionSource).toContain("soft, evidence-based pushback");
    expect(instructionSource).not.toContain("exclude or include an account");
    expect(instructionSource).not.toContain("Use set_account_inclusion");
    expect(instructionSource).not.toContain("Use set_account_protected_savings");
    expect(instructionSource).not.toContain("Use set_savings_goal_protection");
    expect(instructionSource).not.toContain("kept out of Spendable Cash Today");
    expect(instructionSource).not.toContain("tracked only");
  });

  it("forces generic savings goal setup into a stateful preview turn", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "I want to set a savings goal",
      }),
    ).toMatchObject({
      toolName: "preview_savings_goal",
      args: {
        name: "Savings goal",
        include_in_spendable_cash: true,
      },
      requireCard: false,
    });
  });

  it("recovers forced savings goal previews when the model skips the required tool", () => {
    const context = {
      inputMessage: "Save for a big purchase",
      requestKind: "chat",
      forcedTool: {
        toolName: "preview_savings_goal",
        args: {
          name: "Big purchase",
          include_in_spendable_cash: true,
        },
        requireCard: false,
      },
      usedTools: [],
      availableCards: [],
    };
    const fallback = __agentTestHooks.createForcedPreviewSavingsGoalFallbackFinalOutput(context);

    expect(fallback).toMatchObject({
      responseMode: "clarify",
      promptChips: [],
    });
    expect(fallback?.message).toContain("target amount");
    expect(context.usedTools).toEqual(["preview_savings_goal"]);
    expect(context).toMatchObject({
      pendingAction: {
        type: "preview_savings_goal",
        name: "Big purchase",
        missing: ["target_amount", "target_date_or_monthly_contribution"],
      },
    });
  });

  it("keeps no-card preview savings pending actions in clarify mode", () => {
    type ResponseModeInput = Parameters<typeof __agentTestHooks.selectFinalResponseMode>[0] & {
      pendingAction?: { type: "preview_savings_goal" };
    };

    expect(
      __agentTestHooks.selectFinalResponseMode({
        parsedResponseMode: "chat_only",
        message: "I still need either a monthly contribution or a target date.",
        cards: [],
        usedTools: ["preview_savings_goal"],
        forcedToolRequiresCard: false,
        pendingAction: {
          type: "preview_savings_goal",
        },
      } satisfies ResponseModeInput),
    ).toBe("clarify");
  });

  it("reports preview_savings_goal for savings-goal clarify turns", async () => {
    for (const message of ["I want to save for Japan", "Save for a big purchase"]) {
      const response = await runAIAgent(
        {
          message,
          snapshot: getFakeSnapshot("default"),
        },
        createMockModelClient(),
      );

      expect(response.responseMode).toBe("clarify");
      expect(response.usedTools, message).toEqual(["preview_savings_goal"]);
      expect(response.audit.toolNames, message).toEqual(["preview_savings_goal"]);
      expect(response.pendingAction).toMatchObject({
        type: "preview_savings_goal",
      });
    }
  });

  it("coerces no-card non-pending clarify replies back to chat only", () => {
    expect(
      __agentTestHooks.selectFinalResponseMode({
        parsedResponseMode: "clarify",
        message: "I don’t have a specific opportunity yet.",
        cards: [],
        usedTools: ["get_spending_opportunity"],
        forcedToolRequiresCard: false,
      }),
    ).toBe("chat_only");
  });

  it("forces pending preview savings details back through preview_savings_goal", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "It costs $3,000 by December 1st",
        conversationState: {
          pendingAction: {
            type: "preview_savings_goal",
            name: "Japan trip",
            missing: ["target_amount"],
            includeInSpendableCash: true,
          },
        },
      }),
    ).toMatchObject({
      toolName: "preview_savings_goal",
      args: {
        name: "Japan trip",
        target_amount_cents: 300000,
        target_date: "2026-12-01",
        include_in_spendable_cash: true,
      },
      requireCard: true,
    });
  });

  it("keeps generic savings goal setup stateful before asking the model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    const response = await runAIAgent({
      message: "i want to start a savings goal",
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
      actions: createSavingsGoalActions(),
    });

    expect(response.audit.usedModel).toBe(false);
    expect(response.usedTools).toEqual(["preview_savings_goal"]);
    expect(response.responseMode).toBe("clarify");
    expect(response.pendingAction).toMatchObject({
      type: "preview_savings_goal",
      name: "Savings goal",
      missing: ["target_amount", "target_date_or_monthly_contribution"],
      includeInSpendableCash: true,
    });
  });

  it("starts savings goal setup after a spending breakdown card without falling back to a 502", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    const response = await runAIAgent({
      message: "i want to start a savings goal",
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
      conversationState: {
        shownCards: [
          {
            type: "spending_breakdown",
            title: "Spending breakdown",
          },
        ],
        lastToolNames: ["get_spending_breakdown"],
      },
      history: [
        {
          role: "user",
          content: "Show my spending breakdown",
        },
        {
          role: "assistant",
          content: "I grouped the main money flows.",
        },
      ],
      actions: createSavingsGoalActions(),
    });

    expect(response.audit.usedModel).toBe(false);
    expect(response.usedTools).toEqual(["preview_savings_goal"]);
    expect(response.responseMode).toBe("clarify");
    expect(response.message).toBe("How much do you want to save for this goal?");
    expect(response.pendingAction).toMatchObject({
      type: "preview_savings_goal",
      name: "Savings goal",
      missing: ["target_amount", "target_date_or_monthly_contribution"],
    });
  });

  it("previews and creates a multi-turn savings goal without relying on model output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    const actions = createSavingsGoalActions();
    const createSavingsGoal = vi.spyOn(actions, "createSavingsGoal");
    const baseInput = {
      onboardingState: {
        status: "ready" as const,
        hasFinancialData: true,
      },
      snapshot: fakeSnapshot,
      actions,
    };

    const start = await runAIAgent({
      ...baseInput,
      message: "i want to start a savings goal",
    });
    const amount = await runAIAgent({
      ...baseInput,
      message: "5000",
      conversationState: { pendingAction: start.pendingAction },
    });
    const preview = await runAIAgent({
      ...baseInput,
      message: "in 6 months",
      conversationState: { pendingAction: amount.pendingAction },
    });
    const created = await runAIAgent({
      ...baseInput,
      message: "yes",
      conversationState: { pendingAction: preview.pendingAction },
    });

    expect(amount.responseMode).toBe("clarify");
    expect(amount.pendingAction).toMatchObject({
      type: "preview_savings_goal",
      targetAmountCents: 500000,
      missing: ["target_date_or_monthly_contribution"],
    });
    expect(preview.usedTools).toEqual(["preview_savings_goal"]);
    expect(preview.responseMode).toBe("show_card");
    expect(preview.cards[0]).toMatchObject({
      type: "savings_goal_preview",
      targetAmountCents: 500000,
      includeInSpendableCash: true,
    });
    expect(preview.pendingAction).toMatchObject({
      type: "ordinary_write",
      action: "create_savings_goal",
    });
    expect(created.usedTools).toEqual(["create_savings_goal"]);
    expect(created.responseMode).toBe("show_card");
    expect(created.cards[0]).toMatchObject({
      type: "savings_goal_plan",
      targetAmountCents: 500000,
      includeInSpendableCash: true,
    });
    expect(createSavingsGoal).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending savings goal preview when the user says no", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    const actions = createSavingsGoalActions();
    const createSavingsGoal = vi.spyOn(actions, "createSavingsGoal");
    const baseInput = {
      onboardingState: {
        status: "ready" as const,
        hasFinancialData: true,
      },
      snapshot: fakeSnapshot,
      actions,
    };
    const start = await runAIAgent({
      ...baseInput,
      message: "i want to set a savings goal",
    });
    const amount = await runAIAgent({
      ...baseInput,
      message: "2000",
      conversationState: { pendingAction: start.pendingAction },
    });
    const preview = await runAIAgent({
      ...baseInput,
      message: "by December",
      conversationState: { pendingAction: amount.pendingAction },
    });
    const cancelled = await runAIAgent({
      ...baseInput,
      message: "no",
      conversationState: { pendingAction: preview.pendingAction },
    });

    expect(preview.usedTools).toEqual(["preview_savings_goal"]);
    expect(preview.cards[0]).toMatchObject({
      type: "savings_goal_preview",
      targetAmountCents: 200000,
    });
    expect(cancelled.audit.usedModel).toBe(false);
    expect(cancelled.usedTools).toEqual([]);
    expect(cancelled.cards).toEqual([]);
    expect(cancelled.responseMode).toBe("chat_only");
    expect(cancelled.pendingAction).toBeUndefined();
    expect(cancelled.message.toLowerCase()).toContain("won't create");
    expect(createSavingsGoal).not.toHaveBeenCalled();
  });

  it("asks for missing savings goal details with model-written copy", async () => {
    const response = await runAIAgent(
      {
        message: "I want to save money for a big purchase",
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        actions: createSavingsGoalActions(),
      },
      createMockModelClient(),
    );

    expect(response.audit.usedModel).toBe(true);
    expect(response.usedTools).toEqual(["preview_savings_goal"]);
    expect(response.responseMode).toBe("clarify");
    expect(response.pendingAction).toMatchObject({
      type: "preview_savings_goal",
      name: "Big Purchase",
      missing: ["target_amount", "target_date_or_monthly_contribution"],
    });
  });

  it("previews complete savings goal requests before creation", async () => {
    const actions = createSavingsGoalActions();
    const createSavingsGoal = vi.spyOn(actions, "createSavingsGoal");

    const response = await runAIAgent(
      {
        message: "Emergency fund $5000 in 6 months",
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        actions,
      },
      createMockModelClient(),
    );

    expect(response.audit.usedModel).toBe(true);
    expect(response.usedTools).toEqual(["preview_savings_goal"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.pendingAction).toMatchObject({
      type: "ordinary_write",
      action: "create_savings_goal",
      confirmationKind: "contextual",
    });
    expect(response.cards).toEqual([
      expect.objectContaining({
        type: "savings_goal_preview",
        name: "Emergency Fund",
        targetAmountCents: 500000,
        includeInSpendableCash: true,
      }),
    ]);
    expect(createSavingsGoal).not.toHaveBeenCalled();
  });

  it("keeps one-turn savings requests preview-first even when the amount is present", async () => {
    const actions = createSavingsGoalActions();
    const createSavingsGoal = vi.spyOn(actions, "createSavingsGoal");

    const response = await runAIAgent(
      {
        message: "Create a savings goal for $5000 in six months",
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        actions,
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["preview_savings_goal"]);
    expect(response.cards[0]).toMatchObject({
      type: "savings_goal_preview",
      targetAmountCents: 500000,
    });
    expect(response.pendingAction).toMatchObject({
      type: "ordinary_write",
      action: "create_savings_goal",
    });
    expect(createSavingsGoal).not.toHaveBeenCalled();
  });

  it("routes bare-month savings details to a complete preview", () => {
    const forcedTool = __agentTestHooks.getForcedAgentTool({
      message: "$5,000 for a new computer in December",
    });

    expect(forcedTool).toMatchObject({
      toolName: "preview_savings_goal",
      args: {
        name: "Computer",
        target_amount_cents: 500000,
        include_in_spendable_cash: true,
      },
      requireCard: true,
    });
    expect((forcedTool?.args as { target_date?: string }).target_date).toMatch(/-12-31$/);
  });

  it("does not create a savings goal when target date or monthly contribution is missing", async () => {
    const actions = createSavingsGoalActions();
    const createSavingsGoal = vi.spyOn(actions, "createSavingsGoal");

    const response = await runAIAgent(
      {
        message: "I want to save for a computer that costs $5000",
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        actions,
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["preview_savings_goal"]);
    expect(response.responseMode).toBe("clarify");
    expect(response.pendingAction).toMatchObject({
      type: "preview_savings_goal",
      name: "Computer",
      targetAmountCents: 500000,
      missing: ["target_date_or_monthly_contribution"],
    });
    expect(createSavingsGoal).not.toHaveBeenCalled();
  });

  it("creates a savings goal only after a current preview confirmation", async () => {
    const preview = await runAIAgent(
      {
        message: "Emergency fund $5000 in 6 months",
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        actions: createSavingsGoalActions(),
      },
      createMockModelClient(),
    );

    const created = await runAIAgent(
      {
        message: "yes, create it",
        conversationState: { pendingAction: preview.pendingAction },
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        actions: createSavingsGoalActions(),
      },
      createMockModelClient(),
    );

    expect(created.audit.usedModel).toBe(true);
    expect(created.usedTools).toEqual(["create_savings_goal"]);
    expect(created.responseMode).toBe("show_card");
    expect(created.cards).toEqual([
      expect.objectContaining({
        type: "savings_goal_plan",
        targetAmountCents: 500000,
      }),
    ]);
  });

  it("requires model configuration for normal visible savings turns without a runtime", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    await expect(runAIAgent({
      message: "I want to save for a trip that costs $5,000",
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
    })).rejects.toMatchObject({
      code: "missing-openai-config",
    });
  });

  it("does not expose savings goal protection from spendable-cash wording", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Keep my trip goal out of Spendable Cash",
      })?.toolName,
    ).not.toBe("set_savings_goal_protection");
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
      ["what have I been buying?", "get_recent_transactions"],
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

  it("routes explicit bill corrections to the recurring obligation correction tool", () => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Treat City Power as a monthly bill",
      }),
    ).toMatchObject({
      toolName: "correct_recurring_obligation",
      args: {
        merchant_name: "City Power",
        treatment: "bill",
      },
      requireCard: false,
    });
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Target is not a bill",
      }),
    ).toMatchObject({
      toolName: "correct_recurring_obligation",
      args: {
        merchant_name: "Target",
        treatment: "not_bill",
      },
      requireCard: false,
    });
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "My phone bill is usually $80 on the 15th",
      }),
    ).toMatchObject({
      toolName: "correct_recurring_obligation",
      args: {
        merchant_name: "phone",
        treatment: "bill",
        expected_amount_cents: 8000,
        expected_day: 15,
      },
      requireCard: false,
    });
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Treat City Power as a monthly bill around the 3rd",
      }),
    ).toMatchObject({
      toolName: "correct_recurring_obligation",
      args: {
        merchant_name: "City Power",
        treatment: "bill",
        expected_day: 3,
      },
      requireCard: false,
    });
    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Treat City Power as an $84 monthly bill due the 3rd",
      }),
    ).toMatchObject({
      toolName: "correct_recurring_obligation",
      args: {
        merchant_name: "City Power",
        treatment: "bill",
        expected_amount_cents: 8400,
        expected_day: 3,
      },
      requireCard: false,
    });
  });

  it("requires model configuration before saving bill corrections from chat", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");
    const correctRecurringObligation = vi.fn(async () => ({
      ok: true,
      status: "recurring_obligation_confirmed",
      clientAction: {
        type: "reload" as const,
      },
    }));

    await expect(runAIAgent({
      message: "Treat City Power as a monthly bill",
      actions: {
        correctRecurringObligation,
      } satisfies Partial<PipAgentActions>,
    })).rejects.toMatchObject({
      code: "missing-openai-config",
    });

    expect(correctRecurringObligation).not.toHaveBeenCalled();
  });

  it("requires model configuration before showing connected accounts from chat", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    await expect(runAIAgent({
      message: "Show my bank accounts",
      actions: {
        getConnectedAccounts: async () => ({
          ok: true,
          status: "connected_accounts",
          cards: [accountConnectionsCard()],
        }),
      } satisfies Partial<PipAgentActions>,
    })).rejects.toMatchObject({
      code: "missing-openai-config",
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

  it("answers platform pricing prompts with the public web price", async () => {
    const response = await runAIAgent(
      {
        message: "How much does Pip cost?",
        platform: "web",
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_trust_policy"]);
    expect(response.message).toContain("$7.99/month");
    expect(response.message).toContain("Stripe");
  });

  it("returns a billing management card for Pip cancellation prompts", async () => {
    const response = await runAIAgent({
      message: "I need to cancel my Pip subscription",
    });

    expect(response.usedTools).toEqual(["get_trust_policy"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.message).toBe("Stripe handles Pip subscription billing.");
    expect(response.cards).toEqual([
      {
        type: "billing_management",
        title: "Manage billing",
        body: "Stripe handles Pip subscription billing.",
        action: {
          label: "Open billing",
          endpoint: "/api/billing/portal",
        },
      },
    ]);
  });

  it("requires model configuration before answering unrelated platform cost prompts", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");

    await expect(runAIAgent({ message: "What does the browser cost?" })).rejects.toMatchObject({
      code: "missing-openai-config",
    });
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

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Manage accounts",
        selectedPromptChipId: "settings-connected-accounts",
      }),
    ).toMatchObject({
      toolName: "get_connected_accounts",
      requireCard: true,
    });

    expect(
      __agentTestHooks.getForcedAgentTool({
        message: "Manage connected accounts",
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

  it("rejects retired savings protection pending actions at the response boundary", () => {
    const baseResponse = {
      message: "Draft.",
      cards: [],
      promptChips: [],
      usedTools: [],
      responseMode: "chat_only",
      audit: {
        toolNames: [],
        usedModel: true,
      },
    };

    expect(() =>
      agentResponseSchema.parse({
        ...baseResponse,
        pendingAction: {
          type: "set_savings_goal_protection",
          includeInSpendableCash: true,
        },
      }),
    ).toThrow();

    expect(() =>
      agentResponseSchema.parse({
        ...baseResponse,
        pendingAction: {
          type: "preview_savings_goal",
          name: "Trip",
          missing: ["protection_choice"],
        },
      }),
    ).toThrow();
  });

  it("drops oversized optional guidance drafts at the final output boundary", () => {
    const parsed = agentFinalOutputSchema.parse({
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
      });

    expect(__agentTestHooks.normalizeAgentFinalOutput(parsed).guidanceCardDraft).toBeUndefined();
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

  it("returns model-written silent prompt-chip refresh responses", async () => {
    const response = await runAIAgent(
      {
        message: "Create prompt chips for the current Pip screen.",
        requestKind: "prompt_chips",
        snapshot: fakeSnapshot,
        conversationState: {
          shownCards: [],
          lastToolNames: [],
          promptChips: [],
        },
      },
      createMockModelClient(),
    );

    expect(response.responseMode).toBe("chat_only");
    expect(response.cards).toEqual([]);
    expect(response.usedTools).toEqual([]);
    expect(response.promptChips).toHaveLength(3);
    expect(response.audit.usedModel).toBe(true);
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

  it("repairs Pip claiming the user's Spendable Cash Today as its own", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "I set up the goal, and it will be included in my Spendable Cash Today.",
      ),
    ).toBe("I set up the goal, and it will be included in your Spendable Cash Today.");
  });

  it("repairs guaranteed purchase simulation language before showing it", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "You can spend $50. Purchase simulation shows after spending $50 today you’d have $54 left.",
        [purchaseSimulationCard()],
      ),
    ).toBe("Testing $50: Purchase simulation shows after spending $50 today you’d have $54 left.");
  });

  it("removes trailing follow-up questions from card replies", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "Testing $50: After that, Spendable Cash Today would be about $54 remaining. Looks fine, though data quality is a bit low and one card may be missing. Want me to run a quick check on that card or test another amount?",
        [purchaseSimulationCard()],
      ),
    ).toBe(
      "Testing $50: After that, Spendable Cash Today would be about $54 remaining. Looks fine, though data quality is a bit low and one card may be missing.",
    );
  });

  it("repairs transaction counts when no transaction card is returned", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "The rest seems present, with 3 accounts and 22 transactions.",
        [{ type: "missing_card_nudge", title: "Possible missing card", detail: "Missing card." }],
      ),
    ).toBe("The rest seems present, with 3 accounts and connected activity.");
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

  it("drops invalid optional guidance card drafts instead of rejecting the whole final output", () => {
    const parsed = agentFinalOutputSchema.parse({
      message: "I found the biggest drivers behind today's number.",
      responseMode: "show_card",
      guidanceCardDraft: {
        title: "My read",
        stance: "watch",
        summary: "Recent spending is moving the number.",
        rows: [
          {
            label: "Recent spending",
            detail: "Shopping is up this period.",
            tone: "warning",
            evidenceIds: [],
          },
        ],
      },
      promptChips: [],
    });

    expect(__agentTestHooks.normalizeAgentFinalOutput(parsed).guidanceCardDraft).toBeUndefined();
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

  it("allows malformed prompt chip objects at the raw model boundary", () => {
    const parsed = agentFinalOutputSchema.parse({
      message: "Short draft.",
      responseMode: "chat_only",
      promptChips: [{ label: "Forecast next week" }],
    });

    expect(parsed.promptChips).toEqual([{ label: "Forecast next week" }]);
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

  it("repairs breakdown wording when a recent transactions card carries the detail", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "I can show a quick breakdown of what you bought lately.",
        [{ type: "recent_transactions", title: "Recent transactions", transactions: [] }],
      ),
    ).toBe("I can talk through a quick summary of what you bought lately.");
  });

  it("repairs cardless breakdown-card offers", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "Nice to meet you! I see your Spendable Cash Today is $104. I don’t have a breakdown card yet, but I can pull the biggest drivers for you.",
      ),
    ).toBe(
      "Nice to meet you! Your Spendable Cash Today is $104. I can talk through the biggest factors.",
    );

    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "I can help with that. Right now, Spendable Cash Today is tight at $2. The biggest pressure comes from Normal room and Monthly savings, plus recent spending adjustments. I don’t see a concrete cutback opportunity yet, but I can pull up a detailed breakdown if",
      ),
    ).toBe(
      "I can help with that. Right now, Spendable Cash Today is tight at $2. The biggest pressure comes from Normal room and Monthly savings, plus recent spending adjustments. I don’t have a concrete cutback opportunity yet, but I can talk through the details",
    );

    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "Here’s where you can cut back. I don’t have a specific opportunity yet, but you can ask: What can I cut back on from my recent spending? Alternatively, I can show you today’s spend drivers and next bills to spot pressure.",
      ),
    ).toBe(
      "Here’s where you can cut back. I don’t have a specific opportunity yet, but you can ask: What can I cut back on from my recent spending? Alternatively, I can talk through today’s spend factors and next bills to spot pressure.",
    );
  });

  it("repairs data-quality activity promises when only a connect-account card is returned", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "I found data is marked as a low-confidence early estimate. The app shows 3 connected accounts, connected activity, and no completed two-month history yet.",
        [{ type: "connect_account", title: "Connect or repair data", detail: "Connect data." }],
      ),
    ).toBe(
      "I found data is marked as a low-confidence early estimate. The app has 3 connected accounts, connected data, and no completed two-month history yet.",
    );
  });

  it("repairs read-only policy display offers without cards", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "I can’t pay bills directly, but I can help you manage them. I can connect to your bills list, show upcoming charges, or help you plan how to cover them with your Spendable Cash Today.",
      ),
    ).toBe(
      "I can’t pay bills directly, but I can help you manage them. I can connect to your bills, talk through upcoming activity, or help you plan how to cover them with your Spendable Cash Today.",
    );
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
  it("uses the direct OpenAI default", () => {
    expect(getPipAiModel({})).toBe(PIP_AI_MODEL);
  });

  it("lets an explicit PIP_AI_MODEL override the default", () => {
    expect(
      getPipAiModel({
        OPENAI_BASE_URL: "https://llm-gateway.example/v1",
        PIP_AI_MODEL: "custom-model",
      }),
    ).toBe("custom-model");
  });

  it("uses a harmless SDK placeholder key when an OpenAI-compatible base URL supplies auth elsewhere", () => {
    expect(
      getOpenAIApiKeyForSdk({
        OPENAI_BASE_URL: "https://llm-gateway.example/v1",
      }),
    ).toBe("openai-compatible");
  });

  it("classifies OpenAI base URL env as an OpenAI-compatible transport", () => {
    expect(
      getOpenAIClientConfig({
        OPENAI_API_KEY: "custom-key",
        OPENAI_BASE_URL: "https://llm-gateway.example/v1",
      }),
    ).toEqual({
      apiKey: "custom-key",
      baseURL: "https://llm-gateway.example/v1",
      transport: "custom-openai-compatible",
    });
  });

  it("uses direct OpenAI when only an API key is configured", () => {
    expect(
      getOpenAIClientConfig({
        OPENAI_API_KEY: "direct-openai-key",
      }),
    ).toEqual({
      apiKey: "direct-openai-key",
      transport: "openai-direct",
    });
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

function purchaseSimulationCard(): AgentCard {
  return {
    type: "purchase_simulation",
    title: "Purchase simulation",
    amountCents: 5000,
    beforeCents: 10400,
    todayRemainingCents: 5400,
    todayOverageCents: 0,
    afterTodayCents: 5400,
    monthlyAverageAfterCents: 0,
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
        includeInSpendableCash: input.includeInSpendableCash ?? true,
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
