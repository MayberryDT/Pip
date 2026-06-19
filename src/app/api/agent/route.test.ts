import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentResponse } from "@/lib/agent/card-types";
import { fakeSnapshot } from "@/lib/fake-data";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getFinancialDataProvider: vi.fn(),
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

vi.mock("@/lib/providers/provider-registry", async () => {
  const errors = await vi.importActual<typeof import("@/lib/providers/provider-errors")>(
    "@/lib/providers/provider-errors",
  );

  return {
    getFinancialDataProvider: routeMocks.getFinancialDataProvider,
    ProviderUnavailableError: errors.ProviderUnavailableError,
  };
});

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
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ message: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Message is required.",
    });
  });

  it("returns a structured AI error when model configuration is missing", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
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
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
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
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
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
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
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
              type: "pip_cash_explanation",
              title: "Why this number changed",
            },
          ],
          lastToolNames: ["get_pip_cash_drivers"],
          pendingAction: {
            type: "create_savings_goal",
            name: "Japan trip",
            missing: ["target_amount"],
          },
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
              type: "pip_cash_explanation",
              title: "Why this number changed",
            },
          ],
          lastToolNames: ["get_pip_cash_drivers"],
          pendingAction: {
            type: "create_savings_goal",
            name: "Japan trip",
            missing: ["target_amount"],
          },
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

  it("records guidance source in authenticated product events", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);
    routeMocks.runAIAgent.mockResolvedValue(createAgentResponse({
      cards: [
        {
          type: "guidance_card",
          title: "My read",
          stance: "watch",
          summary: "Recent spending is running hot.",
          rows: [
            {
              label: "Main pressure",
              detail: "Recent everyday spending is ahead of pace.",
              tone: "warning",
              evidenceIds: ["recent-spending-hot"],
            },
          ],
        },
      ],
      usedTools: ["get_financial_guidance_context"],
      responseMode: "guidance",
      audit: {
        toolNames: ["get_financial_guidance_context"],
        usedModel: true,
        guidance: {
          validationOutcome: "shown",
          guidanceSource: "model_draft",
          metricVersion: "v2",
          stance: "watch",
          evidenceIds: ["recent-spending-hot"],
        },
      },
    }));

    const response = await POST(jsonRequest({ message: "How am I doing?" }));

    expect(response.status).toBe(200);
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "financial_guidance_card_drafted",
      expect.objectContaining({
        guidanceSource: "model_draft",
        guidanceValidationOutcome: "shown",
        guidanceStance: "watch",
        guidanceEvidenceIds: "recent-spending-hot",
      }),
    );
  });

  it("records redacted Plaid connect failures from agent actions", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    const plaidError = Object.assign(
      new Error("Request failed with status code 400"),
      {
        name: "AxiosError",
        response: {
          data: {
            error_code: "INVALID_FIELD",
            error_type: "INVALID_REQUEST",
            error_message:
              "secret must be a properly formatted string, not PLAID_SECRET=provider-secret",
            request_id: "plaid-request-1",
          },
        },
      },
    );
    const createConnectSession = vi.fn().mockRejectedValue(plaidError);
    routeMocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession,
    });
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.runAIAgent.mockImplementation(async (input) => {
      const result = await input.actions?.startPlaidLink?.({
        mode: "connect",
      });

      return createAgentResponse({
        message: result?.message,
        usedTools: ["start_new_account_connection"],
        responseMode: "clarify",
        audit: {
          toolNames: ["start_new_account_connection"],
          usedModel: true,
        },
      });
    });

    const response = await POST(jsonRequest({ message: "Add a new bank" }));
    const payload = await response.json();
    const safeMessage =
      "Plaid INVALID_FIELD: secret must be a properly formatted string, not PLAID_SECRET=[redacted]";

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      message: safeMessage,
      usedTools: ["start_new_account_connection"],
    });
    expect(createConnectSession).toHaveBeenCalledWith("user-1", {
      mode: "connect",
    });
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "connect_session_failed",
      expect.objectContaining({
        provider: "plaid",
        status: "error",
        mode: "connect",
        institutionId: null,
        errorName: "AxiosError",
        errorCode: "INVALID_FIELD",
        errorType: "INVALID_REQUEST",
        errorRequestId: "plaid-request-1",
        errorKeys: "error_code,error_type,error_message,request_id",
        errorMessage: safeMessage,
      }),
    );
    expect(JSON.stringify(routeMocks.recordProductEventSafely.mock.calls)).not.toContain(
      "provider-secret",
    );
    expect(JSON.stringify(payload)).not.toContain("provider-secret");
  });

  it("returns a deterministic Plaid redirect configuration message", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    const plaidError = Object.assign(
      new Error("Request failed with status code 400"),
      {
        name: "AxiosError",
        response: {
          data: {
            error_code: "INVALID_FIELD",
            error_type: "INVALID_REQUEST",
            error_message:
              "OAuth redirect URI must be configured in the developer dashboard.",
            request_id: "plaid-request-redirect",
          },
        },
      },
    );
    const createConnectSession = vi.fn().mockRejectedValue(plaidError);
    routeMocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession,
    });
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.runAIAgent.mockImplementation(async (input) => {
      const result = await input.actions?.startPlaidLink?.({
        mode: "connect",
      });

      return createAgentResponse({
        message: result?.message,
        usedTools: ["start_new_account_connection"],
        responseMode: "clarify",
      });
    });

    const response = await POST(jsonRequest({ message: "I need to add a credit card" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      message:
        "Account linking is misconfigured right now. Plaid needs Pip's OAuth redirect URI allowlisted before new accounts can be added.",
      usedTools: ["start_new_account_connection"],
    });
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "connect_session_failed",
      expect.objectContaining({
        provider: "plaid",
        status: "error",
        handledStatus: "plaid_redirect_uri_not_allowed",
        errorCode: "INVALID_FIELD",
        errorType: "INVALID_REQUEST",
        errorRequestId: "plaid-request-redirect",
        errorMessage:
          "Plaid INVALID_FIELD: OAuth redirect URI must be configured in the developer dashboard.",
        userMessage:
          "Account linking is misconfigured right now. Plaid needs Pip's OAuth redirect URI allowlisted before new accounts can be added.",
      }),
    );
  });

  it("passes a successful Plaid add-account session through as an open Plaid client action", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    const createConnectSession = vi.fn().mockResolvedValue({
      provider: "plaid",
      status: "ready",
      message: "Plaid Link is ready.",
      connect: {
        kind: "plaid",
        linkToken: "link-token-1",
        environment: "sandbox",
        products: ["transactions"],
        mode: "connect",
      },
    });
    routeMocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession,
    });
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.runAIAgent.mockImplementation(async (input) => {
      const result = await input.actions?.startPlaidLink?.({
        mode: "connect",
      });

      return createAgentResponse({
        message: result?.message,
        usedTools: ["start_new_account_connection"],
        responseMode: "update_context",
        clientAction: result?.clientAction,
      });
    });

    const response = await POST(jsonRequest({ message: "add a card" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      clientAction: {
        type: "open_plaid",
        plaid: {
          linkToken: "link-token-1",
          mode: "connect",
        },
      },
      usedTools: ["start_new_account_connection"],
    });
    expect(createConnectSession).toHaveBeenCalledWith("user-1", {
      mode: "connect",
    });
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "connect_session_created",
      expect.objectContaining({
        provider: "plaid",
        status: "ready",
        mode: "connect",
      }),
    );
  });

  it("uses a fresh Plaid connect session when the only stale institution has an undecryptable token", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(
      { id: "user-1" },
      {
        privacy_consent_at: "2026-06-07T00:00:00.000Z",
      },
      {
        connectedInstitutions: [
          {
            id: "inst-1",
            user_id: "user-1",
            provider: "plaid",
            institution_name: "Wise (US)",
            status: "failed",
            last_successful_sync_at: "2026-06-08T00:00:00.000Z",
            stale_after: "2026-06-09T00:00:00.000Z",
            error_code: "provider-token-decrypt-failed",
            error_message: "This Plaid connection needs to be reconnected before Pip can refresh it.",
            updated_at: "2026-06-14T23:46:00.000Z",
          },
        ],
      },
    );
    const createConnectSession = vi.fn().mockResolvedValue({
      provider: "plaid",
      status: "ready",
      message: "Plaid Link is ready.",
      connect: {
        kind: "plaid",
        linkToken: "link-token-fresh",
        environment: "production",
        products: ["transactions"],
        mode: "connect",
      },
    });
    routeMocks.getFinancialDataProvider.mockReturnValue({
      createConnectSession,
    });
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.runAIAgent.mockImplementation(async (input) => {
      const result = await input.actions?.startPlaidLink?.();

      return createAgentResponse({
        message: result?.message,
        usedTools: ["start_plaid_link"],
        responseMode: "update_context",
        clientAction: result?.clientAction,
      });
    });

    const response = await POST(jsonRequest({ message: "Connect data" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      clientAction: {
        type: "open_plaid",
        plaid: {
          linkToken: "link-token-fresh",
          mode: "connect",
        },
      },
      usedTools: ["start_plaid_link"],
    });
    expect(createConnectSession).toHaveBeenCalledWith("user-1", {
      mode: "connect",
    });
    expect(createConnectSession).not.toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        mode: "repair",
      }),
    );
  });

  it("passes authenticated no-data state into the agent without answering from fake rows", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
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
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
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

  it("passes Android shell platform context into the agent", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.runAIAgent.mockResolvedValue(createAgentResponse());

    const response = await POST(jsonRequest(
      { message: "How much does Pip cost?" },
      { "user-agent": "Mozilla/5.0 PipAndroid/1 VersionCode/13" },
    ));

    expect(response.status).toBe(200);
    expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "android_webview",
      }),
    );
  });

  it("passes selected quality variants into the agent", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.runAIAgent.mockResolvedValue(createAgentResponse());

    const response = await POST(jsonRequest(
      { message: "hi" },
      { "x-pip-agent-variant": "direct-answer" },
    ));

    expect(response.status).toBe(200);
    expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityVariant: "direct-answer",
      }),
    );
  });

  it("rejects oversized history before calling the model", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

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
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createSupabaseClient(
  user: { id: string } | null,
  settings: Record<string, unknown> | null = {
    privacy_consent_at: "2026-06-07T00:00:00.000Z",
  },
  options: {
    connectedInstitutions?: Array<Record<string, unknown>>;
    syncRuns?: Array<Record<string, unknown>>;
  } = {},
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
      if (tableName === "user_settings") {
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
      }

      if (tableName === "connected_institutions") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: options.connectedInstitutions?.[0] ?? null,
            error: null,
          }),
          order: vi.fn().mockResolvedValue({
            data: options.connectedInstitutions ?? [],
            error: null,
          }),
        };
      }

      if (tableName === "sync_runs") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: options.syncRuns ?? [],
            error: null,
          }),
        };
      }

      throw new Error(`Unexpected table ${tableName}`);
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
