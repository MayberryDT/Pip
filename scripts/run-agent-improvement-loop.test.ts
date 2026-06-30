import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAgentImprovementLoop } from "./run-agent-improvement-loop.mjs";

describe("agent improvement loop runner", () => {
  it("stops immediately when the current champion reaches the target score", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-loop-"));
    const comparisonCalls: unknown[] = [];

    try {
      const summary = await runAgentImprovementLoop({
        runRoot: tempDir,
        runId: "target-run",
        baseUrl: "http://localhost:3999",
        targetChampionScore: 85,
        runEval: async (options) => ({
          status: "passed",
          baseUrl: String(options.baseUrl),
          suite: String(options.suite),
          variant: String(options.variant || "champion"),
          quality: {
            averageScore: 86,
            guardFailureCount: 0,
            weakDimensions: [],
          },
          cases: [],
        }),
        runChampionChallenger: async (options) => {
          comparisonCalls.push(options);
          throw new Error("comparison should not run when champion already meets target");
        },
        log: () => undefined,
      });

      expect(summary.stopReason).toBe("champion-score-target-reached");
      expect(summary.finalChampionVariant).toBe("champion");
      expect(summary.finalChampionScore).toBe(86);
      expect(summary.targetChampionScore).toBe(85);
      expect(summary.iterations).toEqual([]);
      expect(comparisonCalls).toHaveLength(0);

      const writtenSummary = JSON.parse(readFileSync(join(tempDir, "target-run", "summary.json"), "utf8"));
      expect(writtenSummary.stopReason).toBe("champion-score-target-reached");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("stops when a later champion comparison reaches the target score", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-loop-"));

    try {
      const summary = await runAgentImprovementLoop({
        runRoot: tempDir,
        runId: "later-target-run",
        baseUrl: "http://localhost:3999",
        targetChampionScore: 85,
        variants: ["direct-answer"],
        runEval: async (options) => ({
          status: "failed",
          baseUrl: String(options.baseUrl),
          suite: String(options.suite),
          variant: String(options.variant || "champion"),
          quality: {
            averageScore: 80,
            guardFailureCount: 0,
            weakDimensions: ["directness"],
          },
          cases: [],
        }),
        runChampionChallenger: async (options) => ({
          status: "rejected",
          champion: {
            summary: {
              variant: options.championVariant || "champion",
              score: 86,
              qualityAverageScore: 86,
              failureCount: 0,
              qualityGuardFailureCount: 0,
            },
          },
          challenger: {
            summary: {
              variant: options.challengerVariant,
              score: 82,
              qualityAverageScore: 82,
              failureCount: 1,
              qualityGuardFailureCount: 0,
            },
            report: {
              quality: {
                weakDimensions: ["directness"],
              },
            },
          },
          decision: {
            promote: false,
            scoreDelta: -4,
            latencyDeltaPercent: 0,
            blockers: ["score delta -4 is below required margin 3"],
            guardRegressions: [],
            qualityGuardRegressions: [],
            caseRegressions: [],
          },
        }),
        log: () => undefined,
      });

      expect(summary.stopReason).toBe("champion-score-target-reached");
      expect(summary.finalChampionVariant).toBe("champion");
      expect(summary.finalChampionScore).toBe(86);
      expect(summary.iterations).toHaveLength(1);
      expect(summary.championAssessments).toEqual([
        expect.objectContaining({
          iteration: 0,
          score: 80,
        }),
        expect.objectContaining({
          iteration: 1,
          score: 86,
        }),
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("continues past the consecutive-failure threshold when a target score is set", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-loop-"));
    let comparisonCount = 0;

    try {
      const summary = await runAgentImprovementLoop({
        runRoot: tempDir,
        runId: "target-ignores-failure-threshold-run",
        baseUrl: "http://localhost:3999",
        targetChampionScore: 85,
        maxConsecutiveFailures: 3,
        variants: ["direct-answer", "grounded-read", "action-next", "calm-plainspoken"],
        runEval: async (options) => ({
          status: "failed",
          baseUrl: String(options.baseUrl),
          suite: String(options.suite),
          variant: String(options.variant || "champion"),
          quality: {
            averageScore: 80,
            guardFailureCount: 0,
            weakDimensions: ["directness"],
          },
          cases: [],
        }),
        runChampionChallenger: async (options) => {
          comparisonCount += 1;

          return {
            status: "rejected",
            champion: {
              summary: {
                variant: options.championVariant || "champion",
                score: comparisonCount >= 4 ? 86 : 84,
                qualityAverageScore: comparisonCount >= 4 ? 86 : 84,
                failureCount: 0,
                qualityGuardFailureCount: 0,
              },
            },
            challenger: {
              summary: {
                variant: options.challengerVariant,
                score: 82,
                qualityAverageScore: 82,
                failureCount: 1,
                qualityGuardFailureCount: 0,
              },
              report: {
                quality: {
                  weakDimensions: ["directness"],
                },
              },
            },
            decision: {
              promote: false,
              scoreDelta: -2,
              latencyDeltaPercent: 0,
              blockers: ["score delta -2 is below required margin 3"],
              guardRegressions: [],
              qualityGuardRegressions: [],
              caseRegressions: [],
            },
          };
        },
        log: () => undefined,
      });

      expect(comparisonCount).toBe(4);
      expect(summary.stopReason).toBe("champion-score-target-reached");
      expect(summary.finalChampionScore).toBe(86);
      expect(summary.consecutiveFailures).toBe(4);
      expect(summary.iterations).toHaveLength(4);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps challenging until three consecutive challengers fail to beat the champion", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-loop-"));
    const calls: Array<{
      challengerVariant: string;
      suite: string;
      holdout?: boolean;
      reportPath: string;
    }> = [];

    try {
      const summary = await runAgentImprovementLoop({
        runRoot: tempDir,
        runId: "test-run",
        baseUrl: "http://localhost:3999",
        variants: [
          "direct-answer",
          "grounded-read",
          "action-next",
          "calm-plainspoken",
          "skeptical-clarifier",
        ],
        runChampionChallenger: async (options) => {
          calls.push({
            challengerVariant: String(options.challengerVariant),
            suite: String(options.suite),
            holdout: Boolean(options.holdout),
            reportPath: String(options.reportPath),
          });

          const promoted = options.challengerVariant === "grounded-read";
          const holdoutPromoted = Boolean(options.holdout) && promoted;

          return {
            status: promoted ? "promoted" : "rejected",
            generatedAt: "2026-06-19T00:00:00.000Z",
            champion: {
              summary: {
                variant: options.championVariant || "champion",
                score: 84,
                qualityAverageScore: 84,
                failureCount: 0,
                qualityGuardFailureCount: 0,
              },
            },
            challenger: {
              summary: {
                variant: options.challengerVariant,
                score: promoted ? 91 : 82,
                qualityAverageScore: promoted ? 91 : 82,
                failureCount: 0,
                qualityGuardFailureCount: 0,
              },
              report: {
                quality: {
                  weakDimensions: promoted ? [] : ["directness"],
                },
              },
            },
            decision: {
              promote: Boolean(options.holdout) ? holdoutPromoted : promoted,
              scoreDelta: promoted ? 7 : -2,
              latencyDeltaPercent: 0,
              blockers: promoted ? [] : ["score delta -2 is below required margin 3"],
              guardRegressions: [],
              qualityGuardRegressions: [],
              caseRegressions: [],
            },
          };
        },
        log: () => undefined,
      });

      expect(summary.stopReason).toBe("three-consecutive-challenger-failures");
      expect(summary.finalChampionVariant).toBe("grounded-read");
      expect(summary.consecutiveFailures).toBe(3);
      expect(summary.iterations).toHaveLength(5);
      expect(summary.promotions).toHaveLength(1);
      expect(calls.map((call) => call.challengerVariant)).toEqual([
        "direct-answer",
        "grounded-read",
        "grounded-read",
        "action-next",
        "calm-plainspoken",
        "skeptical-clarifier",
      ]);
      expect(calls[2]).toMatchObject({
        suite: "quality-holdout",
        holdout: true,
      });

      const writtenSummary = JSON.parse(readFileSync(join(tempDir, "test-run", "summary.json"), "utf8"));
      expect(writtenSummary.finalChampionVariant).toBe("grounded-read");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
