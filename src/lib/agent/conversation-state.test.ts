import { describe, expect, it } from "vitest";
import {
  getVisibleMessageSimilarity,
  inferConversationJob,
  isVisibleMessageRepetitive,
  summarizeConversationState,
} from "@/lib/agent/conversation-state";
import type { SyncStatus } from "@/lib/data/sync-status";
import { fakeSnapshot, getFakeSnapshot } from "@/lib/fake-data";
import { calculateFreeCash } from "@/lib/free-cash/engine";

describe("conversation state", () => {
  it("classifies core Pip conversation jobs from user language", () => {
    expect(inferConversationJob("Show the biggest drivers behind today's number")).toBe("explain_number");
    expect(inferConversationJob("Can I spend $25?")).toBe("purchase_test");
    expect(inferConversationJob("Show my Spendable Cash forecast")).toBe("forecast");
    expect(inferConversationJob("What bills are coming up?")).toBe("recurring_activity");
    expect(inferConversationJob("Show my recent charges")).toBe("recent_transactions");
    expect(inferConversationJob("Show my spending breakdown")).toBe("spending_breakdown");
    expect(inferConversationJob("Show the math")).toBe("math");
    expect(inferConversationJob("Show my true balances")).toBe("true_balances");
    expect(inferConversationJob("Is a card missing from Spendable Cash Today?")).toBe("data_quality");
  });

  it("uses short history to classify purchase amount follow-ups", () => {
    expect(
      inferConversationJob("What about $20 instead?", [
        {
          role: "user",
          content: "Can I spend $50?",
        },
        {
          role: "assistant",
          content: "That would put you $7 over today.",
        },
      ]),
    ).toBe("purchase_test");
  });

  it("summarizes repeated tool and card risk after a response", () => {
    const summary = summarizeConversationState({
      message: "why?",
      history: [
        {
          role: "user",
          content: "Why today?",
        },
        {
          role: "assistant",
          content: "I found the current drivers.",
        },
      ],
      shownCards: [
        {
          type: "free_cash_explanation",
          title: "Why this number changed",
        },
      ],
      lastToolNames: ["get_free_cash_drivers"],
      responseCards: [
        {
          type: "free_cash_explanation",
          title: "Why this number changed",
          summary: "Income and spending are the main drivers.",
          drivers: [],
          warnings: [],
          dataStates: [],
        },
      ],
      responseToolNames: ["get_free_cash_drivers"],
    });

    expect(summary.currentJob).toBe("explain_number");
    expect(summary.lastAnsweredJob).toBe("explain_number");
    expect(summary.duplicateFollowUp).toBe(true);
    expect(summary.repeatedJob).toBe(true);
    expect(summary.repeatedTool).toBe(true);
    expect(summary.repeatedCard).toBe(true);
    expect(summary.recentJobs).toEqual(["explain_number"]);
  });

  it("summarizes financial, sync, and onboarding state for downstream planners", () => {
    const result = calculateFreeCash(fakeSnapshot);
    const syncStatus: SyncStatus = {
      institutions: [],
      hasStaleInstitution: true,
      latestSyncRun: {
        provider: "plaid",
        status: "failed",
        startedAt: "2026-06-09T00:00:00.000Z",
        completedAt: null,
        accountCount: 0,
        transactionCount: 0,
        balanceCount: 0,
        errorMessage: "Sync failed.",
      },
    };
    const summary = summarizeConversationState({
      message: "",
      result: {
        ...result,
        dataStates: [
          {
            id: "pending-transactions",
            label: "Pending items",
            detail: "Some transactions are still pending.",
            amountCents: -1200,
            tone: "warning",
          },
        ],
      },
      syncStatus,
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
    });

    expect(summary.onboardingStatus).toBe("ready");
    expect(summary.hasFinancialResult).toBe(true);
    expect(summary.hasMissingCardWarning).toBe(true);
    expect(summary.hasPendingDataState).toBe(true);
    expect(summary.hasStaleSync).toBe(true);
  });

  it("recognizes negative Spendable Cash Today state", () => {
    const summary = summarizeConversationState({
      message: "",
      result: calculateFreeCash(getFakeSnapshot("negative")),
    });

    expect(summary.isNegativeSpendableCash).toBe(true);
  });

  it("collects recent topic coverage from cards, tools, and chips", () => {
    const summary = summarizeConversationState({
      message: "thanks",
      shownCards: [
        {
          type: "purchase_simulation",
        },
      ],
      lastToolNames: ["forecast_spendable_cash"],
      promptChips: [
        {
          id: "ai-recent-charges",
          label: "Recent charges",
          prompt: "Show my recent charges",
        },
      ],
    });

    expect(summary.recentJobs).toEqual(["purchase_test", "forecast", "recent_transactions"]);
  });

  it("detects exact and high-overlap assistant repetition", () => {
    expect(
      isVisibleMessageRepetitive({
        candidate: "I found these recent items.",
        history: [
          {
            role: "assistant",
            content: "I found these recent items.",
          },
        ],
      }),
    ).toBe(true);
    expect(getVisibleMessageSimilarity("I found these recent items.", "I found recent charges.")).toBeGreaterThan(0);
  });
});
