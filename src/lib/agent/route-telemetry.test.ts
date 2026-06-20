import { describe, expect, it, vi } from "vitest";
import type { AgentResponse } from "@/lib/agent/card-types";
import {
  createChatTurnRequestMetadata,
  getRouteAgentEventNames,
  recordAgentEvents,
} from "@/lib/agent/route-telemetry";
import { fakeSnapshot } from "@/lib/fake-data";

const productEventMocks = vi.hoisted(() => ({
  recordProductEventSafely: vi.fn(),
}));

vi.mock("@/lib/data/product-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/product-events")>();

  return {
    ...actual,
    recordProductEventSafely: productEventMocks.recordProductEventSafely,
  };
});

describe("agent route telemetry", () => {
  it("builds stable chat-turn request metadata", () => {
    const metadata = createChatTurnRequestMetadata(
      {
        scenario: "healthy",
        requestKind: "chat",
        selectedPromptChipId: "pattern-assumptions",
        history: [
          {
            role: "user",
            content: "Why?",
          },
        ],
        conversationState: {
          shownCards: [{ type: "insight_card", title: "Pattern assumptions" }],
          lastToolNames: ["get_pattern_assumptions"],
          promptChips: [
            {
              id: "ai-bills",
              label: "Bills",
              prompt: "What bills are coming up?",
            },
          ],
        },
      },
      {
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        snapshot: fakeSnapshot,
        syncStatus: {
          latestSyncRun: {
            provider: "plaid",
            status: "succeeded",
            startedAt: "2026-06-20T00:00:00.000Z",
            completedAt: "2026-06-20T00:00:01.000Z",
            accountCount: 1,
            transactionCount: 2,
            balanceCount: 1,
            errorMessage: null,
          },
          institutions: [
            {
              id: "institution-1",
              provider: "plaid",
              institutionName: "Wise",
              status: "connected",
              lastSuccessfulSyncAt: "2026-06-20T00:00:01.000Z",
              staleAfter: null,
              isStale: false,
              errorCode: null,
              errorMessage: null,
            },
          ],
          hasStaleInstitution: false,
        },
      },
      createAgentResponse({
        audit: {
          toolNames: ["get_pattern_assumptions"],
          usedModel: true,
          quality: createQualityAudit(),
        },
      }),
    );

    expect(metadata).toMatchObject({
      scenario: "healthy",
      requestKind: "chat",
      selectedPromptChipId: "pattern-assumptions",
      historyLength: 1,
      shownCardCount: 1,
      lastToolCount: 1,
      promptChipCount: 1,
      onboardingStatus: "ready",
      hasFinancialData: true,
      hasSnapshot: true,
      syncInstitutionCount: 1,
      syncHasStaleInstitution: false,
      latestSyncStatus: "succeeded",
      responseQuality: createQualityAudit(),
    });
  });

  it("falls back to basic question events without a Pip Cash amount", () => {
    expect(getRouteAgentEventNames(createAgentResponse(), null)).toEqual([
      "agent_question_asked",
    ]);
    expect(getRouteAgentEventNames(createAgentResponse(), null, { isFollowUp: true })).toEqual([
      "agent_question_asked",
      "agent_follow_up_asked",
    ]);
  });

  it("records event payloads with route telemetry fields", async () => {
    productEventMocks.recordProductEventSafely.mockResolvedValue(undefined);
    const response = createAgentResponse({
      cards: [
        {
          type: "insight_card",
          title: "Pattern assumptions",
          summary: "Pip explains the pattern behind today's number.",
          rows: [],
        },
      ],
      usedTools: ["get_pattern_assumptions"],
      responseMode: "show_card",
      audit: {
        toolNames: ["get_pattern_assumptions"],
        usedModel: true,
        guidance: {
          validationOutcome: "shown",
          guidanceSource: "model_draft",
          metricVersion: "v2",
          state: "steady",
          stance: "stable",
          evidenceIds: ["spendable-today"],
        },
      },
    });

    await recordAgentEvents(
      {
        supabase: {} as never,
        userId: "user-1",
      },
      {
        conversationId: "conversation-1",
        message: "What pattern are you using?",
        requestKind: "chat",
        selectedPromptChipId: "ai-pattern",
        scenario: "healthy",
        historyLength: 1,
        response,
        pipCashTodayCents: null,
      },
    );

    expect(productEventMocks.recordProductEventSafely).toHaveBeenCalledTimes(2);
    expect(productEventMocks.recordProductEventSafely).toHaveBeenCalledWith(
      {},
      "user-1",
      "agent_question_asked",
      expect.objectContaining({
        cardTypes: "insight_card",
        usedTools: "get_pattern_assumptions",
        responseMode: "show_card",
        clientAction: "none",
        conversationId: "conversation-1",
        messageLength: "What pattern are you using?".length,
        requestKind: "chat",
        selectedPromptChipId: "ai-pattern",
        scenario: "healthy",
        historyLength: 1,
        isFollowUp: true,
        pipCashTodayCents: null,
        guidanceState: "steady",
        guidanceStance: "stable",
        guidanceSource: "model_draft",
        guidanceValidationOutcome: "shown",
        guidanceEvidenceIds: "spendable-today",
      }),
    );
  });
});

function createQualityAudit(): NonNullable<AgentResponse["audit"]["quality"]> {
  return {
    conversationJob: "explain_number",
    answerPatternId: "insight-card",
    chipFamilyIds: ["pattern-assumptions"],
    repeatedJob: false,
    repeatedTool: false,
    repeatedCard: false,
    repeatedMessage: false,
    repetitionAdjusted: false,
    chipFallbackReason: "none",
  };
}

function createAgentResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    message: "Ready.",
    cards: [],
    promptChips: [],
    usedTools: [],
    responseMode: "chat_only",
    audit: {
      toolNames: [],
      usedModel: false,
    },
    ...overrides,
  };
}
