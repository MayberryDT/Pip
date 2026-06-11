import { describe, expect, it } from "vitest";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { addDays, buildRollingCalendarWindow, subtractOneCalendarMonth } from "@/lib/pip-cash/date-window";
import { fakeSnapshot, negativePipCashSnapshot } from "@/lib/fake-data";
import type { FinancialSnapshot } from "@/lib/types";

describe("rolling calendar-month window", () => {
  it("uses a one-calendar-month lookback with an inclusive start day", () => {
    expect(buildRollingCalendarWindow("2026-06-20")).toEqual({
      startDate: "2026-05-21",
      endDate: "2026-06-20",
      dayCount: 31,
      daysElapsed: 31,
      daysRemaining: 0,
    });
  });

  it("clamps month-end dates for non-leap and leap years", () => {
    expect(subtractOneCalendarMonth("2026-03-31")).toBe("2026-02-28");
    expect(subtractOneCalendarMonth("2024-03-31")).toBe("2024-02-29");
  });

  it("adds and subtracts calendar days across month boundaries", () => {
    expect(addDays("2026-06-01", -1)).toBe("2026-05-31");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("calculatePipCash", () => {
  it("returns the intended $43 fake-data prototype number", () => {
    const result = calculatePipCash(fakeSnapshot);

    expect(result.incomeTotalCents).toBe(420000);
    expect(result.spendingTotalCents).toBe(262400);
    expect(result.protectedSavingsMonthlyCents).toBe(24300);
    expect(result.rollingNetCents).toBe(133300);
    expect(result.pipCashTodayCents).toBe(4300);
  });

  it("includes rent, protected savings, refunds, and deduped card payments as explanation drivers", () => {
    const result = calculatePipCash(fakeSnapshot);
    const driverIds = result.drivers.map((driver) => driver.id);

    expect(driverIds).toContain("rent");
    expect(driverIds).toContain("protected-savings");
    expect(driverIds).toContain("refunds");
    expect(driverIds).toContain("card-payments");
  });

  it("does not count credit-card settlement payments or transfers as spending", () => {
    const withOnlyIgnoredTransactions: FinancialSnapshot = {
      settings: {
        asOfDate: "2026-06-20",
        protectedSavingsMonthlyCents: 0,
      },
      accounts: [],
      transactions: [
        {
          id: "payment",
          accountId: "checking",
          date: "2026-06-10",
          description: "Autopay Northstar Visa",
          amountCents: -50000,
          kind: "credit_card_payment",
          metadata: {
            matchedConnectedCard: true,
          },
        },
        {
          id: "transfer",
          accountId: "checking",
          date: "2026-06-11",
          description: "Transfer to savings",
          amountCents: -25000,
          kind: "transfer",
        },
      ],
    };

    const result = calculatePipCash(withOnlyIgnoredTransactions);

    expect(result.spendingTotalCents).toBe(0);
    expect(result.pipCashTodayCents).toBe(0);
  });

  it("ignores transactions from inactive or excluded accounts in Spendable Cash Today", () => {
    const snapshot: FinancialSnapshot = {
      settings: {
        asOfDate: "2026-06-20",
        protectedSavingsMonthlyCents: 0,
      },
      accounts: [
        {
          id: "checking",
          name: "Everyday Checking",
          institutionName: "Northstar Bank",
          kind: "checking",
          balanceCents: 100000,
          active: true,
          includedInPipCash: true,
        },
        {
          id: "business-card",
          name: "Business Card",
          institutionName: "Northstar Bank",
          kind: "credit_card",
          balanceCents: -50000,
          active: true,
          includedInPipCash: false,
        },
        {
          id: "old-checking",
          name: "Old Checking",
          institutionName: "Old Bank",
          kind: "checking",
          balanceCents: 50000,
          active: false,
          includedInPipCash: false,
        },
      ],
      transactions: [
        {
          id: "income",
          accountId: "checking",
          date: "2026-06-05",
          description: "Payroll",
          amountCents: 100000,
          kind: "income",
        },
        {
          id: "excluded-purchase",
          accountId: "business-card",
          date: "2026-06-06",
          description: "Business purchase",
          amountCents: -50000,
          kind: "purchase",
        },
        {
          id: "inactive-purchase",
          accountId: "old-checking",
          date: "2026-06-07",
          description: "Old account purchase",
          amountCents: -25000,
          kind: "purchase",
        },
      ],
    };

    const result = calculatePipCash(snapshot);

    expect(result.incomeTotalCents).toBe(100000);
    expect(result.spendingTotalCents).toBe(0);
    expect(result.trueBalances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: "business-card",
          includedInPipCash: false,
        }),
        expect.objectContaining({
          accountId: "old-checking",
          active: false,
        }),
      ]),
    );
  });

  it("counts connected credit-card purchases while ignoring the matching settlement payment", () => {
    const cardPurchaseSnapshot: FinancialSnapshot = {
      settings: {
        asOfDate: "2026-06-20",
        protectedSavingsMonthlyCents: 0,
      },
      accounts: [
        {
          id: "checking",
          name: "Everyday Checking",
          institutionName: "Northstar Bank",
          kind: "checking",
          balanceCents: 120000,
        },
        {
          id: "card",
          name: "Everyday Visa",
          institutionName: "Northstar Bank",
          kind: "credit_card",
          balanceCents: -30000,
          lastFour: "8821",
        },
      ],
      transactions: [
        {
          id: "income",
          accountId: "checking",
          date: "2026-06-07",
          description: "Payroll deposit",
          amountCents: 100000,
          kind: "income",
        },
        {
          id: "card-purchase",
          accountId: "card",
          date: "2026-06-10",
          description: "Card purchase",
          amountCents: -30000,
          kind: "purchase",
        },
        {
          id: "card-payment",
          accountId: "checking",
          date: "2026-06-11",
          description: "Payment to Everyday Visa 8821",
          amountCents: -30000,
          kind: "credit_card_payment",
        },
      ],
    };

    const result = calculatePipCash(cardPurchaseSnapshot);

    expect(result.incomeTotalCents).toBe(100000);
    expect(result.spendingTotalCents).toBe(30000);
    expect(result.rollingNetCents).toBe(70000);
    expect(result.drivers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "card-payments",
          amountCents: 0,
        }),
      ]),
    );
  });

  it("interprets normalized income, spend, refund, and protected-savings signs consistently", () => {
    const signSnapshot: FinancialSnapshot = {
      settings: {
        asOfDate: "2026-06-20",
        protectedSavingsMonthlyCents: 10000,
      },
      accounts: [],
      transactions: [
        {
          id: "income",
          accountId: "checking",
          date: "2026-06-07",
          description: "Payroll deposit",
          amountCents: 100000,
          kind: "income",
        },
        {
          id: "purchase",
          accountId: "checking",
          date: "2026-06-08",
          description: "Purchase",
          amountCents: -40000,
          kind: "purchase",
        },
        {
          id: "refund",
          accountId: "checking",
          date: "2026-06-09",
          description: "Return refund",
          amountCents: 10000,
          kind: "refund",
        },
      ],
    };

    const result = calculatePipCash(signSnapshot);

    expect(result.incomeTotalCents).toBe(100000);
    expect(result.refundTotalCents).toBe(10000);
    expect(result.spendingTotalCents).toBe(30000);
    expect(result.protectedSavingsMonthlyCents).toBe(10000);
    expect(result.rollingNetCents).toBe(60000);
  });

  it("can return positive, zero, and negative Pip Cash values", () => {
    const baseSnapshot: FinancialSnapshot = {
      settings: {
        asOfDate: "2026-06-20",
        protectedSavingsMonthlyCents: 0,
      },
      accounts: [],
      transactions: [],
    };

    expect(
      calculatePipCash({
        ...baseSnapshot,
        transactions: [
          {
            id: "income",
            accountId: "checking",
            date: "2026-06-10",
            description: "Income",
            amountCents: 3200,
            kind: "income",
          },
        ],
      }).pipCashTodayCents,
    ).toBeGreaterThan(0);
    expect(calculatePipCash(baseSnapshot).pipCashTodayCents).toBe(0);
    expect(
      calculatePipCash({
        ...baseSnapshot,
        transactions: [
          {
            id: "purchase",
            accountId: "checking",
            date: "2026-06-10",
            description: "Purchase",
            amountCents: -3200,
            kind: "purchase",
          },
        ],
      }).pipCashTodayCents,
    ).toBeLessThan(0);
  });

  it("allows negative Pip Cash values", () => {
    const negativeSnapshot: FinancialSnapshot = {
      settings: {
        asOfDate: "2026-06-20",
        protectedSavingsMonthlyCents: 20000,
      },
      accounts: [],
      transactions: [
        {
          id: "income",
          accountId: "checking",
          date: "2026-06-01",
          description: "Small deposit",
          amountCents: 100000,
          kind: "income",
        },
        {
          id: "rent",
          accountId: "checking",
          date: "2026-06-02",
          description: "Rent",
          amountCents: -150000,
          kind: "rent",
        },
      ],
    };

    expect(calculatePipCash(negativeSnapshot).pipCashTodayCents).toBeLessThan(0);
  });

  it("surfaces a missing-card nudge when a card payment is not matched to a connected card", () => {
    const result = calculatePipCash(fakeSnapshot);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-card",
          issuerName: "Capital One",
        }),
      ]),
    );
  });

  it("suppresses missing-card nudges for issuers the user intentionally hid", () => {
    const result = calculatePipCash({
      ...fakeSnapshot,
      settings: {
        ...fakeSnapshot.settings,
        suppressedMissingCardIssuers: ["capital one"],
      },
    });

    expect(result.warnings.map((warning) => warning.id)).not.toContain("missing-card");
  });

  it("keeps a negative fake-data scenario available for product testing", () => {
    const result = calculatePipCash(negativePipCashSnapshot);

    expect(result.pipCashTodayCents).toBeLessThan(0);
    expect(result.drivers.map((driver) => driver.id)).toContain("pending-card-spend");
    expect(result.dataStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "pending-transactions",
          amountCents: -43300,
        }),
      ]),
    );
  });

  it("labels pending card purchases while including them in Pip Cash", () => {
    const pendingSnapshot: FinancialSnapshot = {
      settings: {
        asOfDate: "2026-06-20",
        protectedSavingsMonthlyCents: 0,
      },
      accounts: [
        {
          id: "card",
          name: "Everyday Visa",
          institutionName: "Northstar Bank",
          kind: "credit_card",
          balanceCents: -2500,
        },
      ],
      transactions: [
        {
          id: "income",
          accountId: "card",
          date: "2026-06-07",
          description: "Statement credit",
          amountCents: 10000,
          kind: "income",
        },
        {
          id: "pending",
          accountId: "card",
          date: "2026-06-19",
          description: "Pending dinner",
          amountCents: -2500,
          kind: "purchase",
          pending: true,
        },
      ],
    };

    const result = calculatePipCash(pendingSnapshot);

    expect(result.spendingTotalCents).toBe(2500);
    expect(result.dataStates[0]).toMatchObject({
      id: "pending-transactions",
      amountCents: -2500,
    });
  });

  it("explains transactions entering and leaving the rolling window", () => {
    const movementSnapshot: FinancialSnapshot = {
      settings: {
        asOfDate: "2026-06-20",
        protectedSavingsMonthlyCents: 0,
      },
      accounts: [],
      transactions: [
        {
          id: "today-spend",
          accountId: "checking",
          date: "2026-06-20",
          description: "Today spend",
          amountCents: -3000,
          kind: "purchase",
        },
        {
          id: "exited-spend",
          accountId: "checking",
          date: "2026-05-20",
          description: "Old spend",
          amountCents: -10000,
          kind: "purchase",
        },
      ],
    };

    const result = calculatePipCash(movementSnapshot);
    const entered = result.drivers.find((driver) => driver.id === "entered-window");
    const exited = result.drivers.find((driver) => driver.id === "exited-window");

    expect(entered).toMatchObject({
      amountCents: -3000,
      tone: "negative",
    });
    expect(exited).toMatchObject({
      amountCents: 10000,
      tone: "positive",
    });
  });

  it("calls out major rent effects when rent enters or leaves the calendar-month window", () => {
    const rentMovementSnapshot: FinancialSnapshot = {
      settings: {
        asOfDate: "2026-06-01",
        protectedSavingsMonthlyCents: 0,
      },
      accounts: [],
      transactions: [
        {
          id: "current-rent",
          accountId: "checking",
          date: "2026-06-01",
          description: "June rent",
          amountCents: -150000,
          kind: "rent",
        },
        {
          id: "old-rent",
          accountId: "checking",
          date: "2026-05-01",
          description: "April rent",
          amountCents: -150000,
          kind: "rent",
        },
      ],
    };

    const result = calculatePipCash(rentMovementSnapshot);

    expect(result.drivers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rent",
          amountCents: -150000,
        }),
        expect.objectContaining({
          id: "entered-window",
          amountCents: -150000,
          tone: "negative",
        }),
        expect.objectContaining({
          id: "exited-window",
          amountCents: 150000,
          tone: "positive",
        }),
      ]),
    );
  });
});
