import type { AgentCard, PromptChip } from "@/lib/agent/card-types";
import {
  isVisibleMessageRepetitive,
  type ConversationHistoryItem,
} from "@/lib/agent/conversation-state";
import type { SyncStatus } from "@/lib/data/sync-status";
import { formatMoney } from "@/lib/money";
import type { PipPlatform } from "@/lib/platform/android-shell";
import { composeTrustPolicyAnswer } from "@/lib/trust/pip-trust-policy";
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
  platform?: PipPlatform;
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
  const cardBackedAnswer = composeCardBackedAnswer(input.cards[0], input.userMessage);

  if (cardBackedAnswer) {
    return {
      ...cardBackedAnswer,
      repeatedMessage: false,
      repetitionAdjusted: false,
    };
  }

  const modelMessage = composeModelMessage(input.modelOutput, {
    maxChars: input.maxChars,
    maxWords: input.maxWords,
  });
  const modelRepeated = isVisibleMessageRepetitive({
    candidate: modelMessage,
    history: input.history,
  });

  if (modelRepeated && input.cards.length === 0) {
    return {
      message: fitVisibleMessage(
        "I already covered that part. Ask for the math, recent spending, or upcoming bills and I'll go deeper.",
        {
          maxChars: input.maxChars,
          maxWords: input.maxWords,
        },
      ),
      answerPatternId: "repetition-next-step",
      repeatedMessage: true,
      repetitionAdjusted: true,
    };
  }

  return {
    message: modelMessage,
    answerPatternId: input.cards[0]?.type === "guidance_card" ? "guidance-model" : "model",
    repeatedMessage: modelRepeated,
    repetitionAdjusted: false,
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
  userMessage: string,
): { message: string; answerPatternId: string } | null {
  if (!card) {
    return null;
  }

  if (isCardExplanationFollowUp(userMessage)) {
    return null;
  }

  switch (card.type) {
    case "pip_cash_explanation":
      return null;
    case "purchase_simulation":
      return null;
    case "true_balances":
      return null;
    case "recent_transactions":
      return {
        message: "I found recent charges in the current window.",
        answerPatternId: "recent-transactions-card",
      };
    case "spending_breakdown":
      return {
        message: "I grouped the main money flows.",
        answerPatternId: "spending-breakdown-card",
      };
    case "recurring_activity":
      return null;
    case "spendable_cash_forecast":
      return null;
    case "missing_card_nudge":
      return {
        message: "I found a possible missing card in the current money picture.",
        answerPatternId: "missing-card-nudge-card",
      };
    case "math_breakdown":
      return null;
    case "trust_receipt":
      return null;
    case "savings_goal_plan":
      return null;
    case "savings_goal_preview":
      return null;
    case "savings_goals_summary":
      return null;
    case "insight_card":
      return null;
    case "guidance_card":
      return null;
    case "connect_account":
      return null;
    case "settings_panel":
      return null;
    case "settings_detail":
      return null;
    case "account_connections":
      return null;
  }
}

function isCardExplanationFollowUp(message: string): boolean {
  return /^(why|why\?|how|how\?|what do you mean|tell me more|more|explain|explain that)$/i.test(
    message.trim(),
  );
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
        ? `I found ${formatMoney(getSpendableCents(result))} today. It comes from your normal pattern, bills, monthly savings, recent spending pace, and cash reality.`
        : "I estimate today's room from your normal pattern, bills, monthly savings, recent spending pace, and cash reality.",
      answerPatternId: "definition",
    };
  }

  if (input.usedTools.includes("get_trust_policy")) {
    return {
      message: composeTrustPolicyAnswer(input.userMessage, {
        platform: input.platform,
      }).message,
      answerPatternId: "trust-policy",
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

function countWords(message: string): number {
  return message.trim().split(/\s+/).filter(Boolean).length;
}
