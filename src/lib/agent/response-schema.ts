import { z } from "zod";

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

const promptChipSchema = z.object({
  id: z.string(),
  label: z.string(),
  prompt: z.string(),
});

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
  id: z.literal("pending-transactions"),
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

const cardSchema = z.discriminatedUnion("type", [
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
    afterTodayCents: z.number().int(),
    monthlyAverageAfterCents: z.number().int(),
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
  }),
  z.object({
    type: z.literal("connect_account"),
    title: z.string(),
    detail: z.string(),
  }),
]);

export const agentResponseSchema = z.object({
  message: z.string(),
  cards: z.array(cardSchema),
  promptChips: z.array(promptChipSchema).max(3),
  audit: z.object({
    toolNames: z.array(z.string()),
    usedModel: z.boolean(),
    model: z.string().optional(),
    transport: z
      .enum(["netlify-ai-gateway", "openai-direct", "custom-openai-compatible"])
      .optional(),
  }),
});
