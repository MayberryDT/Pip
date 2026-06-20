#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipMoneyCompanionGateCases } from "../tests/fixtures/pip-money-companion-gate.mjs";

export const PASS_THRESHOLD = 95;

export const PIP_COMPANION_DIMENSIONS = Object.freeze({
  numericCorrectness: 35,
  freshnessAndTrust: 15,
  savingsAndBillsBehavior: 15,
  voiceAndJudgment: 20,
  proactiveWorkflow: 10,
  safetyBoundary: 5,
});

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_VERIFICATION_COMMANDS = Object.freeze({
  spendable_cash_today: Object.freeze([
    "npm",
    "run",
    "test",
    "--",
    "src/lib/pip-cash/spendable-cash-today.test.ts",
    "src/lib/pip-cash/same-day-ledger.test.ts",
  ]),
  savings_goals: Object.freeze([
    "npm",
    "run",
    "test",
    "--",
    "src/lib/savings-goals/plan.test.ts",
    "src/lib/data/savings-goals-repository.test.ts",
    "src/app/api/savings-goals/route.test.ts",
    "src/app/api/savings-goals/[goalId]/route.test.ts",
  ]),
  recurring_bills: Object.freeze([
    "npm",
    "run",
    "test",
    "--",
    "src/lib/pip-cash/recurring-obligations.test.ts",
    "src/lib/pip-cash/same-day-ledger.test.ts",
    "src/lib/data/recurring-obligation-rules.test.ts",
    "src/app/api/agent/route.test.ts",
  ]),
  sync_freshness: Object.freeze([
    "npm",
    "run",
    "test",
    "--",
    "src/lib/data/app-open-sync.test.ts",
    "src/app/api/sync/app-open/route.test.ts",
    "src/components/PipHome.test.tsx",
  ]),
  opening_bubble: Object.freeze([
    "npm",
    "run",
    "test",
    "--",
    "src/lib/pip/opening-bubble-planner.test.ts",
    "src/components/PipHome.test.tsx",
  ]),
  assistant_voice: Object.freeze([
    "npm",
    "run",
    "test",
    "--",
    "src/lib/agent/ai-agent.test.ts",
    "src/lib/agent/answer-composer.test.ts",
    "src/lib/agent/visible-response-guard.test.ts",
    "scripts/eval-agent.test.ts",
  ]),
});

export async function runPipMoneyCompanionGate({
  argv = [],
  env = process.env,
  cases = pipMoneyCompanionGateCases,
  runDir,
  resumeManifestPath,
  baseUrl,
  from,
  caseId,
  adapter,
  spawn = defaultSpawn,
  stdout = console.log,
  stderr = console.error,
  now = () => new Date(),
} = {}) {
  const options = parseArgs(argv);
  const effectiveResumeManifestPath = resumeManifestPath || options.resumeManifestPath || null;
  const effectiveBaseUrl = baseUrl || options.baseUrl || env.PIP_MONEY_COMPANION_BASE_URL || DEFAULT_BASE_URL;
  const fixtureChecksum = computeFixtureChecksum(cases);
  const startedAt = now().toISOString();

  if (effectiveResumeManifestPath) {
    return resumeGateRun({
      manifestPath: effectiveResumeManifestPath,
      cases,
      fixtureChecksum,
      baseUrl: effectiveBaseUrl,
      adapter: adapter ?? createDefaultPipMoneyCompanionAdapter({ spawn }),
      preflight: adapter ? null : preflightDefaultAdapterCases,
      stdout,
      stderr,
      now,
    });
  }

  const effectiveCaseId = caseId || options.caseId || null;
  const effectiveFrom = Number(from || options.from || 1);
  const selectedCases = selectCases({ cases, caseId: effectiveCaseId, from: effectiveFrom });
  const effectiveRunDir =
    runDir || options.runDir || `planning-docs/dogfood/runs/pip-money-companion-gate-${sanitizeTimestamp(startedAt)}`;

  if (selectedCases.length === 0) {
    const error = effectiveCaseId
      ? `Unknown Pip money companion gate case: ${effectiveCaseId}`
      : `No Pip money companion gate cases found from order ${effectiveFrom}`;
    stderr(error);

    return { status: 1, error };
  }

  mkdirSync(effectiveRunDir, { recursive: true });

  const manifest = createManifest({
    runDir: effectiveRunDir,
    baseUrl: effectiveBaseUrl,
    cases,
    selectedCases,
    fixtureChecksum,
    startedAt,
  });

  writeManifest(effectiveRunDir, manifest);

  if (!adapter) {
    const preflight = preflightDefaultAdapterCases(selectedCases);

    if (preflight) {
      return blockDefaultAdapterPreflight({
        runDir: effectiveRunDir,
        manifest,
        preflight,
        stderr,
        now,
      });
    }
  }

  return executeCases({
    runDir: effectiveRunDir,
    manifest,
    selectedCases,
    startIndex: 0,
    adapter: adapter ?? createDefaultPipMoneyCompanionAdapter({ spawn }),
    stdout,
    stderr,
    now,
  });
}

