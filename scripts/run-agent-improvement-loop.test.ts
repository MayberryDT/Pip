import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAgentImprovementLoop } from "./run-agent-improvement-loop.mjs";

describe("agent improvement loop runner", () => {
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
