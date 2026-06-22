import { describe, expect, it } from "vitest";
import { AgentUnavailableError } from "@/lib/agent/agent-errors";
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
});
