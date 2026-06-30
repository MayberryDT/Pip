import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/champion-challenger-agent.mjs");

describe("Pip champion/challenger agent loop", () => {
  it("keeps the champion/challenger commands available as package scripts", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["eval:agent:cc"]).toBe("node scripts/champion-challenger-agent.mjs");
    expect(packageJson.scripts["eval:agent:cc:holdout"]).toBe(
      "node scripts/champion-challenger-agent.mjs --holdout",
    );
    expect(packageJson.scripts["eval:agent:cc:analyze"]).toBe(
      "node scripts/analyze-champion-challenger-report.mjs",
    );
    expect(packageJson.scripts["eval:agent:improve"]).toBe(
      "node scripts/run-agent-improvement-loop.mjs",
    );
  });

  it("promotes a challenger only when the frozen score improves without regressions", async () => {
    const { compareChampionChallenger } = await loadChampionChallengerHarness();
    const champion = makeEvalReport({
      cases: [
        makeCase({ id: "tone", ok: true }),
        makeCase({ id: "cutback", ok: false, failures: ["assistant message is too long for the short Pip voice"] }),
        makeCase({ id: "spend", ok: true }),
      ],
    });
    const challenger = makeEvalReport({
      cases: [
        makeCase({ id: "tone", ok: true }),
        makeCase({ id: "cutback", ok: true }),
        makeCase({ id: "spend", ok: true }),
      ],
    });

    const report = compareChampionChallenger({
      champion,
      challenger,
      config: {
        margin: 5,
        maxLatencyRegression: 20,
      },
    });

    expect(report.status).toBe("promoted");
    expect(report.decision.promote).toBe(true);
    expect(report.decision.scoreDelta).toBeGreaterThanOrEqual(5);
    expect(report.decision.blockers).toEqual([]);
  });

  it("rejects a challenger with a guard regression even when its aggregate score improves", async () => {
    const { compareChampionChallenger } = await loadChampionChallengerHarness();
    const champion = makeEvalReport({
      cases: [
        makeCase({ id: "tone", ok: false, failures: ["assistant message is too long for the short Pip voice"] }),
        makeCase({ id: "privacy", ok: true }),
        makeCase({ id: "spend", ok: true }),
      ],
    });
    const challenger = makeEvalReport({
      cases: [
        makeCase({ id: "tone", ok: true }),
        makeCase({ id: "privacy", ok: false, failures: ["forbidden tool used: delete_user_data"] }),
        makeCase({ id: "spend", ok: true }),
      ],
    });

    const report = compareChampionChallenger({
      champion,
      challenger,
      config: {
        margin: 5,
        maxLatencyRegression: 20,
      },
    });

    expect(report.status).toBe("rejected");
    expect(report.decision.promote).toBe(false);
    expect(report.decision.guardRegressions).toEqual([
      {
        id: "privacy",
        failures: ["forbidden tool used: delete_user_data"],
      },
    ]);
    expect(report.decision.blockers.join("\n")).toContain("guard regression");
  });

  it("promotes a challenger based on quality score improvement", async () => {
    const { compareChampionChallenger } = await loadChampionChallengerHarness();
    const champion = makeEvalReport({
      qualityAverageScore: 82,
      cases: [
        makeCase({ id: "quality-tone-1", ok: true, qualityScore: 82 }),
        makeCase({ id: "quality-guidance-1", ok: true, qualityScore: 82 }),
      ],
    });
    const challenger = makeEvalReport({
      qualityAverageScore: 91,
      variant: "direct-answer",
      cases: [
        makeCase({ id: "quality-tone-1", ok: true, qualityScore: 91 }),
        makeCase({ id: "quality-guidance-1", ok: true, qualityScore: 91 }),
      ],
    });

    const report = compareChampionChallenger({
      champion,
      challenger,
      config: {
        margin: 4,
        maxLatencyRegression: 20,
      },
    });

    expect(report.status).toBe("promoted");
    expect(report.decision.scoreDelta).toBe(9);
    expect(report.challenger.summary.qualityAverageScore).toBe(91);
    expect(report.challenger.summary.variant).toBe("direct-answer");
  });

  it("rejects a quality challenger with more guard failures even when its score improves", async () => {
    const { compareChampionChallenger } = await loadChampionChallengerHarness();
    const champion = makeEvalReport({
      qualityAverageScore: 80,
      qualityGuardFailureCount: 0,
      cases: [
        makeCase({ id: "holdout-privacy-1", ok: true, qualityScore: 80 }),
        makeCase({ id: "holdout-trust-1", ok: true, qualityScore: 80 }),
      ],
    });
    const challenger = makeEvalReport({
      qualityAverageScore: 90,
      qualityGuardFailureCount: 1,
      variant: "skeptical-clarifier",
      cases: [
        makeCase({
          id: "holdout-privacy-1",
          ok: false,
          failures: ["forbidden tool used: delete_user_data"],
          qualityScore: 0,
          qualityGuardFailed: true,
        }),
        makeCase({ id: "holdout-trust-1", ok: true, qualityScore: 90 }),
      ],
    });

    const report = compareChampionChallenger({
      champion,
      challenger,
      config: {
        margin: 4,
        maxLatencyRegression: 20,
      },
    });

    expect(report.status).toBe("rejected");
    expect(report.decision.promote).toBe(false);
    expect(report.decision.blockers.join("\n")).toContain("quality guard failure regression");
  });

  it("records a baseline run instead of promoting when no champion source is provided", async () => {
    const { runChampionChallenger } = await loadChampionChallengerHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-cc-"));
    const reportPath = join(tempDir, "report.json");
    const calls: Array<Record<string, unknown>> = [];

    try {
      const report = await runChampionChallenger({
        challengerBaseUrl: "http://localhost:3999",
        reportPath,
        runEval: async (options: Record<string, unknown>) => {
          calls.push(options);

          return makeEvalReport({
            baseUrl: String(options.baseUrl),
            cases: [makeCase({ id: "tone", ok: true })],
          });
        },
        log: () => undefined,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        baseUrl: "http://localhost:3999",
        includeRawResponse: false,
        redactReport: true,
      });
      expect(report.status).toBe("baseline-recorded");
      expect(report.decision.promote).toBe(false);
      expect(report.challenger.summary.failureCount).toBe(0);

      const writtenReport = JSON.parse(readFileSync(reportPath, "utf8"));
      expect(writtenReport).toMatchObject({
        status: "baseline-recorded",
        challenger: {
          summary: {
            caseCount: 1,
            failureCount: 0,
          },
        },
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

async function loadChampionChallengerHarness() {
  const module = await import(pathToFileURL(scriptPath).href);

  return module as {
    compareChampionChallenger: (input: {
      champion: EvalReport;
      challenger: EvalReport;
      config?: {
        margin?: number;
        maxLatencyRegression?: number;
      };
    }) => ChampionChallengerReport;
    runChampionChallenger: (input: Record<string, unknown>) => Promise<ChampionChallengerReport>;
  };
}

type EvalReport = {
  status: string;
  baseUrl: string;
  variant?: string;
  caseCount: number;
  failureCount: number;
  cases: EvalCase[];
  quality?: {
    averageScore: number;
    guardFailureCount: number;
  };
};

type EvalCase = {
  id: string;
  ok: boolean;
  failures: string[];
  durationMs: number;
  qualityScore?: {
    total: number;
    guardFailed: boolean;
  };
};

type ChampionChallengerReport = {
  status: string;
  decision: {
    promote: boolean;
    scoreDelta: number;
    blockers: string[];
    guardRegressions: Array<{ id: string; failures: string[] }>;
  };
  challenger: {
    summary: {
      caseCount: number;
      failureCount: number;
      qualityAverageScore?: number;
      variant?: string;
    };
  };
};

function makeEvalReport({
  baseUrl = "http://localhost:3999",
  variant,
  qualityAverageScore,
  qualityGuardFailureCount,
  cases,
}: {
  baseUrl?: string;
  variant?: string;
  qualityAverageScore?: number;
  qualityGuardFailureCount?: number;
  cases: EvalCase[];
}): EvalReport {
  return {
    status: cases.every((caseResult) => caseResult.ok) ? "passed" : "failed",
    baseUrl,
    variant,
    caseCount: cases.length,
    failureCount: cases.filter((caseResult) => !caseResult.ok).length,
    cases,
    quality: qualityAverageScore === undefined
      ? undefined
      : {
          averageScore: qualityAverageScore,
          guardFailureCount: qualityGuardFailureCount ?? 0,
        },
  };
}

function makeCase({
  id,
  ok,
  failures = [],
  durationMs = 100,
  qualityScore,
  qualityGuardFailed = false,
}: {
  id: string;
  ok: boolean;
  failures?: string[];
  durationMs?: number;
  qualityScore?: number;
  qualityGuardFailed?: boolean;
}): EvalCase {
  return {
    id,
    ok,
    failures,
    durationMs,
    qualityScore: qualityScore === undefined
      ? undefined
      : {
          total: qualityScore,
          guardFailed: qualityGuardFailed,
        },
  };
}
