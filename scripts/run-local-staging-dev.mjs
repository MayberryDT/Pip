#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

loadEnvFile(".env", { override: false });
loadEnvFile(".env.local", { override: true });

process.env.PIP_LOCAL_STAGING ||= "1";
process.env.NEXT_PUBLIC_SITE_URL ||= "http://localhost:3000";
process.env.PLAID_REDIRECT_URI ||= "http://localhost:3000/plaid/oauth";

const nextBin = resolve(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next",
);
const cliArgs = process.argv.slice(2);
const requestedCommand = cliArgs[0];
const command =
  requestedCommand === "build" || requestedCommand === "dev" || requestedCommand === "start"
    ? cliArgs.shift()
    : "dev";
const args = [command, ...cliArgs];

const child = spawn(nextBin, args, {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});

function loadEnvFile(fileName, { override }) {
  const path = resolve(process.cwd(), fileName);

  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

    if (!override && process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = stripQuotes(rawValue.trim());
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
