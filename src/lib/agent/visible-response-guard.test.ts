import { describe, expect, it } from "vitest";
import { AgentUnavailableError } from "@/lib/agent/agent-errors";
import { guardVisibleFinalMessage } from "@/lib/agent/visible-response-guard";

const surfaceLimits = [
  ["bridge", 45, 260],
  ["companion", 85, 520],
  ["openingBubble", 38, 220],
  ["correction", 70, 420],
] as const;

function words(count: number): string {
  return Array.from({ length: count }, () => "w").join(" ");
}

describe("visible response guard", () => {
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
});
