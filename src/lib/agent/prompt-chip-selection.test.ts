import { describe, expect, it } from "vitest";
import {
  selectPromptChips,
  type PromptChipSelectionContext,
} from "@/lib/agent/prompt-chip-selection";
import { fakeSnapshot } from "@/lib/fake-data";

const baseContext: PromptChipSelectionContext = {
  requestKind: "chat",
  onboardingState: {
    status: "ready",
    hasFinancialData: false,
  },
  conversationState: {
    shownCards: [],
    lastToolNames: [],
    promptChips: [],
  },
};

describe("prompt chip selection", () => {
  it("drops generated display chips before data is connected", () => {
    const plan = selectPromptChips(
      {
        message: "Ready.",
        promptChips: [
          {
            id: "ai-forecast",
            label: "Show forecast",
            prompt: "Show my forecast",
          },
        ],
      },
      baseContext,
      null,
      createOptions({ isSupportedCardPrompt: () => true }),
    );

    expect(plan.chips.some((chip) => chip.label === "Show forecast")).toBe(false);
    expect(plan.conversationJob).toBe("setup");
  });

  it("keeps supported generated display chips when a snapshot is available", () => {
    const plan = selectPromptChips(
      {
        message: "Ready.",
        promptChips: [
          {
            id: "ai-forecast",
            label: "Show forecast",
            prompt: "Show my forecast",
          },
        ],
      },
      {
        ...baseContext,
        snapshot: fakeSnapshot,
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
      },
      null,
      createOptions({ isSupportedCardPrompt: () => true }),
    );

    expect(plan.chips[0]).toEqual({
      id: "ai-forecast",
      label: "Show forecast",
      prompt: "Show my forecast",
    });
  });

  it("preserves privileged setup IDs only when the chip matches the setup state", () => {
    const guestPlan = selectPromptChips(
      {
        message: "Ready.",
        promptChips: [
          {
            id: "get-signed-up",
            label: "Continue with Google",
            prompt: "Continue with Google sign in",
          },
        ],
      },
      {
        ...baseContext,
        onboardingState: {
          status: "guest",
          hasFinancialData: false,
        },
      },
      null,
      createOptions(),
    );
    const readyPlan = selectPromptChips(
      {
        message: "Ready.",
        promptChips: [
          {
            id: "get-signed-up",
            label: "Continue with Google",
            prompt: "Continue with Google sign in",
          },
        ],
      },
      baseContext,
      null,
      createOptions(),
    );

    expect(guestPlan.chips[0]?.id).toBe("get-signed-up");
    expect(readyPlan.chips[0]?.id).not.toBe("get-signed-up");
  });
});

function createOptions(overrides: {
  isSupportedCardPrompt?: (normalizedPrompt: string) => boolean;
} = {}) {
  return {
    input: {
      message: "Ready.",
    },
    cards: [],
    usedTools: [],
    isSupportedCardPrompt: overrides.isSupportedCardPrompt ?? (() => false),
  };
}
