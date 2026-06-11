#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_LIVE_BASE_URL = "https://spendwithpip.com";

export function runLiveSmokeEnvCheck({
  env = process.env,
  stdout = console.log,
  stderr = console.error,
  warn = console.warn,
} = {}) {
  const errors = [];
  const warnings = [];
  const storageState = env.PIP_LIVE_STORAGE_STATE;
  const baseUrl = env.PIP_LIVE_BASE_URL || DEFAULT_LIVE_BASE_URL;

  if (!storageState) {
    errors.push("PIP_LIVE_STORAGE_STATE must point to a saved Playwright storage-state file.");
  } else if (!existsSync(storageState)) {
    errors.push(`PIP_LIVE_STORAGE_STATE does not exist: ${storageState}`);
  } else {
    const storageStateError = validateStorageState(storageState);

    if (storageStateError) {
      errors.push(storageStateError);
    }
  }

  const parsedBaseUrl = parseUrl(baseUrl);

  if (!parsedBaseUrl) {
    errors.push(`PIP_LIVE_BASE_URL is not a valid URL: ${baseUrl}`);
  } else if (isLocalhost(parsedBaseUrl) && env.PIP_LIVE_ALLOW_LOCAL !== "1") {
    errors.push("PIP_LIVE_BASE_URL points to localhost. Use production or set PIP_LIVE_ALLOW_LOCAL=1 intentionally.");
  } else if (isLegacyNetlifyHost(parsedBaseUrl)) {
    errors.push("PIP_LIVE_BASE_URL points to a legacy Netlify hostname. Use https://spendwithpip.com.");
  }

  if (env.PIP_LIVE_COMPLETE_PLAID !== "1") {
    warnings.push(
      "PIP_LIVE_COMPLETE_PLAID is not set. The smoke will require the saved session to already have connected Plaid data.",
    );
  }

  if (errors.length > 0) {
    stderr("Live authenticated smoke preflight failed.");
    stderr("Fix these before running `npm run test:e2e:live`:");
    for (const error of errors) {
      stderr(`- ${error}`);
    }
    printWarnings(warnings, warn);
    return 1;
  }

  stdout("Live authenticated smoke preflight passed.");
  stdout(`Base URL: ${baseUrl}`);
  stdout(`Storage state: ${storageState}`);
  if (env.PIP_LIVE_COMPLETE_PLAID === "1") {
    stdout("Plaid automation: enabled");
  } else {
    stdout("Plaid automation: disabled");
  }
  printWarnings(warnings, warn);
  return 0;
}

function validateStorageState(path) {
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return `PIP_LIVE_STORAGE_STATE is not valid JSON: ${path}`;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "PIP_LIVE_STORAGE_STATE must be a Playwright storage-state object.";
  }

  if (!Array.isArray(parsed.cookies) || !Array.isArray(parsed.origins)) {
    return "PIP_LIVE_STORAGE_STATE must include Playwright `cookies` and `origins` arrays.";
  }

  if (parsed.cookies.length === 0 && parsed.origins.length === 0) {
    return "PIP_LIVE_STORAGE_STATE looks empty. Save it after signing in with a Google user.";
  }

  return null;
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLocalhost(url) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
}

function isLegacyNetlifyHost(url) {
  return /(^|--)(free-cash-mayberrydt|pip-mayberrydt)\.netlify\.app$/i.test(url.hostname);
}

function printWarnings(warnings, warn) {
  if (warnings.length === 0) {
    return;
  }

  warn("Warnings:");
  for (const warning of warnings) {
    warn(`- ${warning}`);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runLiveSmokeEnvCheck();
}
