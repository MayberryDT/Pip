#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { runAgentEval } from "./eval-agent.mjs";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_REPORT_PATH = "/tmp/pip-champion-challenger-report.json";
const DEFAULT_MARGIN = 3;
const DEFAULT_MAX_LATENCY_REGRESSION = 20;
const WORKING_SUITE = "quality-working";
const HOLDOUT_SUITE = "quality-holdout";

const guardFailurePattern =
  /\b(?:forbidden|banned|legacy cash|dashboard|safe to spend|safe to buy|you can afford|financial advice|financial advisor|securities action advice|crypto action advice|specific product advice|delete_user_data)\b/i;

export async function runChampionChallenger({
  championBaseUrl = process.env.PIP_CC_CHAMPION_BASE_URL,
  championReportPath = process.env.PIP_CC_CHAMPION_REPORT,
  championVariant = process.env.PIP_CC_CHAMPION_VARIANT || "champion",
  challengerBaseUrl = process.env.PIP_CC_CHALLENGER_BASE_URL || process.env.PIP_AGENT_EVAL_BASE_URL || DEFAULT_BASE_URL,
  challengerVariant = process.env.PIP_CC_CHALLENGER_VARIANT || process.env.PIP_AGENT_EVAL_VARIANT,
  reportPath = process.env.PIP_CC_REPORT || DEFAULT_REPORT_PATH,
  suite = process.env.PIP_CC_SUITE,
  holdout = process.env.PIP_CC_HOLDOUT === "1",
  caseIds = process.env.PIP_CC_CASE_IDS,
  margin = Number(process.env.PIP_CC_MARGIN || DEFAULT_MARGIN),
  maxLatencyRegression = Number(process.env.PIP_CC_MAX_LATENCY_REGRESSION || DEFAULT_MAX_LATENCY_REGRESSION),
  runEval = runAgentEval,
  log = console.log,
} = {}) {
  const selectedSuite = holdout ? HOLDOUT_SUITE : (suite || WORKING_SUITE);
  const config = {
    caseSet: selectedSuite === HOLDOUT_SUITE ? "holdout" : "working",
    suite: selectedSuite,
    margin,
    maxLatencyRegression,
    championVariant,
    challengerVariant: challengerVariant || "champion",
  };
  const baseEvalOptions = {
    suite: selectedSuite,
    caseIds,
    includeRawResponse: false,
    redactReport: true,
  };

  if (!championBaseUrl && !championReportPath) {
    log("No champion URL or report supplied. Recording current challenger as the first baseline.");
    const challenger = await runEval({
      ...baseEvalOptions,
      baseUrl: challengerBaseUrl,
      variant: challengerVariant,
      reportPath: deriveChildReportPath(reportPath, "baseline"),
      conversationPrefix: `cc-baseline-${Date.now()}`,
      log,
    });
    const report = buildBaselineReport({
      challenger,
      config,
      challengerBaseUrl,
    });

    writeReport(reportPath, report);
    log(`Wrote Pip champion/challenger baseline report to ${reportPath}`);

    return report;
  }

  const champion = championReportPath
    ? readJsonReport(championReportPath)
    : await runEval({
        ...baseEvalOptions,
        baseUrl: championBaseUrl,
        variant: championVariant,
        reportPath: deriveChildReportPath(reportPath, "champion"),
        conversationPrefix: `cc-champion-${Date.now()}`,
        log,
      });
  const challenger = await runEval({
    ...baseEvalOptions,
    baseUrl: challengerBaseUrl,
    variant: challengerVariant,
    reportPath: deriveChildReportPath(reportPath, "challenger"),
    conversationPrefix: `cc-challenger-${Date.now()}`,
    log,
  });
  const report = compareChampionChallenger({
    champion,
    challenger,
    config,
  });

  writeReport(reportPath, report);
  log(`Wrote Pip champion/challenger comparison report to ${reportPath}`);

  return report;
}

