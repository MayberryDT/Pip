import type { PromptChip } from "@/lib/agent/card-types";

export type OpeningBubblePriority =
  | "same_day_spend"
  | "missing_data"
  | "clarification"
  | "tight"
  | "savings_opportunity"
  | "product_tip"
  | "normal";

export type OpeningBubblePlan = {
  priority: OpeningBubblePriority;
  message: string;
  chips: PromptChip[];
  shouldMarkReactionSeen?: boolean;
};

export type OpeningBubbleInput = {
  sameDaySpend?: {
    amountCents: number;
    merchantName?: string;
    pending?: boolean;
  };
  missingData?: {
    message: string;
  };
  clarification?: {
    type: "bill" | "savings";
    merchantName?: string;
    message?: string;
  };
  tight?: {
    message?: string;
  };
  savingsOpportunity?: boolean;
  productTip?: {
    message: string;
  };
  spendableCashTodayCents?: number;
};

export function planOpeningBubble(input: OpeningBubbleInput): OpeningBubblePlan {
  if (input.sameDaySpend && input.sameDaySpend.amountCents > 0) {
    const merchant = input.sameDaySpend.merchantName
      ? ` at ${input.sameDaySpend.merchantName}`
      : "";
    const pending = input.sameDaySpend.pending ? " pending" : "";
    const suffix = input.sameDaySpend.pending ? " for now" : "";

    return {
      priority: "same_day_spend",
      message: `I found${pending} ${formatMoney(input.sameDaySpend.amountCents)}${merchant} and took it off today${suffix}.`,
      chips: [whyTodayChip()],
      shouldMarkReactionSeen: true,
    };
  }

  if (input.missingData) {
    return {
      priority: "missing_data",
      message: input.missingData.message,
      chips: [chip("manage-accounts", "Accounts", "Show connected accounts")],
    };
  }

  if (input.clarification) {
    return planClarification(input.clarification);
  }

  if (input.tight) {
    return {
      priority: "tight",
      message: input.tight.message ?? "Today is tight. I would keep spending light.",
      chips: [whyTodayChip()],
    };
  }

  if (input.savingsOpportunity) {
    return {
      priority: "savings_opportunity",
      message: "You have not set a savings goal yet. I can help with one.",
      chips: [chip("set-savings-goal", "Set a goal", "Help me set a savings goal")],
    };
  }

  if (input.productTip) {
    return {
      priority: "product_tip",
      message: input.productTip.message,
      chips: [chip("settings", "Settings", "Open settings")],
    };
  }

  return {
    priority: "normal",
    message: `You have ${formatMoney(input.spendableCashTodayCents ?? 0)} for today. Nothing unusual is pulling on it.`,
    chips: [whyTodayChip()],
  };
}

function planClarification(input: NonNullable<OpeningBubbleInput["clarification"]>): OpeningBubblePlan {
  if (input.type === "bill") {
    const merchantName = input.merchantName ?? "this";

    return {
      priority: "clarification",
      message: input.message ?? `I think ${merchantName} may be a monthly bill. Want me to treat it that way?`,
      chips: [
        chip("treat-as-bill", "Treat as bill", `Treat ${merchantName} as a monthly bill`),
        chip("not-a-bill", "Not a bill", `${merchantName} is not a bill`),
      ],
    };
  }

  return {
    priority: "clarification",
    message: input.message ?? "I can help tune that savings goal. Want to adjust it?",
    chips: [chip("adjust-savings-goal", "Adjust goal", "Adjust my savings goal")],
  };
}

function whyTodayChip(): PromptChip {
  return chip("why-today", "Why today?", "Show the biggest drivers behind today's number");
}

function chip(id: string, label: string, prompt: string): PromptChip {
  return {
    id,
    label,
    prompt,
  };
}

function formatMoney(cents: number): string {
  const dollars = Math.round(Math.abs(cents) / 100);

  return `$${dollars.toLocaleString("en-US")}`;
}
