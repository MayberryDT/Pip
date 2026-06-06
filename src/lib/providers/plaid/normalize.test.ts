import { describe, expect, it } from "vitest";
import type { AccountBase, Transaction as PlaidTransaction } from "plaid";
import {
  normalizePlaidAccount,
  normalizePlaidBalance,
  normalizePlaidTransaction,
} from "@/lib/providers/plaid/normalize";

describe("Plaid normalization", () => {
  it("keeps depository balances positive and credit-card owed balances negative", () => {
    expect(
      normalizePlaidAccount(
        {
          account_id: "acct_checking",
          balances: {
            current: 123.45,
            available: 120,
            iso_currency_code: "USD",
            unofficial_currency_code: null,
            limit: null,
          },
          mask: "1234",
          name: "Everyday Checking",
          official_name: null,
          type: "depository",
          subtype: "checking",
        } as AccountBase,
        "Plaid Bank",
      ),
    ).toMatchObject({
      id: "acct_checking",
      kind: "checking",
      balanceCents: 12345,
      availableBalanceCents: 12000,
    });

    expect(
      normalizePlaidBalance(
        {
          account_id: "acct_credit",
          balances: {
            current: 342.18,
            available: 3154.82,
            iso_currency_code: "USD",
            unofficial_currency_code: null,
            limit: 3500,
          },
          mask: "8821",
          name: "Everyday Visa",
          official_name: null,
          type: "credit",
          subtype: "credit card",
        } as AccountBase,
        "Plaid Bank",
      ),
    ).toMatchObject({
      accountId: "acct_credit",
      kind: "credit_card",
      balanceCents: -34218,
      availableBalanceCents: 315482,
    });
  });

  it("flips Plaid transaction signs into the Free Cash convention", () => {
    expect(
      normalizePlaidTransaction({
        transaction_id: "tx_coffee",
        account_id: "acct_checking",
        amount: 4.25,
        date: "2026-06-05",
        authorized_date: "2026-06-04",
        name: "Coffee Shop",
        original_description: null,
        merchant_name: "Copper Cup",
        pending: false,
        personal_finance_category: {
          primary: "FOOD_AND_DRINK",
          detailed: "FOOD_AND_DRINK_COFFEE",
        },
      } as PlaidTransaction),
    ).toMatchObject({
      id: "tx_coffee",
      amountCents: -425,
      date: "2026-06-04",
      category: "food_and_drink:food_and_drink_coffee",
    });

    expect(
      normalizePlaidTransaction({
        transaction_id: "tx_payroll",
        account_id: "acct_checking",
        amount: -2500,
        date: "2026-06-07",
        authorized_date: null,
        name: "Payroll",
        merchant_name: "Acme Studio",
        pending: false,
      } as PlaidTransaction),
    ).toMatchObject({
      id: "tx_payroll",
      amountCents: 250000,
    });
  });

  it("handles missing merchant names and legacy Plaid categories without dropping descriptions", () => {
    expect(
      normalizePlaidTransaction({
        transaction_id: "tx_no_merchant",
        account_id: "acct_checking",
        amount: 18.75,
        date: "2026-06-05",
        authorized_date: null,
        name: "POS PURCHASE 1234 COFFEE SHOP",
        original_description: null,
        merchant_name: null,
        pending: true,
        category: ["Food and Drink", "Coffee Shop"],
      } as PlaidTransaction),
    ).toMatchObject({
      id: "tx_no_merchant",
      description: "POS PURCHASE 1234 COFFEE SHOP",
      merchantName: undefined,
      amountCents: -1875,
      pending: true,
      category: "food and drink:coffee shop",
    });
  });
});
