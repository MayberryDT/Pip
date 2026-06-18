import type { AgentCard, PromptChip } from "@/lib/agent/card-types";
import {
  isVisibleMessageRepetitive,
  summarizeConversationState,
  type ConversationHistoryItem,
} from "@/lib/agent/conversation-state";
import type { SyncStatus } from "@/lib/data/sync-status";
import { formatMoney } from "@/lib/money";
import type { PipCashResult } from "@/lib/types";

export type AgentAnswerModelOutput = {
  message: string;
  support?: string;
};

export type AgentAnswerConversationState = {
  shownCards?: Array<{
    type: AgentCard["type"] | string;
    title?: string;
  }>;
  lastToolNames?: string[];
  promptChips?: PromptChip[];
  result?: PipCashResult | null;
  syncStatus?: SyncStatus | null;
  onboardingState?: {
    status: "guest" | "needs-consent" | "ready";
    hasFinancialData: boolean;
  };
};

export type ComposeAgentVisibleAnswerInput = {
  modelOutput: AgentAnswerModelOutput;
  userMessage: string;
  history?: ConversationHistoryItem[];
  conversationState?: AgentAnswerConversationState;
  cards: AgentCard[];
  usedTools: string[];
  selectedPromptChipId?: string;
  maxChars: number;
  maxWords: number;
};

export type ComposedAgentVisibleAnswer = {
  message: string;
  answerPatternId: string;
  repeatedMessage: boolean;
  repetitionAdjusted: boolean;
};

export function composeAgentVisibleAnswer(
  input: ComposeAgentVisibleAnswerInput,
): ComposedAgentVisibleAnswer {
  const modelMessage = composeModelMessage(input.modelOutput, {
    maxChars: input.maxChars,
    maxWords: input.maxWords,
  });
  const modelRepeated = isVisibleMessageRepetitive({
    candidate: modelMessage,
    history: input.history,
  });
  const conversationSummary = summarizeConversationState({
    message: input.userMessage,
    history: input.history,
    shownCards: input.conversationState?.shownCards ?? [],
    lastToolNames: input.conversationState?.lastToolNames ?? [],
    promptChips: input.conversationState?.promptChips ?? [],
    responseCards: input.cards,
    responseToolNames: input.usedTools,
    selectedPromptChipId: input.selectedPromptChipId,
    result: input.conversationState?.result,
    syncStatus: input.conversationState?.syncStatus,
    onboardingState: input.conversationState?.onboardingState,
  });

  if (conversationSummary.duplicateFollowUp && input.cards.length === 0) {
    return {
      message: "That same answer still applies. I can take it from another angle.",
      answerPatternId: "duplicate-follow-up",
      repeatedMessage: modelRepeated,
      repetitionAdjusted: true,
    };
  }

  if (isGreetingPrompt(input.userMessage) && input.cards.length === 0 && input.usedTools.length === 0) {
    return {
      message: "I can help with your Spendable Cash Today. Ask what changed or whether a specific purchase fits.",
      answerPatternId: "greeting",
      repeatedMessage: modelRepeated,
      repetitionAdjusted: false,
    };
  }

  if (isFriendlySmallTalkPrompt(input.userMessage) && input.cards.length === 0 && input.usedTools.length === 0) {
    return {
      message: "I’m here with you. Ask me a money question or test a specific purchase amount.",
      answerPatternId: "friendly-small-talk",
      repeatedMessage: modelRepeated,
      repetitionAdjusted: false,
    };
  }

  const deterministicNoCardAnswer = composeDeterministicNoCardAnswer(input);

  if (deterministicNoCardAnswer) {
    return {
      message: deterministicNoCardAnswer.message,
      answerPatternId: deterministicNoCardAnswer.answerPatternId,
      repeatedMessage: modelRepeated,
      repetitionAdjusted: false,
    };
  }

  if (input.cards[0]?.type === "guidance_card") {
    return {
      message: modelMessage,
      answerPatternId: "guidance-model",
      repeatedMessage: modelRepeated,
      repetitionAdjusted: false,
    };
  }

  const cardAnswer = composeCardBackedAnswer(input.cards[0], conversationSummary.duplicateFollowUp);
  const candidate = cardAnswer ?? {
    message: modelMessage,
    answerPatternId: "model",
  };
  const candidateRepeated = isVisibleMessageRepetitive({
    candidate: candidate.message,
    history: input.history,
  });

  if (candidateRepeated && input.cards[0]?.type !== "purchase_simulation") {
    return {
      message: getRepetitionAdjustedMessage(input.cards[0], conversationSummary.duplicateFollowUp),
      answerPatternId: "repetition-adjusted",
      repeatedMessage: true,
      repetitionAdjusted: true,
    };
  }

  return {
    message: candidate.message,
    answerPatternId: candidate.answerPatternId,
    repeatedMessage: modelRepeated || candidateRepeated,
    repetitionAdjusted: candidate.answerPatternId === "duplicate-follow-up",
  };
}

