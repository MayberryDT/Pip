#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_PROOF_REPORT = "/tmp/spendable-live-proof.json";
const EXPECTED_BASE_URL = "https://free-cash-mayberrydt.netlify.app";

export function checkPrdComplete({
  env = process.env,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const proofReport = env.SPENDABLE_LIVE_PROOF_REPORT || DEFAULT_PROOF_REPORT;
  const errors = [];
  const report = readProofReport(proofReport, errors);

  if (report) {
    const latestDeployUrl = getLatestVerifiedDeployUrl(errors);

    if (report.status !== "passed") {
      errors.push(`Proof report status must be "passed"; received ${JSON.stringify(report.status)}.`);
    }

    if (report.baseUrl !== EXPECTED_BASE_URL) {
      errors.push(`Proof report must target production ${EXPECTED_BASE_URL}; received ${JSON.stringify(report.baseUrl)}.`);
    }

    if (report.command !== "npm run test:e2e:live:final") {
      errors.push("Proof report must come from `npm run test:e2e:live:final`.");
    }

    if (latestDeployUrl && report.latestVerifiedDeployUrl !== latestDeployUrl) {
      errors.push(
        `Proof report must match the latest verified deploy ${latestDeployUrl}; received ${JSON.stringify(report.latestVerifiedDeployUrl)}.`,
      );
    }

    const latestDeployId = extractDeployId(latestDeployUrl);

    if (latestDeployId && report.latestVerifiedDeployId !== latestDeployId) {
      errors.push(
        `Proof report deploy id must match latest verified deploy ${latestDeployId}; received ${JSON.stringify(report.latestVerifiedDeployId)}.`,
      );
    }

    if (report.plaidAutomationRequired !== true || report.plaidAutomationEnabled !== true) {
      errors.push("Proof report must require and enable Plaid automation.");
    }

    if (!isRecentIsoTimestamp(report.generatedAt)) {
      errors.push("Proof report must include a valid generatedAt timestamp.");
    }

    if (!isNonEmptyString(report.storageStatePath)) {
      errors.push("Proof report must include the storage-state path used by the live smoke.");
    }
  }

  if (errors.length > 0) {
    stderr("PRD completion check failed.");
    stderr("The implementation is not complete until the final production smoke proof exists:");
    for (const error of errors) {
      stderr(`- ${error}`);
    }
    return 1;
  }

  stdout("PRD completion check passed.");
  stdout(`Proof report: ${proofReport}`);
  return 0;
}

function getLatestVerifiedDeployUrl(errors) {
  try {
    const readme = readFileSync("README.md", "utf8");
    const match = readme.match(/Latest verified production deploy:\s+(https:\/\/\S+)/);

    if (!match) {
      errors.push("README.md must include `Latest verified production deploy:` before PRD completion can be checked.");
      return null;
    }

    return match[1];
  } catch {
    errors.push("Could not read README.md to find the latest verified production deploy.");
    return null;
  }
}

function extractDeployId(url) {
  if (!url) {
    return null;
  }

  const match = url.match(/^https:\/\/([a-f0-9]+)--free-cash-mayberrydt\.netlify\.app/);

  return match?.[1] ?? null;
}

function readProofReport(path, errors) {
  if (!existsSync(path)) {
    errors.push(`Missing proof report: ${path}`);
    errors.push(
      "Run `npm run capture:live-auth`, then `SPENDABLE_LIVE_STORAGE_STATE=/tmp/spendable-live-auth.json npm run test:e2e:live:final`.",
    );
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    errors.push(`Proof report is not valid JSON: ${path}`);
    return null;
  }
}

function isRecentIsoTimestamp(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = checkPrdComplete();
}
