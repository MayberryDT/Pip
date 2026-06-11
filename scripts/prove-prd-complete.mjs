#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_STORAGE_STATE = "/tmp/pip-live-auth.json";
const DEFAULT_PROOF_REPORT = "/tmp/pip-live-proof.json";

export function provePrdComplete({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = console.log,
  spawn = spawnSync,
} = {}) {
  const skipCapture = argv.includes("--skip-capture");
  const effectiveEnv = {
    ...env,
    PIP_LIVE_STORAGE_STATE:
      env.PIP_LIVE_STORAGE_STATE || DEFAULT_STORAGE_STATE,
    PIP_LIVE_PROOF_REPORT:
      env.PIP_LIVE_PROOF_REPORT || DEFAULT_PROOF_REPORT,
    PIP_LIVE_COMPLETE_PLAID: "1",
  };
  const steps = [
    ...(skipCapture
      ? []
      : [
          {
            label: "Capture Google auth state",
            command: "npm",
            args: ["run", "capture:live-auth"],
          },
        ]),
    {
      label: "Preflight saved live auth state",
      command: "npm",
      args: ["run", "check:live-smoke"],
    },
    {
      label: "Run final Plaid production smoke",
      command: "npm",
      args: ["run", "test:e2e:live:final"],
    },
    {
      label: "Verify PRD completion proof",
      command: "npm",
      args: ["run", "check:prd-complete"],
    },
  ];

  for (const step of steps) {
    stdout(`\n==> ${step.label}`);
    const result = spawn(step.command, step.args, {
      env: effectiveEnv,
      stdio: "inherit",
    });
    const status = result.status ?? 1;

    if (status !== 0) {
      return status;
    }
  }

  stdout("\nPRD final proof completed.");
  return 0;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = provePrdComplete();
}
