import { describe, expect, it } from "vitest";
import { toPipCashSnapshot } from "@/lib/pip-cash/account-filters";
import type { FinancialSnapshot } from "@/lib/types";

describe("toPipCashSnapshot", () => {
  it("keeps every active connected account even when the legacy include flag is false", () => {
    const snapshot: FinancialSnapshot = {
      settings: {
        asOfDate: "2026-06-20",
        protectedSavingsMonthlyCents: 0,
      },
      accounts: [
        account("checking", true),
        account("legacy-excluded-card", true, false),
        account("inactive-card", false, false),
      ],
      transactions: [
        transaction("checking-tx", "checking"),
        transaction("legacy-excluded-card-tx", "legacy-excluded-card"),
        transaction("inactive-card-tx", "inactive-card"),
      ],
    };

    const result = toPipCashSnapshot(snapshot);

    expect(result.accounts.map((account) => account.id)).toEqual([
      "checking",
      "legacy-excluded-card",
    ]);
    expect(result.transactions.map((tx) => tx.id)).toEqual([
      "checking-tx",
      "legacy-excluded-card-tx",
    ]);
  });
});

function account(id: string, active: boolean, includedInPipCash = true) {
  return {
    id,
    name: id,
    institutionName: "Bank",
    kind: "checking" as const,
    balanceCents: 10000,
    active,
    includedInPipCash,
  };
}

function transaction(id: string, accountId: string) {
  return {
    id,
    accountId,
    date: "2026-06-20",
    description: id,
    amountCents: -1000,
    kind: "purchase" as const,
  };
}
