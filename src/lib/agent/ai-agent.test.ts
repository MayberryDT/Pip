import { afterEach, describe, expect, it, vi } from "vitest";
import { agentFinalOutputSchema, agentMessageMaxChars, agentResponseSchema, cardSchema } from "@/lib/agent/response-schema";
import {
  FREE_CASH_AI_MODEL,
  NETLIFY_AI_GATEWAY_MODEL,
  getFreeCashAiTransport,
  getFreeCashAiModel,
  getOpenAIClientConfig,
  getOpenAIApiKeyForSdk,
  runAIAgent,
  __agentTestHooks,
} from "@/lib/agent/ai-agent";
import { createMockModelClient } from "../../../tests/helpers/mock-agent-runtime";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runAIAgent", () => {
  it("answers greetings conversationally without forcing a tool or card", async () => {
    const response = await runAIAgent(
      { message: "hi" },
      createMockModelClient(),
    );

    expect(response.audit.usedModel).toBe(true);
    expect(response.audit.model).toBe(FREE_CASH_AI_MODEL);
    expect(response.usedTools).toEqual([]);
    expect(response.audit.toolNames).toEqual([]);
    expect(response.responseMode).toBe("chat_only");
    expect(response.cards).toHaveLength(0);
    expect(response.message.toLowerCase()).not.toContain("dashboard");
  });

  it("shows the Spendable Cash explanation card the first time the user asks why", async () => {
    const response = await runAIAgent(
      { message: "Why this number?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_free_cash_drivers"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]?.type).toBe("free_cash_explanation");
  });

  it("does not repeat the same explanation card for an immediate vague follow-up", async () => {
    const response = await runAIAgent(
      {
        message: "But why?",
        conversationState: {
          shownCards: [
            {
              type: "free_cash_explanation",
              title: "Why this number changed",
            },
          ],
          lastToolNames: ["get_free_cash_drivers"],
        },
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual([]);
    expect(response.responseMode).toBe("chat_only");
    expect(response.cards).toHaveLength(0);
  });

  it("calls the purchase simulation tool when the user asks about a specific spend", async () => {
    const result = calculateFreeCash(fakeSnapshot);
    const response = await runAIAgent(
      { message: "Can I spend $40?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["simulate_purchase"]);
    expect(response.cards[0]).toMatchObject({
      type: "purchase_simulation",
      amountCents: 4000,
      beforeCents: result.spendableCashToday?.spendableCashTodayCents,
      todayRemainingCents: (result.spendableCashToday?.spendableCashTodayCents ?? 0) - 4000,
      todayOverageCents: Math.max(0, 4000 - (result.spendableCashToday?.spendableCashTodayCents ?? 0)),
      afterTodayCents: expect.any(Number),
      dailyEffectCents: expect.any(Number),
    });
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

    expect(response.usedTools).toEqual(["get_free_cash_snapshot"]);
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
    expect(mathResponse.usedTools).toEqual(["get_free_cash_math"]);
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

    expect(whyResponse.usedTools).toEqual(["get_free_cash_drivers"]);
    expect(whyResponse.cards[0]).toMatchObject({
      type: "free_cash_explanation",
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
      toolName: "get_free_cash_drivers",
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
      calculateFreeCash(fakeSnapshot),
      {
        input: {
          message: "I can help.",
        },
        cards: [],
        usedTools: [],
      },
    );

    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-what-number-means",
      "ai-why-today",
      "ai-teach-money-basic",
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
      calculateFreeCash(fakeSnapshot),
      {
        input: {
          message: "I can help.",
        },
        cards: [],
        usedTools: [],
      },
    );

    expect(plan.chips.map((chip) => chip.label)).toEqual([
      "What does my $104 mean?",
      "Why is it $104 today?",
      "Teach me a money basic",
    ]);
    expect(plan.chips[1]?.prompt).toBe("Show the biggest drivers behind today's number");
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
      calculateFreeCash(fakeSnapshot),
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
      "What does my $104 mean?",
      "Why is it $104 today?",
      "Teach me a money basic",
    ]);
  });

  it("accepts longer human-facing prompt chip labels at the schema boundary", () => {
    expect(
      agentFinalOutputSchema.parse({
        message: "I can answer that.",
        responseMode: "chat_only",
        promptChips: [
          {
            id: "ai-spending-basic",
            label: "How should I think about spending?",
            prompt: "How should I think about spending?",
          },
        ],
      }).promptChips[0]?.label,
    ).toBe("How should I think about spending?");
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
    ).toContain("forecast hints");
  });

  it("allows suggestion-menu replies that mention transactions without returning a card", () => {
    expect(
      __agentTestHooks.guardVisibleFinalMessage(
        "You could ask to see recent transactions, check upcoming bills, or test a purchase amount.",
      ),
    ).toContain("recent transactions");
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
    expect(getFreeCashAiModel({})).toBe(FREE_CASH_AI_MODEL);
  });

  it("uses a Netlify AI Gateway supported default when OPENAI_BASE_URL is present", () => {
    expect(
      getFreeCashAiModel({
        OPENAI_BASE_URL: "https://example.netlify.app/.netlify/ai",
      }),
    ).toBe(NETLIFY_AI_GATEWAY_MODEL);
  });

  it("uses a Netlify AI Gateway supported default when Netlify injects gateway env", () => {
    expect(
      getFreeCashAiModel({
        NETLIFY_AI_GATEWAY_BASE_URL: "https://api.netlify.com/ai/v1",
        NETLIFY_AI_GATEWAY_KEY: "netlify-key",
      }),
    ).toBe(NETLIFY_AI_GATEWAY_MODEL);
  });

  it("lets an explicit FREE_CASH_AI_MODEL override either deployment default", () => {
    expect(
      getFreeCashAiModel({
        OPENAI_BASE_URL: "https://example.netlify.app/.netlify/ai",
        FREE_CASH_AI_MODEL: "custom-model",
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
        FREE_CASH_AI_TRANSPORT: "custom-openai-compatible",
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
      getFreeCashAiTransport({
        OPENAI_API_KEY: "direct-openai-key",
        NETLIFY_AI_GATEWAY_BASE_URL: "https://api.netlify.com/ai/v1",
        NETLIFY_AI_GATEWAY_KEY: "netlify-key",
      }),
    ).toBe("netlify-ai-gateway");
  });
});
