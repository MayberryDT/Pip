import { describe, expect, it } from "vitest";
import { AgentUnavailableError } from "@/lib/agent/agent-errors";
import type { AgentCard } from "@/lib/agent/card-types";
import {
  guardVisibleFinalMessage,
  visibleResponseSurfaceLimits,
  type VisibleResponseSurface,
} from "@/lib/agent/visible-response-guard";

const surfaceLimits = Object.entries(visibleResponseSurfaceLimits).map(
  ([surface, limits]) => [
    surface as VisibleResponseSurface,
    limits.maxWords,
    limits.maxChars,
  ] as const,
);

function words(count: number): string {
  return Array.from({ length: count }, () => "w").join(" ");
}

describe("visible response guard", () => {
  it("keeps bridge replies inside the compact chat contract", () => {
    expect(visibleResponseSurfaceLimits.bridge).toEqual({
      maxWords: 45,
      maxChars: 260,
    });
  });

  it.each(surfaceLimits)(
    "allows %s replies at the surface word limit",
    (surface, maxWords) => {
      expect(
        guardVisibleFinalMessage(words(maxWords), [], { surface }),
      ).toBe(words(maxWords));
    },
  );

  it.each(surfaceLimits)(
    "rejects %s replies over the surface word limit",
    (surface, maxWords) => {
      expect(() =>
        guardVisibleFinalMessage(words(maxWords + 1), [], { surface }),
      ).toThrow(AgentUnavailableError);
    },
  );

  it.each(surfaceLimits)(
    "rejects %s replies over the surface character limit",
    (surface, _maxWords, maxChars) => {
      expect(() =>
        guardVisibleFinalMessage("x".repeat(maxChars + 1), [], { surface }),
      ).toThrow(AgentUnavailableError);
    },
  );

  it("repairs generic card promises instead of failing a chat-only answer", () => {
    expect(
      guardVisibleFinalMessage(
        "I found pattern assumptions behind today’s number. Here’s the card:",
        [],
      ),
    ).toBe("I found pattern assumptions behind today’s number.");
  });

  it("removes literal null and empty-object artifacts from visible answers", () => {
    expect(
      guardVisibleFinalMessage("Here’s the trust receipt behind today’s number. {}", []),
    ).toBe("Here’s the trust receipt behind today’s number.");
    expect(
      guardVisibleFinalMessage("I found likely repeat items. null", []),
    ).toBe("I found likely repeat items.");
  });

  it("replaces internal data-check language with a user-facing recurring bridge", () => {
    expect(
      guardVisibleFinalMessage(
        "I see the pattern assumptions behind today’s number. I’m checking if any data is missing (like a card) that could affect the read. null",
        [recurringActivityCard([])],
      ),
    ).toBe("I do not see a clear repeat item yet.");
  });

  it("replaces off-topic pattern bridges when showing a recurring activity card", () => {
    expect(
      guardVisibleFinalMessage(
        "I’m showing the pattern assumptions I’m using behind today’s number. I rely on completed months as the baseline and current-month spending as the adjustment.",
        [recurringActivityCard([])],
      ),
    ).toBe("I do not see a clear repeat item yet.");
  });
});

function recurringActivityCard(
  items: Extract<AgentCard, { type: "recurring_activity" }>["items"],
): Extract<AgentCard, { type: "recurring_activity" }> {
  return {
    type: "recurring_activity",
    title: "Likely recurring activity",
    asOfDate: "2026-06-22",
    horizonDays: 35,
    items,
  };
}
