import { z } from "zod";

export const agentMessageMaxChars = 520;
export const agentModelMessageMaxChars = 1400;

const moneyToneSchema = z.enum(["positive", "negative", "neutral", "warning"]);
const accountKindSchema = z.enum(["checking", "savings", "credit_card", "loan", "other"]);
const transactionKindSchema = z.enum([
  "income",
  "purchase",
  "rent",
  "credit_card_payment",
  "transfer",
  "refund",
  "fee",
  "unknown",
]);
export const promptChipSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(56),
  prompt: z.string().min(1).max(160),
});

const plaidClientActionConfigSchema = z.object({
  kind: z.literal("plaid"),
  linkToken: z.string(),
  environment: z.enum(["sandbox", "production"]),
  products: z.array(z.string()),
  mode: z.enum(["connect", "repair", "account_selection"]),
  institutionId: z.string().optional(),
});

export const clientActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("oauth_redirect"),
    url: z.string(),
  }),
  z.object({
    type: z.literal("open_plaid"),
    plaid: plaidClientActionConfigSchema,
  }),
  z.object({
    type: z.literal("reload"),
  }),
  z.object({
    type: z.literal("none"),
  }),
]);

const driverSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  amountCents: z.number().int(),
  tone: moneyToneSchema,
});

const warningSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  tone: z.literal("warning"),
  issuerName: z.string().optional(),
});

const dataStateSchema = z.object({
  id: z.enum(["pending-transactions", "low-confidence", "missing-data"]),
  label: z.string(),
  detail: z.string(),
  amountCents: z.number().int(),
  tone: z.literal("warning"),
});

const balanceSchema = z.object({
  accountId: z.string(),
  name: z.string(),
  institutionName: z.string(),
  kind: accountKindSchema,
  balanceCents: z.number().int(),
  availableBalanceCents: z.number().int().optional(),
  lastFour: z.string().optional(),
  active: z.boolean().optional(),
  includedInPipCash: z.boolean().optional(),
  isProtectedSavings: z.boolean().optional(),
});

const transactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  date: z.string(),
  description: z.string(),
  merchantName: z.string().optional(),
  amountCents: z.number().int(),
  category: z.string().optional(),
  kind: transactionKindSchema.optional(),
  pending: z.boolean().optional(),
  metadata: z
    .object({
      issuerName: z.string().optional(),
      matchedConnectedCard: z.boolean().optional(),
      linkedTransactionId: z.string().optional(),
    })
    .optional(),
});

const rollingWindowSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  dayCount: z.number().int(),
  daysElapsed: z.number().int(),
  daysRemaining: z.number().int(),
});

const spendingBreakdownGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  amountCents: z.number().int(),
  transactionCount: z.number().int(),
});

const recurringActivityItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  merchantName: z.string().optional(),
  expectedDate: z.string(),
  amountCents: z.number().int(),
  kind: transactionKindSchema,
  cadence: z.literal("monthly"),
  confidence: z.enum(["high", "medium", "low"]),
  sourceTransactionCount: z.number().int(),
  lastSeenDate: z.string(),
});

const forecastPointSchema = z.object({
  date: z.string(),
  projectedSpendableCashCents: z.number().int(),
  deltaFromTodayCents: z.number().int(),
  expectedActivityCents: z.number().int(),
  rollingNetCents: z.number().int(),
});

const insightCardRowSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(60),
  amountCents: z.number().int().optional(),
  valueText: z.string().min(1).max(60).optional(),
  detail: z.string().min(1).max(160).optional(),
  tone: moneyToneSchema,
});

const trustReceiptRowSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(80),
  detail: z.string().min(1).max(220),
  tone: moneyToneSchema,
});

const trustReceiptLimitSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  detail: z.string().min(1).max(260),
});

const guidanceStanceSchema = z.enum(["stable", "watch", "tight", "shortfall", "uncertain"]);

const guidanceCardRowSchema = z.object({
  label: z.string().min(1).max(48),
  detail: z.string().min(1).max(180),
  tone: moneyToneSchema,
  evidenceIds: z.array(z.string().min(1).max(80)).min(1).max(4),
});

const accountConnectionActionSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(40),
  prompt: z.string().min(1).max(160),
  style: z.enum(["primary", "secondary", "danger"]),
});

const settingsActionSchema = accountConnectionActionSchema;

const settingsTextRowSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(180),
});

const settingsSectionSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(260),
});