export function computeFixtureChecksum(cases = pipMoneyCompanionGateCases) {
  return createHash("sha256").update(stableStringify(cases)).digest("hex");
}

export async function unimplementedPipMoneyCompanionAdapter() {
  throw new Error(
    "Real Pip money companion gate execution is not implemented yet; inject an adapter in tests or wire live app execution before using this gate for release.",
  );
}

async function resumeGateRun({
  manifestPath,
  cases,
  fixtureChecksum,
  baseUrl,
  adapter,
  preflight,
  stdout,
  stderr,
  now,
}) {
  if (!existsSync(manifestPath)) {
    const error = `Resume manifest not found: ${manifestPath}`;
    stderr(error);

    return { status: 1, error };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (manifest.fixtureChecksum !== fixtureChecksum) {
    const error = `Refusing resume because fixture checksum changed: expected ${manifest.fixtureChecksum}, got ${fixtureChecksum}`;
    stderr(error);

    return { status: 1, error };
  }

  const runDir = manifest.runDir || dirname(manifestPath);
  const selectedCases = restoreSelectedCases({ manifest, cases });
  const startIndex = findResumeStartIndex({ manifest, selectedCases });

  manifest.status = "running";
  manifest.completedAt = null;
  manifest.baseUrl = baseUrl;
  manifest.failures = [];
  manifest.failedCaseId = null;

  writeManifest(runDir, manifest);

  const selectedResumeCases = selectedCases.slice(startIndex);

  if (preflight) {
    const preflightResult = preflight(selectedResumeCases);

    if (preflightResult) {
      return blockDefaultAdapterPreflight({
        runDir,
        manifest,
        preflight: preflightResult,
        stderr,
        now,
      });
    }
  }

  return executeCases({
    runDir,
    manifest,
    selectedCases,
    startIndex,
    adapter,
    stdout,
    stderr,
    now,
  });
}

function createDefaultPipMoneyCompanionAdapter({ spawn }) {
  const commandCache = new Map();

  return async function defaultPipMoneyCompanionAdapter(testCase) {
    const command = DEFAULT_VERIFICATION_COMMANDS[testCase.category];

    if (!command) {
      return {
        score: 0,
        breakdown: zeroBreakdown(),
        observed: {
          verificationMode: "unsupported-default-adapter-case",
          caseId: testCase.id,
          category: testCase.category,
        },
        hardZeroReasons: ["runnerExecution"],
        rootCauseHint: "runnerExecution",
      };
    }

    const commandKey = command.join("\u0000");
    let result = commandCache.get(commandKey);

    if (!result) {
      const [bin, ...args] = command;
      const spawned = spawn(bin, args);

      result = {
        command: command.join(" "),
        status: Number.isFinite(spawned.status) ? spawned.status : 1,
        stdout: spawned.stdout ?? "",
        stderr: spawned.stderr ?? "",
      };
      commandCache.set(commandKey, result);
    }

    const passed = result.status === 0;

    return {
      score: passed ? 100 : 0,
      breakdown: passed ? PIP_COMPANION_DIMENSIONS : zeroBreakdown(),
      observed: {
        verificationMode: "existing-command-smoke",
        scoreMethod: "binary_command_pass_fail",
        commands: [result],
      },
      hardZeroReasons: passed ? [] : ["runnerExecution"],
      rootCauseHint: passed ? null : "runnerExecution",
    };
  };
}

function preflightDefaultAdapterCases(selectedCases) {
  const missingHarness = selectedCases
    .filter((testCase) => !DEFAULT_VERIFICATION_COMMANDS[testCase.category])
    .map((testCase) => ({
      caseId: testCase.id,
      category: testCase.category,
      reason: `No default verification is wired for ${testCase.id}.`,
    }));

  if (missingHarness.length === 0) {
    return null;
  }

  return {
    status: "failed",
    missingHarness,
  };
}

function blockDefaultAdapterPreflight({
  runDir,
  manifest,
  preflight,
  stderr,
  now,
}) {
  const preflightPath = join(runDir, "preflight.json");
  const error = `Pip money companion gate preflight failed: ${preflight.missingHarness
    .map((entry) => entry.reason)
    .join(" ")}`;

  manifest.status = "blocked";
  manifest.failedCaseId = preflight.missingHarness[0]?.caseId ?? null;
  manifest.failures = preflight.missingHarness.map((entry) => entry.reason);
  manifest.preflight = {
    status: "failed",
    reportPath: preflightPath,
  };
  manifest.completedAt = now().toISOString();
  writeJson(preflightPath, preflight);
  writeManifest(runDir, manifest);
  stderr(error);

  return { status: 1, error, manifest };
}

function defaultSpawn(bin, args) {
  return spawnSync(bin, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });
}

