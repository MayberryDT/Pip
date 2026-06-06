import OpenAI from "openai";
import type {
  FunctionTool,
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseFunctionToolCall,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import { z } from "zod";
import type { AgentCard, AgentResponse } from "@/lib/agent/card-types";
import { agentResponseSchema } from "@/lib/agent/response-schema";
import {
  type AgentToolName,
  isAgentToolName,
  runAgentTool,
} from "@/lib/agent/tool-runner";
import { formatMoney, formatMoneyWithCents } from "@/lib/money";
import type { FinancialSnapshot } from "@/lib/types";

export const FREE_CASH_AI_MODEL = "gpt-5-nano";
export const NETLIFY_AI_GATEWAY_MODEL = "gpt-5-nano";

type AiTransport = NonNullable<AgentResponse["audit"]["transport"]>;

type OpenAIClientConfig = {
  apiKey?: string;
  baseURL?: string;
  transport: AiTransport;
};

export type RunAiAgentInput = {
  message: string;
  snapshot?: FinancialSnapshot;
  history?: AgentHistoryItem[];
};

export type AgentHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type OpenAIResponsesClient = {
  responses: {
    create: (params: ResponseCreateParamsNonStreaming) => Promise<Response>;
  };
};

export class AgentUnavailableError extends Error {
  code: string;
  status: number;
  detail?: string;

  constructor(input: {
    code: string;
    message: string;
    status?: number;
    detail?: string;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "AgentUnavailableError";
    this.code = input.code;
    this.status = input.status ?? 503;
    this.detail = input.detail;
    this.cause = input.cause;
  }
}

export type AgentErrorPayload = {
  code: string;
  error: string;
  detail?: string;
  status: number;
};

const freeCashTools: FunctionTool[] = [
  {
    type: "function",
    name: "explain_free_cash",
    description:
      "Explain the current Free Cash number using deterministic app results. Use when the user asks why, what changed, or what the number means.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "simulate_purchase",
    description:
      "Simulate the consequence of a user spending a specific amount. Use when the user asks if they can buy, spend, order, or afford something.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        amount_cents: {
          type: "integer",
          minimum: 1,
          maximum: 1000000,
          description: "The purchase amount in cents. Infer it from the user's message.",
        },
      },
      required: ["amount_cents"],
    },
  },
  {
    type: "function",
    name: "show_true_balances",
    description:
      "Show actual account balances. Use only when the user explicitly asks for real balances or account balances.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "show_recent_transactions",
    description:
      "Show recent transactions affecting the current rolling window. Use when the user asks for recent transactions, charges, purchases, or activity.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 12,
          description: "Maximum number of transactions to return.",
        },
      },
      required: ["limit"],
    },
  },
  {
    type: "function",
    name: "detect_missing_card",
    description:
      "Explain a likely unconnected credit-card payment or missing card nudge. Use when the user asks about missing cards, connecting cards, or accuracy.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "show_math",
    description:
      "Show the deterministic math breakdown. Use only when the user explicitly asks for math, formula, or calculation details.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "answer_unrelated",
    description:
      "Respond when the user input is unrelated, ambiguous, a greeting, nonsense, or not answerable by the Spendable app tools.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
];

const finalMessageSchema = z.object({
  message: z.string().min(1).max(420),
});