function composeModelMessage(
  output: AgentAnswerModelOutput,
  limits: {
    maxChars: number;
    maxWords: number;
  },
): string {
  const lead = output.message.replace(/\s+/g, " ").trim();
  const support = output.support?.replace(/\s+/g, " ").trim();

  if (!support) {
    return fitVisibleMessage(lead, limits);
  }

  const combined = `${lead} ${support}`.trim();

  if (combined.length <= limits.maxChars && countWords(combined) <= limits.maxWords) {
    return combined;
  }

  return fitVisibleMessage(lead, limits);
}

function composeCardBackedAnswer(
  card: AgentCard | undefined,
  duplicateFollowUp: boolean,
): { message: string; answerPatternId: string } | null {
  if (!card) {
    return null;
  }

  if (duplicateFollowUp && card.type !== "purchase_simulation") {
    return {
      message: "That same answer still applies. I can take it from another angle.",
      answerPatternId: "duplicate-follow-up",
    };
  }

  switch (card.type) {
    case "pip_cash_explanation": {
      const biggestDriver = card.drivers[0]?.label;

      return {
        message: biggestDriver
          ? `I found the main drivers behind today's number. The largest one is ${biggestDriver}.`
          : "I found the main drivers behind today's number.",
        answerPatternId: "explain-number",
      };
    }
    case "purchase_simulation":
      if (card.shortfallCents && card.shortfallCents > 0) {
        return {
          message: `That would add ${formatMoney(card.shortfallCents)} to your shortfall.`,
          answerPatternId: "purchase-simulation",
        };
      }

      if (card.todayOverageCents > 0) {
        return {
          message: `That would put Spendable Cash Today at ${formatMoney(card.todayRemainingCents)}.`,
          answerPatternId: "purchase-simulation",
        };
      }

      return {
        message: `That would leave ${formatMoney(card.todayRemainingCents)} in Spendable Cash Today.`,
        answerPatternId: "purchase-simulation",
      };
    case "true_balances":
      return {
        message: "I pulled the actual balances.",
        answerPatternId: "true-balances",
      };
    case "recent_transactions":
      return {
        message: "I found recent charges in the current window.",
        answerPatternId: "recent-transactions",
      };
    case "spending_breakdown":
      return {
        message: "I grouped the main money flows.",
        answerPatternId: "spending-breakdown",
      };
    case "recurring_activity":
      return {
        message: card.items.length > 0
          ? "I found likely repeat items."
          : "I do not see a clear repeat item yet.",
        answerPatternId: "recurring-activity",
      };
    case "spendable_cash_forecast":
      return {
        message: `I mapped the next ${card.horizonDays} days. Forecast only; not guaranteed.`,
        answerPatternId: "forecast",
      };
    case "missing_card_nudge":
      return {
        message: "I see a possible missing card affecting today's number.",
        answerPatternId: "missing-card",
      };
    case "math_breakdown":
      return {
        message: "I pulled the math behind today's number.",
        answerPatternId: "math-breakdown",
      };
    case "insight_card":
      if (isCutbackInsightCard(card)) {
        return {
          message: composeCutbackInsightBridge(card),
          answerPatternId: "cutback-opportunity",
        };
      }

      return {
        message: `I built a short summary for ${card.title.toLowerCase()}.`,
        answerPatternId: "insight-card",
      };
    case "guidance_card":
      return null;
    case "connect_account":
      return {
        message: "I checked the connection state.",
        answerPatternId: "connect-account",
      };
    case "settings_panel":
      return {
        message: "Settings are here.",
        answerPatternId: "settings-panel",
      };
    case "settings_detail":
      return {
        message: `${card.title} is here.`,
        answerPatternId: "settings-detail",
      };
    case "account_connections":
      return {
        message: "I found the accounts connected to Pip.",
        answerPatternId: "account-connections",
      };
  }
}

