#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeChampionChallengerReport } from "./analyze-champion-challenger-report.mjs";
import { runChampionChallenger } from "./champion-challenger-agent.mjs";
import { AGENT_QUALITY_VARIANTS } from "../tests/fixtures/agent-quality/champion-challenger-cases.mjs";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_RUN_ROOT = "planning-docs/dogfood/champion-challenger/runs";
const WORKING_SUITE = "quality-working";
const HOLDOUT_SUITE = "quality-holdout";
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

export async function runAgentImprovementLoop({
  runRoot = process.env.PIP_AGENT_IMPROVE_RUN_ROOT || DEFAULT_RUN_ROOT,
  runId = process.env.PIP_AGENT_IMPROVE_RUN_ID || createRunId(),
  baseUrl = process.env.PIP_AGENT_EVAL_BASE_URL || DEFAULT_BASE_URL,
  championVariant = process.env.PIP_AGENT_CHAMPION_VARIANT || "champion",
  variants = parseVariants(process.env.PIP_AGENT_IMPROVE_VARIANTS) || AGENT_QUALITY_VARIANTS.map((variant) => variant.id),
  maxConsecutiveFailures = Number(
    process.env.PIP_AGENT_IMPROVE_MAX_CONSECUTIVE_FAILURES || DEFAULT_MAX_CONSECUTIVE_FAILURES,
  ),
  margin = Number(process.env.PIP_CC_MARGIN || 3),
  maxLatencyRegression = Number(process.env.PIP_CC_MAX_LATENCY_REGRESSION || 20),
  runChampionChallenger: runComparison = runChampionChallenger,
  log = console.log,
} = {}) {
  const runDir = join(runRoot, runId);
  const selectedVariants = variants.map(String).filter(Boolean);

  if (selectedVariants.length === 0) {
    throw new Error("At least one challenger variant is required.");
  }

  mkdirSync(runDir, { recursive: true });

  let currentChampionVariant = championVariant;
  let consecutiveFailures = 0;
  let variantCursor = 0;
  const iterations = [];
  const promotions = [];

  const config = {
    runId,
    runDir,
    baseUrl,
    initialChampionVariant: championVariant,
    variants: selectedVariants,
    maxConsecutiveFailures,
    margin,
    maxLatencyRegression,
    workingSuite: WORKING_SUITE,
    holdoutSuite: HOLDOUT_SUITE,
  };

  writeJson(join(runDir, "config.json"), config);

  while (consecutiveFailures < maxConsecutiveFailures) {
    const selected = selectNextVariant({
      variants: selectedVariants,
      cursor: variantCursor,
      championVariant: currentChampionVariant,
    });
    const iterationNumber = iterations.length + 1;
    const iterationLabel = String(iterationNumber).padStart(3, "0");
    const challengerVariant = selected.variant;
    const championBefore = currentChampionVariant;

    variantCursor = selected.nextCursor;
    log(`Iteration ${iterationNumber}: ${championBefore} champion vs ${challengerVariant} challenger`);

    const workingReportPath = join(runDir, `${iterationLabel}-${challengerVariant}-working.json`);
    const workingReport = await runComparison({
      championBaseUrl: baseUrl,
      challengerBaseUrl: baseUrl,
      championVariant: championBefore,
      challengerVariant,
      suite: WORKING_SUITE,
      reportPath: workingReportPath,
      margin,
      maxLatencyRegression,
      log,
    });
    const workingAnalysis = analyzeChampionChallengerReport(workingReport);

    writeJson(join(runDir, `${iterationLabel}-${challengerVariant}-working-analysis.json`), workingAnalysis);

    let holdoutReport;
    let holdoutAnalysis;
    let accepted = false;

    if (workingReport?.decision?.promote) {
      const holdoutReportPath = join(runDir, `${iterationLabel}-${challengerVariant}-holdout.json`);

      holdoutReport = await runComparison({
        championBaseUrl: baseUrl,
        challengerBaseUrl: baseUrl,
        championVariant: championBefore,
        challengerVariant,
        suite: HOLDOUT_SUITE,
        holdout: true,
        reportPath: holdoutReportPath,
        margin,
        maxLatencyRegression,
        log,
      });
      holdoutAnalysis = analyzeChampionChallengerReport(holdoutReport);
      writeJson(join(runDir, `${iterationLabel}-${challengerVariant}-holdout-analysis.json`), holdoutAnalysis);
      accepted = Boolean(holdoutReport?.decision?.promote);
    }

    if (accepted) {
      currentChampionVariant = challengerVariant;
      consecutiveFailures = 0;
      promotions.push({
        iteration: iterationNumber,
        from: championBefore,
        to: challengerVariant,
        workingScoreDelta: workingAnalysis.scoreDelta,
        holdoutScoreDelta: holdoutAnalysis?.scoreDelta ?? 0,
      });
    } else {
      consecutiveFailures += 1;
    }

    iterations.push({
      iteration: iterationNumber,
      championVariant: championBefore,
      challengerVariant,
      accepted,
      consecutiveFailures,
      working: {
        status: workingReport?.status,
        decision: workingAnalysis.decision,
        scoreDelta: workingAnalysis.scoreDelta,
        blockers: workingAnalysis.blockers,
        reportPath: workingReportPath,
      },
      holdout: holdoutAnalysis
        ? {
            status: holdoutReport?.status,
            decision: holdoutAnalysis.decision,
            scoreDelta: holdoutAnalysis.scoreDelta,
            blockers: holdoutAnalysis.blockers,
            reportPath: join(runDir, `${iterationLabel}-${challengerVariant}-holdout.json`),
          }
        : null,
    });

    writeJson(join(runDir, "summary.json"), buildSummary({
      config,
      iterations,
      promotions,
      finalChampionVariant: currentChampionVariant,
      consecutiveFailures,
      stopReason: consecutiveFailures >= maxConsecutiveFailures
        ? "three-consecutive-challenger-failures"
        : "running",
    }));
  }

  const summary = buildSummary({
    config,
    iterations,
    promotions,
    finalChampionVariant: currentChampionVariant,
    consecutiveFailures,
    stopReason: "three-consecutive-challenger-failures",
  });

  writeJson(join(runDir, "summary.json"), summary);
  log(`Stopped after ${consecutiveFailures} consecutive challengers failed to beat the champion.`);
  log(`Final champion variant: ${currentChampionVariant}`);
  log(`Run summary: ${join(runDir, "summary.json")}`);

  return summary;
}

