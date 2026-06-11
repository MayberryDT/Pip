import { appendFile, readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentResponse } from "@/lib/agent/card-types";
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
    user_message: input.userMessage,
    assistant_message: response?.message ?? null,
    error_message: input.errorMessage ?? null,
    response_mode: response?.responseMode ?? null,
    used_tools: response?.usedTools ?? [],
    card_types: response?.cards.map((card) => card.type) ?? [],
    prompt_chips: summarizePromptChips(response),
    client_action: response?.clientAction?.type ?? null,
    model: response?.audit.model ?? null,
    transport: response?.audit.transport ?? null,
    request_metadata: input.requestMetadata ?? {},
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
    userMessage: input.userMessage,
    assistantMessage: response?.message ?? null,
    errorMessage: input.errorMessage ?? null,
    responseMode: response?.responseMode ?? null,
    usedTools: response?.usedTools ?? [],
    cardTypes: response?.cards.map((card) => card.type) ?? [],
    promptChips: summarizePromptChips(response),
    clientAction: response?.clientAction?.type ?? null,
    model: response?.audit.model ?? null,
    transport: response?.audit.transport ?? null,
    requestMetadata: input.requestMetadata ?? {},
    createdAt: new Date().toISOString(),
  };

  await appendFile(localChatLogPath, `${JSON.stringify(turn)}\n`, "utf8");
}

function summarizePromptChips(response: AgentResponse | undefined): Json {
  return (response?.promptChips ?? []).map((chip) => ({
    id: chip.id,
    label: chip.label,
    prompt: chip.prompt,
  }));
}

function createLocalTurnId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSafeLogError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown chat logging error.";
  }

  return error.message.slice(0, 180);
}
