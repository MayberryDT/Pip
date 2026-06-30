import { describe, expect, it } from "vitest";
import {
  normalizeTellerAccount,
  normalizeTellerBalance,
  normalizeTellerTransaction,
  parseDollarAmountToCents,
} from "@/lib/providers/teller/normalize";

describe("Teller normalization", () => {
  it("parses dollar amounts into cents", () => {
    expect(parseDollarAmountToCents("42.47")).toBe(4247);
    expect(parseDollarAmountToCents("-42.47")).toBe(-4247);
  });

  it("normalizes accounts and balances into internal account shapes", () => {
    const account = {
      id: "acct_1",
      name: "Everyday Checking",
      type: "depository",
      subtype: "checking",
      institution: {
        name: "Example Bank",
      },
      last_four: "1234",
    };
    const balance = {
      account_id: "acct_1",
      ledger: "123.45",
      available: "100.00",
    };

    expect(normalizeTellerAccount(account, [balance])).toMatchObject({
      id: "acct_1",
      kind: "checking",
      balanceCents: 12345,
      availableBalanceCents: 10000,
    });
    expect(normalizeTellerBalance(account, balance)).toMatchObject({
      accountId: "acct_1",
      kind: "checking",
      balanceCents: 12345,
    });
  });

  it("normalizes likely spending as negative and income as positive", () => {
    expect(
      normalizeTellerTransaction({
        id: "tx_purchase",
        account_id: "acct_1",
        date: "2026-06-05",
        description: "Coffee Shop",
        amount: "4.25",
        details: {
          category: "food",
        },
      }),
    ).toMatchObject({
      amountCents: -425,
      kind: "purchase",
    });
    expect(
      normalizeTellerTransaction({
        id: "tx_income",
        account_id: "acct_1",
        date: "2026-06-05",
        description: "Payroll",
        amount: "1800.00",
        details: {
          category: "income",
        },
      }),
    ).toMatchObject({
      amountCents: 180000,
      kind: "income",
    });
  });

  it("keeps messy Teller descriptions usable for transfers, refunds, pending items, and card payments", () => {
    expect(
      normalizeTellerTransaction({
        id: "tx_transfer",
        account_id: "acct_1",
        date: "2026-06-05",
        description: "Online Transfer to savings",
        amount: "250.00",
        details: {
          category: "transfer",
        },
      }),
    ).toMatchObject({
      amountCents: -25000,
      kind: "transfer",
      merchantName: "Online Transfer to savings",
    });
    expect(
      normalizeTellerTransaction({
        id: "tx_refund",
        account_id: "acct_1",
        date: "2026-06-05",
        description: "MERCHANT RETURN",
        amount: "19.99",
        details: {
          category: "refund",
          processing_status: "pending",
        },
      }),
    ).toMatchObject({
      amountCents: 1999,
      kind: "refund",
      pending: true,
    });
    expect(
      normalizeTellerTransaction({
        id: "tx_card_payment",
        account_id: "acct_1",
        date: "2026-06-05",
        description: "WEB CREDIT CARD PAYMENT CAPITAL ONE",
        amount: "124.00",
        details: {
          category: "payment",
        },
      }),
    ).toMatchObject({
      amountCents: -12400,
      kind: "credit_card_payment",
    });
  });
});
