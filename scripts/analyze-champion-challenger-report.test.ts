import { describe, expect, it } from "vitest";
import { analyzeChampionChallengerReport } from "./analyze-champion-challenger-report.mjs";

describe("champion/challenger report analyzer", () => {
  it("summarizes decision, quality score movement, blockers, and weak dimensions", () => {
    const analysis = analyzeChampionChallengerReport({
      status: "rejected",
      champion: {
        summary: {
          variant: "champion",
          score: 84,
          qualityAverageScore: 84,
          qualityGuardFailureCount: 0,
          failureCount: 1,
        },
      },
      challenger: {
        summary: {
          variant: "direct-answer",
          score: 88,
          qualityAverageScore: 88,
          qualityGuardFailureCount: 1,
          failureCount: 1,
        },
        report: {
          quality: {
            weakDimensions: ["trustBoundary", "continuation"],
          },
        },
      },
      decision: {
        promote: false,
        scoreDelta: 4,
        latencyDeltaPercent: 3,
        blockers: ["quality guard failure regression in 1 case(s)"],
        guardRegressions: [],
        qualityGuardRegressions: [
          {
            id: "holdout-privacy-1",
            failures: ["forbidden tool used: delete_user_data"],
          },
        ],
        caseRegressions: [],
      },
    });

    expect(analysis).toMatchObject({
      decision: "rejected",
      championVariant: "champion",
      challengerVariant: "direct-answer",
      scoreDelta: 4,
      blockers: ["quality guard failure regression in 1 case(s)"],
      weakDimensions: ["continuation", "trustBoundary"],
      nextFocus: "Fix continuation and trustBoundary before another challenger run.",
    });
  });
});
