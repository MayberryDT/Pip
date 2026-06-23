import { describe, expect, it } from "vitest";
import type { AgentCard } from "@/lib/agent/card-types";
import {
  formatVisibleCardFactsForModel,
  summarizeVisibleCardFacts,
} from "@/lib/agent/visible-card-context";

describe("visible card context", () => {
  it("summarizes visible recurring activity with a deterministic expense total", () => {
    const facts = summarizeVisibleCardFacts([
      recurringActivityCard([
        recurringItem("google", "Google Workspace", -1680),
        recurringItem("hulu", "Hulu", -1899),
        recurringItem("payroll", "Payroll", 250000, "income"),
      ]),
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      type: "recurring_activity",
      title: "Likely recurring activity",
      facts: expect.arrayContaining([
        "Visible recurring expense total: $35.79 across 2 items.",
      ]),
    });
    expect(facts[0]?.values.map((value) => value.label)).toEqual([
      "Google Workspace",
      "Hulu",
      "Payroll",
    ]);
  });

  it("formats compact model context without leaking account ids", () => {
    const facts = summarizeVisibleCardFacts([
      {
        type: "recent_transactions",
        title: "Recent charges",
        transactions: [
          {
            id: "txn-provider-id",
            accountId: "acct-secret-id",
            date: "2026-06-18",
            description: "Hulu",
            merchantName: "Hulu",
            amountCents: -1899,
            kind: "purchase",
            pending: false,
          },
        ],
      },
    ]);
    const formatted = formatVisibleCardFactsForModel(facts);

    expect(formatted).toContain("Recent charges");
    expect(formatted).toContain("Hulu");
    expect(formatted).not.toContain("acct-secret-id");
    expect(formatted).not.toContain("txn-provider-id");
  });

  it("caps context to recent cards and compact values", () => {
    const facts = summarizeVisibleCardFacts(
      Array.from({ length: 6 }, (_, cardIndex) =>
        recurringActivityCard(
          Array.from({ length: 8 }, (_, itemIndex) =>
            recurringItem(`item-${cardIndex}-${itemIndex}`, `Item ${cardIndex}-${itemIndex}`, -1000 - itemIndex),
          ),
          `Card ${cardIndex}`,
        ),
      ),
    );

    expect(facts).toHaveLength(4);
    expect(facts[0]?.title).toBe("Card 2");
    expect(facts.flatMap((card) => card.values)).toHaveLength(12);
  });
});

function recurringActivityCard(
  items: Extract<AgentCard, { type: "recurring_activity" }>["items"],
  title = "Likely recurring activity",
): Extract<AgentCard, { type: "recurring_activity" }> {
  return {
    type: "recurring_activity",
    title,
    asOfDate: "2026-06-22",
    horizonDays: 35,
    items,
  };
}

function recurringItem(
  id: string,
  label: string,
  amountCents: number,
  kind: "purchase" | "income" = "purchase",
): Extract<AgentCard, { type: "recurring_activity" }>["items"][number] {
  return {
    id,
    label,
    merchantName: label,
    expectedDate: "2026-07-01",
    amountCents,
    kind,
    cadence: "monthly",
    confidence: "high",
    sourceTransactionCount: 3,
    lastSeenDate: "2026-06-01",
  };
}
