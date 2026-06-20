#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function validateBrowserEvidence(evidence, { requiredCapabilityIds = [] } = {}) {
  const failures = [];

  if (evidence?.validatedBy !== "codex_in_app_browser") {
    failures.push("browser evidence must be validatedBy codex_in_app_browser");
  }

  if (evidence?.backend !== "iab") {
    failures.push("browser evidence backend must be iab");
  }

  const viewports = Array.isArray(evidence?.viewports) ? evidence.viewports : [];
  const viewportNames = new Set(viewports.map((viewport) => viewport?.name));

  if (!viewportNames.has("mobile")) {
    failures.push("browser evidence missing mobile viewport");
  }

  if (!viewportNames.has("desktop")) {
    failures.push("browser evidence missing desktop viewport");
  }

  for (const viewport of viewports) {
    const name = viewport?.name || "unknown";

    if (viewport?.passed !== true) {
      failures.push(`${name} viewport did not pass`);
    }

    if ((viewport?.consoleErrors ?? []).length > 0) {
      failures.push(`${name} viewport has console errors`);
    }

    if ((viewport?.networkFailures ?? []).length > 0) {
      failures.push(`${name} viewport has network failures`);
    }

    const checked = new Set(viewport?.checkedCapabilities ?? []);
    for (const capabilityId of requiredCapabilityIds) {
      if (!checked.has(capabilityId)) {
        failures.push(`${name} viewport missing capability ${capabilityId}`);
      }
    }
  }

  return validationResult(failures);
}

export function validateEvalReport(report, { suite, expectedCaseIds = [] } = {}) {
  const failures = [];

  if (report?.status !== "passed") {
    failures.push(`eval report status is ${report?.status || "missing"}`);
  }

  if (report?.failureCount !== 0) {
    failures.push(`eval report failureCount is ${report?.failureCount ?? "missing"}`);
  }

  if (suite && report?.suite !== suite) {
    failures.push(`eval report suite is ${report?.suite || "missing"}, expected ${suite}`);
  }

  const cases = Array.isArray(report?.cases) ? report.cases : [];
  const caseIds = new Set(cases.map((entry) => entry?.id).filter(Boolean));

  for (const expectedCaseId of expectedCaseIds) {
    if (!caseIds.has(expectedCaseId)) {
      failures.push(`eval report missing case ${expectedCaseId}`);
    }
  }

  for (const entry of cases) {
    if (Array.isArray(entry?.failures) && entry.failures.length > 0) {
      failures.push(`eval report case ${entry.id || "unknown"} has failures`);
    }
  }

  return validationResult(failures);
}

export function validateProductionRedaction(report) {
  const failures = [];
  const cases = Array.isArray(report?.cases) ? report.cases : [];

  for (const [index, entry] of cases.entries()) {
    if ("rawResponse" in entry) {
      failures.push(`production-safe report contains rawResponse for case ${index}`);
    }

    if (entry.inputMessage && entry.inputMessage !== "[redacted]") {
      failures.push(`production-safe report contains unredacted inputMessage for case ${index}`);
    }

    for (const field of ["responseMessage", "message", "responseSearchText"]) {
      if (entry[field] && entry[field] !== "[redacted]") {
        failures.push(`production-safe report contains unredacted ${field} for case ${index}`);
      }
    }
  }

  return validationResult(failures);
}

export function validateManifest(manifest) {
  const failures = [];
  const tiers = Array.isArray(manifest?.tiers) ? manifest.tiers : [];

  if (manifest?.status !== "passed") {
    failures.push(`manifest status is ${manifest?.status || "missing"}`);
  }

  for (const tier of tiers) {
    if (!isPassedStatus(tier?.status)) {
      failures.push(`tier ${tier?.name || "unknown"} did not pass`);
    }
  }

  for (const unresolvedFailure of manifest?.failures ?? []) {
    failures.push(`unresolved manifest failure: ${String(unresolvedFailure)}`);
  }

  for (const record of manifest?.failureRecords ?? []) {
    const id = record?.caseId || record?.id || "unknown";

    if (!record?.rootCause) {
      failures.push(`failure ${id} missing root cause`);
    }

    if (!isPassedStatus(record?.affectedRerun?.status)) {
      failures.push(`failure ${id} missing affected rerun evidence`);
    }

    if (!isPassedStatus(record?.finalRerun?.status)) {
      failures.push(`failure ${id} missing final complete rerun evidence`);
    }
  }

  return validationResult(failures);
}

export function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validationResult(failures) {
  return {
    ok: failures.length === 0,
    failures,
  };
}

function isPassedStatus(status) {
  return status === 0 || status === "passed";
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const manifestPath = process.argv[2];

  if (!manifestPath) {
    console.error("Usage: node scripts/major-dogfood-report.mjs path/to/manifest.json");
    process.exitCode = 1;
  } else {
    const result = validateManifest(readJsonFile(manifestPath));

    if (result.ok) {
      console.log(`Major dogfood manifest is valid: ${manifestPath}`);
      process.exitCode = 0;
    } else {
      console.error(result.failures.join("\n"));
      process.exitCode = 1;
    }
  }
}
