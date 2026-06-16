import { describe, expect, it } from "vitest";
import type { PipCashFreshness } from "@/lib/data/current-snapshot";
import { buildFinancialRead } from "@/lib/pip-cash/financial-read";
import {
  fakeSnapshot,
  getFakeSnapshot,
  missingCardPipSnapshot,
} from "@/lib/fake-data";
import type { FinancialSnapshot } from "@/lib/types";

describe("buildFinancialRead", () => {
  it("composes the core deterministic money context", () => {
    const read = buildFinancialRead({
      snapshot: fakeSnapshot,
    });

    expect(read.asOfDate).toBe(fakeSnapshot.settings.asOfDate);
    expect(read.spendableCashToday?.metricVersion).toBe("v2");
    expect(read.guidance.metricVersion).toBe("v2");
    expect(read.spendingBreakdown.topCategories.length).toBeGreaterThan(0);
    expect(read.recurringActivity.asOfDate).toBe(fakeSnapshot.settings.asOfDate);
    expect(read.dataQuality.accountCount).toBe(fakeSnapshot.accounts.length);
    expect(read.dataQuality.transactionCount).toBe(fakeSnapshot.transactions.length);
  });

  it("carries stale freshness into data-quality findings", () => {
    const freshness = {
      state: "stale",
      lastSuccessfulSyncAt: "2026-06-15T12:00:00.000Z",
      latestSyncRunStatus: "succeeded",
      hasPendingSyncJob: false,
      hasStaleInstitution: true,
    } satisfies PipCashFreshness;
    const read = buildFinancialRead({
      snapshot: fakeSnapshot,
      freshness,
    });

    expect(read.freshness).toEqual(freshness);
    expect(read.dataQuality.freshnessState).toBe("stale");
    expect(read.dataQuality.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "freshness",
          label: "Stale data",
          severity: "warning",
        }),
      ]),
    );
  });

  it("marks repair-needed freshness as a blocker", () => {
    const read = buildFinancialRead({
      snapshot: fakeSnapshot,
      freshness: {
        state: "needs_repair",
        latestSyncRunStatus: "failed",
        hasPendingSyncJob: false,
        hasStaleInstitution: true,
      },
    });

    expect(read.dataQuality.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "freshness",
          label: "Connection needs repair",
          severity: "blocker",
        }),
      ]),
    );
  });

  it("carries low-confidence data quality from Spendable Cash Today", () => {
    const read = buildFinancialRead({
      snapshot: getFakeSnapshot("low-confidence"),
    });

    expect(read.dataQuality.hasLowConfidence).toBe(true);
    expect(read.dataQuality.findings.some((finding) => finding.id === "low-confidence")).toBe(true);
  });

  it("carries missing-card warnings", () => {
    const read = buildFinancialRead({
      snapshot: missingCardPipSnapshot,
    });

    expect(read.dataQuality.hasMissingCardWarning).toBe(true);
    expect(read.dataQuality.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-card",
          severity: "warning",
        }),
      ]),
    );
  });

  it("flags sparse history and missing account coverage", () => {
    const snapshot: FinancialSnapshot = {
      settings: {
        asOfDate: "2026-06-20",
        protectedSavingsMonthlyCents: 20000,
      },
      accounts: [
        {
          id: "acct_savings",
          name: "Savings",
          institutionName: "Northstar",
          kind: "savings",
          balanceCents: 50000,
          isProtectedSavings: true,
        },
      ],
      transactions: [],
    };
    const read = buildFinancialRead({
      snapshot,
    });

    expect(read.dataQuality.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining(["missing-cash-account", "missing-credit-card", "sparse-history"]),
    );
  });
});
