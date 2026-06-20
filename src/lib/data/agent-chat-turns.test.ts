import { describe, expect, it, vi } from "vitest";
import { recordAgentChatTurn, recordAgentChatTurnSafely } from "@/lib/data/agent-chat-turns";
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

  it("redacts secret-shaped values before storing operator chat transcripts", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient<Database>;

    await recordAgentChatTurn(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessage: "Can you check access_token=provider-secret?",
      errorMessage: "Tool failed with sk-test-secret",
      response: {
        ...createGuidanceResponse(),
        message: "I found Bearer abc123 in the provider error.",
        promptChips: [
          {
            id: "retry",
            label: "Retry",
            prompt: "Retry with public_token=public-secret",
          },
        ],
      },
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_message: "Can you check access_token=[redacted]",
        assistant_message: "I found Bearer [redacted] in the provider error.",
        error_message: "Tool failed with [redacted]",
        prompt_chips: [
          {
            id: "retry",
            label: "Retry",
            prompt: "Retry with public_token=[redacted]",
          },
        ],
      }),
    );
    expect(JSON.stringify(insert.mock.calls)).not.toContain("provider-secret");
    expect(JSON.stringify(insert.mock.calls)).not.toContain("sk-test-secret");
    expect(JSON.stringify(insert.mock.calls)).not.toContain("public-secret");
  });

  it("redacts sensitive values when safe chat turn logging warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const insert = vi.fn().mockResolvedValue({
      error: new Error("insert failed: access_token=provider-secret sk-test-secret"),
    });
    const supabase = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient<Database>;

    await recordAgentChatTurnSafely(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessage: "hello",
    });

    expect(warn).toHaveBeenCalledWith(
      "Agent chat turn logging failed.",
      expect.not.stringContaining("provider-secret"),
    );
    expect(warn).toHaveBeenCalledWith(
      "Agent chat turn logging failed.",
      expect.not.stringContaining("sk-test-secret"),
    );
    expect(warn).toHaveBeenCalledWith(
      "Agent chat turn logging failed.",
      expect.stringContaining("[redacted]"),
    );
    warn.mockRestore();
  });

  it("logs useful sanitized chat-turn warnings from message-shaped data errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const insert = vi.fn().mockResolvedValue({
      error: {
        message: "insert failed: public_token=public-secret Authorization: Bearer abc123",
      },
    });
    const supabase = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient<Database>;

    await recordAgentChatTurnSafely(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessage: "hello",
    });

    expect(warn).toHaveBeenCalledWith(
      "Agent chat turn logging failed.",
      "insert failed: public_token=[redacted] Authorization=[redacted]",
    );
    warn.mockRestore();
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
