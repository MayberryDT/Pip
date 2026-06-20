import { describe, expect, it } from "vitest";
import { intentCatalog } from "@/lib/agent/intent-catalog";

describe("intent catalog", () => {
  it("has complete routing metadata for every entry", () => {
    const ids = new Set<string>();

    for (const entry of intentCatalog) {
      expect(entry.id).toMatch(/^[a-z0-9_.-]+$/);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(entry.family).toBeTruthy();
      expect(entry.priority).toBeGreaterThan(0);
      expect(entry.description).toBeTruthy();
      expect(entry.positiveExamples.length).toBeGreaterThan(0);
      expect(entry.negativeExamples.length).toBeGreaterThan(0);
      expect(entry.lexicalBoosts.length).toBeGreaterThan(0);
      expect(entry.followUpParents).toBeDefined();
      expect(entry.followUpChildren).toBeDefined();

      if (entry.risk === "destructive") {
        expect(entry.requiresConfirmation).toBe(true);
        expect(entry.destructive).toBe(true);
      }
    }
  });

  it("does not expose retired account inclusion or savings-goal protection tools", () => {
    const retiredToolNames = new Set([
      "set_account_inclusion",
      "set_account_protected_savings",
      "set_savings_goal_protection",
    ]);

    expect(intentCatalog.map((entry) => entry.toolName)).not.toEqual(
      expect.arrayContaining([...retiredToolNames]),
    );
    expect(intentCatalog.map((entry) => entry.id)).not.toEqual(
      expect.arrayContaining(["account.inclusion", "account.protected_savings"]),
    );
  });
});