const settingsDetailRowSchema = z.object({
  label: z.string().min(1).max(80),
  detail: z.string().min(1).max(260),
});

const accountConnectionAccountSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).max(120),
  kind: accountKindSchema,
  lastFour: z.string().optional(),
  includedInPipCash: z.boolean(),
  isProtectedSavings: z.boolean(),
  active: z.boolean(),
  roleLabel: z.string().min(1).max(80),
  warning: z.string().min(1).max(160).optional(),
});

const accountConnectionInstitutionSchema = z.object({
  institutionId: z.string().min(1),
  institutionName: z.string().min(1).max(160),
  provider: z.enum(["plaid", "teller", "mock"]),
  status: z.enum(["connected", "mocked", "stale", "failed", "revoked"]),
  lastSuccessfulSyncAt: z.string().nullable().optional(),
  accounts: z.array(accountConnectionAccountSchema),
  actions: z.array(accountConnectionActionSchema).max(6),
});

export const guidanceCardDraftOutputSchema = z.object({
  title: z.string().min(1).max(48),
  stance: guidanceStanceSchema,
  summary: z.string().min(1).max(220),
  rows: z.array(guidanceCardRowSchema).min(1).max(3),
  footer: z.string().min(1).max(140).optional(),
});

export const cardSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pip_cash_explanation"),
    title: z.string(),
    summary: z.string(),
    drivers: z.array(driverSchema),
    warnings: z.array(warningSchema),
    dataStates: z.array(dataStateSchema),
  }),
  z.object({
    type: z.literal("purchase_simulation"),
    title: z.string(),
    amountCents: z.number().int(),
    beforeCents: z.number().int(),
    todayRemainingCents: z.number().int(),
    todayOverageCents: z.number().int(),
    afterTodayCents: z.number().int(),
    monthlyAverageAfterCents: z.number().int(),
    dailyEffectCents: z.number().int().optional(),
    shortfallCents: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("true_balances"),
    title: z.string(),
    balances: z.array(balanceSchema),
  }),
  z.object({
    type: z.literal("recent_transactions"),
    title: z.string(),
    transactions: z.array(transactionSchema),
  }),
  z.object({
    type: z.literal("spending_breakdown"),
    title: z.string(),
    window: rollingWindowSchema,
    totals: z.object({
      incomeCents: z.number().int(),
      spendingCents: z.number().int(),
      refundCents: z.number().int(),
      rentCents: z.number().int(),
      cardPaymentCents: z.number().int(),
      protectedSavingsMonthlyCents: z.number().int(),
    }),
    topCategories: z.array(spendingBreakdownGroupSchema),
    topMerchants: z.array(spendingBreakdownGroupSchema),
    incomeSources: z.array(spendingBreakdownGroupSchema),
  }),
  z.object({
    type: z.literal("recurring_activity"),
    title: z.string(),
    asOfDate: z.string(),
    horizonDays: z.number().int(),
    items: z.array(recurringActivityItemSchema),
  }),
  z.object({
    type: z.literal("spendable_cash_forecast"),
    title: z.string(),
    asOfDate: z.string(),
    horizonDays: z.number().int(),
    currentSpendableCashCents: z.number().int(),
    projectedSpendableCashCents: z.number().int(),
    dailyTrendCents: z.number().int(),
    disclaimer: z.literal("Forecast only; not guaranteed."),
    points: z.array(forecastPointSchema),
    recurringItems: z.array(recurringActivityItemSchema),
  }),
  z.object({
    type: z.literal("missing_card_nudge"),
    title: z.string(),
    detail: z.string(),
    issuerName: z.string().optional(),
  }),
  z.object({
    type: z.literal("math_breakdown"),
    title: z.string(),
    incomeTotalCents: z.number().int(),
    spendingTotalCents: z.number().int(),
    protectedSavingsMonthlyCents: z.number().int(),
    rollingNetCents: z.number().int(),
    dayCount: z.number().int(),
    spendableCashTodayCents: z.number().int().optional(),
    baselineDailyAllowanceCents: z.number().int().optional(),
    behaviorAdjustmentCents: z.number().int().optional(),
    cashRealityAdjustmentCents: z.number().int().optional(),
    legacyRollingDailySurplusCents: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("trust_receipt"),
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(260),
    asOfLabel: z.string().min(1).max(120),
    rows: z.array(trustReceiptRowSchema).min(1).max(8),
    knownLimits: z.array(trustReceiptLimitSchema).max(6),
    footer: z.string().min(1).max(260),
  }),
  z.object({
    type: z.literal("savings_goal_plan"),
    title: z.string().min(1).max(80),
    goalId: z.string().min(1),
    name: z.string().min(1).max(80),
    targetAmountCents: z.number().int(),
    currentAmountCents: z.number().int(),
    remainingCents: z.number().int(),
    targetDate: z.string().optional(),
    recommendedMonthlyContributionCents: z.number().int().optional(),
    monthlyContributionCents: z.number().int(),
    includeInSpendableCash: z.boolean(),
    onTrack: z.boolean().optional(),
    summary: z.string().min(1).max(260),
  }),
  z.object({
    type: z.literal("savings_goal_preview"),
    title: z.string().min(1).max(80),
    name: z.string().min(1).max(80),
    targetAmountCents: z.number().int(),
    currentAmountCents: z.number().int(),
    remainingCents: z.number().int(),
    targetDate: z.string().optional(),
    monthlyContributionCents: z.number().int(),
    includeInSpendableCash: z.boolean(),
    currentSpendableCashTodayCents: z.number().int(),
    spendableCashTodayAfterGoalCents: z.number().int(),
    currentBaselineDailyAllowanceCents: z.number().int(),
    baselineDailyAllowanceAfterGoalCents: z.number().int(),
    usualDailySpendCents: z.number().int().optional(),
    dailyRoomDeltaCents: z.number().int(),
    warningLevel: z.enum(["ok", "watch", "tight", "too_tight"]),
    summary: z.string().min(1).max(320),
  }),
  z.object({
    type: z.literal("savings_goals_summary"),
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(260),
    activeGoalCount: z.number().int(),
    protectedMonthlyContributionCents: z.number().int(),
    goals: z.array(z.object({
      goalId: z.string().min(1),
      name: z.string().min(1).max(80),
      targetAmountCents: z.number().int(),
      currentAmountCents: z.number().int(),
      remainingCents: z.number().int(),
      targetDate: z.string().optional(),
      monthlyContributionCents: z.number().int(),
      includeInSpendableCash: z.boolean(),
      onTrack: z.boolean().optional(),
    })).max(5),
  }),
  z.object({
    type: z.literal("insight_card"),
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(240),
    rows: z.array(insightCardRowSchema).min(3).max(6),
    footer: z.string().min(1).max(160).optional(),
  }),
  z.object({
    type: z.literal("guidance_card"),
    title: z.string().min(1).max(48),
    stance: guidanceStanceSchema,
    summary: z.string().min(1).max(220),
    rows: z.array(guidanceCardRowSchema).min(1).max(3),
    footer: z.string().min(1).max(140).optional(),
  }),
  z.object({
    type: z.literal("connect_account"),
    title: z.string(),
    detail: z.string(),
  }),
  z.object({
    type: z.literal("settings_panel"),
    title: z.string().min(1).max(80),
    accountRows: z.array(settingsTextRowSchema).min(1).max(4),
    sections: z.array(settingsSectionSchema).min(1).max(4),
    actions: z.array(settingsActionSchema).min(1).max(8),
  }),
  z.object({
    type: z.literal("settings_detail"),
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(260),
    rows: z.array(settingsDetailRowSchema).min(1).max(6),
    actions: z.array(settingsActionSchema).min(1).max(6),
  }),
  z.object({
    type: z.literal("account_connections"),
    title: z.string().min(1).max(80),
    institutions: z.array(accountConnectionInstitutionSchema),
  }),
]);

