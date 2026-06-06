import { describe, expect, it } from "vitest";
import { classifyTransaction } from "@/lib/free-cash/classify";
import type { Transaction } from "@/lib/types";

describe("classifyTransaction", () => {
  it.each([
    ["refund from a merchant return", tx({ description: "RETURN REFUND REI", amountCents: 4200 }), "refund"],
    ["peer transfer text", tx({ description: "VENMO Tyler cashout", amountCents: 3500 }), "transfer"],
    [
      "messy card autopay",
      tx({
        description: "WEB AUTOPAY CAPITAL ONE CREDIT CARD",
        merchantName: "Capital One",
        amountCents: -12400,
      }),
      "credit_card_payment",
    ],
    ["rent description", tx({ description: "Trailhead Apartments rent", amountCents: -145000 }), "rent"],
    ["bank fee", tx({ description: "Monthly maintenance fee", amountCents: -1200 }), "fee"],
    ["positive default", tx({ description: "Payroll deposit", amountCents: 260000 }), "income"],
    ["negative default", tx({ description: "POS PURCHASE COFFEE SHOP", amountCents: -642 }), "purchase"],
    ["zero amount fallback", tx({ description: "Balance correction", amountCents: 0 }), "unknown"],
  ] as const)("classifies %s", (_label, transaction, expectedKind) => {
    expect(classifyTransaction(transaction)).toBe(expectedKind);
  });

  it("trusts explicit normalized kind over messy provider text", () => {
    expect(
      classifyTransaction(
        tx({
          description: "Refund looking text",
          amountCents: 5000,
          kind: "transfer",
        }),
      ),
    ).toBe("transfer");
  });
});

function tx(input: Partial<Transaction>): Transaction {
  return {
    id: input.id ?? "tx",
    accountId: input.accountId ?? "acct",
    date: input.date ?? "2026-06-20",
    description: input.description ?? "Transaction",
    amountCents: input.amountCents ?? -1000,
    merchantName: input.merchantName,
    category: input.category,
    kind: input.kind,
    pending: input.pending,
    metadata: input.metadata,
  };
}
