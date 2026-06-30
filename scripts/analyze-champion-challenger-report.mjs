#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

export function analyzeChampionChallengerReport(report) {
  const championSummary = report?.champion?.summary || {};
  const challengerSummary = report?.challenger?.summary || {};
  const decision = report?.decision || {};
  const weakDimensions = uniqueStrings(report?.challenger?.report?.quality?.weakDimensions).sort();
  const blockers = asArray(decision.blockers).map(String);
  const qualityGuardRegressions = asArray(decision.qualityGuardRegressions);
  const caseRegressions = asArray(decision.caseRegressions);
  const guardRegressions = asArray(decision.guardRegressions);

  return {
    decision: decision.promote ? "promoted" : "rejected",
    championVariant: String(championSummary.variant || "champion"),
    challengerVariant: String(challengerSummary.variant || "champion"),
    championScore: numberOrZero(championSummary.qualityAverageScore ?? championSummary.score),
    challengerScore: numberOrZero(challengerSummary.qualityAverageScore ?? challengerSummary.score),
    scoreDelta: numberOrZero(decision.scoreDelta),
    latencyDeltaPercent: numberOrZero(decision.latencyDeltaPercent),
    championFailures: numberOrZero(championSummary.failureCount),
    challengerFailures: numberOrZero(challengerSummary.failureCount),
    championQualityGuardFailures: numberOrZero(championSummary.qualityGuardFailureCount),
    challengerQualityGuardFailures: numberOrZero(challengerSummary.qualityGuardFailureCount),
    blockers,
    weakDimensions,
    guardRegressions,
    qualityGuardRegressions,
    caseRegressions,
    nextFocus: buildNextFocus({
      promoted: Boolean(decision.promote),
      blockers,
      weakDimensions,
      qualityGuardRegressions,
      caseRegressions,
    }),
  };
}

function buildNextFocus({
  promoted,
  blockers,
  weakDimensions,
  qualityGuardRegressions,
  caseRegressions,
}) {
  if (promoted) {
    return "Promote this challenger, then validate the new champion against holdout.";
  }

  if (weakDimensions.length > 0) {
    return `Fix ${weakDimensions.join(" and ")} before another challenger run.`;
  }

  if (qualityGuardRegressions.length > 0 || blockers.some((blocker) => /guard/i.test(blocker))) {
    return "Fix guard regressions before changing quality style.";
  }

  if (caseRegressions.length > 0) {
    return "Fix regressed cases before trying another challenger.";
  }

  if (blockers.length > 0) {
    return blockers[0];
  }

  return "No blocker details found. Inspect the challenger cases with the lowest quality scores.";
}

function uniqueStrings(value) {
  return [...new Set(asArray(value).map(String).filter(Boolean))];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberOrZero(value) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function parseCliArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--report" && next) {
      options.reportPath = next;
      index += 1;
    } else if (arg.startsWith("--report=")) {
      options.reportPath = arg.slice("--report=".length);
    } else if (arg === "--out" && next) {
      options.outPath = next;
      index += 1;
    } else if (arg.startsWith("--out=")) {
      options.outPath = arg.slice("--out=".length);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown analyzer option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Pip champion/challenger report analyzer

Usage:
  npm run eval:agent:cc:analyze -- --report planning-docs/dogfood/champion-challenger/runs/run/report.json

Options:
  --report PATH  Champion/challenger JSON report to analyze
  --out PATH     Optional JSON output path for the analysis
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseCliArgs(process.argv.slice(2));

    if (!options.reportPath) {
      throw new Error("Missing --report PATH");
    }

    const report = JSON.parse(readFileSync(options.reportPath, "utf8"));
    const analysis = analyzeChampionChallengerReport(report);
    const payload = `${JSON.stringify(analysis, null, 2)}\n`;

    if (options.outPath) {
      writeFileSync(options.outPath, payload);
    } else {
      process.stdout.write(payload);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