function buildSummary({
  config,
  iterations,
  promotions,
  finalChampionVariant,
  consecutiveFailures,
  stopReason,
}) {
  return {
    ...config,
    generatedAt: new Date().toISOString(),
    stopReason,
    finalChampionVariant,
    consecutiveFailures,
    iterationCount: iterations.length,
    promotions,
    iterations,
  };
}

function selectNextVariant({ variants, cursor, championVariant }) {
  for (let offset = 0; offset < variants.length; offset += 1) {
    const index = (cursor + offset) % variants.length;
    const variant = variants[index];

    if (variant !== championVariant) {
      return {
        variant,
        nextCursor: (index + 1) % variants.length,
      };
    }
  }

  throw new Error(`No challenger variants remain after excluding champion variant ${championVariant}.`);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseVariants(value) {
  if (!value) {
    return null;
  }

  return value.split(",").map((variant) => variant.trim()).filter(Boolean);
}

function parseCliArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--base-url" && next) {
      options.baseUrl = next;
      index += 1;
    } else if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
    } else if (arg === "--run-root" && next) {
      options.runRoot = next;
      index += 1;
    } else if (arg.startsWith("--run-root=")) {
      options.runRoot = arg.slice("--run-root=".length);
    } else if (arg === "--run-id" && next) {
      options.runId = next;
      index += 1;
    } else if (arg.startsWith("--run-id=")) {
      options.runId = arg.slice("--run-id=".length);
    } else if (arg === "--champion-variant" && next) {
      options.championVariant = next;
      index += 1;
    } else if (arg.startsWith("--champion-variant=")) {
      options.championVariant = arg.slice("--champion-variant=".length);
    } else if (arg === "--variants" && next) {
      options.variants = parseVariants(next);
      index += 1;
    } else if (arg.startsWith("--variants=")) {
      options.variants = parseVariants(arg.slice("--variants=".length));
    } else if (arg === "--max-consecutive-failures" && next) {
      options.maxConsecutiveFailures = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-consecutive-failures=")) {
      options.maxConsecutiveFailures = Number(arg.slice("--max-consecutive-failures=".length));
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
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown improvement-loop option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Pip agent improvement loop

Usage:
  npm run eval:agent:improve
  npm run eval:agent:improve -- --base-url http://127.0.0.1:3000 --max-consecutive-failures 3

Options:
  --base-url URL                    App URL to evaluate, default ${DEFAULT_BASE_URL}
  --run-root PATH                   Directory for durable run artifacts
  --run-id ID                       Run directory name
  --champion-variant ID             Initial champion variant, default champion
  --variants ID1,ID2                Challenger variants, comma-separated
  --max-consecutive-failures NUM    Stop threshold, default ${DEFAULT_MAX_CONSECUTIVE_FAILURES}
  --margin NUM                      Required quality score improvement, default 3
  --max-latency-regression NUM      Allowed latency regression percent, default 20
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAgentImprovementLoop(parseCliArgs(process.argv.slice(2))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