function fitVisibleMessage(
  message: string,
  limits: {
    maxChars: number;
    maxWords: number;
  },
): string {
  const words = message.split(/\s+/).filter(Boolean);
  let fitted = "";

  for (const word of words.slice(0, limits.maxWords)) {
    const next = fitted ? `${fitted} ${word}` : word;

    if (next.length > limits.maxChars) {
      break;
    }

    fitted = next;
  }

  if (fitted) {
    return fitted;
  }

  return message.slice(0, Math.max(1, limits.maxChars)).trim();
}

function isGreetingPrompt(message: string): boolean {
  return /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening)$/i.test(message.trim());
}

function isFriendlySmallTalkPrompt(message: string): boolean {
  const normalized = message.toLowerCase().replace(/[\u2018\u2019]/g, "'").trim();

  return /\b(i love you|love you|love u|luv you)\b/.test(normalized) ||
    /\b(why are you so cute|you're cute|you are cute|you('re| are)? so cute)\b/.test(normalized);
}

function composeDeterministicNoCardAnswer(
  input: ComposeAgentVisibleAnswerInput,
): { message: string; answerPatternId: string } | null {
  if (input.cards.length > 0) {
    return null;
  }

  const result = input.conversationState?.result;

  if (input.usedTools.includes("get_spendable_cash_definition")) {
    return {
      message: result
        ? `I found ${formatMoney(getSpendableCents(result))} today. It comes from your normal pattern, bills, protected savings, recent spending pace, and cash reality.`
        : "I estimate today's room from your normal pattern, bills, protected savings, recent spending pace, and cash reality.",
      answerPatternId: "definition",
    };
  }

  if (input.usedTools.includes("get_pip_cash_snapshot") && result) {
    const metric = result.spendableCashToday;

    if (metric?.state === "shortfall" || getSpendableCents(result) <= 0) {
      return {
        message: `I found ${formatMoney(getSpendableCents(result))} today with about ${formatMoney(metric?.shortfallCents ?? 0)} shortfall. Treat that as a warning to keep spending to essentials.`,
        answerPatternId: "snapshot",
      };
    }

    return {
      message: `I found ${formatMoney(getSpendableCents(result))} today. That means there is room for normal spending, but use a specific amount for a real spend test.`,
      answerPatternId: "snapshot",
    };
  }

  if (input.usedTools.length === 0 && isMoneyBasicPrompt(input.userMessage)) {
    return {
      message: "One useful money basic: separate bills, needs, and fun money before you spend. A small planned amount beats guessing.",
      answerPatternId: "money-basic",
    };
  }

  if (input.usedTools.length === 0 && isGeneralSpendingAdvicePrompt(input.userMessage)) {
    return {
      message: "Start with one small spending rule: choose one category, set a weekly cap, and keep one low-cost thing you still enjoy.",
      answerPatternId: "spending-advice",
    };
  }

  if (isCreditCardDiscussion(input.userMessage) && input.usedTools.length === 0) {
    return {
      message: "I can help with credit cards. We can talk through payoff timing, card use, or how a specific purchase would affect today.",
      answerPatternId: "credit-card-chat",
    };
  }

  if (input.usedTools.length === 0 && hasUnsupportedNoCardReference(input.modelOutput)) {
    return {
      message: "I’m not sure what you mean yet. Ask about today’s number or test a specific purchase amount.",
      answerPatternId: "clarify",
    };
  }

  return null;
}

