#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_LIVE_BASE_URL = "https://free-cash-mayberrydt.netlify.app";
const DEFAULT_STORAGE_STATE = "/tmp/spendable-live-auth.json";

export function captureLiveAuthState({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = console.log,
  stderr = console.error,
  spawn = spawnSync,
} = {}) {
  const options = parseArgs(argv);
  const baseUrl = options.baseUrl || env.SPENDABLE_LIVE_BASE_URL || DEFAULT_LIVE_BASE_URL;
  const storageState = options.storageState || env.SPENDABLE_LIVE_STORAGE_STATE || DEFAULT_STORAGE_STATE;
  const parsedBaseUrl = parseUrl(baseUrl);

  if (!parsedBaseUrl) {
    stderr(`SPENDABLE_LIVE_BASE_URL is not a valid URL: ${baseUrl}`);
    return 1;
  }

  if (isLocalhost(parsedBaseUrl) && env.SPENDABLE_LIVE_ALLOW_LOCAL !== "1") {
    stderr("Refusing to capture live auth state from localhost. Use production or set SPENDABLE_LIVE_ALLOW_LOCAL=1 intentionally.");
    return 1;
  }

  stdout("Opening Playwright codegen for Spendable live auth capture.");
  stdout(`Base URL: ${baseUrl}`);
  stdout(`Storage state output: ${storageState}`);
  stdout("Sign in with any Google account, wait until Spendable returns to the app, then close the browser window.");

  const result = spawn(
    "npx",
    ["playwright", "codegen", "--channel", "chrome", baseUrl, `--save-storage=${storageState}`],
    {
      env,
      stdio: "inherit",
    },
  );

  return result.status ?? 1;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--base-url") {
      options.baseUrl = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
    } else if (arg === "--storage-state") {
      options.storageState = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--storage-state=")) {
      options.storageState = arg.slice("--storage-state=".length);
    }
  }

  return options;
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

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = captureLiveAuthState();
}
