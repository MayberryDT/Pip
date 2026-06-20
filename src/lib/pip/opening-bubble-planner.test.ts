import { describe, expect, it } from "vitest";
import { planOpeningBubble } from "@/lib/pip/opening-bubble-planner";

describe("planOpeningBubble", () => {
  it("prioritizes refresh status over every other opening job", () => {
    const plan = planOpeningBubble({
      refresh: { status: "checking" },
      sameDaySpend: { amountCents: 1800, merchantName: "Target" },
      missingData: { message: "I am missing a card." },
      savingsOpportunity: true,
      spendableCashTodayCents: 7400,
    });

    expect(plan).toMatchObject({
      priority: "refresh",
      message: "I am checking for new transactions now. This number may move.",
    });
    expect(plan.chips).toHaveLength(1);
  });

  it("chooses same-day spend before lower-priority tips", () => {
    const plan = planOpeningBubble({
      sameDaySpend: { amountCents: 1800, merchantName: "Target" },
      productTip: { message: "You can type settings to manage Pip." },
      spendableCashTodayCents: 5600,
    });

    expect(plan.priority).toBe("same_day_spend");
    expect(plan.message).toBe("I found $18 at Target and took it off today.");
    expect(plan.chips.map((chip) => chip.id)).toEqual(["why-today"]);
  });

  it("asks only material clarification questions before product tips", () => {
    const plan = planOpeningBubble({
      clarification: {
        type: "bill",
        merchantName: "City Power",
      },
      productTip: { message: "You can type settings to manage Pip." },
      spendableCashTodayCents: 7400,
    });

    expect(plan.priority).toBe("clarification");
    expect(plan.message).toBe("I think City Power may be a monthly bill. Want me to treat it that way?");
    expect(plan.chips.map((chip) => chip.id)).toEqual(["treat-as-bill", "not-a-bill"]);
  });

  it("uses a calm normal note when nothing higher priority exists", () => {
    const plan = planOpeningBubble({
      spendableCashTodayCents: 7400,
    });

    expect(plan).toMatchObject({
      priority: "normal",
      message: "You have $74 for today. Nothing unusual is pulling on it.",
      chips: [
        {
          id: "why-today",
        },
      ],
    });
  });
});
