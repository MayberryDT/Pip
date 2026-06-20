#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBrowserEvidence, validateManifest } from "./major-dogfood-report.mjs";

const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:3001";
const DEFAULT_PRODUCTION_BASE_URL = "https://spendwithpip.com";

export function runMajorCapabilityDogfood({
  argv = process.argv.slice(2),
  env = process.env,
  runDir,
  baseUrl,
  browserEvidencePath,
  requireBrowserEvidence,
  includeProductionSafe,
  includeLiveReviewer,
  allowPlaywrightUiRegression,
  failureRecords = [],
  spawn = spawnSync,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const options = parseArgs(argv);
  const effectiveRunDir =
    runDir || options.runDir || `planning-docs/dogfood/runs/major-capabilities-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const effectiveBaseUrl = baseUrl || options.baseUrl || env.PIP_AGENT_EVAL_BASE_URL || DEFAULT_LOCAL_BASE_URL;
  const effectiveBrowserEvidencePath =
    browserEvidencePath || options.browserEvidence || env.PIP_MAJOR_BROWSER_EVIDENCE || null;
  const shouldRequireBrowserEvidence =
    requireBrowserEvidence ?? options.requireBrowserEvidence ?? env.PIP_MAJOR_REQUIRE_BROWSER !== "0";
  const shouldIncludeProductionSafe =
    includeProductionSafe ?? options.includeProductionSafe ?? env.PIP_MAJOR_INCLUDE_PRODUCTION_SAFE === "1";
  const shouldIncludeLiveReviewer =
    includeLiveReviewer ?? options.includeLiveReviewer ?? env.PIP_MAJOR_INCLUDE_LIVE_REVIEWER === "1";
  const shouldAllowPlaywrightUiRegression =
    allowPlaywrightUiRegression ?? options.allowPlaywrightUiRegression ?? env.PIP_MAJOR_ALLOW_PLAYWRIGHT_UI === "1";
  const effectiveFailureRecords = options.failureRecords ?? failureRecords;

  mkdirSync(effectiveRunDir, { recursive: true });

  const manifest = {
    status: "failed",
    runId: effectiveRunDir.split("/").pop(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    runDir: effectiveRunDir,
    baseUrl: effectiveBaseUrl,
    officialBrowserBackend: "iab",
    env: {
      PIP_AGENT_EVAL_BASE_URL: effectiveBaseUrl,
      PIP_AGENT_EVAL_INCLUDE_RAW: env.PIP_AGENT_EVAL_INCLUDE_RAW ?? null,
      PIP_MAJOR_BROWSER_REQUIRED: shouldRequireBrowserEvidence ? "1" : "0",
    },
    tiers: [],
    failures: [],
    failureRecords: effectiveFailureRecords,
  };

  const tierDefinitions = buildTierDefinitions({
    runDir: effectiveRunDir,
    baseUrl: effectiveBaseUrl,
    includeProductionSafe: shouldIncludeProductionSafe,
    includeLiveReviewer: shouldIncludeLiveReviewer,
    allowPlaywrightUiRegression: shouldAllowPlaywrightUiRegression,
  });

  for (const tier of tierDefinitions) {
    const result = runTier({ tier, spawn, env });
    manifest.tiers.push(result);

    if (result.status !== 0) {
      manifest.failures.push(`${result.name} failed`);
    }
  }

  if (shouldRequireBrowserEvidence) {
    manifest.tiers.push(validateBrowserTier(effectiveBrowserEvidencePath));
    const browserTier = manifest.tiers.at(-1);

    if (browserTier.status !== 0) {
      manifest.failures.push(...(browserTier.failures?.length ? browserTier.failures : ["browser-iab failed"]));
    }
  }

  const preliminaryFailures = [...manifest.failures];
  manifest.status = preliminaryFailures.length === 0 ? "passed" : "failed";

  if (manifest.status === "passed" || manifest.failureRecords.length > 0) {
    const validation = validateManifest({
      ...manifest,
      status: "passed",
      failures: preliminaryFailures,
    });

    if (!validation.ok) {
      manifest.status = "failed";
      manifest.failures = validation.failures;
    }
  }

  manifest.completedAt = new Date().toISOString();
  writeFileSync(join(effectiveRunDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  if (manifest.status === "passed") {
    stdout(`Major capability dogfood passed. Manifest: ${join(effectiveRunDir, "manifest.json")}`);
    return { status: 0, manifest };
  }

  stderr(`Major capability dogfood failed. Manifest: ${join(effectiveRunDir, "manifest.json")}`);
  return { status: 1, manifest };
}

function buildTierDefinitions({
  runDir,
  baseUrl,
  includeProductionSafe,
  includeLiveReviewer,
  allowPlaywrightUiRegression,
}) {
  const tiers = [
    {
      name: "api-primary",
      command: ["npm", "run", "eval:agent:major"],
      env: {
        PIP_AGENT_EVAL_BASE_URL: baseUrl,
        PIP_AGENT_EVAL_REPORT: join(runDir, "api-primary.json"),
      },
      reportPath: join(runDir, "api-primary.json"),
    },
    {
      name: "api-expanded",
      command: ["npm", "run", "eval:agent", "--", "--suite", "major-capabilities-expanded"],
      env: {
        PIP_AGENT_EVAL_BASE_URL: baseUrl,
        PIP_AGENT_EVAL_REPORT: join(runDir, "api-expanded.json"),
      },
      reportPath: join(runDir, "api-expanded.json"),
    },
    {
      name: "api-multiturn",
      command: ["npm", "run", "eval:agent", "--", "--suite", "major-capabilities-multiturn"],
      env: {
        PIP_AGENT_EVAL_BASE_URL: baseUrl,
        PIP_AGENT_EVAL_REPORT: join(runDir, "api-multiturn.json"),
      },
      reportPath: join(runDir, "api-multiturn.json"),
    },
    {
      name: "router-dogfood",
      command: ["npm", "run", "dogfood:router"],
    },
    {
      name: "android-static",
      command: ["npm", "run", "play:android-copy:verify"],
    },
  ];

  if (includeProductionSafe) {
    tiers.push({
      name: "production-safe",
      command: ["npm", "run", "eval:agent", "--", "--suite", "major-capabilities-production-safe"],
      env: {
        PIP_AGENT_EVAL_BASE_URL: DEFAULT_PRODUCTION_BASE_URL,
        PIP_AGENT_EVAL_INCLUDE_RAW: "0",
        PIP_AGENT_EVAL_REPORT: join(runDir, "production-safe.json"),
      },
      reportPath: join(runDir, "production-safe.json"),
    });
  }

  if (includeLiveReviewer) {
    tiers.push(
      {
        name: "reviewer-account",
        command: ["npm", "run", "play:reviewer:verify"],
      },
      {
        name: "reporting-storage",
        command: ["npm", "run", "play:reporting:verify"],
      },
    );
  }

  if (allowPlaywrightUiRegression) {
    tiers.push({
      name: "ui-playwright-regression",
      command: ["npm", "run", "dogfood:major:ui"],
    });
  }

  return tiers;
}

function runTier({ tier, spawn, env }) {
  const [bin, ...args] = tier.command;
  const startedAt = new Date().toISOString();
  const result = spawn(bin, args, {
    env: {
      ...env,
      ...(tier.env ?? {}),
    },
    stdio: "inherit",
  });

  return {
    name: tier.name,
    command: tier.command.join(" "),
    status: result.status ?? 1,
    startedAt,
    completedAt: new Date().toISOString(),
    reportPath: tier.reportPath ?? null,
  };
}

function validateBrowserTier(browserEvidencePath) {
  if (!browserEvidencePath || !existsSync(browserEvidencePath)) {
    return {
      name: "browser-iab",
      status: 1,
      evidencePath: browserEvidencePath,
      failures: ["missing browser evidence"],
    };
  }

  const evidence = JSON.parse(readFileSync(browserEvidencePath, "utf8"));
  const validation = validateBrowserEvidence(evidence, {
    requiredCapabilityIds: evidence.requiredCapabilities ?? [],
  });

  return {
    name: "browser-iab",
    status: validation.ok ? 0 : 1,
    evidencePath: browserEvidencePath,
    failures: validation.failures,
  };
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
    } else if (arg === "--browser-evidence" && next) {
      options.browserEvidence = next;
      index += 1;
    } else if (arg.startsWith("--browser-evidence=")) {
      options.browserEvidence = arg.slice("--browser-evidence=".length);
    } else if (arg === "--include-production-safe") {
      options.includeProductionSafe = true;
    } else if (arg === "--include-live-reviewer") {
      options.includeLiveReviewer = true;
    } else if (arg === "--allow-playwright-ui-regression") {
      options.allowPlaywrightUiRegression = true;
    } else if (arg === "--no-browser-evidence") {
      options.requireBrowserEvidence = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown major dogfood option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Pip major capability dogfood

Usage:
  npm run dogfood:major -- --browser-evidence path/to/browser-evidence.json

Options:
  --run-dir PATH                         Write reports and manifest under PATH
  --base-url URL                         Local app URL for API tiers
  --browser-evidence PATH                In-app Browser iab evidence JSON
  --include-production-safe              Include redacted production-safe API subset
  --include-live-reviewer                Include live reviewer and reporting checks
  --allow-playwright-ui-regression       Include optional repo-native Playwright UI tier
  --no-browser-evidence                  Do not require browser evidence
`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runMajorCapabilityDogfood().status;
}
