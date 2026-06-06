export type TellerAccount = {
  id: string;
  name: string;
  type?: string;
  subtype?: string;
  institution?: {
    name?: string;
  };
  last_four?: string;
  currency?: string;
};

export type TellerBalance = {
  account_id: string;
  available?: string;
  ledger?: string;
};

export type TellerTransaction = {
  id: string;
  account_id: string;
  date: string;
  description: string;
  details?: {
    category?: string;
    processing_status?: string;
  };
  amount: string;
  running_balance?: string;
};

export type TellerEnrollmentPayload = {
  accessToken: string;
  enrollment: {
    id: string;
    institution?: {
      name?: string;
    };
    user?: {
      id?: string;
    };
  };
  nonce?: string;
};