export async function runAIAgent(
  input: RunAiAgentInput,
  client?: OpenAIResponsesClient,
): Promise<AgentResponse> {
  if (!client && !shouldUseModel()) {
    throw new AgentUnavailableError({
      code: "missing-openai-config",
      message: "AI is not configured.",
      detail: "Set OPENAI_API_KEY, OPENAI_BASE_URL, or enable Netlify AI Gateway before using the agent.",
    });
  }

  try {
    const openAIClient = client ?? createOpenAIClient();
    const transport = client ? undefined : getOpenAIClientConfig().transport;
    const response = await openAIClient.responses.create({
      model: getFreeCashAiModel(),
      instructions: [
        "You route Spendable app messages to exactly one deterministic tool.",
        "Never calculate money yourself.",
        "Never invent balances, transactions, safety advice, or financial-advisor language.",
        "If the user asks if they can spend or buy something, call simulate_purchase.",
        "If a spending question does not include or imply a specific amount, call answer_unrelated.",
        "Use recent conversation to resolve short follow-ups like 'what about $20 instead' as purchase simulations when they follow a spending question.",
        "If the user asks for account balances, call show_true_balances.",
        "If the user asks for math or formula details, call show_math.",
        "If the user asks about missing cards or accuracy, call detect_missing_card.",
        "If the user asks for transaction activity, call show_recent_transactions.",
        "If the user asks what the Free Cash number means or why it changed, call explain_free_cash.",
        "If the user input is unrelated, ambiguous, a greeting, nonsense, or not answerable by these tools, call answer_unrelated.",
      ].join(" "),
      input: [
        ...formatHistoryForModel(input.history),
        {
          role: "user",
          content: input.message,
        },
      ],
      tools: freeCashTools,
      tool_choice: "required",
      parallel_tool_calls: false,
      store: false,
    });

    const toolCall = getSingleFunctionToolCall(response);

    if (!toolCall) {
      throw new AgentUnavailableError({
        code: "model-returned-no-tool-call",
        message: "AI did not return an app action.",
        status: 502,
        detail: "The model response did not include a supported Spendable tool call.",
      });
    }

    const toolName = toolCall.name;

    if (!isAgentToolName(toolName)) {
      throw new AgentUnavailableError({
        code: "model-returned-unknown-tool",
        message: "AI returned an unsupported app action.",
        status: 502,
        detail: `Unsupported tool: ${sanitizeErrorDetail(toolName)}`,
      });
    }

    const args = groundToolArguments(toolName, parseToolArguments(toolName, toolCall.arguments), input.message);
    const toolResponse = runAgentToolSafely(toolName, args, input.snapshot);
    const finalMessage = await generateFinalMessage(openAIClient, {
      userMessage: input.message,
      history: input.history,
      toolName,
      toolResponse,
    });

    return agentResponseSchema.parse({
      ...toolResponse,
      message: finalMessage.message,
      audit: {
        ...toolResponse.audit,
        toolNames: [toolName],
        usedModel: true,
        model: finalMessage.model,
        transport,
      },
    });
  } catch (error) {
    if (error instanceof AgentUnavailableError) {
      throw error;
    }

    throw new AgentUnavailableError({
      code: "openai-request-failed",
      message: "AI request failed.",
      detail: getErrorDetail(error),
      cause: error,
    });
  }
}

async function generateFinalMessage(
  client: OpenAIResponsesClient,
  input: {
    userMessage: string;
    history?: AgentHistoryItem[];
    toolName: AgentToolName;
    toolResponse: AgentResponse;
  },
): Promise<{ message: string; model: string }> {
  const response = await client.responses.create({
    model: getFreeCashAiModel(),
    instructions: [
      "You write the final visible chat reply for Spendable.",
      "Return JSON that matches the supplied schema.",
      "Use the app_result as the only source of financial facts.",
      "Do not invent accounts, transactions, balances, dates, or safety advice.",
      "Spendable is a single-screen chat app with a top Free Cash number, temporary cards, prompt chips, and this chat input.",
      "There is no dashboard, dashboard page, budget page, transaction page, tab view, or separate area to send the user to.",
      "If a card is returned, say it is shown below or in this reply, never somewhere else.",
      "Never say safe to spend, afford, recommend, or tell the user what they should buy.",
      "Do not mention tools, JSON, routing, or deterministic systems.",
      "Do not sound templated; respond to the user's exact wording.",
      "Keep it to one or two short sentences.",
      "If route_tool is answer_unrelated, briefly redirect to the current Free Cash number, spending tests, balances, transactions, or data accuracy.",
      "Do not mention generic budgeting, expense tracking, dashboards, pages, tabs, or financial planning.",
    ].join(" "),
    input: [
      {
        role: "user",
        content: JSON.stringify({
          user_message: input.userMessage,
          recent_conversation: formatHistoryForGrounding(input.history),
          route_tool: input.toolName,
          app_result: createModelGrounding(input.toolResponse),
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "free_cash_final_message",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            message: {
              type: "string",
              minLength: 1,
              maxLength: 420,
            },
          },
          required: ["message"],
        },
      },
    },
    store: false,
  });

  const rawContent = getResponseOutputText(response);

  if (!rawContent) {
    throw new AgentUnavailableError({
      code: "model-returned-empty-final-message",
      message: "AI did not write a final response.",
      status: 502,
      detail: "The model returned an empty final message.",
    });
  }

  return {
    message: guardVisibleFinalMessage(parseFinalMessage(rawContent), input.toolResponse),
    model: response.model,
  };
}