export function compareChampionChallenger({ champion, challenger, config = {} }) {
  const resolvedConfig = {
    caseSet: config.caseSet || "working",
    suite: config.suite || WORKING_SUITE,
    margin: Number.isFinite(Number(config.margin)) ? Number(config.margin) : DEFAULT_MARGIN,
    maxLatencyRegression: Number.isFinite(Number(config.maxLatencyRegression))
      ? Number(config.maxLatencyRegression)
      : DEFAULT_MAX_LATENCY_REGRESSION,
  };
  const championSummary = summarizeEvalReport(champion);
  const challengerSummary = summarizeEvalReport(challenger);
  const scoreDelta = round(challengerSummary.score - championSummary.score);
  const latencyDeltaPercent = calculateLatencyDeltaPercent({
    championAverageMs: championSummary.averageDurationMs,
    challengerAverageMs: challengerSummary.averageDurationMs,
  });
  const guardRegressions = findGuardRegressions({
    championCases: championSummary.cases,
    challengerCases: challengerSummary.cases,
  });
  const qualityGuardRegressions = findQualityGuardRegressions({
    championCases: championSummary.cases,
    challengerCases: challengerSummary.cases,
  });
  const caseRegressions = findCaseRegressions({
    championCases: championSummary.cases,
    challengerCases: challengerSummary.cases,
  });
  const blockers = [];

  if (guardRegressions.length > 0) {
    blockers.push(`guard regression in ${guardRegressions.length} case(s)`);
  }

  if (qualityGuardRegressions.length > 0) {
    blockers.push(`quality guard failure regression in ${qualityGuardRegressions.length} case(s)`);
  }

  if (caseRegressions.length > 0) {
    blockers.push(`pass/fail regression in ${caseRegressions.length} case(s)`);
  }

  if (challengerSummary.failureCount > championSummary.failureCount) {
    blockers.push(
      `challenger has more failing cases (${challengerSummary.failureCount}) than champion (${championSummary.failureCount})`,
    );
  }

  if (scoreDelta < resolvedConfig.margin) {
    blockers.push(`score delta ${scoreDelta} is below required margin ${resolvedConfig.margin}`);
  }

  if (latencyDeltaPercent > resolvedConfig.maxLatencyRegression) {
    blockers.push(
      `latency regression ${latencyDeltaPercent}% exceeds ${resolvedConfig.maxLatencyRegression}% limit`,
    );
  }

  const promote = blockers.length === 0;

  return {
    status: promote ? "promoted" : "rejected",
    generatedAt: new Date().toISOString(),
    mode: "champion-challenger",
    config: resolvedConfig,
    champion: {
      summary: stripCaseDetails(championSummary),
      report: champion,
    },
    challenger: {
      summary: stripCaseDetails(challengerSummary),
      report: challenger,
    },
    decision: {
      promote,
      scoreDelta,
      latencyDeltaPercent,
      guardRegressions,
      qualityGuardRegressions,
      caseRegressions,
      blockers,
    },
  };
}

export function summarizeEvalReport(report) {
  const cases = asArray(report?.cases).map(normalizeCase);
  const caseCount = cases.length;
  const failureCount = cases.filter((caseResult) => !caseResult.ok).length;
  const qualityAverageScore = Number(report?.quality?.averageScore);
  const score = Number.isFinite(qualityAverageScore)
    ? round(qualityAverageScore)
    : caseCount === 0
      ? 0
      : round(cases.reduce((sum, caseResult) => sum + scoreCase(caseResult), 0) / caseCount);
  const durations = cases.map((caseResult) => caseResult.durationMs).filter((duration) => duration > 0);
  const averageDurationMs =
    durations.length === 0 ? 0 : Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length);
  const qualityGuardFailureCount = Number(report?.quality?.guardFailureCount);

  return {
    status: report?.status || (failureCount === 0 ? "passed" : "failed"),
    baseUrl: report?.baseUrl || "",
    variant: report?.variant || "champion",
    caseCount,
    failureCount,
    passCount: caseCount - failureCount,
    score,
    qualityAverageScore: Number.isFinite(qualityAverageScore) ? round(qualityAverageScore) : undefined,
    averageDurationMs,
    guardFailureCount: cases.filter((caseResult) => hasGuardFailure(caseResult)).length,
    qualityGuardFailureCount: Number.isFinite(qualityGuardFailureCount)
      ? qualityGuardFailureCount
      : cases.filter((caseResult) => caseResult.qualityGuardFailed).length,
    cases,
  };
}

function buildBaselineReport({ challenger, config, challengerBaseUrl }) {
  const challengerSummary = summarizeEvalReport(challenger);

  return {
    status: "baseline-recorded",
    generatedAt: new Date().toISOString(),
    mode: "baseline",
    config,
    champion: null,
    challenger: {
      summary: stripCaseDetails(challengerSummary),
      report: challenger,
    },
    decision: {
      promote: false,
      scoreDelta: 0,
      latencyDeltaPercent: 0,
      guardRegressions: [],
      qualityGuardRegressions: [],
      caseRegressions: [],
      blockers: [`no champion source supplied; recorded ${challengerBaseUrl} as the baseline`],
    },
  };
}

function normalizeCase(caseResult) {
  const failures = asArray(caseResult?.failures).map(String);

  return {
    id: String(caseResult?.id || "unknown"),
    ok: Boolean(caseResult?.ok) && failures.length === 0,
    failures,
    durationMs: Number(caseResult?.durationMs || 0),
    qualityScore: Number.isFinite(Number(caseResult?.qualityScore?.total))
      ? Number(caseResult.qualityScore.total)
      : undefined,
    qualityGuardFailed: Boolean(caseResult?.qualityScore?.guardFailed),
  };
}

function scoreCase(caseResult) {
  if (caseResult.ok) return 100;

  const failureCount = Math.max(1, caseResult.failures.length);

  return Math.max(0, 100 - failureCount * 25);
}

function findGuardRegressions({ championCases, challengerCases }) {
  const championById = new Map(championCases.map((caseResult) => [caseResult.id, caseResult]));

  return challengerCases
    .map((challengerCase) => {
      const guardFailures = challengerCase.failures.filter(isGuardFailure);
      const championCase = championById.get(challengerCase.id);

      if (guardFailures.length === 0 || hasGuardFailure(championCase)) {
        return null;
      }

      return {
        id: challengerCase.id,
        failures: guardFailures,
      };
    })
    .filter(Boolean);
}

