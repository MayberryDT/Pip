import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentRequestError,
  fetchAgentResponse,
  getConversationState,
  getThreadHistory,
  mergePromptChipHistory,
  type AgentThreadItem,
} from "@/components/pip-home/agent-session";
import type { AgentResponse, PromptChip } from "@/lib/agent/card-types";

const responseFixture: AgentResponse = {
  message: "I found the pattern.",
  cards: [
    {
      type: "insight_card",
      title: "Pattern assumptions",
      summary: "Pip explains the assumptions behind today.",
      rows: [
        {
          id: "pattern",
          label: "Pattern",
          detail: "Recent spending is steady.",
          tone: "neutral",
        },
        {
          id: "cash",
          label: "Cash",
          detail: "Cash reality is included.",
          tone: "neutral",
        },
        {
          id: "bills",
          label: "Bills",
          detail: "Known bills are held back.",
          tone: "neutral",
        },
      ],
    },
  ],
  promptChips: [
    {
      id: "ai-next-few-days",
      label: "What happens in the next few days?",
      prompt: "Show my Spendable Cash forecast",
    },
  ],
  usedTools: ["get_pattern_assumptions"],
  responseMode: "show_card",
  audit: {
    toolNames: ["get_pattern_assumptions"],
    usedModel: false,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agent session helpers", () => {
  it("serializes agent requests with compact history and conversation state", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(responseFixture),
    });
    vi.stubGlobal("fetch", fetchMock);
    const visibleChips: PromptChip[] = [
      {
        id: "ai-show-math",
        label: "Show how the math works",
        prompt: "Show the math",
      },
    ];
    const chipHistory: PromptChip[] = [
      {
        id: "ai-upcoming-bills",
        label: "What bills are coming up?",
        prompt: "What bills are coming up?",
      },
    ];
    const thread: AgentThreadItem[] = [
      {
        id: "turn-1",
        userText: "What pattern are you using?",
        response: responseFixture,
      },
    ];

    await fetchAgentResponse(
      "Refresh chips",
      "healthy",
      thread,
      visibleChips,
      chipHistory,
      "conversation-1",
      undefined,
      "prompt_chips",
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));

    expect(fetchMock).toHaveBeenCalledWith("/api/agent", expect.objectContaining({
      method: "POST",
    }));
    expect(body).toMatchObject({
      message: "Refresh chips",
      requestKind: "prompt_chips",
      conversationId: "conversation-1",
      scenario: "healthy",
    });
    expect(body.history).toEqual([
      { role: "user", content: "What pattern are you using?" },
      { role: "assistant", content: "I found the pattern." },
    ]);
    expect(body.conversationState.shownCards).toEqual([
      { type: "insight_card", title: "Pattern assumptions" },
    ]);
    expect(body.conversationState.lastToolNames).toEqual(["get_pattern_assumptions"]);
    expect(body.conversationState.promptChips.map((chip: PromptChip) => chip.id)).toEqual([
      "ai-upcoming-bills",
      "ai-next-few-days",
      "ai-show-math",
    ]);
  });

  it("keeps only the latest completed assistant pending action", () => {
    const conversationState = getConversationState(
      [
        {
          id: "turn-1",
          userText: "Save for Japan",
          response: {
            ...responseFixture,
            pendingAction: {
              type: "create_savings_goal",
              name: "Japan",
              missing: ["target_amount"],
            },
          },
        },
        {
          id: "turn-2",
          userText: "Cancel",
          response: responseFixture,
        },
      ],
      [],
      [],
    );

    expect(conversationState).not.toHaveProperty("pendingAction");
  });

  it("deduplicates prompt chip history by visible text and prompt", () => {
    const chips = mergePromptChipHistory(
      [
        {
          id: "first",
          label: "Show math",
          prompt: "Show the math",
        },
      ],
      [
        {
          id: "second",
          label: "show math",
          prompt: "show the math",
        },
      ],
    );

    expect(chips).toHaveLength(1);
    expect(chips[0]?.id).toBe("first");
  });

  it("throws safe request errors for failed agent responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({ code: "missing-openai-config" }),
    }));

    await expect(fetchAgentResponse(
      "What changed?",
      "default",
      [],
      [],
      [],
      "conversation-1",
    )).rejects.toMatchObject({
      name: "AgentRequestError",
      status: 503,
      code: "missing-openai-config",
      message: expect.stringContaining("answer service"),
    } satisfies Partial<AgentRequestError>);
  });

  it("uses a local data setup message when Supabase config is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({ code: "supabase-config-missing" }),
    }));

    await expect(fetchAgentResponse(
      "What changed?",
      "default",
      [],
      [],
      [],
      "conversation-1",
    )).rejects.toMatchObject({
      name: "AgentRequestError",
      status: 503,
      code: "supabase-config-missing",
      message: expect.stringContaining("local Supabase data"),
    } satisfies Partial<AgentRequestError>);
  });

  it("caps thread history to the latest eight entries", () => {
    const thread = Array.from({ length: 10 }, (_, index) => ({
      id: "turn-" + index,
      userText: "Question " + index,
    }));

    expect(getThreadHistory(thread).map((item) => item.content)).toEqual([
      "Question 2",
      "Question 3",
      "Question 4",
      "Question 5",
      "Question 6",
      "Question 7",
      "Question 8",
      "Question 9",
    ]);
  });
});
