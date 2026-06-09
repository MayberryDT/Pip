import { z } from "zod";

export const agentMessageMaxChars = 260;
export const agentModelMessageMaxChars = 1000;

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
  mode: z.enum(["connect", "repair"]),
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

export const cardSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("free_cash_explanation"),
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
    type: z.literal("insight_card"),
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(240),
    rows: z.array(insightCardRowSchema).min(3).max(6),
    footer: z.string().min(1).max(160).optional(),
  }),
  z.object({
    type: z.literal("connect_account"),
    title: z.string(),
    detail: z.string(),
  }),
]);

export const responseModeSchema = z.enum(["chat_only", "show_card", "update_context", "clarify"]);

export const agentFinalOutputSchema = z.object({
  message: z.string().min(1).max(agentModelMessageMaxChars),
  support: z.string().min(1).max(500).optional(),
  responseMode: responseModeSchema,
  promptChips: z.array(promptChipSchema).max(8),
});

export const agentResponseSchema = z.object({
  message: z.string().min(1).max(agentMessageMaxChars),
  cards: z.array(cardSchema),
  promptChips: z.array(promptChipSchema).max(3),
  usedTools: z.array(z.string()).max(8),
  responseMode: responseModeSchema,
  clientAction: clientActionSchema.optional(),
  audit: z.object({
    toolNames: z.array(z.string()),
    usedModel: z.boolean(),
    model: z.string().optional(),
    transport: z
      .enum(["netlify-ai-gateway", "openai-direct", "custom-openai-compatible"])
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
