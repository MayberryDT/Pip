#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDbSchemaNames } from "./check-db-schema-names.mjs";

export function runDeploymentEnvCheck({
  argv = process.argv,
  cwd = process.cwd(),
  env = process.env,
  stdout = console.log,
  stderr = console.error,
  warn = console.warn,
} = {}) {
  const mode = getMode(argv, stderr);
  const effectiveEnv = {
    ...env,
  };

  if (!mode) {
    return 1;
  }

  loadEnvFile(".env", cwd, effectiveEnv);
  loadEnvFile(".env.local", cwd, effectiveEnv);

  const missing = requiredByMode[mode].filter((name) => !hasValue(effectiveEnv[name]));
  const warnings = [];

  if (mode === "beta") {
    if (!hasAiConfiguration(effectiveEnv)) {
      missing.push(
        "OPENAI_API_KEY, OPENAI_BASE_URL, or NETLIFY_AI_GATEWAY_BASE_URL plus NETLIFY_AI_GATEWAY_KEY",
      );
    }

    if (effectiveEnv.PIP_SUPABASE_MODE === "off") {
      warnings.push("PIP_SUPABASE_MODE=off disables real Supabase data.");
    }

    if (effectiveEnv.PIP_LOCAL_FAKE_APP_MODE === "1") {
      addUnique(missing, "PIP_LOCAL_FAKE_APP_MODE must not be enabled for beta mode.");
    }

    if (hasValue(effectiveEnv.PLAID_ENV) && effectiveEnv.PLAID_ENV !== "production") {
      addUnique(missing, "PLAID_ENV must be production for beta mode.");
    }

    const siteOrigin = normalizeOrigin(effectiveEnv.NEXT_PUBLIC_SITE_URL);
    const plaidRedirectUri = normalizeAbsoluteUrl(effectiveEnv.PLAID_REDIRECT_URI);

    if (!siteOrigin) {
      addUnique(missing, "NEXT_PUBLIC_SITE_URL");
    } else if (isLocalhostUrl(siteOrigin)) {
      addUnique(missing, "NEXT_PUBLIC_SITE_URL must be the production app origin, not localhost.");
    }

    if (plaidRedirectUri && isLocalhostUrl(plaidRedirectUri)) {
      addUnique(missing, "PLAID_REDIRECT_URI must not point to localhost in beta mode.");
    }

    if (plaidRedirectUri && siteOrigin && new URL(plaidRedirectUri).origin !== siteOrigin) {
      warnings.push("PLAID_REDIRECT_URI does not share the NEXT_PUBLIC_SITE_URL origin.");
    }

    if (effectiveEnv.PIP_EMAIL_MODE?.trim() !== "off" && !hasBetaEmailConfiguration(effectiveEnv)) {
      addUnique(
        missing,
        "RESEND_API_KEY, PIP_EMAIL_FROM, PIP_EMAIL_POSTAL_ADDRESS, PIP_EMAIL_UNSUBSCRIBE_SECRET, and RESEND_WEBHOOK_SECRET are required for beta email delivery unless PIP_EMAIL_MODE=off.",
      );
    }
  }

  if (missing.length > 0) {
    stderr(`Deployment env check failed for ${mode} mode.`);
    stderr("Missing required variables:");
    for (const name of missing) {
      stderr(`- ${name}`);
    }
    printWarnings(warnings, warn);
    return 1;
  }

  const schemaStatus = checkDbSchemaNames({
    cwd,
    stdout,
    stderr,
    skipWhenProjectFilesMissing: true,
  });

  if (schemaStatus !== 0) {
    return schemaStatus;
  }

  stdout(`Deployment env check passed for ${mode} mode.`);
  printWarnings(warnings, warn);
  return 0;
}

const requiredByMode = {
  fake: ["PIP_SUPABASE_MODE", "PIP_RATE_LIMIT_SALT"],
  beta: [
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PIP_OPERATOR_TOKEN",
    "PIP_PROVIDER_TOKEN_KEY_BASE64",
    "PIP_RATE_LIMIT_SALT",
    "PLAID_CLIENT_ID",
    "PLAID_SECRET",
    "PLAID_ENV",
  ],
};

function getMode(argv, stderr) {
  const modeArg = argv.find((arg) => arg.startsWith("--mode="));
  const value = modeArg?.slice("--mode=".length) || "beta";

  if (value !== "beta" && value !== "fake") {
    stderr("Use --mode=beta or --mode=fake.");
    return null;
  }

  return value;
}

function loadEnvFile(fileName, cwd, env) {
  const path = resolve(cwd, fileName);

  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

    if (env[key] !== undefined) {
      continue;
    }

    env[key] = stripQuotes(rawValue.trim());
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

function hasValue(value) {
  return Boolean(value && value.trim());
}

function addUnique(values, value) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function hasAiConfiguration(env) {
  return (
    hasValue(env.OPENAI_API_KEY) ||
    hasValue(env.OPENAI_BASE_URL) ||
    (hasValue(env.NETLIFY_AI_GATEWAY_BASE_URL) && hasValue(env.NETLIFY_AI_GATEWAY_KEY))
  );
}

function hasBetaEmailConfiguration(env) {
  return [
    "RESEND_API_KEY",
    "PIP_EMAIL_FROM",
    "PIP_EMAIL_POSTAL_ADDRESS",
    "PIP_EMAIL_UNSUBSCRIBE_SECRET",
    "RESEND_WEBHOOK_SECRET",
  ].every((name) => hasValue(env[name]));
}

function normalizeOrigin(rawUrl) {
  const absoluteUrl = normalizeAbsoluteUrl(rawUrl);

  if (!absoluteUrl) {
    return null;
  }

  return new URL(absoluteUrl).origin;
}

function normalizeAbsoluteUrl(rawUrl) {
  if (!rawUrl?.trim()) {
    return null;
  }

  const trimmedUrl = rawUrl.trim();
  const urlWithProtocol =
    trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")
      ? trimmedUrl
      : `https://${trimmedUrl}`;

  try {
    return new URL(urlWithProtocol).toString();
  } catch {
    return null;
  }
}

function isLocalhostUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
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
  process.exitCode = runDeploymentEnvCheck();
}
