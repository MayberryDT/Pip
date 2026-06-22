import { describe, expect, it } from "vitest";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { getFakeSnapshot, isFakeDataScenario } from "@/lib/fake-data";

describe("fake data scenarios", () => {
  it("provides a sanitized production-scale local scenario", () => {
    expect(isFakeDataScenario("production-scale")).toBe(true);

    const snapshot = getFakeSnapshot("production-scale");
    const accountIds = new Set(snapshot.accounts.map((account) => account.id));
    const transactionIds = new Set(snapshot.transactions.map((transaction) => transaction.id));
    const accountKinds = new Set(snapshot.accounts.map((account) => account.kind));
    const transactionKinds = new Set(snapshot.transactions.map((transaction) => transaction.kind));
    const categories = new Set(snapshot.transactions.map((transaction) => transaction.category));
    const searchableText = [
      ...snapshot.accounts.flatMap((account) => [
        account.id,
        account.name,
        account.institutionName,
        account.lastFour ?? "",
        account.userLabel ?? "",
      ]),
      ...snapshot.transactions.flatMap((transaction) => [
        transaction.id,
        transaction.description,
        transaction.merchantName ?? "",
        transaction.category ?? "",
        transaction.metadata?.issuerName ?? "",
      ]),
    ].join(" ");

    expect(snapshot.accounts.length).toBeGreaterThanOrEqual(8);
    expect(snapshot.transactions.length).toBeGreaterThanOrEqual(500);
    expect(transactionIds.size).toBe(snapshot.transactions.length);
    expect(accountKinds).toEqual(new Set(["checking", "savings", "credit_card", "loan"]));
    expect(transactionKinds).toEqual(
      new Set(["income", "purchase", "rent", "credit_card_payment", "transfer", "refund", "fee"]),
    );
    expect(Array.from(categories)).toEqual(
      expect.arrayContaining([
        "payroll",
        "rent",
        "groceries",
        "dining",
        "utilities",
        "subscriptions",
        "transport",
        "health",
        "childcare",
        "insurance",
        "travel",
      ]),
    );
    expect(snapshot.transactions.every((transaction) => accountIds.has(transaction.accountId))).toBe(true);
    expect(snapshot.transactions.some((transaction) => transaction.pending)).toBe(true);
    expect(snapshot.transactions.every((transaction) => transaction.amountCents !== 0)).toBe(true);
    expect(
      snapshot.transactions.some(
        (transaction) =>
          transaction.kind === "credit_card_payment" &&
          transaction.metadata?.matchedConnectedCard === false,
      ),
    ).toBe(true);
    expect(
      snapshot.transactions.some(
        (transaction) =>
          transaction.date === snapshot.settings.asOfDate &&
          transaction.kind === "purchase" &&
          transaction.pending !== true,
      ),
    ).toBe(true);
    expect(snapshot.savingsGoals?.some((goal) => goal.status === "active" && goal.includeInSpendableCash)).toBe(true);
    expect(searchableText).not.toMatch(/@|tyler|mayberry|spendwithpip|plaid|teller|oauth/i);
    expect(searchableText).not.toMatch(/\b\d{9,}\b/);
    const result = calculatePipCash(snapshot);

    expect(result.spendableCashToday?.spendableCashTodayCents).toBeGreaterThan(0);
    expect(result.spendableCashToday?.sameDayDiscretionarySpendCents).toBeGreaterThan(0);
    expect(result.spendableCashToday?.savingsGoalMonthlyCents).toBeGreaterThan(0);
    expect(result.spendableCashToday?.state).not.toBe("shortfall");
  });
});