export const responseModeSchema = z.enum(["chat_only", "show_card", "update_context", "clarify", "guidance"]);
export const rawPromptChipOutputSchema = z.union([
  promptChipSchema,
  z.string().min(1).max(160),
  z.record(z.string(), z.unknown()),
]);
const savingsGoalPendingFieldSchema = z.enum([
  "target_amount",
  "target_date",
  "target_date_or_monthly_contribution",
  "monthly_contribution",
  "protection_choice",
  "confirmation",
]);
export const pendingActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("preview_savings_goal"),
    name: z.string().trim().min(1).max(80),
    targetAmountCents: z.number().int().positive().max(100_000_000).optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startingAmountCents: z.number().int().min(0).max(100_000_000).optional(),
    currentAmountCents: z.number().int().min(0).max(100_000_000).optional(),
    monthlyContributionCents: z.number().int().min(0).max(100_000_000).optional(),
    includeInSpendableCash: z.boolean().optional(),
    missing: z.array(savingsGoalPendingFieldSchema).optional(),
  }),
  z.object({
    type: z.literal("create_savings_goal"),
    name: z.string().trim().min(1).max(80),
    targetAmountCents: z.number().int().positive().max(100_000_000).optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startingAmountCents: z.number().int().min(0).max(100_000_000).optional(),
    currentAmountCents: z.number().int().min(0).max(100_000_000).optional(),
    monthlyContributionCents: z.number().int().min(0).max(100_000_000).optional(),
    includeInSpendableCash: z.boolean().optional(),
    missing: z.array(savingsGoalPendingFieldSchema).optional(),
  }),
  z.object({
    type: z.literal("set_savings_goal_protection"),
    goalId: z.string().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    includeInSpendableCash: z.boolean(),
    monthlyContributionCents: z.number().int().min(0).max(100_000_000).optional(),
    missing: z.array(z.enum(["goal", "confirmation"])).optional(),
  }),
  z.object({
    type: z.literal("ordinary_write"),
    action: z.string().min(1).max(120),
    createdAt: z.string().min(1).max(80),
    expiresAt: z.string().min(1).max(80).optional(),
    confirmationKind: z.literal("contextual"),
    summary: z.string().min(1).max(220),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("sensitive_confirmation"),
    action: z.string().min(1).max(120),
    createdAt: z.string().min(1).max(80),
    expiresAt: z.string().min(1).max(80).optional(),
    confirmationKind: z.literal("exact"),
    exactConfirmation: z.string().min(1).max(160),
    summary: z.string().min(1).max(220),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
]);
const rawSupportOutputSchema = z.union([
  z.string().max(1000),
  z.null(),
  z.boolean(),
  z.number(),
  z.array(z.unknown()).max(8),
  z.record(z.string(), z.unknown()),
]).optional();
const rawGuidanceCardDraftOutputSchema = z.union([
  guidanceCardDraftOutputSchema,
  z.record(z.string(), z.unknown()),
]).nullable().optional();

