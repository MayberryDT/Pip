import { describe, expect, it } from "vitest";
import { planPromptChips } from "@/lib/agent/prompt-chip-planner";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot, getFakeSnapshot } from "@/lib/fake-data";
import type { SyncStatus } from "@/lib/data/sync-status";

describe("prompt chip planner", () => {
  it("returns contextual ready-state chips instead of an empty financial set", () => {
    const plan = planPromptChips({
      result: resultWithSpendableState("normal"),
      message: "",
    });

    expect(plan.chips).toHaveLength(3);
    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-why-today",
      "ai-cutback-opportunity",
      "ai-next-few-days",
    ]);
    expect(plan.chips.map((chip) => chip.label)).toEqual([
      "Why is it $104 today?",
      "What can I cut back on?",
      "What happens in the next few days?",
    ]);
    expect(plan.chips[1].prompt).toBe("What can I cut back on from my recent spending?");
    expect(plan.chips.map((chip) => chip.label)).not.toContain("Missing card");
    expect(plan.chips.map((chip) => chip.label)).not.toContain("Test purchase");
  });

  it("branches from an explanation card into adjacent topics", () => {
    const plan = planPromptChips({
      result: calculatePipCash(fakeSnapshot),
      message: "Why this number?",
      responseCards: [
        {
          type: "pip_cash_explanation",
          title: "Why this number changed",
          summary: "Income and spending are the main drivers.",
          drivers: [],
          warnings: [],
          dataStates: [],
        },
      ],
      responseToolNames: ["get_pip_cash_drivers"],
    });

    expect(plan.conversationJob).toBe("explain_number");
    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-spending-pressure",
      "ai-upcoming-bills",
      "ai-show-math",
    ]);
  });

  it("branches from a purchase simulation into amount comparison and near-term context", () => {
    const result = calculatePipCash(fakeSnapshot);
    const plan = planPromptChips({
      result,
      message: "Can I spend $50?",
      responseCards: [
        {
          type: "purchase_simulation",
          title: "Purchase simulation",
          amountCents: 5000,
          beforeCents: result.pipCashTodayCents,
          todayRemainingCents: result.pipCashTodayCents - 5000,
          todayOverageCents: Math.max(0, 5000 - result.pipCashTodayCents),
          afterTodayCents: result.pipCashTodayCents - 5000,
          monthlyAverageAfterCents: 0,
        },
      ],
      responseToolNames: ["simulate_purchase"],
    });

    expect(plan.conversationJob).toBe("purchase_test");
    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-try-20",
      "ai-next-few-days",
      "ai-biggest-drivers",
    ]);
  });

  it("uses tight-state chips when the home number is negative", () => {
    const plan = planPromptChips({
      result: calculatePipCash(getFakeSnapshot("negative")),
      message: "",
    });

    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-cutback-opportunity",
      "ai-spending-pressure",
      "ai-upcoming-bills",
    ]);
  });

  it("prioritizes cutback opportunities for overspending states", () => {
    const plan = planPromptChips({
      result: resultWithSpendableState("overspending"),
      message: "",
    });

    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-cutback-opportunity",
      "ai-spending-pressure",
      "ai-upcoming-bills",
    ]);
  });

  it("prioritizes cutback opportunities after a financial guidance read", () => {
    const plan = planPromptChips({
      result: calculatePipCash(fakeSnapshot),
      message: "Am I spending too much?",
      responseToolNames: ["get_financial_guidance_context"],
      responseCards: [
        {
          type: "guidance_card",
          title: "Pip read",
          stance: "watch",
          summary: "Recent spending is worth watching.",
          rows: [],
        },
      ],
    });

    expect(plan.conversationJob).toBe("financial_guidance");
    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-cutback-opportunity",
      "ai-spending-pressure",
      "ai-upcoming-bills",
    ]);
  });

  it("keeps stale sync diagnostics ahead of cutback opportunities", () => {
    const syncStatus: SyncStatus = {
      institutions: [],
      hasStaleInstitution: true,
      latestSyncRun: null,
    };
    const plan = planPromptChips({
      result: calculatePipCash(fakeSnapshot),
      message: "",
      syncStatus,
    });

    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-refresh-data",
      "ai-pattern-assumptions",
      "ai-data-quality",
    ]);
    expect(plan.chips.map((chip) => chip.id)).not.toContain("ai-cutback-opportunity");
  });

  it("surfaces one diagnostic chip when the user asks about data quality", () => {
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
    const plan = planPromptChips({
      result: calculatePipCash(fakeSnapshot),
      message: "Check data quality",
      syncStatus,
    });

    expect(plan.chips[0]).toMatchObject({
      id: "ai-refresh-data",
      label: "Refresh connected data",
    });
    expect(plan.chips.filter((chip) => chip.id === "ai-refresh-data" || chip.id === "ai-missing-card")).toHaveLength(1);
  });

  it("uses contextual copy for missing-card diagnostics only after a data-quality ask", () => {
    const plan = planPromptChips({
      result: calculatePipCash(fakeSnapshot),
      message: "Is a card missing?",
    });

    expect(plan.chips[0]).toMatchObject({
      id: "ai-missing-card",
      label: "Could this be missing something?",
    });
  });

  it("rotates away from recently shown chips before falling back to repeats", () => {
    const plan = planPromptChips({
      result: calculatePipCash(fakeSnapshot),
      message: "Why this number?",
      responseToolNames: ["get_pip_cash_drivers"],
      promptChips: [
        {
          id: "ai-missing-card",
          label: "Missing card",
          prompt: "Is there a missing card in Spendable Cash Today?",
        },
        {
          id: "ai-recent-charges",
          label: "Recent charges",
          prompt: "Show my recent charges",
        },
        {
          id: "ai-upcoming-bills",
          label: "Upcoming bills",
          prompt: "What bills are coming up?",
        },
      ],
    });

    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-spending-pressure",
      "ai-show-math",
      "ai-next-few-days",
    ]);
  });

  it("reports repeated-job risk for adjacent vague follow-ups", () => {
    const plan = planPromptChips({
      result: calculatePipCash(fakeSnapshot),
      message: "why?",
      history: [
        {
          role: "user",
          content: "Why this number?",
        },
        {
          role: "assistant",
          content: "I found the main drivers behind today's number.",
        },
      ],
      shownCards: [
        {
          type: "pip_cash_explanation",
        },
      ],
      lastToolNames: ["get_pip_cash_drivers"],
      responseToolNames: ["get_pip_cash_drivers"],
    });

    expect(plan.conversationJob).toBe("explain_number");
    expect(plan.repeatedJob).toBe(true);
    expect(plan.repeatedTool).toBe(true);
    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-spending-pressure",
      "ai-upcoming-bills",
      "ai-show-math",
    ]);
  });

  it("prioritizes chips that match a visible Pip follow-up question", () => {
    const plan = planPromptChips({
      result: calculatePipCash(fakeSnapshot),
      message: "tell me more",
      assistantMessage:
        "Want to see the biggest drivers in more detail or a quick forecast for the next few days?",
    });

    expect(plan.chips.map((chip) => chip.id)).toEqual([
      "ai-biggest-drivers",
      "ai-next-few-days",
      "ai-cash-flow-basic",
    ]);
  });
});

function resultWithSpendableState(state: "normal" | "overspending") {
  const result = calculatePipCash(fakeSnapshot);

  if (!result.spendableCashToday) {
    throw new Error("Expected Spendable Cash Today result for test fixture.");
  }

  return {
    ...result,
    warnings: [],
    dataStates: [],
    spendableCashToday: {
      ...result.spendableCashToday,
      state,
      confidence: "high" as const,
      warnings: [],
      dataStates: [],
    },
  };
}
