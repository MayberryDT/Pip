import { describe, expect, it } from "vitest";
import { fakeSnapshot } from "@/lib/fake-data";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import {
  buildSpendableTrustReceipt,
  formatTrustReceiptInline,
} from "@/lib/pip-cash/trust-receipt";

describe("buildSpendableTrustReceipt", () => {
  it("builds a compact receipt from a Pip cash result and sync status", () => {
    const result = calculatePipCash(fakeSnapshot);
    const receipt = buildSpendableTrustReceipt({
      result,
      syncStatus: {
        institutions: [
          {
            id: "ins_1",
            institutionName: "Chase",
            provider: "plaid",
            status: "connected",
            lastSuccessfulSyncAt: "2026-06-18T20:14:00.000Z",
          },
        ],
        latestSyncRun: {
          status: "completed",
          completedAt: "2026-06-18T20:15:00.000Z",
          startedAt: "2026-06-18T20:14:00.000Z",
          accountCount: 2,
          transactionCount: 42,
          balanceCount: 2,
        },
        hasStaleInstitution: false,
      },
    });

    expect(receipt.title).toBe("Trust receipt");
    expect(receipt.asOfLabel).toContain("Connected data refreshed");
    expect(receipt.rows.map((row) => row.id)).toEqual([
      "freshness",
      "accounts",
      "time-horizon",
      "monthly-savings",
      "pending",
      "confidence",
    ]);
    expect(receipt.rows.find((row) => row.id === "monthly-savings")).toMatchObject({
      label: "Monthly savings",
    });
    expect(formatTrustReceiptInline(receipt)).toMatch(/known limit|no active warning/);
  });

  it("shows protected savings goals separately from base monthly savings", () => {
    const result = calculatePipCash({
      ...fakeSnapshot,
      savingsGoals: [
        {
          id: "goal-1",
          userId: "user-1",
          name: "Trip",
          targetAmountCents: 500000,
          targetDate: "2027-06-18",
          startingAmountCents: 0,
          currentAmountCents: 100000,
          monthlyContributionCents: 35000,
          includeInSpendableCash: true,
          status: "active",
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z",
        },
      ],
    });
    const receipt = buildSpendableTrustReceipt({ result });

    expect(receipt.rows.find((row) => row.id === "monthly-savings")).toMatchObject({
      label: "Monthly savings",
    });
    expect(receipt.rows.find((row) => row.id === "savings-goals")).toMatchObject({
      label: "Savings goals",
      value: "-$350",
    });
  });

  it("surfaces stale connections as known limits", () => {
    const result = calculatePipCash(fakeSnapshot);
    const receipt = buildSpendableTrustReceipt({
      result,
      syncStatus: {
        institutions: [
          {
            id: "ins_1",
            institutionName: "Chase",
            provider: "plaid",
            status: "failed",
            isStale: true,
          },
        ],
        latestSyncRun: null,
        hasStaleInstitution: true,
      },
    });

    expect(receipt.knownLimits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "stale-connection",
          label: "Connection needs attention",
        }),
      ]),
    );
    expect(receipt.rows.find((row) => row.id === "freshness")).toMatchObject({
      tone: "warning",
    });
  });
});
