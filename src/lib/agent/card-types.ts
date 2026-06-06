import type { AccountBalanceSummary, FreeCashDriver, FreeCashResult, Transaction } from "@/lib/types";

export type PromptChip = {
  id: string;
  label: string;
  prompt: string;
};

export type AgentCard =
  | {
      type: "free_cash_explanation";
      title: string;
      summary: string;
      drivers: FreeCashDriver[];
      warnings: FreeCashResult["warnings"];
      dataStates: FreeCashResult["dataStates"];
    }
  | {
      type: "purchase_simulation";
      title: string;
      amountCents: number;
      beforeCents: number;
      afterTodayCents: number;
      monthlyAverageAfterCents: number;
    }
  | {
      type: "true_balances";
      title: string;
      balances: AccountBalanceSummary[];
    }
  | {
      type: "recent_transactions";
      title: string;
      transactions: Transaction[];
    }
  | {
      type: "missing_card_nudge";
      title: string;
      detail: string;
      issuerName?: string;
    }
  | {
      type: "math_breakdown";
      title: string;
      incomeTotalCents: number;
      spendingTotalCents: number;
      protectedSavingsMonthlyCents: number;
      rollingNetCents: number;
      dayCount: number;
    }
  | {
      type: "connect_account";
      title: string;
      detail: string;
    };

export type AgentResponse = {
  message: string;
  cards: AgentCard[];
  promptChips: PromptChip[];
  audit: {
    toolNames: string[];
    usedModel: boolean;
    model?: string;
    transport?: "netlify-ai-gateway" | "openai-direct" | "custom-openai-compatible";
  };
};
