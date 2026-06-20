#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_PROOF_REPORT = "/tmp/pip-live-proof.json";
const EXPECTED_BASE_URL = "https://spendwithpip.com";
const PLAYWRIGHT_FINAL_COMMAND = "npm run test:e2e:live:final";
const IN_APP_BROWSER_COMMAND = "Codex in-app Browser live proof";

export function checkPrdComplete({
  env = process.env,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const proofReport = env.PIP_LIVE_PROOF_REPORT || DEFAULT_PROOF_REPORT;
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

    if (!isRecentIsoTimestamp(report.generatedAt)) {
      errors.push("Proof report must include a valid generatedAt timestamp.");
    }

    if (getProofMethod(report) === "in_app_browser") {
      validateInAppBrowserProof(report, errors);
    } else {
      validatePlaywrightProof(report, errors);
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

  const match = url.match(/^https:\/\/([a-f0-9]+)--spendwithpip\.netlify\.app/);

  return match?.[1] ?? null;
}

function readProofReport(path, errors) {
  if (!existsSync(path)) {
    errors.push(`Missing proof report: ${path}`);
    errors.push(
      "Run `npm run capture:live-auth`, then `PIP_LIVE_STORAGE_STATE=/tmp/pip-live-auth.json npm run test:e2e:live:final`, or use `npm run proof:in-app-browser` after writing /tmp/pip-in-app-browser-evidence.json.",
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

function getProofMethod(report) {
  return report.proofMethod ?? "playwright_live_smoke";
}

function validatePlaywrightProof(report, errors) {
  if (report.command !== PLAYWRIGHT_FINAL_COMMAND) {
    errors.push("Proof report must come from `npm run test:e2e:live:final`.");
  }

  if (report.plaidAutomationRequired !== true || report.plaidAutomationEnabled !== true) {
    errors.push("Proof report must require and enable Plaid automation.");
  }

  if (!isNonEmptyString(report.storageStatePath)) {
    errors.push("Proof report must include the storage-state path used by the live smoke.");
  }
}

function validateInAppBrowserProof(report, errors) {
  if (report.command !== IN_APP_BROWSER_COMMAND) {
    errors.push(`In-app Browser proof report must use command ${JSON.stringify(IN_APP_BROWSER_COMMAND)}.`);
  }

  if (report.validatedBy !== "codex_in_app_browser") {
    errors.push("In-app Browser proof report must be validated by codex_in_app_browser.");
  }

  const evidence = isObject(report.evidence) ? report.evidence : null;
  if (!evidence) {
    errors.push("In-app Browser proof report must include structured evidence.");
    return;
  }

  const sync = objectField(evidence, "authenticatedSyncStatus");
  expectTrue(sync?.ok, "Authenticated /api/sync/status must return ok.", errors);
  expectEqual(sync?.status, 200, "Authenticated /api/sync/status must return HTTP 200.", errors);
  expectTrue(sync?.plaidConnected, "Authenticated sync status must show a connected Plaid institution.", errors);
  expectTrue(sync?.latestSyncSucceeded, "Authenticated sync status must show a succeeded latest Plaid sync.", errors);
  expectPositiveNumber(sync?.accountCount, "Authenticated sync status must include synced accounts.", errors);
  expectPositiveNumber(sync?.transactionCount, "Authenticated sync status must include synced transactions.", errors);

  const canonicalApi = objectField(evidence, "canonicalApi");
  const compatibilityApi = objectField(evidence, "compatibilityApi");
  expectTrue(canonicalApi?.ok, "/api/pip-cash must return ok.", errors);
  expectEqual(canonicalApi?.status, 200, "/api/pip-cash must return HTTP 200.", errors);
  expectNumber(canonicalApi?.pipCashTodayCents, "/api/pip-cash must include pipCashTodayCents.", errors);
  expectTrue(compatibilityApi?.ok, "/api/free-cash must return ok.", errors);
  expectEqual(compatibilityApi?.status, 200, "/api/free-cash must return HTTP 200.", errors);
  if (
    typeof canonicalApi?.pipCashTodayCents === "number" &&
    compatibilityApi?.pipCashTodayCents !== canonicalApi.pipCashTodayCents
  ) {
    errors.push("/api/free-cash must match /api/pip-cash pipCashTodayCents.");
  }

  const page = objectField(evidence, "page");
  expectTrue(page?.hasPip, "Page must show Pip.", errors);
  expectTrue(page?.hasSpendableCashToday, "Page must show Spendable Cash Today.", errors);
  expectTrue(page?.hasPipCashNumber, "Page must expose data-testid=\"pip-cash-number\".", errors);
  expectFalse(page?.hasVisibleOldBrand, "Page must not show visible Free Cash.", errors);
  expectFalse(page?.hasVisiblePipCashToday, "Page must not show visible PIP Cash Today.", errors);

  const drivers = objectField(evidence, "driversQuestion");
  expectTrue(drivers?.ok, "Drivers question must return ok.", errors);
  expectTrue(drivers?.usedModel, "Drivers question must use the deployed model path.", errors);
  expectIncludes(drivers?.toolNames, "get_pip_cash_drivers", "Drivers question must use get_pip_cash_drivers.", errors);

  const guidance = objectField(evidence, "guidanceQuestion");
  expectTrue(guidance?.ok, "Guidance question must return ok.", errors);
  expectTrue(guidance?.usedModel, "Guidance question must use the deployed model path.", errors);
  expectTrue(
    guidance?.responseMode === "guidance" || guidance?.hasGuidanceAudit === true,
    "Guidance question must return guidance response mode or guidance audit.",
    errors,
  );
  expectIncludes(
    guidance?.toolNames,
    "get_financial_guidance_context",
    "Guidance question must use get_financial_guidance_context.",
    errors,
  );
  expectTrue(guidance?.blockedLanguageAbsent, "Guidance response must not include blocked guidance language.", errors);
  expectPositiveNumber(guidance?.evidenceIdsCount, "Guidance response must include evidence IDs.", errors);
  expectTrue(guidance?.cardRowsEvidenceBacked, "Guidance card rows must be evidence-backed when shown.", errors);
}

function objectField(object, key) {
  const value = object?.[key];

  return isObject(value) ? value : null;
}

function expectTrue(value, message, errors) {
  if (value !== true) {
    errors.push(message);
  }
}

function expectFalse(value, message, errors) {
  if (value !== false) {
    errors.push(message);
  }
}

function expectEqual(value, expected, message, errors) {
  if (value !== expected) {
    errors.push(message);
  }
}

function expectIncludes(value, expected, message, errors) {
  if (!Array.isArray(value) || !value.includes(expected)) {
    errors.push(message);
  }
}

function expectNumber(value, message, errors) {
  if (typeof value !== "number") {
    errors.push(message);
  }
}

function expectPositiveNumber(value, message, errors) {
  if (typeof value !== "number" || value <= 0) {
    errors.push(message);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
