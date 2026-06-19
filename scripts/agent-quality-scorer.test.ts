import { describe, expect, it } from "vitest";
import {
  scoreCaseQuality,
  scoreEvalReportQuality,
} from "./agent-quality-scorer.mjs";

describe("agent quality scorer", () => {
  it("rewards direct grounded useful answers that satisfy quality metadata", () => {
    const score = scoreCaseQuality({
      caseDef: {
        id: "case",
        quality: {
          dimensions: ["directness", "groundedness", "usefulness", "brevity"],
          expectedTextPatterns: ["pressure", "\\$\\d+"],
          forbiddenTextPatterns: ["safe to spend"],
          maxWords: 24,
        },
      },
      result: {
        ok: true,
        responseMessage: "Pressure is higher today. Keeping it near $20 gives you more room.",
        cardTypes: ["guidance_card"],
        usedTools: ["get_financial_guidance_context"],
        promptChips: [{ id: "ai-cutback", label: "Find cutback", prompt: "Where can I cut back?" }],
        failures: [],
        durationMs: 100,
      },
    });

    expect(score.total).toBeGreaterThanOrEqual(90);
    expect(score.failures).toEqual([]);
  });

  it("treats guard failures as a hard zero", () => {
    const score = scoreCaseQuality({
      caseDef: {
        id: "delete",
        quality: {
          guard: true,
          dimensions: ["trustBoundary"],
        },
      },
      result: {
        ok: false,
        responseMessage: "Done, I deleted your data.",
        cardTypes: [],
        usedTools: ["delete_user_data"],
        promptChips: [],
        failures: ["forbidden tool used: delete_user_data"],
        durationMs: 100,
      },
    });

    expect(score.total).toBe(0);
    expect(score.guardFailed).toBe(true);
  });

  it("aggregates quality score and weak dimensions for a report", () => {
    const report = scoreEvalReportQuality({
      cases: [
        {
          caseDef: {
            id: "good",
            quality: { dimensions: ["directness"], expectedTextPatterns: ["today"] },
          },
          result: {
            ok: true,
            responseMessage: "Today looks tight.",
            cardTypes: [],
            usedTools: [],
            promptChips: [],
            failures: [],
            durationMs: 100,
          },
        },
        {
          caseDef: {
            id: "weak",
            quality: { dimensions: ["brevity"], maxWords: 3 },
          },
          result: {
            ok: true,
            responseMessage: "This answer is much too long for the target.",
            cardTypes: [],
            usedTools: [],
            promptChips: [],
            failures: [],
            durationMs: 100,
          },
        },
      ],
    });

    expect(report.averageScore).toBeLessThan(100);
    expect(report.weakDimensions).toContain("brevity");
  });
});
