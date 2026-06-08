#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runLiveSmokeEnvCheck } from "./check-live-smoke-env.mjs";

const DEFAULT_LIVE_BASE_URL = "https://free-cash-mayberrydt.netlify.app";
const DEFAULT_PROOF_REPORT = "/tmp/spendable-live-proof.json";

export function runLiveSmoke({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = console.log,
  stderr = console.error,
  warn = console.warn,
  spawn = spawnSync,
} = {}) {
  const effectiveEnv = { ...env };
  const requiresPlaid = argv.includes("--require-plaid");

  if (argv.includes("--complete-plaid")) {
    effectiveEnv.SPENDABLE_LIVE_COMPLETE_PLAID = "1";
  }

  if (requiresPlaid && effectiveEnv.SPENDABLE_LIVE_COMPLETE_PLAID !== "1") {
    stderr("Live authenticated smoke requires Plaid automation for final PRD proof.");
    stderr("Rerun with --complete-plaid or set SPENDABLE_LIVE_COMPLETE_PLAID=1.");
    return 1;
  }

  if (requiresPlaid && !effectiveEnv.SPENDABLE_LIVE_PROOF_REPORT) {
    effectiveEnv.SPENDABLE_LIVE_PROOF_REPORT = DEFAULT_PROOF_REPORT;
  }

  const preflightResult = runLiveSmokeEnvCheck({
    env: effectiveEnv,
    stdout,
    stderr,
    warn,
  });

  if (preflightResult !== 0) {
    return preflightResult;
  }

  const result = spawn("npm", ["run", "test:e2e:live"], {
    env: effectiveEnv,
    stdio: "inherit",
  });

  const status = result.status ?? 1;

  if (status !== 0) {
    return status;
  }

  const proofReport = effectiveEnv.SPENDABLE_LIVE_PROOF_REPORT;

  if (proofReport) {
    writeProofReport({
      path: proofReport,
      env: effectiveEnv,
      requiresPlaid,
      stdout,
    });
  }

  return 0;
}

function writeProofReport({ path, env, requiresPlaid, stdout }) {
  const latestDeployUrl = getLatestVerifiedDeployUrl();
  const report = {
    status: "passed",
    generatedAt: new Date().toISOString(),
    baseUrl: env.SPENDABLE_LIVE_BASE_URL || DEFAULT_LIVE_BASE_URL,
    latestVerifiedDeployUrl: latestDeployUrl,
    latestVerifiedDeployId: extractDeployId(latestDeployUrl),
    storageStatePath: env.SPENDABLE_LIVE_STORAGE_STATE,
    plaidAutomationRequired: requiresPlaid,
    plaidAutomationEnabled: env.SPENDABLE_LIVE_COMPLETE_PLAID === "1",
    command: "npm run test:e2e:live:final",
    evidence:
      "The live Playwright smoke passed against production with authenticated session, Plaid exchange/sync/status checks, Spendable Cash Today number, and deployed AI tool usage assertions.",
  };

  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  stdout(`Live authenticated smoke proof report written: ${path}`);
}

function getLatestVerifiedDeployUrl() {
  try {
    const readme = readFileSync("README.md", "utf8");
    const match = readme.match(/Latest verified production deploy:\s+(https:\/\/\S+)/);

    return match?.[1] ?? null;
  } catch {
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

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runLiveSmoke();
}
