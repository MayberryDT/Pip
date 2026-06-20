import type { SavingsGoal } from "@/lib/savings-goals/types";

export type AccountKind = "checking" | "savings" | "credit_card" | "loan" | "other";

export type TransactionKind =
  | "income"
  | "purchase"
  | "rent"
  | "credit_card_payment"
  | "transfer"
  | "refund"
  | "fee"
  | "unknown";

export type Account = {
  id: string;
  name: string;
  institutionName: string;
  kind: AccountKind;
  balanceCents: number;
  availableBalanceCents?: number;
  lastFour?: string;
  isProtectedSavings?: boolean;
  active?: boolean;
  includedInPipCash?: boolean;
  userLabel?: string;
  hiddenReason?: string;
};

export type Transaction = {
  id: string;
  accountId: string;
  date: string;
  description: string;
  merchantName?: string;
  amountCents: number;
  category?: string;
  kind?: TransactionKind;
  pending?: boolean;
  metadata?: {
    issuerName?: string;
    matchedConnectedCard?: boolean;
    linkedTransactionId?: string;
  };
};

export type UserSettings = {
  asOfDate: string;
  protectedSavingsMonthlyCents: number;
  suppressedMissingCardIssuers?: string[];
};

export type MoneyTone = "positive" | "negative" | "neutral" | "warning";

export type SpendableTransactionGroup =
  | "income"
  | "recurring_obligation"
  | "everyday_spending"
  | "transfer"
  | "card_settlement"
  | "refund"
  | "savings_protected"
  | "fee"
  | "unknown";

export type SpendableCashConfidence = "high" | "medium" | "low";

export type SpendableCashTodayState =
  | "healthy"
  | "normal"
  | "tight"
  | "overspending"
  | "shortfall"
  | "low_confidence"
  | "missing_data";

export type ClassifiedSpendableTransaction = {
  transaction: Transaction;
  group: SpendableTransactionGroup;
  confidence: SpendableCashConfidence;
  reason: string;
};

export type SameDayLedgerTreatment =
  | "daily_spend"
  | "daily_refund"
  | "expected_bill"
  | "bill_variance"
  | "card_settlement"
  | "transfer"
  | "ignored";

export type SameDayLedgerItem = {
  transactionId: string;
  accountId: string;
  date: string;
  label: string;
  amountCents: number;
  treatment: SameDayLedgerTreatment;
  expectedAmountCents?: number;
  varianceCents?: number;
  pending: boolean;
  reason: string;
};

export type SameDayLedger = {
  asOfDate: string;
  items: SameDayLedgerItem[];
  discretionarySpendCents: number;
  refundCents: number;
  billVarianceCents: number;
  pendingSpendCents: number;
};

export type RecurringObligation = {
  merchantKey: string;
  label: string;
  expectedAmountCents: number;
  expectedDay?: number;
};

export type RecurringObligationRuleSource =
  | "user_confirmed"
  | "user_correction"
  | "auto_detected";

export type RecurringObligationRuleStatus = "active" | "ignored";

export type RecurringObligationRule = RecurringObligation & {
  id: string;
  userId: string;
  cadence: "monthly";
  source: RecurringObligationRuleSource;
  status: RecurringObligationRuleStatus;
  lastConfirmedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RecurringObligationSuggestion = RecurringObligation & {
  transactionCount: number;
  source: "auto_detected";
};

export type RecurringObligationModel = {
  confirmed: RecurringObligation[];
  suggestions: RecurringObligationSuggestion[];
  ignoredMerchantKeys: string[];
};

export type PipCashDriver = {
  id: string;
  label: string;
  detail: string;
  amountCents: number;
  tone: MoneyTone;
};

export type PipCashWarning = {
  id: string;
  label: string;
  detail: string;
  tone: "warning";
  issuerName?: string;
};

export type AccountBalanceSummary = {
  accountId: string;
  name: string;
  institutionName: string;
  kind: AccountKind;
  balanceCents: number;
  availableBalanceCents?: number;
  lastFour?: string;
  active?: boolean;
  includedInPipCash?: boolean;
  isProtectedSavings?: boolean;
};

export type RollingWindow = {
  startDate: string;
  endDate: string;
  dayCount: number;
  daysElapsed: number;
  daysRemaining: number;
};

export type SpendableCashTodayResult = {
  metricVersion: "v2";
  spendableCashTodayCents: number;
  startingSpendableCashTodayCents: number;
  sameDayDiscretionarySpendCents: number;
  sameDayRefundCents: number;
  billVarianceCents: number;
  sameDayPendingSpendCents: number;
  sameDayLedger: SameDayLedger;
  shortfallCents: number;
  patternShortfallCents: number;
  behaviorShortfallCents: number;
  cashShortfallCents: number;
  baselineDailyAllowanceCents: number;
  behaviorAdjustmentCents: number;
  cashRealityAdjustmentCents: number;
  cashGuardrailApplied: boolean;
  cashGuardrailShareOfBaseline: number;
  materialDailyChangeCents: number;
  lowConfidenceDailyCapCents?: number;
  lowConfidenceCapApplied: boolean;
  adaptiveDailyAllowanceCents: number;
  monthlyEverydayPoolCents: number;
  averageMonthlyIncomeCents: number;
  averageMonthlyRecurringObligationsCents: number;
  averageMonthlyEverydaySpendCents: number;
  monthlySavingsCents?: number;
  savingsGoalMonthlyCents?: number;
  totalSavingsProtectedMonthlyCents?: number;
  protectedSavingsMonthlyCents: number;
  hiddenCushionCents: number;
  allowedSoFarThisMonthCents: number;
  actualEverydaySpendSoFarCents: number;
  currentMonthVarianceCents: number;
  availableCashGuardrailCents: number;
  pendingCommittedSpendCents: number;
  cashDailyCapCents: number;
  lookbackStartDate: string;
  lookbackEndDate: string;
  completedMonthCount: number;
  currentMonthStartDate: string;
  currentMonthElapsedDays: number;
  recoveryDays: number;
  confidence: SpendableCashConfidence;
  state: SpendableCashTodayState;
  drivers: PipCashDriver[];
  warnings: PipCashWarning[];
  dataStates: FinancialDataState[];
  legacyRollingDailySurplusCents: number;
  legacyRollingNetCents: number;
};

export type PipCashResult = {
  pipCashTodayCents: number;
  rollingNetCents: number;
  incomeTotalCents: number;
  spendingTotalCents: number;
  refundTotalCents: number;
  monthlySavingsCents?: number;
  savingsGoalMonthlyCents?: number;
  totalSavingsProtectedMonthlyCents?: number;
  protectedSavingsMonthlyCents: number;
  window: RollingWindow;
  drivers: PipCashDriver[];
  warnings: PipCashWarning[];
  dataStates: FinancialDataState[];
  trueBalances: AccountBalanceSummary[];
  spendableCashToday?: SpendableCashTodayResult;
};

export type FinancialSnapshot = {
  accounts: Account[];
  transactions: Transaction[];
  settings: UserSettings;
  savingsGoals?: SavingsGoal[];
  recurringObligationRules?: RecurringObligationRule[];
};

export type FinancialDataState = {
  id: "pending-transactions" | "low-confidence" | "missing-data";
  label: string;
  detail: string;
  amountCents: number;
  tone: "warning";
};