function formatHistoryForModel(history: AgentHistoryItem[] | undefined): ResponseInputItem[] {
  return formatHistoryForGrounding(history).map((item) => ({
    role: item.role,
    content: item.content,
  }));
}

function formatHistoryForGrounding(history: AgentHistoryItem[] | undefined): AgentHistoryItem[] {
  return (history ?? []).slice(-8).map((item) => ({
    role: item.role,
    content: item.content.slice(0, 500),
  }));
}

function getSingleFunctionToolCall(response: Response): ResponseFunctionToolCall | undefined {
  const functionCalls = response.output.filter(
    (item): item is ResponseFunctionToolCall => item.type === "function_call",
  );

  if (functionCalls.length > 1) {
    throw new AgentUnavailableError({
      code: "model-returned-multiple-tool-calls",
      message: "AI returned more than one app action.",
      status: 502,
      detail: "The model response included multiple Spendable tool calls.",
    });
  }

  return functionCalls[0];
}

function getResponseOutputText(response: Response): string | undefined {
  if (response.output_text) {
    return response.output_text;
  }

  for (const item of response.output) {
    if (item.type !== "message") {
      continue;
    }

    const outputText = item.content.find((content) => content.type === "output_text");
    if (outputText?.type === "output_text" && outputText.text) {
      return outputText.text;
    }
  }

  return undefined;
}

export function createOpenAIClient(): OpenAIResponsesClient {
  if (process.env.FREE_CASH_AI_MODE === "mock-model") {
    return createMockModelClient();
  }

  const config = getOpenAIClientConfig();

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
}

export function shouldUseModel(): boolean {
  return (
    process.env.FREE_CASH_AI_MODE === "mock-model" ||
    Boolean(process.env.NETLIFY_AI_GATEWAY_BASE_URL && process.env.NETLIFY_AI_GATEWAY_KEY) ||
    Boolean(process.env.OPENAI_API_KEY) ||
    Boolean(process.env.OPENAI_BASE_URL)
  );
}

export function getFreeCashAiModel(env: Record<string, string | undefined> = process.env): string {
  if (env.FREE_CASH_AI_MODEL) {
    return env.FREE_CASH_AI_MODEL;
  }

  if (isNetlifyAiGatewayConfigured(env) || env.OPENAI_BASE_URL) {
    return NETLIFY_AI_GATEWAY_MODEL;
  }

  return FREE_CASH_AI_MODEL;
}

export function getOpenAIApiKeyForSdk(env: Record<string, string | undefined> = process.env): string | undefined {
  return getOpenAIClientConfig(env).apiKey;
}

export function getOpenAIClientConfig(
  env: Record<string, string | undefined> = process.env,
): OpenAIClientConfig {
  if (isNetlifyAiGatewayConfigured(env)) {
    return {
      apiKey: env.NETLIFY_AI_GATEWAY_KEY,
      baseURL: env.NETLIFY_AI_GATEWAY_BASE_URL,
      transport: "netlify-ai-gateway",
    };
  }

  if (env.OPENAI_BASE_URL) {
    return {
      apiKey: env.OPENAI_API_KEY || "netlify-ai-gateway",
      baseURL: env.OPENAI_BASE_URL,
      transport:
        env.FREE_CASH_AI_TRANSPORT === "custom-openai-compatible"
          ? "custom-openai-compatible"
          : "netlify-ai-gateway",
    };
  }

  return {
    apiKey: env.OPENAI_API_KEY,
    transport: "openai-direct",
  };
}

function isNetlifyAiGatewayConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.NETLIFY_AI_GATEWAY_BASE_URL && env.NETLIFY_AI_GATEWAY_KEY);
}

