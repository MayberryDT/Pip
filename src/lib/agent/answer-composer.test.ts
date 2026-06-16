import { describe, expect, it } from "vitest";
import { composeAgentVisibleAnswer } from "@/lib/agent/answer-composer";

describe("answer composer", () => {
  it("uses purchase simulation card facts for purchase answers", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "Model bridge.",
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
      message: "That would put Spendable Cash Today at -$7.",
      answerPatternId: "purchase-simulation",
      repetitionAdjusted: false,
    });
  });

  it("separates immediate room left from unchanged Spendable Cash after purchase", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "Model bridge.",
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
      message: "That would leave $79 in Spendable Cash Today.",
      answerPatternId: "purchase-simulation",
    });
  });

  it("puts the biggest explanation driver in the short answer", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "Model bridge.",
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

    expect(answer.message).toBe(
      "I found the main drivers behind today's number. The largest one is Recent spending.",
    );
    expect(answer.answerPatternId).toBe("explain-number");
  });

  it("keeps forecast answers compact with the required caveat", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "Model bridge.",
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

    expect(answer.message).toBe("I mapped the next 7 days. Forecast only; not guaranteed.");
    expect(answer.answerPatternId).toBe("forecast");
  });

  it("uses cutback insight card facts instead of a generic insight bridge", () => {
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
      message: "I found a cutback opportunity: Dining is up $72 over the last 14 days.",
      answerPatternId: "cutback-opportunity",
      repetitionAdjusted: false,
    });
    expect(answer.message).not.toContain("short summary");
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

  it("keeps bare greetings free of display promises", () => {
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
      message: "I can help with your Spendable Cash Today. Ask what changed or whether a specific purchase fits.",
      answerPatternId: "greeting",
    });
  });

  it("keeps friendly small talk free of display promises", () => {
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
      message: "I’m here with you. Ask me a money question or test a specific purchase amount.",
      answerPatternId: "friendly-small-talk",
    });
  });

  it("keeps broad money basics general and off user data", () => {
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
      message: "One useful money basic: separate bills, needs, and fun money before you spend. A small planned amount beats guessing.",
      answerPatternId: "money-basic",
    });
  });

  it("keeps general spending advice conversational and card-free", () => {
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
      message: "Start with one small spending rule: choose one category, set a weekly cap, and keep one low-cost thing you still enjoy.",
      answerPatternId: "spending-advice",
    });
  });

  it("replaces unsupported no-card view references on broad prompts", () => {
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
      message: "I’m not sure what you mean yet. Ask about today’s number or test a specific purchase amount.",
      answerPatternId: "clarify",
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

  it("adjusts repeated vague follow-ups instead of repeating the same answer", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I found recent charges in the current window.",
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
      message: "That same answer still applies. I can take it from another angle.",
      answerPatternId: "duplicate-follow-up",
      repeatedMessage: true,
      repetitionAdjusted: true,
    });
  });

  it("does not let duplicate no-card follow-ups describe a hidden card", () => {
    const answer = composeAgentVisibleAnswer({
      modelOutput: {
        message: "I found the main drivers behind today's number.",
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
      message: "That same answer still applies. I can take it from another angle.",
      answerPatternId: "duplicate-follow-up",
      repetitionAdjusted: true,
    });
  });
});
