import { describe, expect, it } from "vitest";
import {
  getBlockedGuidanceDomain,
  getBlockedGuidanceLanguage,
  validateGuidanceCardDraft,
} from "@/lib/agent/guidance-card";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { buildFinancialGuidanceContext } from "@/lib/free-cash/guidance-context";
import { overspendingSpendableSnapshot } from "@/lib/fake-data";

const context = buildFinancialGuidanceContext(calculateFreeCash(overspendingSpendableSnapshot));

describe("guidance card validation", () => {
  it("accepts a concise evidence-backed guidance card", () => {
    const result = validateGuidanceCardDraft({
      title: "My read",
      stance: "watch",
      summary: "You are not in crisis, but recent spending is running hotter than pace.",
      rows: [
        {
          label: "Main pressure",
          detail: "Recent everyday spending is ahead of pace.",
          tone: "warning",
          evidenceIds: ["recent-spending-hot"],
        },
        {
          label: "Why it matters",
          detail: "The behavior adjustment is pulling down today's room.",
          tone: "neutral",
          evidenceIds: ["behavior-adjustment-negative", "spendable-today"],
        },
      ],
      footer: "Based on today's Spendable Cash evidence.",
    }, context);

    expect(result).toMatchObject({
      ok: true,
      card: {
        type: "guidance_card",
        stance: "watch",
      },
    });
  });

  it("accepts plan/source evidence aliases that are exposed by context", () => {
    const result = validateGuidanceCardDraft({
      title: "My read",
      stance: "watch",
      summary: "The read is useful, but the data quality still matters.",
      rows: [
        {
          label: "Data quality",
          detail: "Connected history and warnings shape how strongly to trust this read.",
          tone: "neutral",
          evidenceIds: ["data_quality"],
        },
        {
          label: "Normal room",
          detail: "The normal daily room is still part of the read.",
          tone: "neutral",
          evidenceIds: ["normal-room", "recurring-obligations"],
        },
      ],
    }, context);

    expect(result).toMatchObject({
      ok: true,
      card: {
        type: "guidance_card",
      },
    });
  });

  it("accepts whole-dollar rounding for supported evidence amounts", () => {
    const roundedSpendable = Math.round(context.currentRead.spendableCashTodayCents / 100);
    const result = validateGuidanceCardDraft({
      title: "My read",
      stance: "watch",
      summary: `You have about $${roundedSpendable} of room today.`,
      rows: [
        {
          label: "Today's room",
          detail: `The rounded read is about $${roundedSpendable}.`,
          tone: "neutral",
          evidenceIds: ["spendable-today"],
        },
      ],
    }, context);

    expect(result).toMatchObject({
      ok: true,
    });
  });

  it("rejects rows without valid evidence", () => {
    const result = validateGuidanceCardDraft({
      title: "My read",
      stance: "watch",
      summary: "Recent spending is the main pressure.",
      rows: [
        {
          label: "Main pressure",
          detail: "Recent everyday spending is ahead of pace.",
          tone: "warning",
          evidenceIds: ["made-up-evidence"],
        },
      ],
    }, context);

    expect(result).toEqual({
      ok: false,
      reason: "unknown evidence id: made-up-evidence",
    });
  });

  it.each([
    ["You can afford it.", "you can afford"],
    ["This is safe to spend.", "safe to spend"],
    ["I recommend opening this card.", "i recommend"],
  ])("rejects blocked language: %s", (summary, reason) => {
    expect(getBlockedGuidanceLanguage(summary)).toBe(reason);
  });

  it.each([
    ["Buy this stock today.", "securities"],
    ["Buy Bitcoin today.", "crypto"],
    ["Write this off on taxes.", "tax"],
    ["File bankruptcy now.", "bankruptcy"],
    ["Open this balance transfer card.", "specific product"],
  ])("rejects blocked domains: %s", (summary, reason) => {
    expect(getBlockedGuidanceDomain(summary)).toBe(reason);
  });

  it("rejects unsupported dollar amounts", () => {
    const result = validateGuidanceCardDraft({
      title: "My read",
      stance: "watch",
      summary: "You have $12,345.67 of pressure.",
      rows: [
        {
          label: "Main pressure",
          detail: "Recent everyday spending is ahead of pace.",
          tone: "warning",
          evidenceIds: ["recent-spending-hot"],
        },
      ],
    }, context);

    expect(result).toMatchObject({
      ok: false,
      reason: "unsupported dollar amount: $12345.67",
    });
  });
});
