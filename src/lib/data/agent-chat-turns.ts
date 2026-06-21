import { appendFile, readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentResponse } from "@/lib/agent/card-types";
import { getSafeErrorMessage, sanitizeSensitiveText } from "@/lib/security/error-messages";
import type { Database, Json } from "@/lib/supabase/database.types";

type AgentChatTurnRow = Database["public"]["Tables"]["agent_chat_turns"]["Row"];

export type AgentChatTurnInput = {
  userId?: string | null;
  conversationId: string;
  userMessage: string;
  response?: AgentResponse;
  errorMessage?: string;
  requestMetadata?: Json;
};

export type OperatorAgentChatTurn = {
  id: string;
  userId: string | null;
  conversationId: string;
  userMessage: string;
  assistantMessage: string | null;
  errorMessage: string | null;
  responseMode: string | null;
  usedTools: string[];
  cardTypes: string[];
  promptChips: Json;
  clientAction: string | null;
  model: string | null;
  transport: string | null;
  requestMetadata: Json;
  createdAt: string;
};

const localChatLogPath = "/tmp/pip-agent-chat-turns.jsonl";
const AGENT_CHAT_USER_EXCERPT_MAX_CHARS = 240;
const AGENT_CHAT_ASSISTANT_EXCERPT_MAX_CHARS = 320;
const AGENT_CHAT_ERROR_EXCERPT_MAX_CHARS = 240;
const AGENT_CHAT_PROMPT_CHIP_LABEL_MAX_CHARS = 56;
const AGENT_CHAT_PROMPT_CHIP_PROMPT_MAX_CHARS = 160;
const AGENT_CHAT_METADATA_STRING_MAX_CHARS = 160;
const AGENT_CHAT_METADATA_ARRAY_MAX_ITEMS = 8;
const allowedMetadataKeys = new Set([
  "scenario",
  "requestKind",
  "selectedPromptChipId",
  "historyLength",
  "shownCardCount",
  "lastToolCount",
  "promptChipCount",
  "onboardingStatus",
  "hasFinancialData",
  "hasSnapshot",
  "syncInstitutionCount",
  "syncHasStaleInstitution",
  "latestSyncStatus",
  "responseQuality",
  "errorCode",
  "status",
]);

export async function recordAgentChatTurnSafely(
  supabase: SupabaseClient<Database> | null,
  input: AgentChatTurnInput,
) {
  try {
    if (supabase) {
      await recordAgentChatTurn(supabase, input);
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      await appendLocalAgentChatTurn(input);
    }
  } catch (error) {
    console.warn("Agent chat turn logging failed.", getSafeLogError(error));
  }
}

export async function recordAgentChatTurn(
  supabase: SupabaseClient<Database>,
  input: AgentChatTurnInput,
) {
  const response = input.response;
  const { error } = await supabase.from("agent_chat_turns").insert({
    user_id: input.userId ?? null,
    conversation_id: input.conversationId,
    user_message: minimizeChatText(input.userMessage, AGENT_CHAT_USER_EXCERPT_MAX_CHARS),
    assistant_message: response?.message
      ? minimizeChatText(response.message, AGENT_CHAT_ASSISTANT_EXCERPT_MAX_CHARS)
      : null,
    error_message: input.errorMessage
      ? minimizeChatText(input.errorMessage, AGENT_CHAT_ERROR_EXCERPT_MAX_CHARS)
      : null,
    response_mode: response?.responseMode ?? null,
    used_tools: response?.usedTools ?? [],
    card_types: response?.cards.map((card) => card.type) ?? [],
    prompt_chips: summarizePromptChips(response),
    client_action: response?.clientAction?.type ?? null,
    model: response?.audit.model ?? null,
    transport: response?.audit.transport ?? null,
    request_metadata: buildRequestMetadata(input),
  });

  if (error) {
    throw error;
  }
}

