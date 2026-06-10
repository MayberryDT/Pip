import type {
  RecurringActivityItem,
  SpendableCashForecastPoint,
  SpendingBreakdown,
  SpendingBreakdownGroup,
} from "@/lib/free-cash/insights";
import type { AccountBalanceSummary, FreeCashDriver, FreeCashResult, RollingWindow, Transaction } from "@/lib/types";

export type PromptChip = {
  id: string;
  label: string;
  prompt: string;
};

export type PlaidClientActionConfig = {
  kind: "plaid";
  linkToken: string;
  environment: "sandbox" | "production";
  products: string[];
  mode: "connect" | "repair";
};

export type AgentClientAction =
  | {
      type: "oauth_redirect";
      url: string;
    }
  | {
      type: "open_plaid";
      plaid: PlaidClientActionConfig;
    }
  | {
      type: "reload";
    }
  | {
      type: "none";
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
      todayRemainingCents: number;
      todayOverageCents: number;
      afterTodayCents: number;
      monthlyAverageAfterCents: number;
      dailyEffectCents?: number;
      shortfallCents?: number;
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
      type: "spending_breakdown";
      title: string;
      window: RollingWindow;
      totals: SpendingBreakdown["totals"];
      topCategories: SpendingBreakdownGroup[];
      topMerchants: SpendingBreakdownGroup[];
      incomeSources: SpendingBreakdownGroup[];
    }
  | {
      type: "recurring_activity";
      title: string;
      asOfDate: string;
      horizonDays: number;
      items: RecurringActivityItem[];
    }
  | {
      type: "spendable_cash_forecast";
      title: string;
      asOfDate: string;
      horizonDays: number;
      currentSpendableCashCents: number;
      projectedSpendableCashCents: number;
      dailyTrendCents: number;
      disclaimer: "Forecast only; not guaranteed.";
      points: SpendableCashForecastPoint[];
      recurringItems: RecurringActivityItem[];
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
      spendableCashTodayCents?: number;
      baselineDailyAllowanceCents?: number;
      behaviorAdjustmentCents?: number;
      cashRealityAdjustmentCents?: number;
      legacyRollingDailySurplusCents?: number;
    }
  | {
      type: "insight_card";
      title: string;
      summary: string;
      rows: Array<{
        id: string;
        label: string;
        amountCents?: number;
        valueText?: string;
        detail?: string;
        tone: "positive" | "negative" | "neutral" | "warning";
      }>;
      footer?: string;
    }
  | {
      type: "guidance_card";
      title: string;
      stance: "stable" | "watch" | "tight" | "shortfall" | "uncertain";
      summary: string;
      rows: Array<{
        label: string;
        detail: string;
        tone: "positive" | "negative" | "neutral" | "warning";
        evidenceIds: string[];
      }>;
      footer?: string;
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
  usedTools: string[];
  responseMode: "chat_only" | "show_card" | "update_context" | "clarify" | "guidance";
  clientAction?: AgentClientAction;
  audit: {
    toolNames: string[];
    usedModel: boolean;
    model?: string;
    transport?: "netlify-ai-gateway" | "openai-direct" | "custom-openai-compatible";
    guidance?: {
      validationOutcome: "not_requested" | "context_built" | "shown" | "repaired" | "rejected";
      metricVersion?: "v2";
      state?: string;
      confidence?: string;
      stance?: string;
      evidenceIds?: string[];
      spendableCashTodayCents?: number;
      shortfallCents?: number;
      baselineDailyAllowanceCents?: number;
      behaviorAdjustmentCents?: number;
      cashRealityAdjustmentCents?: number;
      currentMonthVarianceCents?: number;
      rejectionReason?: string;
    };
    quality?: {
      conversationJob: string;
      answerPatternId: string;
      chipFamilyIds: string[];
      repeatedJob: boolean;
      repeatedTool: boolean;
      repeatedCard: boolean;
      repeatedMessage: boolean;
      repetitionAdjusted: boolean;
      chipFallbackReason: string;
    };
  };
};