function findCaseRegressions({ championCases, challengerCases }) {
  const championById = new Map(championCases.map((caseResult) => [caseResult.id, caseResult]));

  return challengerCases
    .map((challengerCase) => {
      const championCase = championById.get(challengerCase.id);

      if (!championCase?.ok || challengerCase.ok) {
        return null;
      }

      return {
        id: challengerCase.id,
        failures: challengerCase.failures,
      };
    })
    .filter(Boolean);
}

function findQualityGuardRegressions({ championCases, challengerCases }) {
  const championById = new Map(championCases.map((caseResult) => [caseResult.id, caseResult]));

  return challengerCases
    .map((challengerCase) => {
      const championCase = championById.get(challengerCase.id);

      if (!challengerCase.qualityGuardFailed || championCase?.qualityGuardFailed) {
        return null;
      }

      return {
        id: challengerCase.id,
        failures: challengerCase.failures,
      };
    })
    .filter(Boolean);
}

function hasGuardFailure(caseResult) {
  return asArray(caseResult?.failures).some(isGuardFailure);
}

function isGuardFailure(failure) {
  return guardFailurePattern.test(String(failure));
}

function calculateLatencyDeltaPercent({ championAverageMs, challengerAverageMs }) {
  if (!championAverageMs || !challengerAverageMs) {
    return 0;
  }

  return round(((challengerAverageMs - championAverageMs) / championAverageMs) * 100);
}

function stripCaseDetails(summary) {
  const { cases: _cases, ...rest } = summary;

  return rest;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function writeReport(reportPath, report) {
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function readJsonReport(reportPath) {
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function deriveChildReportPath(reportPath, label) {
  if (!reportPath.endsWith(".json")) {
    return `${reportPath}.${label}.json`;
  }

  return reportPath.replace(/\.json$/u, `.${label}.json`);
}

function parseCliArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--champion-url" && next) {
      options.championBaseUrl = next;
      index += 1;
    } else if (arg.startsWith("--champion-url=")) {
      options.championBaseUrl = arg.slice("--champion-url=".length);
    } else if (arg === "--challenger-url" && next) {
      options.challengerBaseUrl = next;
      index += 1;
    } else if (arg.startsWith("--challenger-url=")) {
      options.challengerBaseUrl = arg.slice("--challenger-url=".length);
    } else if (arg === "--base-url" && next) {
      options.challengerBaseUrl = next;
      index += 1;
    } else if (arg.startsWith("--base-url=")) {
      options.challengerBaseUrl = arg.slice("--base-url=".length);
    } else if (arg === "--champion-report" && next) {
      options.championReportPath = next;
      index += 1;
    } else if (arg.startsWith("--champion-report=")) {
      options.championReportPath = arg.slice("--champion-report=".length);
    } else if (arg === "--report" && next) {
      options.reportPath = next;
      index += 1;
    } else if (arg.startsWith("--report=")) {
      options.reportPath = arg.slice("--report=".length);
    } else if (arg === "--suite" && next) {
      options.suite = next;
      index += 1;
    } else if (arg.startsWith("--suite=")) {
      options.suite = arg.slice("--suite=".length);
    } else if (arg === "--case-ids" && next) {
      options.caseIds = next;
      index += 1;
    } else if (arg.startsWith("--case-ids=")) {
      options.caseIds = arg.slice("--case-ids=".length);
    } else if (arg === "--margin" && next) {
      options.margin = Number(next);
      index += 1;
    } else if (arg.startsWith("--margin=")) {
      options.margin = Number(arg.slice("--margin=".length));
    } else if (arg === "--max-latency-regression" && next) {
      options.maxLatencyRegression = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-latency-regression=")) {
      options.maxLatencyRegression = Number(arg.slice("--max-latency-regression=".length));
    } else if (arg === "--holdout") {
      options.holdout = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown champion/challenger option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Pip champion/challenger agent loop

Usage:
  npm run eval:agent:cc
  npm run eval:agent:cc -- --champion-url http://127.0.0.1:3000 --challenger-url http://127.0.0.1:3001
  npm run eval:agent:cc -- --champion-report /tmp/champion.json --challenger-url http://127.0.0.1:3000
  npm run eval:agent:cc:holdout

Options:
  --champion-url URL             Run the frozen champion against this app URL
  --challenger-url URL           Run the challenger against this app URL
  --base-url URL                 Alias for --challenger-url
  --champion-report PATH         Compare against an existing eval report instead of a live champion URL
  --report PATH                  Final champion/challenger report path
  --suite NAME                   Eval suite to run
  --holdout                      Alias for --suite major-capabilities
  --case-ids ID1,ID2             Limit evals to selected case IDs
  --margin NUMBER                Required score improvement, default ${DEFAULT_MARGIN}
  --max-latency-regression NUM   Allowed average latency regression percent, default ${DEFAULT_MAX_LATENCY_REGRESSION}
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runChampionChallenger(parseCliArgs(process.argv.slice(2)))
    .then((report) => {
      process.exitCode = report.status === "rejected" ? 1 : 0;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
