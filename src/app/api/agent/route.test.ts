import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentResponse } from "@/lib/agent/card-types";
import { fakeSnapshot } from "@/lib/fake-data";

const routeMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getFinancialDataProvider: vi.fn(),
  getCurrentFinancialSnapshot: vi.fn(),
  loadActiveAppAccessGrant: vi.fn(),
  recordAppAccessGrantAccess: vi.fn(),
  recordAgentChatTurnSafely: vi.fn(),
  recordProductEventSafely: vi.fn(),
  runAIAgent: vi.fn(),
  claimAgentModelGate: vi.fn(),
  getAgentModelGateScope: vi.fn(),
  releaseAgentModelGate: vi.fn(),
  loadManualRefreshOnlyForUser: vi.fn(),
  runManualSync: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/data/current-snapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/current-snapshot")>();

  return {
    ...actual,
    getCurrentFinancialSnapshot: routeMocks.getCurrentFinancialSnapshot,
  };
});

vi.mock("@/lib/data/app-access-grants", () => ({
  loadActiveAppAccessGrant: routeMocks.loadActiveAppAccessGrant,
  recordAppAccessGrantAccess: routeMocks.recordAppAccessGrantAccess,
}));

vi.mock("@/lib/data/product-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/product-events")>();

  return {
    ...actual,
    recordProductEventSafely: routeMocks.recordProductEventSafely,
  };
});

vi.mock("@/lib/data/user-settings", () => ({
  loadManualRefreshOnlyForUser: routeMocks.loadManualRefreshOnlyForUser,
}));

vi.mock("@/lib/data/manual-sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/manual-sync")>();

  return {
    ...actual,
    runManualSync: routeMocks.runManualSync,
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

vi.mock("@/lib/agent/agent-model-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/agent-model-gate")>();

  return {
    ...actual,
    claimAgentModelGate: routeMocks.claimAgentModelGate,
    getAgentModelGateScope: routeMocks.getAgentModelGateScope,
    releaseAgentModelGate: routeMocks.releaseAgentModelGate,
  };
});