export function getFreeCashAiTransport(
  env: Record<string, string | undefined> = process.env,
): AiTransport {
  return getOpenAIClientConfig(env).transport;
}

function runAgentToolSafely(
  toolName: AgentToolName,
  args: unknown,
  snapshot: FinancialSnapshot | undefined,
): AgentResponse {
  try {
    return runAgentTool(toolName, args, snapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AgentUnavailableError({
        code: "model-returned-invalid-tool-arguments",
        message: "AI returned invalid app action arguments.",
        status: 502,
        detail: getErrorDetail(error),
        cause: error,
      });
    }

    throw error;
  }
}

function parseToolArguments(toolName: AgentToolName, argumentJson: string): unknown {
  if (!argumentJson) {
    return {};
  }

  try {
    return JSON.parse(argumentJson);
  } catch {
    throw new AgentUnavailableError({
      code: "model-returned-invalid-tool-arguments",
      message: "AI returned invalid app action arguments.",
      status: 502,
      detail: `Invalid arguments for ${sanitizeErrorDetail(toolName)}.`,
    });
  }
}

function groundToolArguments(
  toolName: AgentToolName,
  args: unknown,
  userMessage: string,
): unknown {
  if (toolName !== "simulate_purchase") {
    return args;
  }

  const explicitAmountCents = extractExplicitPurchaseAmountCents(userMessage);

  if (explicitAmountCents === null) {
    return args;
  }

  return {
    ...(isRecord(args) ? args : {}),
    amount_cents: explicitAmountCents,
  };
}

function extractExplicitPurchaseAmountCents(message: string): number | null {
  const candidates: Array<{ amountCents: number; index: number; score: number }> = [];
  const amountPattern =
    /(?:\$|usd\s*)\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)/gi;
  const normalized = message.toLowerCase();

  for (const match of message.matchAll(amountPattern)) {
    const rawAmount = match[1] ?? match[2];
    const amount = Number(rawAmount.replaceAll(",", ""));

    if (!Number.isFinite(amount)) {
      continue;
    }

    const amountCents = Math.round(amount * 100);

    if (amountCents <= 0 || amountCents > 1000000) {
      continue;
    }

    const index = match.index ?? 0;
    candidates.push({
      amountCents,
      index,
      score: scorePurchaseAmountCandidate(normalized, index),
    });
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score || right.index - left.index);

  return candidates[0].amountCents;
}

