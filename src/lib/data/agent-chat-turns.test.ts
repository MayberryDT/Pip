import { describe, expect, it, vi } from "vitest";
import {
  loadLatestAgentPendingAction,
  loadRecentAgentChatHistory,
  recordAgentChatTurn,
} from "@/lib/data/agent-chat-turns";
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

  it("stores response pending action in request metadata without dropping existing metadata", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient<Database>;
    const pendingAction = {
      type: "create_savings_goal" as const,
      name: "Bali",
      targetAmountCents: 500000,
      missing: ["target_amount" as const],
    };

    await recordAgentChatTurn(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessage: "Help me save for Bali",
      requestMetadata: {
        historyLength: 2,
        hydratedHistoryLength: 4,
      },
      response: createGuidanceResponse({
        pendingAction,
      }),
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        request_metadata: expect.objectContaining({
          historyLength: 2,
          hydratedHistoryLength: 4,
          responsePendingAction: pendingAction,
        }),
      }),
    );
  });

  it("loads the newest valid pending action scoped to user and conversation", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          createChatTurnRow({
            id: "turn-3",
            request_metadata: {
              responsePendingAction: {
                type: "not_a_real_action",
                name: "Bad row",
              },
            },
            created_at: "2026-06-19T00:03:00.000Z",
          }),
          createChatTurnRow({
            id: "turn-2",
            request_metadata: {
              responsePendingAction: {
                type: "set_savings_goal_protection",
                name: "Emergency fund",
                includeInSpendableCash: true,
              },
            },
            created_at: "2026-06-19T00:02:00.000Z",
          }),
          createChatTurnRow({
            id: "turn-1",
            request_metadata: {},
            created_at: "2026-06-19T00:01:00.000Z",
          }),
        ],
        error: null,
      }),
    };
    const supabase = {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient<Database>;

    const pendingAction = await loadLatestAgentPendingAction(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
    });

    expect(supabase.from).toHaveBeenCalledWith("agent_chat_turns");
    expect(query.select).toHaveBeenCalledWith("request_metadata, created_at");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.eq).toHaveBeenCalledWith("conversation_id", "conversation-1");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(20);
    expect(pendingAction).toEqual({
      type: "set_savings_goal_protection",
      name: "Emergency fund",
      includeInSpendableCash: true,
    });
  });

  it("returns undefined when latest pending action rows have no valid pending action", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          createChatTurnRow({
            request_metadata: {
              responsePendingAction: {
                type: "create_savings_goal",
                name: "",
              },
            },
          }),
          createChatTurnRow({
            request_metadata: {
              responsePendingAction: "not-json-object",
            },
          }),
        ],
        error: null,
      }),
    };
    const supabase = {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient<Database>;

    await expect(loadLatestAgentPendingAction(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
    })).resolves.toBeUndefined();
  });

  it("does not resurrect an older pending action after a newer response clears it", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          createChatTurnRow({
            id: "turn-2",
            request_metadata: {
              responsePendingAction: null,
            },
            created_at: "2026-06-19T00:02:00.000Z",
          }),
          createChatTurnRow({
            id: "turn-1",
            request_metadata: {
              responsePendingAction: {
                type: "create_savings_goal",
                name: "Japan trip",
                missing: ["target_amount"],
              },
            },
            created_at: "2026-06-19T00:01:00.000Z",
          }),
        ],
        error: null,
      }),
    };
    const supabase = {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient<Database>;

    await expect(loadLatestAgentPendingAction(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
    })).resolves.toBeUndefined();
  });

  it("stores a null response pending action when a response has cleared the draft", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient<Database>;

    await recordAgentChatTurn(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessage: "$3000 by December 1st",
      response: createGuidanceResponse(),
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        request_metadata: expect.objectContaining({
          responsePendingAction: null,
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

function createGuidanceResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
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
    ...overrides,
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
