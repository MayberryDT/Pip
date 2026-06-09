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
      message: "That is $7 over today's room. The V2 daily room after would be -$7.",
      answerPatternId: "purchase-simulation",
      repetitionAdjusted: false,
    });
  });

  it("separates immediate room left from unchanged V2 daily room", () => {
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
      message: "That leaves $79 of today's room. Your V2 daily room stays about $104.",
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
          type: "free_cash_explanation",
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
      usedTools: ["get_free_cash_drivers"],
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
});