function scorePurchaseAmountCandidate(message: string, index: number): number {
  const before = message.slice(Math.max(0, index - 56), index);
  const after = message.slice(index, index + 56);
  let score = 0;

  if (/\b(spend|buy|purchase|order|afford|pay|cost)\b/.test(before)) {
    score += 8;
  }

  if (/\b(what about|how about|instead|rather|does|do to|leave|would)\b/.test(before)) {
    score += 5;
  }

  if (/\b(spend|buy|purchase|order|afford|pay|cost|instead|today)\b/.test(after)) {
    score += 3;
  }

  if (/\b(balance|paycheck|income|deposit|have|left)\b/.test(before)) {
    score -= 4;
  }

  if (/\b(balance|paycheck|income|deposit)\b/.test(after)) {
    score -= 4;
  }

  return score;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFinalMessage(rawContent: string): string {
  try {
    return finalMessageSchema.parse(JSON.parse(rawContent)).message;
  } catch (error) {
    throw new AgentUnavailableError({
      code: "model-returned-invalid-final-message",
      message: "AI returned an invalid final response.",
      status: 502,
      detail: getErrorDetail(error),
      cause: error,
    });
  }
}

function guardVisibleFinalMessage(message: string, toolResponse: AgentResponse): string {
  if (!containsDisallowedFinalLanguage(message)) {
    return message;
  }

  return toolResponse.message;
}

function containsDisallowedFinalLanguage(message: string): boolean {
  const normalized = message.toLowerCase();
  const disallowedPatterns = [
    /\bsafe to spend\b/,
    /\bsafe to buy\b/,
    /\byou can afford\b/,
    /\bi recommend\b/,
    /\bmy recommendation\b/,
    /\bfinancial advice\b/,
    /\bfinancial advisor\b/,
    /\bguarantee(?:d|s)?\b/,
    /\byou should (?:buy|spend|purchase|order)\b/,
    /\byou shouldn'?t (?:buy|spend|purchase|order)\b/,
    /\bdashboard\b/,
    /\bbudget(?:ing)?\b/,
    /\bexpense tracking\b/,
    /\bfinancial planning\b/,
    /\b(?:page|tab|section|area)\s+(?:for|with)\b/,
    /\breview (?:them|it|transactions?|balances?) there\b/,
  ];

  return disallowedPatterns.some((pattern) => pattern.test(normalized));
}

function createModelGrounding(response: AgentResponse) {
  return {
    interface_context:
      "Single Spendable screen only. No dashboard, tabs, budget page, transaction page, or separate navigation.",
    cards: response.cards.map(formatCardForModel),
    suggested_prompts: response.promptChips.map((chip) => chip.label),
  };
}

function formatCardForModel(card: AgentCard): Record<string, unknown> {
  switch (card.type) {
    case "free_cash_explanation":
      return {
        type: card.type,
        title: card.title,
        drivers: card.drivers.map((driver) => ({
          label: driver.label,
          detail: driver.detail,
          amount: driver.amountCents === 0 ? "OK" : formatMoney(driver.amountCents),
          tone: driver.tone,
        })),
        warnings: card.warnings.map((warning) => ({
          label: warning.label,
          detail: warning.detail,
        })),
        data_states: card.dataStates.map((state) => ({
          label: state.label,
          detail: state.detail,
          amount: formatMoney(state.amountCents),
        })),
      };
    case "purchase_simulation":
      return {
        type: card.type,
        title: card.title,
        purchase_amount: formatMoney(card.amountCents),
        free_cash_before: formatMoney(card.beforeCents),
        free_cash_after_today: formatMoney(card.afterTodayCents),
        rolling_window_average_after: formatMoney(card.monthlyAverageAfterCents),
      };
    case "true_balances":
      return {
        type: card.type,
        title: card.title,
        balances: card.balances.map((balance) => ({
          name: balance.name,
          institution: balance.institutionName,
          kind: balance.kind,
          last_four: balance.lastFour,
          balance: formatMoneyWithCents(balance.balanceCents),
          available_balance:
            balance.availableBalanceCents === undefined
              ? undefined
              : formatMoneyWithCents(balance.availableBalanceCents),
        })),
      };
    case "recent_transactions":
      return {
        type: card.type,
        title: card.title,
        transaction_count: card.transactions.length,
        total_amount: formatMoneyWithCents(sumTransactionAmounts(card.transactions)),
        pending_transaction_count: card.transactions.filter((transaction) => transaction.pending).length,
      };
    case "missing_card_nudge":
      return {
        type: card.type,
        title: card.title,
        detail: card.detail,
        issuer: card.issuerName,
      };
    case "math_breakdown":
      return {
        type: card.type,
        title: card.title,
        income: formatMoney(card.incomeTotalCents),
        spending: formatMoney(-card.spendingTotalCents),
        protected_savings: formatMoney(-card.protectedSavingsMonthlyCents),
        rolling_net: formatMoney(card.rollingNetCents),
        day_count: card.dayCount,
        daily_average: formatMoney(Math.round(card.rollingNetCents / card.dayCount)),
      };
    case "connect_account":
      return {
        type: card.type,
        title: card.title,
        detail: card.detail,
      };
  }
}

function sumTransactionAmounts(
  transactions: Extract<AgentCard, { type: "recent_transactions" }>["transactions"],
): number {
  return transactions.reduce((total, transaction) => total + transaction.amountCents, 0);
}

export function toAgentErrorPayload(error: unknown): AgentErrorPayload {
  if (error instanceof AgentUnavailableError) {
    return {
      code: error.code,
      error: error.message,
      detail: error.detail,
      status: error.status,
    };
  }

  return {
    code: "agent-error",
    error: "Agent failed.",
    detail: getErrorDetail(error),
    status: 500,
  };
}

function getErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeErrorDetail(error.message);
  }

  return "Unknown AI error.";
}