import { POST } from "@/app/api/agent/route";
import { AgentUnavailableError } from "@/lib/agent/ai-agent";
import {
  AuthenticationRequiredError,
  NoFinancialDataError,
} from "@/lib/data/current-snapshot";
import { SupabaseConfigError } from "@/lib/supabase/env";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/agent", () => {
  beforeEach(() => {
    routeMocks.loadManualRefreshOnlyForUser.mockResolvedValue(false);
    routeMocks.getAgentModelGateScope.mockReturnValue("scope-hash");
    routeMocks.claimAgentModelGate.mockResolvedValue({
      outcome: "allowed",
      leaseId: "lease-1",
    });
    routeMocks.releaseAgentModelGate.mockResolvedValue(undefined);
    routeMocks.createSupabaseAdminClient.mockReturnValue({ kind: "admin" });
    routeMocks.loadActiveAppAccessGrant.mockResolvedValue({
      normalized_email: "tester@example.com",
      status: "active",
      first_accessed_at: null,
    });
    routeMocks.recordAppAccessGrantAccess.mockResolvedValue(undefined);
  });

  it("rejects invalid request bodies with a structured 400 response", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ message: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Message is required.",
    });
  });

  it("returns a setup error instead of fake agent data when Supabase env is missing", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    routeMocks.getCurrentFinancialSnapshot.mockRejectedValue(
      new SupabaseConfigError(
        "Set Supabase env or PIP_SUPABASE_MODE=off before using fake Pip Cash data.",
      ),
    );

    const response = await POST(jsonRequest({ message: "Show the math" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "supabase-config-missing",
      error: "Set Supabase env or PIP_SUPABASE_MODE=off before using fake Pip Cash data.",
    });
    expect(routeMocks.claimAgentModelGate).not.toHaveBeenCalled();
    expect(routeMocks.runAIAgent).not.toHaveBeenCalled();
  });

  it("rejects missing Supabase auth before acquiring a model gate", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ message: "Can I spend $50?" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "authentication-required",
      error: "Sign in to use Pip.",
    });
    expect(routeMocks.claimAgentModelGate).not.toHaveBeenCalled();
    expect(routeMocks.runAIAgent).not.toHaveBeenCalled();
  });

  it("rejects signed-in users without app access before acquiring a model gate", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1", email: "tester@example.com" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.loadActiveAppAccessGrant.mockResolvedValue(null);

    const response = await POST(jsonRequest({ message: "Can I spend $50?" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "app-access-required",
      error: "Pip app access is not active for this account.",
    });
    expect(routeMocks.claimAgentModelGate).not.toHaveBeenCalled();
    expect(routeMocks.runAIAgent).not.toHaveBeenCalled();
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
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
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
    expect(routeMocks.releaseAgentModelGate).toHaveBeenCalledWith("lease-1");
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
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(routeMocks.claimAgentModelGate.mock.invocationCallOrder[0]).toBeLessThan(
      routeMocks.runAIAgent.mock.invocationCallOrder[0],
    );
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
    expect(routeMocks.releaseAgentModelGate).toHaveBeenCalledWith("lease-1");
  });

  it("accepts the production-scale local scenario from the hydrated app", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.runAIAgent.mockResolvedValue(createAgentResponse({
      message: "Testing $50: after that, you would have room left today.",
      cards: [
        {
          type: "purchase_simulation",
          title: "Purchase simulation",
          amountCents: 5000,
          beforeCents: 1200,
          todayRemainingCents: 0,
          todayOverageCents: 3800,
          afterTodayCents: 0,
          monthlyAverageAfterCents: 100,
        },
      ],
      usedTools: ["simulate_purchase"],
      responseMode: "show_card",
    }));

    const response = await POST(
      jsonRequest({
        message: "Can I spend $50?",
        scenario: "production-scale",
        conversationId: "production-scale-browser-smoke",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      usedTools: ["simulate_purchase"],
      responseMode: "show_card",
    });
    expect(routeMocks.getCurrentFinancialSnapshot).toHaveBeenCalledWith({
      scenario: "production-scale",
    });
    expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Can I spend $50?",
        snapshot: fakeSnapshot,
      }),
    );
  });

  it("rate limits guest agent calls before running the model", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockRejectedValue(new AuthenticationRequiredError());
    routeMocks.claimAgentModelGate.mockResolvedValue({
      outcome: "denied",
      retryAfterSeconds: 30,
      reason: "minute_limit",
    });

    const response = await POST(jsonRequest({ message: "hello" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Retry-After")).toBe("30");
    await expect(response.json()).resolves.toMatchObject({
      code: "agent-rate-limited",
      retryAfterSeconds: 30,
    });
    expect(routeMocks.runAIAgent).not.toHaveBeenCalled();
    expect(routeMocks.releaseAgentModelGate).not.toHaveBeenCalled();
  });

  it("fails closed when the agent model gate is unavailable", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockRejectedValue(new AuthenticationRequiredError());
    routeMocks.claimAgentModelGate.mockResolvedValue({
      outcome: "unavailable",
      retryAfterSeconds: 30,
    });

    const response = await POST(jsonRequest({ message: "hello" }));

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    await expect(response.json()).resolves.toMatchObject({
      code: "agent-model-gate-unavailable",
    });
    expect(routeMocks.runAIAgent).not.toHaveBeenCalled();
  });

  it("fails closed when scope hashing is not configured", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    routeMocks.getCurrentFinancialSnapshot.mockRejectedValue(new AuthenticationRequiredError());
    routeMocks.getAgentModelGateScope.mockImplementation(() => {
      throw new Error("PIP_RATE_LIMIT_SALT is required in production.");
    });

    const response = await POST(jsonRequest({ message: "hello" }));

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    await expect(response.json()).resolves.toMatchObject({
      code: "agent-model-gate-unavailable",
    });
    expect(routeMocks.claimAgentModelGate).not.toHaveBeenCalled();
    expect(routeMocks.runAIAgent).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Agent model gate claim failed.",
      "PIP_RATE_LIMIT_SALT is required in production.",
    );
    warn.mockRestore();
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
        conversationId: "conversation-1",
        scenario: "healthy",
        selectedPromptChipId: "ai-spend",
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
        conversationId: "conversation-1",
        requestKind: "chat",
        selectedPromptChipId: "ai-spend",
        scenario: "healthy",
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

  it("persists recurring bill corrections from agent actions and reloads the number", async () => {
    enableSupabaseEnv();
    const tableCalls: unknown[][] = [];
    const supabase = createSupabaseClient({ id: "user-1" }, undefined, {
      tableCalls,
    });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(supabase);
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);
    routeMocks.runAIAgent.mockImplementation(async (input) => {
      const result = await input.actions?.correctRecurringObligation?.({
        merchantName: "City Power",
        treatment: "bill",
        expectedAmountCents: 8400,
        expectedDay: 3,
      });

      return createAgentResponse({
        message: result?.message,
        usedTools: ["correct_recurring_obligation"],
        responseMode: "chat_only",
        clientAction: result?.clientAction,
      });
    });

    const response = await POST(jsonRequest({ message: "Treat City Power as a monthly bill" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      clientAction: {
        type: "reload",
      },
      usedTools: ["correct_recurring_obligation"],
    });
    expect(tableCalls).toContainEqual([
      "upsert",
      "recurring_obligation_rules",
      expect.objectContaining({
        user_id: "user-1",
        merchant_key: "city-power",
        label: "City Power",
        expected_amount_cents: 8400,
        expected_day: 3,
        source: "user_confirmed",
        status: "active",
      }),
      { onConflict: "user_id,merchant_key" },
    ]);
    expect(tableCalls).toContainEqual([
      "update",
      "pip_cash_snapshots",
      {
        stale: true,
      },
    ]);
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "recurring_obligation_corrected",
      expect.objectContaining({
        merchantName: "City Power",
        treatment: "bill",
        expectedAmountCents: 8400,
        expectedDay: 3,
      }),
    );
  });

  it("asks for the monthly day before saving a bill rule that cannot infer a schedule", async () => {
    enableSupabaseEnv();
    const tableCalls: unknown[][] = [];
    const supabase = createSupabaseClient({ id: "user-1" }, undefined, {
      tableCalls,
    });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(supabase);
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue({
      ...fakeSnapshot,
      transactions: [],
    });
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);
    routeMocks.runAIAgent.mockImplementation(async (input) => {
      const result = await input.actions?.correctRecurringObligation?.({
        merchantName: "City Power",
        treatment: "bill",
        expectedAmountCents: 8400,
      });

      return createAgentResponse({
        message: result?.message,
        usedTools: ["correct_recurring_obligation"],
        responseMode: "chat_only",
        clientAction: result?.clientAction,
      });
    });

    const response = await POST(jsonRequest({ message: "Treat City Power as an $84 monthly bill" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.message).toContain("What day of the month");
    expect(tableCalls).not.toContainEqual([
      "upsert",
      "recurring_obligation_rules",
      expect.anything(),
      expect.anything(),
    ]);
    expect(routeMocks.recordProductEventSafely).not.toHaveBeenCalledWith(
      supabase,
      "user-1",
      "recurring_obligation_corrected",
      expect.anything(),
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

  it("returns an explicit manual-only result when chat asks to refresh disabled data", async () => {
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
            institution_name: "Capital One",
            status: "connected",
            last_successful_sync_at: "2026-06-20T21:53:25.485Z",
            stale_after: "2026-06-21T21:53:25.485Z",
            error_code: null,
            error_message: null,
            updated_at: "2026-06-20T21:53:25.485Z",
          },
        ],
      },
    );
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
    routeMocks.loadManualRefreshOnlyForUser.mockResolvedValue(true);
    routeMocks.runAIAgent.mockImplementation(async (input) => {
      const result = await input.actions?.refreshFinancialData?.();

      return createAgentResponse({
        message: result?.message,
        usedTools: ["refresh_financial_data"],
        responseMode: "update_context",
      });
    });

    const response = await POST(jsonRequest({ message: "Refresh my connected data" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      message: "Automatic refresh is disabled for this account.",
      usedTools: ["refresh_financial_data"],
    });
    expect(routeMocks.loadManualRefreshOnlyForUser).toHaveBeenCalledWith(supabase, "user-1");
    expect(routeMocks.runManualSync).not.toHaveBeenCalled();
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
  user: { id: string; email?: string } | null,
  settings: Record<string, unknown> | null = {
    privacy_consent_at: "2026-06-07T00:00:00.000Z",
  },
  options: {
    connectedInstitutions?: Array<Record<string, unknown>>;
    syncRuns?: Array<Record<string, unknown>>;
    tableCalls?: unknown[][];
    transactions?: Array<Record<string, unknown>>;
  } = {},
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: user
            ? {
                email: "tester@example.com",
                ...user,
              }
            : null,
        },
        error: null,
      }),
    },
    from: vi.fn((tableName: string) => {
      options.tableCalls?.push(["from", tableName]);

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

      if (tableName === "recurring_obligation_rules") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
          upsert: vi.fn((payload, optionsArg) => {
            options.tableCalls?.push(["upsert", tableName, payload, optionsArg]);

            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "rule-1",
                  user_id: payload.user_id,
                  merchant_key: payload.merchant_key,
                  label: payload.label,
                  expected_amount_cents: payload.expected_amount_cents,
                  expected_day: payload.expected_day,
                  cadence: payload.cadence,
                  source: payload.source,
                  status: payload.status,
                  last_confirmed_at: payload.last_confirmed_at ?? null,
                  created_at: "2026-06-20T00:00:00.000Z",
                  updated_at: payload.updated_at,
                },
                error: null,
              }),
            };
          }),
        };
      }

      if (tableName === "accounts") {
        const query = {
          data: [
            {
              id: "checking",
              user_id: "user-1",
              institution_id: "institution-1",
              provider_account_id: "provider-checking",
              name: "Everyday Checking",
              institution_name: "Northstar Bank",
              kind: "checking",
              balance_cents: 100000,
              available_balance_cents: 100000,
              last_four: "1234",
              is_protected_savings: false,
              active: true,
              created_at: "2026-06-20T00:00:00.000Z",
              updated_at: "2026-06-20T00:00:00.000Z",
            },
          ],
          error: null,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };

        return query;
      }

      if (tableName === "account_preferences" || tableName === "missing_card_preferences") {
        const query = {
          data: [],
          error: null,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };

        return query;
      }

      if (tableName === "transactions") {
        const query = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: options.transactions ?? [],
            error: null,
          }),
        };

        return query;
      }

      if (tableName === "savings_goals") {
        const query = {
          data: [],
          error: null,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
        };

        return query;
      }

      if (tableName === "pip_cash_snapshots") {
        const query = {
          error: null,
          update: vi.fn((payload) => {
            options.tableCalls?.push(["update", tableName, payload]);

            return query;
          }),
          eq: vi.fn((column, value) => {
            options.tableCalls?.push(["eq", tableName, column, value]);

            return query;
          }),
        };

        return query;
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
