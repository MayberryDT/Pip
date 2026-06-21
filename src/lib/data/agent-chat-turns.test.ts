import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("stores bounded message and prompt-chip excerpts", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient<Database>;

    await recordAgentChatTurn(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessage: "u".repeat(520),
      errorMessage: "e".repeat(260),
      response: {
        ...createGuidanceResponse(),
        message: "a".repeat(540),
        promptChips: [
          {
            id: "long-chip",
            label: "l".repeat(80),
            prompt: "p".repeat(200),
          },
        ],
      },
    });

    const inserted = insert.mock.calls[0][0];
    expect(inserted.user_message.length).toBeLessThan(500);
    expect(inserted.assistant_message.length).toBeLessThan(520);
    expect(inserted.error_message).toHaveLength(240);
    expect(inserted.prompt_chips[0].label).toHaveLength(56);
    expect(inserted.prompt_chips[0].prompt).toHaveLength(160);
  });

  it("redacts payment account details before storing chat excerpts", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient<Database>;

    await recordAgentChatTurn(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessage: [
        "My card number is 4242 4242 4242 4242.",
        "The account ending in 1234 has account_number=1234567890.",
        "It also shows last_four=4242 and mask: 9876.",
      ].join(" "),
      errorMessage: "Provider returned routing number 123456789.",
      response: {
        ...createGuidanceResponse(),
        message: "I checked the card ending in 4242 and account number is 1234567890.",
      },
    });

    const serializedInsert = JSON.stringify(insert.mock.calls[0][0]);
    expect(serializedInsert).not.toContain("4242 4242 4242 4242");
    expect(serializedInsert).not.toContain("card ending in 4242");
    expect(serializedInsert).not.toContain("account ending in 1234");
    expect(serializedInsert).not.toContain("account_number=1234567890");
    expect(serializedInsert).not.toContain("last_four=4242");
    expect(serializedInsert).not.toContain("mask: 9876");
    expect(serializedInsert).not.toContain("routing number 123456789");
    expect(serializedInsert).not.toContain("account number is 1234567890");
    expect(serializedInsert).toContain("[redacted]");
  });

  it("stores only allowlisted request metadata and derived guidance summary", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient<Database>;

    await recordAgentChatTurn(supabase, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessage: "hello",
      requestMetadata: {
        scenario: "ready",
        requestKind: "chat",
        selectedPromptChipId: "chip-1",
        historyLength: 2,
        shownCardCount: 1,
        lastToolCount: 3,
        promptChipCount: 2,
        onboardingStatus: "ready",
        hasFinancialData: true,
        hasSnapshot: true,
        syncInstitutionCount: 1,
        syncHasStaleInstitution: false,
        latestSyncStatus: "success",
        responseQuality: {
          conversationJob: "spending_check",
          answerPatternId: "daily_safe_to_spend",
          chipFamilyIds: ["safe-to-spend", "cutback"],
          repeatedJob: false,
          repeatedTool: false,
          repeatedCard: false,
          repeatedMessage: false,
          repetitionAdjusted: true,
          chipFallbackReason: "none",
          notes: "raw quality detail",
        },
        errorCode: "model_failed",
        status: "failed",
        history: [{ role: "user", content: "raw transcript" }],
        conversationState: { accountNumber: "123456789" },
        providerPayload: { access_token: "provider-secret" },
        accounts: [{ last_four: "4242" }],
        transactions: [{ merchant: "Sensitive Merchant" }],
      },
      response: createGuidanceResponse(),
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        request_metadata: {
          scenario: "ready",
          requestKind: "chat",
          selectedPromptChipId: "chip-1",
          historyLength: 2,
          shownCardCount: 1,
          lastToolCount: 3,
          promptChipCount: 2,
          onboardingStatus: "ready",
          hasFinancialData: true,
          hasSnapshot: true,
          syncInstitutionCount: 1,
          syncHasStaleInstitution: false,
          latestSyncStatus: "success",
          responseQuality: "spending_check:daily_safe_to_spend:adjusted",
          errorCode: "model_failed",
          status: "failed",
          guidanceSource: "model_draft",
          guidanceValidationOutcome: "shown",
          guidanceStance: "watch",
          guidanceEvidenceIds: ["recent-spending-hot"],
        },
      }),
    );
    expect(JSON.stringify(insert.mock.calls[0][0])).not.toContain("raw transcript");
    expect(JSON.stringify(insert.mock.calls[0][0])).not.toContain("provider-secret");
    expect(JSON.stringify(insert.mock.calls[0][0])).not.toContain("Sensitive Merchant");
  });
});

describe("agent chat retention schema", () => {
  it("defines a service-role-only purge function for old chat turns", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260621130000_agent_chat_retention.sql"),
      "utf8",
    );

    expect(migration).toContain("create or replace function public.purge_agent_chat_turns");
    expect(migration).toContain("security definer");
    expect(migration).toContain("delete from public.agent_chat_turns");
    expect(migration).toContain("created_at < now() - make_interval(days => p_retention_days)");
    expect(migration).toContain(
      "revoke all on function public.purge_agent_chat_turns(integer) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.purge_agent_chat_turns(integer) to service_role;",
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
