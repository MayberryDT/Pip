import type {
  RecurringActivityItem,
  SpendableCashForecastPoint,
  SpendingBreakdown,
  SpendingBreakdownGroup,
} from "@/lib/pip-cash/insights";
import type {
  AccountBalanceSummary,
  AccountKind,
  PipCashDriver,
  PipCashResult,
  RollingWindow,
  Transaction,
} from "@/lib/types";
import type { SpendableTrustReceipt } from "@/lib/pip-cash/trust-receipt";
import type { PlaidLinkMode } from "@/lib/providers/FinancialDataProvider";

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
  mode: PlaidLinkMode;
  institutionId?: string;
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

export type SavingsGoalPendingField =
  | "target_amount"
  | "target_date"
  | "target_date_or_monthly_contribution"
  | "monthly_contribution"
  | "confirmation";

export type AgentPendingAction =
  | {
      type: "preview_savings_goal";
      name: string;
      targetAmountCents?: number;
      targetDate?: string;
      startingAmountCents?: number;
      currentAmountCents?: number;
      monthlyContributionCents?: number;
      includeInSpendableCash?: boolean;
      missing?: SavingsGoalPendingField[];
    }
  | {
      type: "create_savings_goal";
      name: string;
      targetAmountCents?: number;
      targetDate?: string;
      startingAmountCents?: number;
      currentAmountCents?: number;
      monthlyContributionCents?: number;
      includeInSpendableCash?: boolean;
      missing?: SavingsGoalPendingField[];
    }
  | {
      type: "ordinary_write";
      action: string;
      createdAt: string;
      expiresAt?: string;
      confirmationKind: "contextual";
      summary: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "sensitive_confirmation";
      action: string;
      createdAt: string;
      expiresAt?: string;
      confirmationKind: "exact";
      exactConfirmation: string;
      summary: string;
      payload?: Record<string, unknown>;
    };

export type AgentCard =
  | {
      type: "pip_cash_explanation";
      title: string;
      summary: string;
      drivers: PipCashDriver[];
      warnings: PipCashResult["warnings"];
      dataStates: PipCashResult["dataStates"];
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
  | ({
      type: "trust_receipt";
    } & SpendableTrustReceipt)
  | {
      type: "billing_management";
      title: string;
      body: string;
      action: {
        label: string;
        endpoint: string;
      };
    }
  | {
      type: "savings_goal_plan";
      title: string;
      goalId: string;
      name: string;
      targetAmountCents: number;
      currentAmountCents: number;
      remainingCents: number;
      targetDate?: string;
      recommendedMonthlyContributionCents?: number;
      monthlyContributionCents: number;
      includeInSpendableCash: boolean;
      onTrack?: boolean;
      summary: string;
    }
  | {
      type: "savings_goal_preview";
      title: string;
      name: string;
      targetAmountCents: number;
      currentAmountCents: number;
      remainingCents: number;
      targetDate?: string;
      monthlyContributionCents: number;
      includeInSpendableCash: boolean;
      monthlySavingsAfterGoalCents: number;
      monthlySavingsIncreaseCents: number;
      currentSpendableCashTodayCents: number;
      spendableCashTodayAfterGoalCents: number;
      currentBaselineDailyAllowanceCents: number;
      baselineDailyAllowanceAfterGoalCents: number;
      usualDailySpendCents?: number;
      dailyRoomDeltaCents: number;
      warningLevel: "ok" | "watch" | "tight" | "too_tight";
      summary: string;
    }
  | {
      type: "savings_goals_summary";
      title: string;
      summary: string;
      activeGoalCount: number;
      protectedMonthlyContributionCents: number;
      goals: Array<{
        goalId: string;
        name: string;
        targetAmountCents: number;
        currentAmountCents: number;
        remainingCents: number;
        targetDate?: string;
        monthlyContributionCents: number;
        includeInSpendableCash: boolean;
        onTrack?: boolean;
      }>;
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
    }
  | {
      type: "settings_panel";
      title: string;
      summary: string;
      metadataRows: Array<{
        label: string;
        value: string;
      }>;
      actionGroups: Array<{
        title: string;
        actions: Array<{
          id: string;
          label: string;
          prompt: string;
          style: "primary" | "secondary" | "danger";
        }>;
      }>;
    }
  | {
      type: "settings_detail";
      title: string;
      summary: string;
      rows: Array<{
        label: string;
        detail: string;
      }>;
      actions: Array<{
        id: string;
        label: string;
        prompt: string;
        style: "primary" | "secondary" | "danger";
      }>;
    }
  | {
      type: "account_connections";
      title: string;
      institutions: Array<{
        institutionId: string;
        institutionName: string;
        provider: "plaid" | "teller" | "mock";
        status: "connected" | "mocked" | "stale" | "failed" | "revoked";
        lastSuccessfulSyncAt?: string | null;
        accounts: Array<{
          accountId: string;
          name: string;
          kind: AccountKind;
          lastFour?: string;
          includedInPipCash: boolean;
          isProtectedSavings: boolean;
          active: boolean;
          roleLabel: string;
          warning?: string;
        }>;
        actions: Array<{
          id: string;
          label: string;
          prompt: string;
          style: "primary" | "secondary" | "danger";
        }>;
      }>;
    };

export type AgentResponse = {
  message: string;
  cards: AgentCard[];
  promptChips: PromptChip[];
  usedTools: string[];
  responseMode: "chat_only" | "show_card" | "update_context" | "clarify" | "guidance";
  pendingAction?: AgentPendingAction;
  clientAction?: AgentClientAction;
  audit: {
    toolNames: string[];
    usedModel: boolean;
    model?: string;
    transport?: "openai-direct" | "custom-openai-compatible";
    guidance?: {
      validationOutcome: "not_requested" | "context_built" | "shown" | "repaired" | "rejected";
      guidanceSource?: "model_draft" | "deterministic_fallback" | "none";
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