async function executeCases({
  runDir,
  manifest,
  selectedCases,
  startIndex,
  adapter,
  stdout,
  stderr,
  now,
}) {
  for (const testCase of selectedCases.slice(startIndex)) {
    const report = await runCase({ testCase, adapter });
    const reportPath = join(runDir, caseReportFileName(testCase.order));

    writeJson(reportPath, report);
    upsertCaseRecord(manifest, {
      caseId: testCase.id,
      order: testCase.order,
      status: report.passed ? "passed" : "failed",
      score: report.score,
      reportPath,
    });

    if (!report.passed) {
      manifest.status = "failed";
      manifest.failedCaseId = testCase.id;
      manifest.completedCaseIds = passedCaseIds(manifest);
      manifest.failures = [`${testCase.id} scored ${report.score}`];
      manifest.completedAt = now().toISOString();
      writeManifest(runDir, manifest);
      stderr(formatFailure({ report }));

      return { status: 1, manifest };
    }

    manifest.completedCaseIds = passedCaseIds(manifest);
    writeManifest(runDir, manifest);
  }

  manifest.status = "passed";
  manifest.failedCaseId = null;
  manifest.completedCaseIds = passedCaseIds(manifest);
  manifest.failures = [];
  manifest.completedAt = now().toISOString();
  writeManifest(runDir, manifest);
  stdout(`Pip money companion gate passed. Manifest: ${join(runDir, "manifest.json")}`);

  return { status: 0, manifest };
}

