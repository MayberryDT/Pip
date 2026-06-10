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

export type FreeCashDriver = {
  id: string;
  label: string;
  detail: string;
  amountCents: number;
  tone: MoneyTone;
};

export type FreeCashWarning = {
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
  drivers: FreeCashDriver[];
  warnings: FreeCashWarning[];
  dataStates: FinancialDataState[];
  legacyRollingDailySurplusCents: number;
  legacyRollingNetCents: number;
};

export type FreeCashResult = {
  freeCashTodayCents: number;
  rollingNetCents: number;
  incomeTotalCents: number;
  spendingTotalCents: number;
  refundTotalCents: number;
  protectedSavingsMonthlyCents: number;
  window: RollingWindow;
  drivers: FreeCashDriver[];
  warnings: FreeCashWarning[];
  dataStates: FinancialDataState[];
  trueBalances: AccountBalanceSummary[];
  spendableCashToday?: SpendableCashTodayResult;
};

export type FinancialSnapshot = {
  accounts: Account[];
  transactions: Transaction[];
  settings: UserSettings;
};

export type FinancialDataState = {
  id: "pending-transactions" | "low-confidence" | "missing-data";
  label: string;
  detail: string;
  amountCents: number;
  tone: "warning";
};
