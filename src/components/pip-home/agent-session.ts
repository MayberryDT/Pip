import type { AgentCard, AgentResponse, PromptChip } from "@/lib/agent/card-types";
import type { FakeDataScenario } from "@/lib/fake-data";

export type AgentThreadItem = {
  id: string;
  userText: string;
  response?: AgentResponse;
  errorText?: string;
  isPending?: boolean;
};

export type AgentRequestKind = "chat" | "prompt_chips";

export class AgentRequestError extends Error {
  code?: string;
  status: number;

  constructor(input: {
    message: string;
    status: number;
    code?: string;
  }) {
    super(input.message);
    this.name = "AgentRequestError";
    this.code = input.code;
    this.status = input.status;
  }
}

export async function fetchAgentResponse(
  message: string,
  scenario: FakeDataScenario,
  thread: AgentThreadItem[],
  visibleChips: PromptChip[],
  chipHistory: PromptChip[],
  conversationId: string,
  selectedPromptChipId?: string,
  requestKind: AgentRequestKind = "chat",
): Promise<AgentResponse> {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message,
      requestKind,
      conversationId,
      scenario,
      selectedPromptChipId,
      history: getThreadHistory(thread),
      conversationState: getConversationState(thread, visibleChips, chipHistory),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const code = payload && typeof payload.code === "string" ? payload.code : undefined;

    throw new AgentRequestError({
      code,
      status: response.status,
      message: getSafeAgentFailureMessage({
        code,
        status: response.status,
      }),
    });
  }

  return response.json();
}

export function getThreadHistory(thread: AgentThreadItem[]) {
  return thread.flatMap((item) => {
    const history: Array<{ role: "user" | "assistant"; content: string }> = [
      {
        role: "user",
        content: item.userText,
      },
    ];

    if (item.response?.message) {
      history.push({
        role: "assistant",
        content: item.response.message,
      });
    }

    return history;
  }).slice(-8);
}

export function getConversationState(
  thread: AgentThreadItem[],
  visibleChips: PromptChip[],
  chipHistory: PromptChip[],
) {
  const shownCards = thread
    .flatMap((item) => item.response?.cards ?? [])
    .map((card) => ({
      type: card.type,
      title: card.title,
    }))
    .slice(-8);
  const lastToolNames = thread
    .flatMap((item) => item.response?.usedTools ?? item.response?.audit.toolNames ?? [])
    .slice(-8);
  const promptChips = [
    ...chipHistory,
    ...thread.flatMap((item) => item.response?.promptChips ?? []),
    ...visibleChips,
  ].slice(-24);
  const latestResponse = [...thread]
    .reverse()
    .find((item) => item.response)
    ?.response;
  const pendingAction = latestResponse?.pendingAction;

  return {
    shownCards,
    lastToolNames,
    promptChips,
    ...(pendingAction ? { pendingAction } : {}),
  };
}

export function mergePromptChipHistory(...chipSets: PromptChip[][]): PromptChip[] {
  const merged: PromptChip[] = [];
  const seen = new Set<string>();

  chipSets.flat().forEach((chip) => {
    const key = chip.label.toLowerCase() + "|" + chip.prompt.toLowerCase();

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push(chip);
  });

  return merged.slice(-24);
}

export function getNextVisiblePromptChips(
  responseChips: PromptChip[],
  currentChips: PromptChip[],
  lastNonEmptyChips: PromptChip[],
): PromptChip[] {
  if (responseChips.length > 0) {
    return responseChips;
  }

  if (currentChips.length > 0) {
    return currentChips;
  }

  return lastNonEmptyChips;
}

export function getAgentErrorText(error: unknown): string {
  if (error instanceof AgentRequestError) {
    return error.message;
  }

  return getSafeAgentFailureMessage();
}

export function getSafeAgentFailureMessage(input?: {
  code?: string;
  status?: number;
}): string {
  const code = input?.code ?? "";
  const status = input?.status ?? 0;

  if (
    status === 401 ||
    status === 403 ||
    code === "authentication-required" ||
    code === "no-financial-data"
  ) {
    return "I need your setup finished before I can answer that.";
  }

  if (
    status === 503 ||
    code === "missing-openai-config" ||
    code === "model-unavailable"
  ) {
    return "I can’t reach the answer service right now. Try again in a moment.";
  }

  if (
    status === 502 ||
    code === "invalid-agent-output" ||
    code === "invalid-agent-response" ||
    code === "agent-output-rejected"
  ) {
    return "I couldn’t answer that cleanly. Try again, or ask for the math.";
  }

  return "I couldn’t answer that cleanly. Try again.";
}