async function runCase({ testCase, adapter }) {
  const startedAt = new Date().toISOString();
  let rawResult;

  try {
    rawResult = await adapter(testCase, {
      passThreshold: PASS_THRESHOLD,
      dimensions: PIP_COMPANION_DIMENSIONS,
    });
  } catch (error) {
    rawResult = {
      score: 0,
      breakdown: zeroBreakdown(),
      observed: { error: error instanceof Error ? error.message : String(error) },
      hardZeroReasons: ["execution_error"],
      rootCauseHint: "runnerExecution",
    };
  }

  const report = normalizeCaseReport({ testCase, rawResult });

  return {
    ...report,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

function normalizeCaseReport({ testCase, rawResult }) {
  const hardZeroReasons = Array.isArray(rawResult?.hardZeroReasons)
    ? rawResult.hardZeroReasons.map(String)
    : [];
  const breakdown = normalizeBreakdown(rawResult?.breakdown);
  const rawScore = Number.isFinite(rawResult?.score) ? rawResult.score : sumBreakdown(breakdown);
  const score = hardZeroReasons.length > 0 ? 0 : clampScore(rawScore);
  const rootCauseHint =
    rawResult?.rootCauseHint ?? (score < PASS_THRESHOLD ? findWeakestDimension(breakdown) : null);

  return {
    caseId: testCase.id,
    order: testCase.order,
    score,
    passed: score >= PASS_THRESHOLD && hardZeroReasons.length === 0,
    breakdown,
    observed: rawResult?.observed ?? {},
    expected: testCase.expected ?? {},
    hardZeroReasons,
    rootCauseHint,
  };
}

function createManifest({ runDir, baseUrl, cases, selectedCases, fixtureChecksum, startedAt }) {
  return {
    status: "running",
    runId: runDir.split("/").pop(),
    startedAt,
    completedAt: null,
    runDir,
    baseUrl,
    passThreshold: PASS_THRESHOLD,
    totalCases: cases.length,
    selectedCaseIds: selectedCases.map((testCase) => testCase.id),
    fixtureChecksum,
    completedCaseIds: [],
    failedCaseId: null,
    failures: [],
    cases: [],
  };
}

function selectCases({ cases, caseId, from }) {
  if (caseId) {
    return cases.filter((testCase) => testCase.id === caseId);
  }

  return cases.filter((testCase) => testCase.order >= from);
}

function restoreSelectedCases({ manifest, cases }) {
  const casesById = new Map(cases.map((testCase) => [testCase.id, testCase]));
  const selectedCaseIds = Array.isArray(manifest.selectedCaseIds)
    ? manifest.selectedCaseIds
    : cases.map((testCase) => testCase.id);

  return selectedCaseIds.map((id) => casesById.get(id)).filter(Boolean);
}

function findResumeStartIndex({ manifest, selectedCases }) {
  if (manifest.failedCaseId) {
    const failedIndex = selectedCases.findIndex((testCase) => testCase.id === manifest.failedCaseId);

    if (failedIndex >= 0) return failedIndex;
  }

  const failedRecord = Array.isArray(manifest.cases)
    ? manifest.cases.find((entry) => entry.status === "failed")
    : null;
  if (failedRecord) {
    const failedIndex = selectedCases.findIndex((testCase) => testCase.id === failedRecord.caseId);

    if (failedIndex >= 0) return failedIndex;
  }

  const completedCaseIds = new Set(Array.isArray(manifest.completedCaseIds) ? manifest.completedCaseIds : []);
  const firstIncompleteIndex = selectedCases.findIndex((testCase) => !completedCaseIds.has(testCase.id));

  return firstIncompleteIndex >= 0 ? firstIncompleteIndex : selectedCases.length;
}

function upsertCaseRecord(manifest, record) {
  const cases = Array.isArray(manifest.cases) ? manifest.cases : [];
  const existingIndex = cases.findIndex((entry) => entry.caseId === record.caseId);

  if (existingIndex >= 0) {
    cases[existingIndex] = record;
  } else {
    cases.push(record);
  }

  cases.sort((left, right) => left.order - right.order);
  manifest.cases = cases;
}

function passedCaseIds(manifest) {
  return (manifest.cases ?? [])
    .filter((entry) => entry.status === "passed")
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.caseId);
}

function normalizeBreakdown(rawBreakdown = {}) {
  return Object.fromEntries(
    Object.entries(PIP_COMPANION_DIMENSIONS).map(([dimension, maxPoints]) => {
      const value = rawBreakdown[dimension];

      return [dimension, Number.isFinite(value) ? Math.max(0, Math.min(maxPoints, value)) : maxPoints];
    }),
  );
}

function zeroBreakdown() {
  return Object.fromEntries(Object.keys(PIP_COMPANION_DIMENSIONS).map((dimension) => [dimension, 0]));
}

function sumBreakdown(breakdown) {
  return clampScore(Object.values(breakdown).reduce((sum, value) => sum + value, 0));
}

function clampScore(score) {
  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}

function findWeakestDimension(breakdown) {
  const [dimension] = Object.entries(breakdown).sort(
    ([leftDimension, leftScore], [rightDimension, rightScore]) => {
      const leftPercent = leftScore / PIP_COMPANION_DIMENSIONS[leftDimension];
      const rightPercent = rightScore / PIP_COMPANION_DIMENSIONS[rightDimension];

      return leftPercent - rightPercent;
    },
  )[0] ?? ["unknown"];

  return dimension;
}

function formatFailure({ report }) {
  const weakestDimension = findWeakestDimension(report.breakdown);

  return [
    `Pip money companion gate failed at ${report.caseId}.`,
    `Score: ${report.score}/${PASS_THRESHOLD}.`,
    `Weakest dimension: ${weakestDimension}.`,
    `Root cause hint: ${report.rootCauseHint || weakestDimension}.`,
  ].join(" ");
}

function writeManifest(runDir, manifest) {
  writeJson(join(runDir, "manifest.json"), manifest);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function caseReportFileName(order) {
  return `case-${String(order).padStart(3, "0")}.json`;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--run-dir" && next) {
      options.runDir = next;
      index += 1;
    } else if (arg.startsWith("--run-dir=")) {
      options.runDir = arg.slice("--run-dir=".length);
    } else if (arg === "--base-url" && next) {
      options.baseUrl = next;
      index += 1;
    } else if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
    } else if (arg === "--from" && next) {
      options.from = Number(next);
      index += 1;
    } else if (arg.startsWith("--from=")) {
      options.from = Number(arg.slice("--from=".length));
    } else if (arg === "--case" && next) {
      options.caseId = next;
      index += 1;
    } else if (arg.startsWith("--case=")) {
      options.caseId = arg.slice("--case=".length);
    } else if (arg === "--resume" && next) {
      options.resumeManifestPath = next;
      index += 1;
    } else if (arg.startsWith("--resume=")) {
      options.resumeManifestPath = arg.slice("--resume=".length);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown Pip money companion gate option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Pip money companion gate

Usage:
  node scripts/pip-money-companion-gate.mjs --from 1 --base-url http://127.0.0.1:3000
  node scripts/pip-money-companion-gate.mjs --case SCT-001
  node scripts/pip-money-companion-gate.mjs --resume planning-docs/dogfood/runs/<run-id>/manifest.json

Options:
  --run-dir PATH      Write manifest and case evidence under PATH
  --base-url URL      App URL for future live execution wiring
  --from NUMBER       Start from a 1-based case order
  --case ID           Run one case by id
  --resume PATH       Resume from a previous manifest
`);
}

function sanitizeTimestamp(value) {
  return value.replace(/[:.]/g, "-");
}

function stableStringify(value) {
  return JSON.stringify(sortForChecksum(value));
}

function sortForChecksum(value) {
  if (Array.isArray(value)) {
    return value.map(sortForChecksum);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortForChecksum(entryValue)]),
    );
  }

  return value;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runPipMoneyCompanionGate({ argv: process.argv.slice(2) })
    .then((result) => {
      process.exitCode = result.status;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