function sanitizeErrorDetail(detail: string): string {
  return detail.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 180);
}

export function createMockModelClient(): OpenAIResponsesClient {
  return {
    responses: {
      async create(params) {
        if (!params.tools) {
          return createMockFinalMessageResponse(params);
        }

        const tool = chooseMockTool(getLastInputText(params.input));

        return createResponse({
          outputText: "",
          output: [
            {
              type: "function_call",
              id: "mock-tool-call",
              call_id: "mock-tool-call",
              name: tool.name,
              arguments: JSON.stringify(tool.arguments),
              status: "completed",
            },
          ],
        });
      },
    },
  };
}

function createMockFinalMessageResponse(params: ResponseCreateParamsNonStreaming): Response {
  const content = getLastInputText(params.input);
  const outputText = JSON.stringify({
    message: createMockFinalMessage(content),
  });

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
  outputText: string;
  output: Response["output"];
}): Response {
  return {
    id: "mock-free-cash-response",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: getFreeCashAiModel(),
    output_text: input.outputText,
    output: input.output,
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

function getLastInputText(input: ResponseCreateParamsNonStreaming["input"]): string {
  if (typeof input === "string") {
    return input;
  }

  if (!Array.isArray(input)) {
    return "";
  }

  for (const item of [...input].reverse()) {
    if (!("role" in item) || item.role !== "user") {
      continue;
    }

    if (typeof item.content === "string") {
      return item.content;
    }
  }

  return "";
}

function createMockFinalMessage(content: string): string {
  const parsed = parseMockFinalMessageInput(content);
  const card = parsed.app_result.cards[0];

  if (parsed.route_tool === "answer_unrelated") {
    return "That does not look like a Spendable question yet. Ask me about spending, balances, transactions, or why the number is what it is.";
  }

  if (parsed.route_tool === "simulate_purchase" && card?.type === "purchase_simulation") {
    return `That ${card.purchase_amount} test spend would put today's Free Cash at ${card.free_cash_after_today}.`;
  }

  if (parsed.route_tool === "show_true_balances") {
    return "Free Cash is the spendable number; the account card shows the raw balances behind it.";
  }

  if (parsed.route_tool === "show_recent_transactions") {
    return "Here are the recent items currently shaping the Free Cash number.";
  }

  return "Here is what is driving the Free Cash number right now.";
}

function parseMockFinalMessageInput(content: string): {
  route_tool: AgentToolName;
  app_result: {
    cards: Array<Record<string, string>>;
  };
} {
  try {
    return JSON.parse(content);
  } catch {
    return {
      route_tool: "answer_unrelated",
      app_result: {
        cards: [],
      },
    };
  }
}

function chooseMockTool(message: string): { name: AgentToolName; arguments: Record<string, unknown> } {
  const normalized = message.toLowerCase();

  if (normalized.includes("balance")) {
    return { name: "show_true_balances", arguments: {} };
  }

  if (normalized.includes("transaction") || normalized.includes("recent")) {
    return { name: "show_recent_transactions", arguments: { limit: 6 } };
  }

  if (normalized.includes("math") || normalized.includes("formula")) {
    return { name: "show_math", arguments: {} };
  }

  if (normalized.includes("missing") || normalized.includes("connect")) {
    return { name: "detect_missing_card", arguments: {} };
  }

  const amount = normalized.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);

  if (amount && /\b(?:what about|how about|instead|rather|that one)\b/.test(normalized)) {
    return {
      name: "simulate_purchase",
      arguments: {
        amount_cents: Math.round(Number(amount[1]) * 100),
      },
    };
  }

  if (normalized.includes("spend") || normalized.includes("buy") || normalized.includes("purchase")) {
    if (!amount) {
      return { name: "answer_unrelated", arguments: {} };
    }

    return {
      name: "simulate_purchase",
      arguments: {
        amount_cents: Math.round(Number(amount[1]) * 100),
      },
    };
  }

  if (
    normalized.includes("why") ||
    normalized.includes("changed") ||
    normalized.includes("free cash") ||
    normalized.includes("number")
  ) {
    return { name: "explain_free_cash", arguments: {} };
  }

  return { name: "answer_unrelated", arguments: {} };
}
