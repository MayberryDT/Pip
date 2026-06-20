#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_EVIDENCE_PATH = "/tmp/pip-in-app-browser-evidence.json";
const DEFAULT_PROOF_REPORT = "/tmp/pip-live-proof.json";
const DEFAULT_BASE_URL = "https://spendwithpip.com";

export function writeInAppBrowserProof({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const options = parseArgs(argv);
  const evidencePath = options.evidence || env.PIP_IN_APP_BROWSER_EVIDENCE || DEFAULT_EVIDENCE_PATH;
  const proofReport = options.proofReport || env.PIP_LIVE_PROOF_REPORT || DEFAULT_PROOF_REPORT;
  const latestDeployUrl = getLatestVerifiedDeployUrl();
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const validationFailures = validateInAppBrowserEvidenceSource(evidence);

  if (validationFailures.length > 0) {
    stderr(validationFailures.join("\n"));
    return 1;
  }

  const report = {
    status: "passed",
    proofMethod: "in_app_browser",
    validatedBy: "codex_in_app_browser",
    generatedAt: new Date().toISOString(),
    baseUrl: DEFAULT_BASE_URL,
    latestVerifiedDeployUrl: latestDeployUrl,
    latestVerifiedDeployId: extractDeployId(latestDeployUrl),
    command: "Codex in-app Browser live proof",
    evidence,
  };

  writeFileSync(proofReport, `${JSON.stringify(report, null, 2)}\n`);
  stdout(`In-app Browser live proof report written: ${proofReport}`);

  return 0;
}

function validateInAppBrowserEvidenceSource(evidence) {
  const failures = [];

  if (evidence?.validatedBy !== "codex_in_app_browser") {
    failures.push("in-app Browser evidence validatedBy must be codex_in_app_browser");
  }

  if (evidence?.backend !== "iab") {
    failures.push("in-app Browser evidence backend must be iab");
  }

  return failures;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--evidence") {
      options.evidence = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--evidence=")) {
      options.evidence = arg.slice("--evidence=".length);
    } else if (arg === "--proof-report") {
      options.proofReport = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--proof-report=")) {
      options.proofReport = arg.slice("--proof-report=".length);
    }
  }

  return options;
}

function getLatestVerifiedDeployUrl() {
  const readme = readFileSync("README.md", "utf8");
  const match = readme.match(/Latest verified production deploy:\s+(https:\/\/\S+)/);

  return match?.[1] ?? null;
}

function extractDeployId(url) {
  if (!url) {
    return null;
  }

  const match = url.match(/^https:\/\/([a-f0-9]+)--spendwithpip\.netlify\.app/);

  return match?.[1] ?? null;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = writeInAppBrowserProof();
}
