import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";
import {
  FREE_CASH_AI_MODEL,
  NETLIFY_AI_GATEWAY_MODEL,
  createMockModelClient,
  getFreeCashAiTransport,
  getFreeCashAiModel,
  getOpenAIClientConfig,
  getOpenAIApiKeyForSdk,
  type AgentHistoryItem,
  type OpenAIResponsesClient,
  runAIAgent,
} from "@/lib/agent/ai-agent";
import type { AgentToolName } from "@/lib/agent/tool-runner";
import type { FinancialSnapshot } from "@/lib/types";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runAIAgent", () => {
  it("uses a mocked OpenAI tool call to simulate a purchase", async () => {
    const response = await runAIAgent(
      { message: "Can I buy dinner for $75?" },
      createAgentClient(
        "simulate_purchase",
        { amount_cents: 7500 },
        "Dinner would leave Free Cash at -$32 today.",
      ),
    );

    expect(response.audit.usedModel).toBe(true);
    expect(response.audit.model).toBe(FREE_CASH_AI_MODEL);
    expect(response.audit.toolNames).toEqual(["simulate_purchase"]);
    expect(response.message).toBe("Dinner would leave Free Cash at -$32 today.");
    expect(response.cards[0]?.type).toBe("purchase_simulation");

    const card = response.cards[0];
    if (card?.type === "purchase_simulation") {
      expect(card.amountCents).toBe(7500);
      expect(card.beforeCents).toBe(4300);
      expect(card.afterTodayCents).toBe(-3200);
    }
  });

  it("uses the Responses API contract for tool routing and structured final output", async () => {
    const calls: ResponseCreateParamsNonStreaming[] = [];

    await runAIAgent(
      {
        message: "Can I buy lunch for $12?",
        history: [
          {
            role: "user",
            content: "Why this number?",
          },
          {
            role: "assistant",
            content: "Rent is the biggest driver.",
          },
        ],
      },
      createAgentClient(
        "simulate_purchase",
        { amount_cents: 1200 },
        "Lunch would leave Free Cash at $31 today.",
        calls,
      ),
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      tool_choice: "required",
      parallel_tool_calls: false,
      store: false,
    });
    expect(calls[0]?.tools?.map((tool) => ("name" in tool ? tool.name : ""))).toContain(
      "simulate_purchase",
    );
    expect(calls[0]?.tools?.every((tool) => tool.type === "function")).toBe(true);
    expect(JSON.stringify(calls[0]?.input)).toContain("Rent is the biggest driver.");

    expect(calls[1]?.tools).toBeUndefined();
    expect(calls[1]?.store).toBe(false);
    expect(calls[1]?.text?.format).toMatchObject({
      type: "json_schema",
      name: "free_cash_final_message",
      strict: true,
    });
    expect(JSON.stringify(calls[1]?.input)).toContain("purchase_simulation");
  });

  it("uses recent conversation to answer short purchase follow-ups", async () => {
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
            content: "That would move Free Cash from $43 to -$7 today.",
          },
        ],
      },
      createMockModelClient(),
    );

    expect(response.audit.toolNames).toEqual(["simulate_purchase"]);
    expect(response.message).toContain("$20");
    expect(response.cards[0]).toMatchObject({
      type: "purchase_simulation",
      amountCents: 2000,
    });
  });

  it("grounds explicit purchase dollars when the model misreads the amount", async () => {
    const response = await runAIAgent(
      { message: "I want tacos. What does $17 do to my day?" },
      createAgentClient(
        "simulate_purchase",
        { amount_cents: 700 },
        "Tacos would leave Free Cash at $26 today.",
      ),
    );

    expect(response.cards[0]).toMatchObject({
      type: "purchase_simulation",
      amountCents: 1700,
      beforeCents: 4300,
      afterTodayCents: 2600,
    });
  });

  it("prefers the spending amount over a nearby balance amount", async () => {
    const response = await runAIAgent(
      { message: "I have a $100 balance, but can I spend $20 on lunch?" },
      createAgentClient(
        "simulate_purchase",
        { amount_cents: 10000 },
        "Lunch would leave Free Cash at $23 today.",
      ),
    );

    expect(response.cards[0]).toMatchObject({
      type: "purchase_simulation",
      amountCents: 2000,
      beforeCents: 4300,
      afterTodayCents: 2300,
    });
  });

  it("does not invent a default purchase amount for vague spending questions", async () => {
    const response = await runAIAgent(
      {
        message: "Can I spend something today?",
      },
      createMockModelClient(),
    );

    expect(response.audit.toolNames).toEqual(["answer_unrelated"]);
    expect(response.cards).toHaveLength(0);
    expect(response.message).toContain("Spendable question");
  });

  it("does not pass raw transaction histories into normal explanation model calls", async () => {
    const calls: ResponseCreateParamsNonStreaming[] = [];

    await runAIAgent(
      {
        message: "Why this number?",
        snapshot: sensitiveSnapshot,
      },
      createAgentClient(
        "explain_free_cash",
        {},
        "Spending is the main pressure on Free Cash.",
        calls,
      ),
    );

    const allModelInputs = JSON.stringify(calls.map((call) => call.input));

    expect(calls).toHaveLength(2);
    expect(allModelInputs).toContain("free_cash_explanation");
    expect(allModelInputs).not.toContain("PRIVATE MEDICAL PAYMENT");
    expect(allModelInputs).not.toContain("Sensitive Clinic");
  });

  it("bounds conversation history before both model calls", async () => {
    const calls: ResponseCreateParamsNonStreaming[] = [];
    const history = Array.from({ length: 10 }, (_, index): AgentHistoryItem => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `history-${index} ${"x".repeat(520)} HISTORY_TAIL_SHOULD_NOT_SEND_${index}`,
    }));

    await runAIAgent(
      {
        message: "Why this number?",
        history,
      },
      createAgentClient(
        "explain_free_cash",
        {},
        "Spending is the main pressure on Free Cash.",
        calls,
      ),
    );

    const allModelInputs = JSON.stringify(calls.map((call) => call.input));

    expect(calls).toHaveLength(2);
    expect(allModelInputs).not.toContain("history-0");
    expect(allModelInputs).not.toContain("history-1");
    expect(allModelInputs).toContain("history-2");
    expect(allModelInputs).toContain("history-9");
    expect(allModelInputs).not.toContain("HISTORY_TAIL_SHOULD_NOT_SEND");
  });

  it("keeps recent-transaction final-message grounding summarized while returning exact UI card rows", async () => {
    const calls: ResponseCreateParamsNonStreaming[] = [];

    const response = await runAIAgent(
      {
        message: "Show recent transactions",
        snapshot: transactionHeavySnapshot,
      },
      createAgentClient(
        "show_recent_transactions",
        { limit: 12 },
        "Here are the recent items currently shaping Free Cash.",
        calls,
      ),
    );

    const finalModelInput = JSON.stringify(calls[1]?.input);

    expect(response.cards[0]).toMatchObject({
      type: "recent_transactions",
      transactions: expect.arrayContaining([
        expect.objectContaining({
          description: "Merchant 0",
        }),
        expect.objectContaining({
          description: "Merchant 11",
        }),
      ]),
    });
    expect(finalModelInput).toContain("recent_transactions");
    expect(finalModelInput).toContain("transaction_count");
    expect(finalModelInput).toContain("-$120.66");
    expect(finalModelInput).not.toContain("Merchant 0");
    expect(finalModelInput).not.toContain("Merchant 11");
    expect(finalModelInput).not.toContain("Merchant 12");
    expect(finalModelInput).not.toContain("Merchant 19");
  });

  it("uses a mocked OpenAI tool call to reveal true balances", async () => {
    const response = await runAIAgent(
      { message: "What are my actual balances?" },
      createAgentClient("show_true_balances", {}, "The card shows the raw balances behind Free Cash."),
    );

    expect(response.audit.usedModel).toBe(true);
    expect(response.message).toBe("The card shows the raw balances behind Free Cash.");
    expect(response.cards[0]?.type).toBe("true_balances");
  });

  it("replaces safe-to-spend and advisor-style final wording with deterministic tool text", async () => {
    const response = await runAIAgent(
      { message: "Can I spend $50?" },
      createAgentClient(
        "simulate_purchase",
        { amount_cents: 5000 },
        "It is safe to spend this, and I recommend buying it.",
      ),
    );

    expect(response.message).toBe("That would move Free Cash from $43 to -$7 today.");
    expect(response.message.toLowerCase()).not.toContain("safe to spend");
    expect(response.message.toLowerCase()).not.toContain("recommend");
  });

  it("replaces invented dashboard wording with deterministic tool text", async () => {
    const response = await runAIAgent(
      { message: "hi" },
      createAgentClient(
        "answer_unrelated",
        {},
        "Your current Free Cash balance is shown in your dashboard, and you can review transactions there.",
      ),
    );

    expect(response.message).toBe(
      "I can help with Spendable questions about spending, balances, transactions, missing cards, or the current Free Cash number.",
    );
    expect(response.message.toLowerCase()).not.toContain("dashboard");
  });

  it("rejects when OpenAI is not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");
    vi.stubEnv("FREE_CASH_AI_MODE", "");

    await expect(runAIAgent({ message: "Can I spend $50?" })).rejects.toMatchObject({
      code: "missing-openai-config",
    });
  });

  it("rejects if the model returns no tool call", async () => {
    await expect(
      runAIAgent({ message: "Can I spend $50?" }, createNoToolClient()),
    ).rejects.toMatchObject({
      code: "model-returned-no-tool-call",
    });
  });

  it("rejects if the model returns multiple tool calls", async () => {
    await expect(
      runAIAgent({ message: "Can I spend $50?" }, createMultipleToolClient()),
    ).rejects.toMatchObject({
      code: "model-returned-multiple-tool-calls",
    });
  });

  it("rejects if the model omits required deterministic tool arguments", async () => {
    await expect(
      runAIAgent(
        { message: "Can I spend something today?" },
        createAgentClient("simulate_purchase", {}, "Sure."),
      ),
    ).rejects.toMatchObject({
      code: "model-returned-invalid-tool-arguments",
      status: 502,
    });
  });

  it("rejects malformed model tool arguments instead of using local defaults", async () => {
    await expect(
      runAIAgent({ message: "Can I spend $50?" }, createMalformedToolArgumentsClient()),
    ).rejects.toMatchObject({
      code: "model-returned-invalid-tool-arguments",
      status: 502,
    });
  });

  it("uses a mocked OpenAI tool call to answer unrelated input", async () => {
    const response = await runAIAgent(
      { message: "purple toaster weather balloon" },
      createAgentClient("answer_unrelated", {}, "I can help once you ask about Spendable."),
    );

    expect(response.audit.usedModel).toBe(true);
    expect(response.audit.toolNames).toEqual(["answer_unrelated"]);
    expect(response.cards).toHaveLength(0);
    expect(response.message).toBe("I can help once you ask about Spendable.");
  });

  it("rejects if the model cannot write the final message", async () => {
    await expect(
      runAIAgent(
        { message: "Can I spend $50?" },
        createAgentClient("simulate_purchase", { amount_cents: 5000 }, ""),
      ),
    ).rejects.toMatchObject({
      code: "model-returned-empty-final-message",
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

function createAgentClient(
  toolName: AgentToolName,
  args: Record<string, unknown>,
  finalMessage: string,
  calls?: ResponseCreateParamsNonStreaming[],
): OpenAIResponsesClient {
  let callCount = 0;

  return {
    responses: {
      async create(params) {
        calls?.push(params);
        callCount += 1;

        if (callCount > 1) {
          return createFinalMessageResponse(finalMessage);
        }

        return createToolCallResponse(toolName, args);
      },
    },
  };
}

function createNoToolClient(): OpenAIResponsesClient {
  return {
    responses: {
      async create() {
        return createTextResponse("No tool call.");
      },
    },
  };
}

function createMultipleToolClient(): OpenAIResponsesClient {
  return {
    responses: {
      async create() {
        return createResponse({
          output: [
            createFunctionCall("simulate_purchase", { amount_cents: 5000 }, "mock-tool-call-1"),
            createFunctionCall("show_math", {}, "mock-tool-call-2"),
          ],
        });
      },
    },
  };
}

function createMalformedToolArgumentsClient(): OpenAIResponsesClient {
  return {
    responses: {
      async create() {
        return createResponse({
          output: [
            {
              id: "mock-tool-call",
              type: "function_call",
              call_id: "mock-tool-call",
              name: "simulate_purchase",
              arguments: "{",
              status: "completed",
            },
          ],
        });
      },
    },
  };
}

function createToolCallResponse(
  toolName: AgentToolName,
  args: Record<string, unknown>,
): Response {
  return createResponse({
    output: [createFunctionCall(toolName, args, "mock-tool-call")],
  });
}

function createFunctionCall(
  toolName: AgentToolName,
  args: Record<string, unknown>,
  callId: string,
): Response["output"][number] {
  return {
    id: callId,
    type: "function_call",
    call_id: callId,
    name: toolName,
    arguments: JSON.stringify(args),
    status: "completed",
  };
}

function createFinalMessageResponse(finalMessage: string): Response {
  const outputText = finalMessage ? JSON.stringify({ message: finalMessage }) : "";
  return createTextResponse(outputText);
}

function createTextResponse(outputText: string): Response {
  return createResponse({
    outputText,
    output: [
      {
        id: "mock-final-message",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: outputText,
            annotations: [],
          },
        ],
      },
    ],
  });
}

function createResponse(input: {
  output?: Response["output"];
  outputText?: string;
} = {}): Response {
  return {
    id: "mock-response",
    object: "response",
    created_at: 0,
    model: FREE_CASH_AI_MODEL,
    output_text: input.outputText ?? "",
    output: input.output ?? [],
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    parallel_tool_calls: false,
    temperature: null,
    tool_choice: "auto",
    tools: [],
    top_p: null,
  } as Response;
}

const sensitiveSnapshot: FinancialSnapshot = {
  settings: {
    asOfDate: "2026-06-20",
    protectedSavingsMonthlyCents: 0,
  },
  accounts: [
    {
      id: "checking",
      name: "Everyday Checking",
      institutionName: "Plaid Bank",
      kind: "checking",
      balanceCents: 100000,
    },
  ],
  transactions: [
    {
      id: "income",
      accountId: "checking",
      date: "2026-06-10",
      description: "Payroll",
      amountCents: 200000,
      kind: "income",
    },
    {
      id: "sensitive-purchase",
      accountId: "checking",
      date: "2026-06-12",
      description: "PRIVATE MEDICAL PAYMENT",
      merchantName: "Sensitive Clinic",
      amountCents: -25000,
      kind: "purchase",
    },
  ],
};

const transactionHeavySnapshot: FinancialSnapshot = {
  settings: {
    asOfDate: "2026-06-20",
    protectedSavingsMonthlyCents: 0,
  },
  accounts: [
    {
      id: "checking",
      name: "Everyday Checking",
      institutionName: "Plaid Bank",
      kind: "checking",
      balanceCents: 100000,
    },
  ],
  transactions: Array.from({ length: 20 }, (_, index) => ({
    id: `tx-${index}`,
    accountId: "checking",
    date: `2026-06-${String(20 - index).padStart(2, "0")}`,
    description: `Merchant ${index}`,
    amountCents: -1000 - index,
    kind: "purchase" as const,
  })),
};