export const agentFinalOutputSchema = z.object({
  message: z.string().min(1).max(agentModelMessageMaxChars),
  support: rawSupportOutputSchema,
  responseMode: responseModeSchema,
  guidanceCardDraft: rawGuidanceCardDraftOutputSchema,
  promptChips: z.array(rawPromptChipOutputSchema).max(8).nullable().optional(),
});

export const agentResponseSchema = z.object({
  message: z.string().min(1).max(agentMessageMaxChars),
  cards: z.array(cardSchema),
  promptChips: z.array(promptChipSchema).max(3),
  usedTools: z.array(z.string()).max(8),
  responseMode: responseModeSchema,
  pendingAction: pendingActionSchema.optional(),
  clientAction: clientActionSchema.optional(),
  audit: z.object({
    toolNames: z.array(z.string()),
    usedModel: z.boolean(),
    model: z.string().optional(),
    transport: z
      .enum(["netlify-ai-gateway", "openai-direct", "custom-openai-compatible"])
      .optional(),
    guidance: z
      .object({
        validationOutcome: z.enum(["not_requested", "context_built", "shown", "repaired", "rejected"]),
        guidanceSource: z.enum(["model_draft", "deterministic_fallback", "none"]).optional(),
        metricVersion: z.literal("v2").optional(),
        state: z.string().optional(),
        confidence: z.string().optional(),
        stance: z.string().optional(),
        evidenceIds: z.array(z.string()).optional(),
        spendableCashTodayCents: z.number().int().optional(),
        shortfallCents: z.number().int().optional(),
        baselineDailyAllowanceCents: z.number().int().optional(),
        behaviorAdjustmentCents: z.number().int().optional(),
        cashRealityAdjustmentCents: z.number().int().optional(),
        currentMonthVarianceCents: z.number().int().optional(),
        rejectionReason: z.string().optional(),
      })
      .optional(),
    quality: z
      .object({
        conversationJob: z.string(),
        answerPatternId: z.string(),
        chipFamilyIds: z.array(z.string()).max(3),
        repeatedJob: z.boolean(),
        repeatedTool: z.boolean(),
        repeatedCard: z.boolean(),
        repeatedMessage: z.boolean(),
        repetitionAdjusted: z.boolean(),
        chipFallbackReason: z.string(),
      })
      .optional(),
  }),
});
