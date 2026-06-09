import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentResponse } from "@/lib/agent/card-types";
import { fakeSnapshot } from "@/lib/fake-data";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentFinancialSnapshot: vi.fn(),
  recordAgentChatTurnSafely: vi.fn(),
  recordProductEventSafely: vi.fn(),
  runAIAgent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/current-snapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/current-snapshot")>();

  return {
    ...actual,
    getCurrentFinancialSnapshot: routeMocks.getCurrentFinancialSnapshot,
  };
});

vi.mock("@/lib/data/product-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/product-events")>();

  return {
    ...actual,
    recordProductEventSafely: routeMocks.recordProductEventSafely,
  };
});

vi.mock("@/lib/data/agent-chat-turns", () => ({
  recordAgentChatTurnSafely: routeMocks.recordAgentChatTurnSafely,
}));

vi.mock("@/lib/agent/ai-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/ai-agent")>();

  return {
    ...actual,
    runAIAgent: routeMocks.runAIAgent,
  };
});

import { POST } from "@/app/api/agent/route";
import { AgentUnavailableError } from "@/lib/agent/ai-agent";
import {
  AuthenticationRequiredError,
  NoFinancialDataError,
} from "@/lib/data/current-snapshot";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/agent", () => {
  it("rejects invalid request bodies with a structured 400 response", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ message: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Message is required.",
    });
  });

  it("returns a structured AI error when model configuration is missing", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.runAIAgent.mockRejectedValue(
      new AgentUnavailableError({
        code: "missing-openai-config",
        message: "AI is not configured.",
        detail: "Set OPENAI_API_KEY, OPENAI_BASE_URL, or enable Netlify AI Gateway before using the agent.",
      }),
    );

    const response = await POST(jsonRequest({ message: "Can I spend $50?" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "missing-openai-config",
      error: "AI is not configured.",
    });
    expect(routeMocks.recordAgentChatTurnSafely).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        conversationId: expect.stringMatching(/^server-/),
        userMessage: "Can I spend $50?",
        errorMessage: expect.stringContaining("AI is not configured."),
      }),
    );
  });

  it("calls the real agent route path without runtime injection", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.runAIAgent.mockResolvedValue(createAgentResponse({
      cards: [
        {
          type: "purchase_simulation",
          title: "Purchase simulation",
          amountCents: 1200,
          beforeCents: 4300,
          todayRemainingCents: 3100,
          todayOverageCents: 0,
          afterTodayCents: 4300,
          monthlyAverageAfterCents: 100,
        },
      ],
      usedTools: ["simulate_purchase"],
      responseMode: "show_card",
    }));

    const response = await POST(
      jsonRequest(
        {
          message: "Can I spend $12?",
          conversationId: "web-test-conversation",
          history: [
            {
              role: "user",
              content: "Why this number?",
            },
            {
              role: "assistant",
              content: "Rent is included.",
            },
          ],
        },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      cards: [
        {
          type: "purchase_simulation",
          amountCents: 1200,
        },
      ],
      audit: {
        usedModel: true,
        toolNames: ["simulate_purchase"],
      },
      responseMode: "show_card",
      usedTools: ["simulate_purchase"],
    });
    expect(payload.promptChips).toEqual([]);
    expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Can I spend $12?",
        snapshot: fakeSnapshot,
      }),
    );
    expect(routeMocks.runAIAgent.mock.calls[0]).toHaveLength(1);
    expect(routeMocks.recordAgentChatTurnSafely).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        conversationId: "web-test-conversation",
        userMessage: "Can I spend $12?",
        response: expect.objectContaining({
          usedTools: ["simulate_purchase"],
        }),
        requestMetadata: expect.objectContaining({
          historyLength: 2,
          hasFinancialData: true,
        }),
      }),
    );
  });

  it("returns silent prompt chip refreshes without recording a chat turn", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.runAIAgent.mockResolvedValue(createAgentResponse({
      message: "Ready.",
      promptChips: [
        {
          id: "ai-upcoming-bills",
          label: "Upcoming bills",
          prompt: "What bills are coming up?",
        },
      ],
    }));

    const response = await POST(
      jsonRequest({
        message: "Create prompt chips for the current Pip screen.",
        requestKind: "prompt_chips",
        conversationId: "web-test-conversation",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.promptChips).toEqual([
      {
        id: "ai-upcoming-bills",
        label: "Upcoming bills",
        prompt: "What bills are coming up?",
      },
    ]);
    expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestKind: "prompt_chips",
        snapshot: fakeSnapshot,
      }),
    );
    expect(routeMocks.recordAgentChatTurnSafely).not.toHaveBeenCalled();
    expect(routeMocks.recordProductEventSafely).not.toHaveBeenCalled();
  });

  it("passes conversation state into the agent so duplicate cards can be suppressed", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.runAIAgent.mockResolvedValue(createAgentResponse({
      cards: [],
      usedTools: [],
      responseMode: "chat_only",
    }));

    const response = await POST(
      jsonRequest({
        message: "But why?",
        conversationState: {
          shownCards: [
            {
              type: "free_cash_explanation",
              title: "Why this number changed",
            },
          ],
          lastToolNames: ["get_free_cash_drivers"],
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      cards: [],
      responseMode: "chat_only",
      usedTools: [],
      audit: {
        toolNames: [],
        usedModel: true,
      },
    });
    expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationState: {
          shownCards: [
            {
              type: "free_cash_explanation",
              title: "Why this number changed",
            },
          ],
          lastToolNames: ["get_free_cash_drivers"],
        },
      }),
    );
  });

  it("records authenticated product events derived from agent cards", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);
    routeMocks.runAIAgent.mockResolvedValue(createAgentResponse({
      cards: [
        {
          type: "purchase_simulation",
          title: "Purchase simulation",
          amountCents: 5000,
          beforeCents: 4300,
          todayRemainingCents: -700,
          todayOverageCents: 700,
          afterTodayCents: 4300,
          monthlyAverageAfterCents: -23,
        },
      ],
      usedTools: ["simulate_purchase"],
      responseMode: "show_card",
    }));

    const response = await POST(
      jsonRequest({
        message: "Can I spend $50?",
        history: [
          {
            role: "user",
            content: "Can I spend $25?",
          },
          {
            role: "assistant",
            content: "That would move Spendable Cash.",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "agent_question_asked",
      expect.objectContaining({
        cardTypes: "purchase_simulation",
        usedTools: "simulate_purchase",
        responseMode: "show_card",
        historyLength: 2,
        isFollowUp: true,
      }),
    );
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "agent_follow_up_asked",
      expect.objectContaining({
        cardTypes: "purchase_simulation",
        historyLength: 2,
        isFollowUp: true,
      }),
    );
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "purchase_simulation_requested",
      expect.objectContaining({
        cardTypes: "purchase_simulation",
        messageLength: "Can I spend $50?".length,
      }),
    );
  });

  it("passes authenticated no-data state into the agent without answering from fake rows", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockRejectedValue(new NoFinancialDataError());
    routeMocks.runAIAgent.mockResolvedValue(createAgentResponse({
      usedTools: ["get_onboarding_state"],
      responseMode: "chat_only",
    }));

    const response = await POST(jsonRequest({ message: "Why this number?" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      usedTools: ["get_onboarding_state"],
      responseMode: "chat_only",
    });
    expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: undefined,
        onboardingState: {
          status: "ready",
          hasFinancialData: false,
        },
      }),
    );
  });

  it("passes missing auth into the agent as guest onboarding state", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockRejectedValue(new AuthenticationRequiredError());
    routeMocks.runAIAgent.mockResolvedValue(createAgentResponse({
      usedTools: ["start_google_oauth"],
      responseMode: "update_context",
      clientAction: {
        type: "oauth_redirect",
        url: "/api/auth/oauth/google",
      },
    }));

    const response = await POST(jsonRequest({ message: "Why this number?" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      clientAction: {
        type: "oauth_redirect",
      },
    });
    expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: undefined,
        onboardingState: {
          status: "guest",
          hasFinancialData: false,
        },
      }),
    );
  });

  it("rejects oversized history before calling the model", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");

    const response = await POST(
      jsonRequest({
        message: "Can I spend $12?",
        history: Array.from({ length: 9 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: `message ${index}`,
        })),
      }),
    );

    expect(response.status).toBe(400);
  });
});

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/agent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function enableSupabaseEnv() {
  vi.stubEnv("FREE_CASH_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createSupabaseClient(
  user: { id: string } | null,
  settings: Record<string, unknown> | null = {
    privacy_consent_at: "2026-06-07T00:00:00.000Z",
  },
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: null,
      }),
    },
    from: vi.fn((tableName: string) => {
      if (tableName !== "user_settings") {
        throw new Error(`Unexpected table ${tableName}`);
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: settings,
          error: null,
        }),
        upsert: vi.fn().mockResolvedValue({
          error: null,
        }),
      };
    }),
  };
}

function createAgentResponse(
  overrides: Partial<AgentResponse> = {},
): AgentResponse {
  const usedTools = overrides.usedTools ?? [];
  const audit = {
    toolNames: usedTools,
    usedModel: true,
    model: "gpt-5-nano",
    transport: "openai-direct" as const,
    ...overrides.audit,
  };

  return {
    message: "Model-authored test response.",
    cards: [],
    promptChips: [],
    usedTools,
    responseMode: "chat_only",
    ...overrides,
    audit,
  };
}