export async function loadOperatorAgentChats(
  supabase: SupabaseClient<Database>,
  input: {
    limit?: number;
    userId?: string;
    conversationId?: string;
  } = {},
): Promise<OperatorAgentChatTurn[]> {
  let query = supabase
    .from("agent_chat_turns")
    .select(
      "id, user_id, conversation_id, user_message, assistant_message, error_message, response_mode, used_tools, card_types, prompt_chips, client_action, model, transport, request_metadata, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 100);

  if (input.userId) {
    query = query.eq("user_id", input.userId);
  }

  if (input.conversationId) {
    query = query.eq("conversation_id", input.conversationId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapAgentChatTurnRow);
}

export async function loadLocalOperatorAgentChats(
  input: {
    limit?: number;
    conversationId?: string;
  } = {},
): Promise<OperatorAgentChatTurn[]> {
  const file = await readFile(localChatLogPath, "utf8").catch(() => "");
  const turns = file
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OperatorAgentChatTurn)
    .filter((turn) => !input.conversationId || turn.conversationId === input.conversationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return turns.slice(0, input.limit ?? 100);
}

function mapAgentChatTurnRow(row: AgentChatTurnRow): OperatorAgentChatTurn {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    userMessage: row.user_message,
    assistantMessage: row.assistant_message,
    errorMessage: row.error_message,
    responseMode: row.response_mode,
    usedTools: row.used_tools,
    cardTypes: row.card_types,
    promptChips: row.prompt_chips,
    clientAction: row.client_action,
    model: row.model,
    transport: row.transport,
    requestMetadata: row.request_metadata,
    createdAt: row.created_at,
  };
}

async function appendLocalAgentChatTurn(input: AgentChatTurnInput) {
  const response = input.response;
  const turn: OperatorAgentChatTurn = {
    id: createLocalTurnId(),
    userId: input.userId ?? null,
    conversationId: input.conversationId,
    userMessage: minimizeChatText(input.userMessage, AGENT_CHAT_USER_EXCERPT_MAX_CHARS),
    assistantMessage: response?.message
      ? minimizeChatText(response.message, AGENT_CHAT_ASSISTANT_EXCERPT_MAX_CHARS)
      : null,
    errorMessage: input.errorMessage
      ? minimizeChatText(input.errorMessage, AGENT_CHAT_ERROR_EXCERPT_MAX_CHARS)
      : null,
    responseMode: response?.responseMode ?? null,
    usedTools: response?.usedTools ?? [],
    cardTypes: response?.cards.map((card) => card.type) ?? [],
    promptChips: summarizePromptChips(response),
    clientAction: response?.clientAction?.type ?? null,
    model: response?.audit.model ?? null,
    transport: response?.audit.transport ?? null,
    requestMetadata: buildRequestMetadata(input),
    createdAt: new Date().toISOString(),
  };

  await appendFile(localChatLogPath, `${JSON.stringify(turn)}\n`, "utf8");
}

function summarizePromptChips(response: AgentResponse | undefined): Json {
  return (response?.promptChips ?? []).map((chip) => ({
    id: chip.id,
    label: minimizeChatText(chip.label, AGENT_CHAT_PROMPT_CHIP_LABEL_MAX_CHARS),
    prompt: minimizeChatText(chip.prompt, AGENT_CHAT_PROMPT_CHIP_PROMPT_MAX_CHARS),
  }));
}

function buildRequestMetadata(input: AgentChatTurnInput): Json {
  const metadata: { [key: string]: Json } = {};
  const rawMetadata = isJsonObject(input.requestMetadata) ? input.requestMetadata : {};

  for (const [key, value] of Object.entries(rawMetadata)) {
    if (!allowedMetadataKeys.has(key)) {
      continue;
    }

    const minimizedValue = key === "responseQuality"
      ? summarizeResponseQuality(value)
      : minimizeMetadataValue(value);

    if (minimizedValue !== undefined) {
      metadata[key] = minimizedValue;
    }
  }

  const guidance = input.response?.audit.guidance;

  if (guidance) {
    metadata.guidanceSource = guidance.guidanceSource ?? null;
    metadata.guidanceValidationOutcome = guidance.validationOutcome;
    metadata.guidanceStance = guidance.stance ?? null;
    metadata.guidanceEvidenceIds = (guidance.evidenceIds ?? [])
      .slice(0, AGENT_CHAT_METADATA_ARRAY_MAX_ITEMS)
      .map((evidenceId) => minimizeChatText(evidenceId, AGENT_CHAT_METADATA_STRING_MAX_CHARS));
  }

  return metadata;
}

function minimizeMetadataValue(value: Json | undefined): Json | undefined {
  if (typeof value === "string") {
    return minimizeChatText(value, AGENT_CHAT_METADATA_STRING_MAX_CHARS);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string | number | boolean | null =>
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean" ||
        item === null,
      )
      .slice(0, AGENT_CHAT_METADATA_ARRAY_MAX_ITEMS)
      .map((item) =>
        typeof item === "string"
          ? minimizeChatText(item, AGENT_CHAT_METADATA_STRING_MAX_CHARS)
          : item,
      );
  }

  return undefined;
}

function summarizeResponseQuality(value: Json | undefined): Json | undefined {
  if (isJsonObject(value) && typeof value.reviewPassed === "boolean") {
    return value.reviewPassed ? "passed" : "failed";
  }

  if (
    isJsonObject(value) &&
    typeof value.conversationJob === "string" &&
    typeof value.answerPatternId === "string"
  ) {
    const state = value.repetitionAdjusted === true ? "adjusted" : "ok";

    return minimizeChatText(
      `${value.conversationJob}:${value.answerPatternId}:${state}`,
      AGENT_CHAT_METADATA_STRING_MAX_CHARS,
    );
  }

  return minimizeMetadataValue(value);
}

function minimizeChatText(value: string, maxChars: number): string {
  return redactPaymentDetails(sanitizeSensitiveText(value)).slice(0, maxChars);
}

function redactPaymentDetails(value: string): string {
  return value
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[redacted]")
    .replace(
      /\b((?:card|account)\s+(?:ending\s+in|ending\s+with|last[-\s]?(?:four|4)|number(?:\s+is)?))\s+\d{4}\b/gi,
      "$1 [redacted]",
    )
    .replace(
      /\b((?:last[-_ ]?(?:four|4)|mask|account[-_ ]?number|routing[-_ ]?number)\s*[:=]\s*)\d{4,19}\b/gi,
      "$1[redacted]",
    )
    .replace(
      /\b((?:account|routing)\s+number\s+(?:is\s+)?)\d{5,19}\b/gi,
      "$1[redacted]",
    );
}

function isJsonObject(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createLocalTurnId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSafeLogError(error: unknown): string {
  return getSafeErrorMessage(error, "Unknown chat logging error.").slice(0, 180);
}
