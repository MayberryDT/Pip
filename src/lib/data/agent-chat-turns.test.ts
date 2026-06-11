import { describe, expect, it, vi } from "vitest";
import { recordAgentChatTurn } from "@/lib/data/agent-chat-turns";
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
