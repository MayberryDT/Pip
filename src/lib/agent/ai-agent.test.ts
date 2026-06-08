import { afterEach, describe, expect, it, vi } from "vitest";
import { agentFinalOutputSchema, agentMessageMaxChars } from "@/lib/agent/response-schema";
import {
  FREE_CASH_AI_MODEL,
  NETLIFY_AI_GATEWAY_MODEL,
  getFreeCashAiTransport,
  getFreeCashAiModel,
  getOpenAIClientConfig,
  getOpenAIApiKeyForSdk,
  runAIAgent,
} from "@/lib/agent/ai-agent";
import { createMockModelClient } from "../../../tests/helpers/mock-agent-runtime";

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
              title: "Why Spendable Cash changed",
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
    const response = await runAIAgent(
      { message: "Can I spend $40?" },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["simulate_purchase"]);
    expect(response.cards[0]).toMatchObject({
      type: "purchase_simulation",
      amountCents: 4000,
      beforeCents: 4300,
      afterTodayCents: 300,
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
      afterTodayCents: 2300,
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

  it("rejects long visible final messages at the structured output boundary", () => {
    expect(() =>
      agentFinalOutputSchema.parse({
        message: "x".repeat(agentMessageMaxChars + 1),
        responseMode: "chat_only",
        promptChips: [],
      }),
    ).toThrow();
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
