import { describe, expect, it, vi } from "vitest";
import { loadRecentAgentChatHistory, recordAgentChatTurn } from "@/lib/data/agent-chat-turns";
import type { AgentResponse } from "@/lib/agent/card-types";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("agent chat turn logging", () => {
  it("stores guidance source in request metadata for operator review", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient<Database>;

    await recordAgentChatTurn(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessage: "How am I doing?",
      requestMetadata: {
        historyLength: 0,
      },
      response: createGuidanceResponse(),
    });

    expect(supabase.from).toHaveBeenCalledWith("agent_chat_turns");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        request_metadata: expect.objectContaining({
          historyLength: 0,
          guidanceSource: "model_draft",
          guidanceValidationOutcome: "shown",
          guidanceStance: "watch",
          guidanceEvidenceIds: ["recent-spending-hot"],
        }),
      }),
    );
  });

  it("loads recent chat history scoped to user and conversation while ignoring errored turns", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          createChatTurnRow({
            id: "turn-5",
            user_message: "new user",
            assistant_message: "new assistant",
            created_at: "2026-06-19T00:05:00.000Z",
          }),
          createChatTurnRow({
            id: "turn-4",
            user_message: "errored user",
            assistant_message: null,
            error_message: "AI failed.",
            created_at: "2026-06-19T00:04:00.000Z",
          }),
          createChatTurnRow({
            id: "turn-3",
            user_message: "third user",
            assistant_message: "third assistant",
            created_at: "2026-06-19T00:03:00.000Z",
          }),
          createChatTurnRow({
            id: "turn-2",
            user_message: "second user",
            assistant_message: "second assistant",
            created_at: "2026-06-19T00:02:00.000Z",
          }),
          createChatTurnRow({
            id: "turn-1",
            user_message: "old user",
            assistant_message: "old assistant",
            created_at: "2026-06-19T00:01:00.000Z",
          }),
        ],
        error: null,
      }),
    };
    const supabase = {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient<Database>;

    const history = await loadRecentAgentChatHistory(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
    });

    expect(supabase.from).toHaveBeenCalledWith("agent_chat_turns");
    expect(query.select).toHaveBeenCalledWith(
      "id, user_id, conversation_id, user_message, assistant_message, error_message, created_at",
    );
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.eq).toHaveBeenCalledWith("conversation_id", "conversation-1");
    expect(query.is).toHaveBeenCalledWith("error_message", null);
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(8);
    expect(history).toEqual([
      {
        role: "user",
        content: "old user",
      },
      {
        role: "assistant",
        content: "old assistant",
      },
      {
        role: "user",
        content: "second user",
      },
      {
        role: "assistant",
        content: "second assistant",
      },
      {
        role: "user",
        content: "third user",
      },
      {
        role: "assistant",
        content: "third assistant",
      },
      {
        role: "user",
        content: "new user",
      },
      {
        role: "assistant",
        content: "new assistant",
      },
    ]);
  });
});

function createGuidanceResponse(): AgentResponse {
  return {
    message: "My read: spending is running hot.",
    cards: [],
    promptChips: [],
    usedTools: ["get_financial_guidance_context"],
    responseMode: "guidance",
    audit: {
      toolNames: ["get_financial_guidance_context"],
      usedModel: true,
      guidance: {
        validationOutcome: "shown",
        guidanceSource: "model_draft",
        stance: "watch",
        evidenceIds: ["recent-spending-hot"],
      },
    },
  };
}

function createChatTurnRow(
  overrides: Partial<Database["public"]["Tables"]["agent_chat_turns"]["Row"]> = {},
): Database["public"]["Tables"]["agent_chat_turns"]["Row"] {
  return {
    id: "turn-1",
    user_id: "user-1",
    conversation_id: "conversation-1",
    user_message: "user",
    assistant_message: "assistant",
    error_message: null,
    response_mode: "chat_only",
    used_tools: [],
    card_types: [],
    prompt_chips: [],
    client_action: null,
    model: null,
    transport: null,
    request_metadata: {},
    created_at: "2026-06-19T00:00:00.000Z",
    ...overrides,
  };
}