function getSpendableCents(result: PipCashResult): number {
  return result.spendableCashToday?.spendableCashTodayCents ?? Math.max(0, result.pipCashTodayCents);
}

function isCutbackInsightCard(card: Extract<AgentCard, { type: "insight_card" }>): boolean {
  return /\b(cutback|cut back|spending opportunity)\b/i.test(`${card.title} ${card.summary}`);
}

function composeCutbackInsightBridge(card: Extract<AgentCard, { type: "insight_card" }>): string {
  const summary = card.summary.replace(/\s+/g, " ").trim();
  const message = summary
    ? `I found a cutback opportunity: ${summary}`
    : "I found a cutback opportunity in your recent spending.";

  return fitVisibleMessage(message, {
    maxChars: 260,
    maxWords: 45,
  });
}

function isCreditCardDiscussion(message: string): boolean {
  return /\bcredit cards?\b|\bcards?\b/.test(message.toLowerCase()) &&
    !/\b(show|list|pull|view|transactions?|charges?|payments?|breakdown)\b/.test(message.toLowerCase());
}

function hasUnsupportedNoCardReference(output: AgentAnswerModelOutput): boolean {
  const normalized = `${output.message} ${output.support ?? ""}`.toLowerCase();

  if (/\b(?:credit|debit) cards?\b/.test(normalized)) {
    return false;
  }

  return /\b(cards?|view|trend view|this card|the card|the view|missing card)\b/.test(normalized);
}

function isMoneyBasicPrompt(message: string): boolean {
  const normalized = message.toLowerCase();

  return /\b(teach me|money basic|useful basic|learn|tip|tips|spending tips|how to spend|teach me something)\b/.test(normalized) &&
    (
      /\b(money|spend|spending|cash|budget|finance|financial|basic|something)\b/.test(normalized) ||
      normalized.trim() === "teach me something"
    );
}

function isGeneralSpendingAdvicePrompt(message: string): boolean {
  const normalized = message.toLowerCase();

  return /\b(lower|reduce|cut|spend less|control|slow down|curb)\b/.test(normalized) &&
    /\b(spending|spend|expenses?|budget|money)\b/.test(normalized);
}

function getRepetitionAdjustedMessage(
  card: AgentCard | undefined,
  duplicateFollowUp: boolean,
): string {
  if (duplicateFollowUp) {
    return "That same answer still applies. I can take it from another angle.";
  }

  switch (card?.type) {
    case "pip_cash_explanation":
      return "I checked the drivers again, and the next chips can take it deeper.";
    case "spendable_cash_forecast":
      return "I refreshed the near-term view, and the next chips can narrow it down.";
    case "recurring_activity":
      return "I checked likely repeat items again, and the next chips can branch out.";
    case "recent_transactions":
      return "I checked recent charges again, and the next chips can summarize them.";
    case "spending_breakdown":
      return "I grouped the flows again, and the next chips can narrow the view.";
    case "math_breakdown":
      return "I checked the math again, and the next chips can explain the drivers.";
    case "guidance_card":
      return "I checked the read again and kept it tied to the same evidence.";
    default:
      return "I checked that again and kept the next steps focused on a different angle.";
  }
}

function countWords(message: string): number {
  return message.trim().split(/\s+/).filter(Boolean).length;
}
