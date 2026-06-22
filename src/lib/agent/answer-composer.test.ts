import { describe, expect, it } from "vitest";
import { composeAgentVisibleAnswer } from "@/lib/agent/answer-composer";

describe("answer composer", () => {
  it("replaces repeated no-card follow-ups with a next-step answer", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I found the main drivers behind today's number.",
      },
      userMessage: "why?",
      history: [
        {
          role: "assistant",
          content: "I found the main drivers behind today's number.",
        },
      ],
      cards: [],
      usedTools: [],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer.repeatedMessage).toBe(true);
    expect(answer.repetitionAdjusted).toBe(true);
    expect(answer.message).not.toBe("I found the main drivers behind today's number.");
    expect(answer.message).toContain("go deeper");
  });

  it("preserves model output for purchase cards instead of deterministic simulation copy", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "The purchase would put today in the red, so I would pause before buying it.",
      },
      userMessage: "Can I spend $50?",
      cards: [
        {
          type: "purchase_simulation",
          title: "Purchase simulation",
          amountCents: 5000,
          beforeCents: 4300,
          todayRemainingCents: -700,
          todayOverageCents: 700,
          afterTodayCents: -700,
          monthlyAverageAfterCents: 0,
        },
      ],
      usedTools: ["simulate_purchase"],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "The purchase would put today in the red, so I would pause before buying it.",
      answerPatternId: "model",
      repetitionAdjusted: false,
    });
    expect(answer.answerPatternId).not.toBe("purchase-simulation");
  });

  it("preserves model output when purchase card cash fields differ", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "That amount still fits today, but keep the rest of the day quiet.",
      },
      userMessage: "Can I spend $25?",
      cards: [
        {
          type: "purchase_simulation",
          title: "Purchase simulation",
          amountCents: 2500,
          beforeCents: 10400,
          todayRemainingCents: 7900,
          todayOverageCents: 0,
          afterTodayCents: 10400,
          monthlyAverageAfterCents: 0,
          dailyEffectCents: 0,
        },
      ],
      usedTools: ["simulate_purchase"],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "That amount still fits today, but keep the rest of the day quiet.",
      answerPatternId: "model",
    });
    expect(answer.answerPatternId).not.toBe("purchase-simulation");
  });

  it("uses the model bridge for explanation cards instead of a canned driver sentence", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "Recent spending is the main reason today feels tighter.",
      },
      userMessage: "Why this number?",
      cards: [
        {
          type: "pip_cash_explanation",
          title: "Why this number changed",
          summary: "Spending moved it most.",
          drivers: [
            {
              id: "spending",
              label: "Recent spending",
              detail: "Recent purchases counted in the current window.",
              amountCents: -24000,
              tone: "negative",
            },
          ],
          warnings: [],
          dataStates: [],
        },
      ],
      usedTools: ["get_pip_cash_drivers"],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer.message).toBe("Recent spending is the main reason today feels tighter.");
    expect(answer.answerPatternId).toBe("model");
  });

  it("uses the model bridge for forecast cards instead of a canned forecast sentence", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I mapped the next week so you can see the pressure ahead.",
      },
      userMessage: "Show forecast",
      cards: [
        {
          type: "spendable_cash_forecast",
          title: "7-day forecast",
          asOfDate: "2026-06-09",
          horizonDays: 7,
          currentSpendableCashCents: 4300,
          projectedSpendableCashCents: 2200,
          dailyTrendCents: -300,
          disclaimer: "Forecast only; not guaranteed.",
          points: [],
          recurringItems: [],
        },
      ],
      usedTools: ["forecast_spendable_cash"],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer.message).toBe("I mapped the next week so you can see the pressure ahead.");
    expect(answer.answerPatternId).toBe("model");
  });

  it("uses the model bridge for bill cards instead of a canned recurring answer", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I found two likely bills coming up, with Netflix looking closest.",
      },
      userMessage: "What bills are coming up?",
      cards: [
        {
          type: "recurring_activity",
          title: "Likely repeats",
          asOfDate: "2026-06-20",
          horizonDays: 45,
          items: [
            {
              id: "netflix",
              label: "Netflix",
              expectedDate: "2026-06-27",
              amountCents: -1799,
              kind: "purchase",
              cadence: "monthly",
              confidence: "medium",
              sourceTransactionCount: 3,
              lastSeenDate: "2026-05-27",
            },
          ],
        },
      ],
      usedTools: ["get_recurring_activity"],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "I found two likely bills coming up, with Netflix looking closest.",
      answerPatternId: "model",
    });
  });

  it("uses the model bridge for empty recurring cards instead of a canned empty-state sentence", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I don’t see any upcoming subscriptions in my current view.",
      },
      userMessage: "Do I have any subscriptions coming up?",
      cards: [
        {
          type: "recurring_activity",
          title: "Likely recurring activity",
          asOfDate: "2026-06-20",
          horizonDays: 45,
          items: [],
        },
      ],
      usedTools: ["get_recurring_activity"],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "I don’t see any upcoming subscriptions in my current view.",
      answerPatternId: "model",
    });
  });

  it("uses the model bridge for savings-goal cards instead of a canned setup answer", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "Trip is now tracked, and its monthly plan counts in Spendable Cash Today.",
      },
      userMessage: "Create my trip savings goal",
      cards: [
        {
          type: "savings_goal_plan",
          title: "Savings goal",
          goalId: "goal-trip",
          name: "Trip",
          targetAmountCents: 500000,
          currentAmountCents: 0,
          remainingCents: 500000,
          monthlyContributionCents: 30000,
          includeInSpendableCash: true,
          summary: "$5,000 left for Trip.",
        },
      ],
      usedTools: ["create_savings_goal"],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "Trip is now tracked, and its monthly plan counts in Spendable Cash Today.",
      answerPatternId: "model",
    });
  });

  it("uses the model bridge for cutback insight cards instead of a canned opportunity sentence", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "Generic spending advice.",
      },
      userMessage: "What can I cut back on?",
      cards: [
        {
          type: "insight_card",
          title: "Cutback opportunity",
          summary: "Dining is up $72 over the last 14 days.",
          rows: [
            {
              id: "current-window",
              label: "Last 14 days",
              amountCents: -18600,
              detail: "Dining and takeout",
              tone: "warning",
            },
          ],
        },
      ],
      usedTools: ["get_spending_opportunity"],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "Generic spending advice.",
      answerPatternId: "model",
      repetitionAdjusted: false,
    });
    expect(answer.message).not.toContain("short summary");
  });

  it("uses guidance-model for guidance cards while preserving the model read", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "You are stable today, but dining is the area to watch next.",
      },
      userMessage: "Am I spending too much?",
      cards: [
        {
          type: "guidance_card",
          title: "Pip read",
          stance: "watch",
          summary: "Recent spending is worth watching.",
          rows: [
            {
              label: "Dining",
              detail: "Dining is running above your recent baseline.",
              tone: "warning",
              evidenceIds: ["txn-dining"],
            },
          ],
        },
      ],
      usedTools: ["get_financial_guidance_context"],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "You are stable today, but dining is the area to watch next.",
      answerPatternId: "guidance-model",
    });
  });

  it("uses model support for non-card answers when it fits", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I can help with Spendable Cash Today.",
        support: "Ask about why it changed or test a purchase amount.",
      },
      userMessage: "thanks",
      cards: [],
      usedTools: [],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer.message).toBe(
      "I can help with Spendable Cash Today. Ask about why it changed or test a purchase amount.",
    );
    expect(answer.answerPatternId).toBe("model");
  });

  it("preserves model output for bare greetings", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "Want me to show a forecast?",
      },
      userMessage: "hi",
      cards: [],
      usedTools: [],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "Want me to show a forecast?",
      answerPatternId: "model",
    });
  });

  it("preserves model output for friendly small talk", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I love you back. Want me to show your spending breakdown?",
      },
      userMessage: "i love you",
      cards: [],
      usedTools: [],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "I love you back. Want me to show your spending breakdown?",
      answerPatternId: "model",
    });
  });

  it("preserves model output for broad money basics", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I see your cushion and bills.",
      },
      userMessage: "Teach me one useful money basic",
      cards: [],
      usedTools: [],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "I see your cushion and bills.",
      answerPatternId: "model",
    });
  });

  it("preserves model output for general spending advice", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I can show a spending breakdown.",
      },
      userMessage: "How do I lower my spending without feeling miserable?",
      cards: [],
      usedTools: [],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "I can show a spending breakdown.",
      answerPatternId: "model",
    });
  });

  it("preserves model output for unsupported no-card prompts", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I found it is $104 today. A missing card warning could tweak things.",
      },
      userMessage: "purple banana waterfall",
      cards: [],
      usedTools: [],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "I found it is $104 today. A missing card warning could tweak things.",
      answerPatternId: "model",
    });
  });

  it("fits long model drafts to the visible response limits", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: `${"Long draft sentence. ".repeat(30)}Final detail.`,
      },
      userMessage: "Can you explain how you got the spendable cash number?",
      cards: [],
      usedTools: [],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer.message.length).toBeLessThanOrEqual(260);
  });

  it("does not replace repeated card follow-ups with a fixed duplicate message", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "The same recent charges are still what I have to work from.",
      },
      userMessage: "why?",
      history: [
        {
          role: "user",
          content: "Show recent charges",
        },
        {
          role: "assistant",
          content: "I found recent charges in the current window.",
        },
      ],
      conversationState: {
        shownCards: [
          {
            type: "recent_transactions",
          },
        ],
        lastToolNames: ["get_recent_transactions"],
      },
      cards: [
        {
          type: "recent_transactions",
          title: "Recent transactions",
          transactions: [],
        },
      ],
      usedTools: ["get_recent_transactions"],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "The same recent charges are still what I have to work from.",
      answerPatternId: "model",
      repeatedMessage: false,
      repetitionAdjusted: false,
    });
  });

  it("does not replace duplicate no-card follow-ups with a fixed duplicate message", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I can say it another way: recent spending is still the main driver.",
      },
      userMessage: "why?",
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
      conversationState: {
        shownCards: [
          {
            type: "pip_cash_explanation",
          },
        ],
        lastToolNames: ["get_pip_cash_drivers"],
      },
      cards: [],
      usedTools: [],
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "I can say it another way: recent spending is still the main driver.",
      answerPatternId: "model",
      repetitionAdjusted: false,
    });
  });

  it("preserves model output for Android trust-policy pricing prompts", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "Pip lists $2.99/week.",
      },
      userMessage: "What does Pip cost?",
      cards: [],
      usedTools: ["get_trust_policy"],
      platform: "android_webview",
      maxChars: 260,
      maxWords: 45,
    });

    expect(answer).toMatchObject({
      message: "Pip lists $2.99/week.",
      answerPatternId: "model",
    });
  });
});
