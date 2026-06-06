import { describe, expect, it } from "vitest";
import {
  annotateCreditCardPaymentMatches,
  findUnmatchedCreditCardPayments,
  isDedupedCreditCardPayment,
} from "@/lib/free-cash/dedupe-credit-card-payments";
import type { Account, Transaction } from "@/lib/types";

const accounts: Account[] = [
  {
    id: "card-northstar",
    name: "Everyday Visa",
    institutionName: "Northstar Bank",
    kind: "credit_card",
    balanceCents: -34218,
    lastFour: "8821",
  },
  {
    id: "checking",
    name: "Everyday Checking",
    institutionName: "Northstar Bank",
    kind: "checking",
    balanceCents: 185642,
  },
];

describe("credit-card payment dedupe", () => {
  it("auto-matches likely payments to a connected card by institution and card signal", () => {
    const [payment] = annotateCreditCardPaymentMatches(
      [
        tx({
          description: "AUTOPAY NORTHSTAR VISA",
          merchantName: "Northstar Visa",
          amountCents: -12500,
        }),
      ],
      accounts,
    );

    expect(payment?.metadata).toMatchObject({
      issuerName: "Everyday Visa",
      matchedConnectedCard: true,
    });
    expect(isDedupedCreditCardPayment(payment as Transaction)).toBe(true);
  });

  it("auto-matches partial payments by card last four without requiring amount equality", () => {
    const [payment] = annotateCreditCardPaymentMatches(
      [
        tx({
          description: "Credit card payment ending 8821",
          amountCents: -3700,
        }),
      ],
      accounts,
    );

    expect(payment?.metadata?.matchedConnectedCard).toBe(true);
  });

  it("matches multiple close card payments to their corresponding connected cards", () => {
    const multiCardAccounts: Account[] = [
      ...accounts,
      {
        id: "card-travel",
        name: "Travel Mastercard",
        institutionName: "Summit Bank",
        kind: "credit_card",
        balanceCents: -8123,
        lastFour: "4444",
      },
    ];
    const annotated = annotateCreditCardPaymentMatches(
      [
        tx({
          id: "visa-payment",
          description: "Online card payment ending 8821",
          date: "2026-06-20",
          amountCents: -3700,
        }),
        tx({
          id: "mastercard-payment",
          description: "Autopay Summit Mastercard 4444",
          date: "2026-06-21",
          amountCents: -8123,
        }),
      ],
      multiCardAccounts,
    );

    expect(annotated).toEqual([
      expect.objectContaining({
        id: "visa-payment",
        metadata: expect.objectContaining({
          issuerName: "Everyday Visa",
          matchedConnectedCard: true,
        }),
      }),
      expect.objectContaining({
        id: "mastercard-payment",
        metadata: expect.objectContaining({
          issuerName: "Travel Mastercard",
          matchedConnectedCard: true,
        }),
      }),
    ]);
  });

  it("preserves explicit provider metadata instead of second-guessing it", () => {
    const [payment] = annotateCreditCardPaymentMatches(
      [
        tx({
          description: "AUTOPAY NORTHSTAR VISA",
          metadata: {
            issuerName: "Northstar Visa",
            matchedConnectedCard: false,
          },
        }),
      ],
      accounts,
    );

    expect(payment?.metadata).toMatchObject({
      issuerName: "Northstar Visa",
      matchedConnectedCard: false,
    });
  });

  it("keeps unmatched external-card payments visible for missing-card nudges", () => {
    const annotated = annotateCreditCardPaymentMatches(
      [
        tx({
          id: "capital-one",
          description: "Capital One card payment",
          merchantName: "Capital One",
          amountCents: -12400,
        }),
      ],
      accounts,
    );

    expect(annotated[0]?.metadata?.matchedConnectedCard).toBeUndefined();
    expect(findUnmatchedCreditCardPayments(annotated).map((item) => item.id)).toEqual([
      "capital-one",
    ]);
  });

  it("does not false-positive generic transfers as card payments", () => {
    const annotated = annotateCreditCardPaymentMatches(
      [
        tx({
          id: "transfer",
          description: "Transfer to savings",
          amountCents: -50000,
        }),
      ],
      accounts,
    );

    expect(findUnmatchedCreditCardPayments(annotated)).toHaveLength(0);
  });
});

function tx(input: Partial<Transaction>): Transaction {
  return {
    id: input.id ?? "payment",
    accountId: input.accountId ?? "checking",
    date: input.date ?? "2026-06-20",
    description: input.description ?? "Card payment",
    merchantName: input.merchantName,
    category: input.category ?? "credit card payment",
    amountCents: input.amountCents ?? -10000,
    kind: input.kind,
    pending: input.pending,
    metadata: input.metadata,
  };
}
