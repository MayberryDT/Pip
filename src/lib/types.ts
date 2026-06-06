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
};

export type FinancialSnapshot = {
  accounts: Account[];
  transactions: Transaction[];
  settings: UserSettings;
};

export type FinancialDataState = {
  id: "pending-transactions";
  label: string;
  detail: string;
  amountCents: number;
  tone: "warning";
};
