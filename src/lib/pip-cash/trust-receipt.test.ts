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
      "pending",
      "confidence",
    ]);
    expect(formatTrustReceiptInline(receipt)).toMatch(/known limit|no active warning/);
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
