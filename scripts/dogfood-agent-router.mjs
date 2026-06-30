#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { runAgentEval } from "./eval-agent.mjs";
import {
  agentRouterDogfoodCases,
  sampleRouterDogfoodCases,
} from "../tests/fixtures/agent-routing/dogfood-cases.ts";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_REPORT_PATH = "/tmp/pip-router-dogfood-report.json";
const DEFAULT_SAMPLE_LIMIT = 60;

const sideEffectTools = new Set([
  "refresh_financial_data",
  "request_delete_data_confirmation",
  "start_new_account_connection",
  "repair_account_connection",
  "start_account_selection_update",
  "request_remove_institution_confirmation",
]);

const destructiveTools = new Set([
  "delete_user_data",
  "remove_institution",
]);

function parseArgs(argv) {
  const options = {
    all: false,
    includeActions: process.env.PIP_ROUTER_DOGFOOD_INCLUDE_ACTIONS === "1",
    includeDestructive: process.env.PIP_ROUTER_DOGFOOD_ALLOW_DESTRUCTIVE === "1",
    strictCards: process.env.PIP_ROUTER_DOGFOOD_STRICT_CARDS === "1",
    limit: parseLimit(process.env.PIP_ROUTER_DOGFOOD_LIMIT, DEFAULT_SAMPLE_LIMIT),
    caseIds: process.env.PIP_ROUTER_DOGFOOD_CASE_IDS || process.env.PIP_AGENT_EVAL_CASE_IDS,
    baseUrl: process.env.PIP_AGENT_EVAL_BASE_URL || DEFAULT_BASE_URL,
    reportPath: process.env.PIP_AGENT_EVAL_REPORT || DEFAULT_REPORT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--all") {
      options.all = true;
      options.limit = null;
    } else if (arg === "--include-actions") {
      options.includeActions = true;
    } else if (arg === "--include-destructive") {
      options.includeDestructive = true;
    } else if (arg === "--strict-cards") {
      options.strictCards = true;
    } else if (arg === "--limit" && next) {
      options.limit = parseLimit(next, DEFAULT_SAMPLE_LIMIT);
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      options.limit = parseLimit(arg.slice("--limit=".length), DEFAULT_SAMPLE_LIMIT);
    } else if (arg === "--case-ids" && next) {
      options.caseIds = next;
      index += 1;
    } else if (arg.startsWith("--case-ids=")) {
      options.caseIds = arg.slice("--case-ids=".length);
    } else if (arg === "--base-url" && next) {
      options.baseUrl = next;
      index += 1;
    } else if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
    } else if (arg === "--report" && next) {
      options.reportPath = next;
      index += 1;
    } else if (arg.startsWith("--report=")) {
      options.reportPath = arg.slice("--report=".length);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown dogfood router option: ${arg}`);
    }
  }

  if (options.caseIds) {
    options.limit = null;
  }

  return options;
}

function parseLimit(value, fallback) {
  if (value === "all") {
    return null;
  }

  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function printHelp() {
  console.log(`Pip router dogfood API harness

Usage:
  npm run dogfood:router:api -- [--all] [--limit 80] [--base-url URL] [--report PATH]

Environment:
  PIP_AGENT_EVAL_BASE_URL          Target app URL. Defaults to ${DEFAULT_BASE_URL}
  PIP_AGENT_EVAL_REPORT            JSON report path. Defaults to ${DEFAULT_REPORT_PATH}
  PIP_AGENT_EVAL_STORAGE_STATE     Optional Playwright storage-state JSON for auth cookies
  PIP_AGENT_EVAL_COOKIE            Optional raw Cookie header override
  PIP_ROUTER_DOGFOOD_LIMIT         Sample size or "all". Defaults to ${DEFAULT_SAMPLE_LIMIT}
  PIP_ROUTER_DOGFOOD_CASE_IDS      Comma-separated dogfood case ids
  PIP_ROUTER_DOGFOOD_INCLUDE_ACTIONS=1      Include non-destructive action cases
  PIP_ROUTER_DOGFOOD_ALLOW_DESTRUCTIVE=1    Include destructive confirmations
  PIP_ROUTER_DOGFOOD_STRICT_CARDS=1         Require exact expected cards for every case`);
}

function selectDogfoodCases(options) {
  const baseCases = options.all || options.caseIds
    ? agentRouterDogfoodCases
    : sampleRouterDogfoodCases;
  const safeCases = baseCases
    .filter((caseDef) => caseDef.expectedDecision === "route")
    .filter((caseDef) => Boolean(caseDef.expectedToolName))
    .filter((caseDef) => options.includeActions || !sideEffectTools.has(caseDef.expectedToolName))
    .filter((caseDef) => options.includeDestructive || !destructiveTools.has(caseDef.expectedToolName));

  if (options.caseIds) {
    return safeCases;
  }

  if (!options.limit || options.limit >= safeCases.length) {
    return safeCases;
  }

  return stratifiedSample(safeCases, options.limit);
}

function stratifiedSample(cases, limit) {
  const byFamily = new Map();

  for (const caseDef of cases) {
    const familyCases = byFamily.get(caseDef.family) ?? [];
    familyCases.push(caseDef);
    byFamily.set(caseDef.family, familyCases);
  }

  const selected = [];
  const families = [...byFamily.keys()].sort();

  for (const family of families) {
    const [first] = byFamily.get(family) ?? [];

    if (first) {
      selected.push(first);
    }
  }

  let offset = 1;

  while (selected.length < limit) {
    let added = false;

    for (const family of families) {
      const next = byFamily.get(family)?.[offset];

      if (next) {
        selected.push(next);
        added = true;
      }

      if (selected.length >= limit) {
        break;
      }
    }

    if (!added) {
      break;
    }

    offset += 1;
  }

  return selected;
}

function toEvalCase(caseDef, options) {
  return {
    id: caseDef.id,
    description: `${caseDef.family} router dogfood: ${caseDef.message}`,
    message: caseDef.message,
    expectedTools: [caseDef.expectedToolName],
    ...getLiveCardExpectations(caseDef, options),
    forbiddenTools: getLiveForbiddenTools(caseDef),
    routingOnly: true,
  };
}

function getLiveCardExpectations(caseDef, options) {
  const cardTypes = caseDef.expectedCardTypes ?? [];

  if (options.strictCards) {
    return {
      expectedCards: cardTypes,
    };
  }

  if (caseDef.expectedToolName === "get_connected_accounts") {
    return {};
  }

  if (cardTypes.length > 1) {
    return {
      expectedAnyCards: cardTypes,
    };
  }

  return {
    expectedCards: cardTypes,
  };
}

function getLiveForbiddenTools(caseDef) {
  const forbiddenToolNames = caseDef.forbiddenToolNames ?? [];

  if (caseDef.expectedToolName !== "simulate_purchase") {
    return forbiddenToolNames;
  }

  return forbiddenToolNames.filter((toolName) => toolName !== "get_financial_guidance_context");
}

function buildAuthHeaders(baseUrl) {
  if (process.env.PIP_AGENT_EVAL_COOKIE) {
    return {
      Cookie: process.env.PIP_AGENT_EVAL_COOKIE,
    };
  }

  const storageStatePath = process.env.PIP_AGENT_EVAL_STORAGE_STATE;

  if (!storageStatePath) {
    return {};
  }

  if (!existsSync(storageStatePath)) {
    throw new Error(`PIP_AGENT_EVAL_STORAGE_STATE does not exist: ${storageStatePath}`);
  }

  const storageState = JSON.parse(readFileSync(storageStatePath, "utf8"));
  const targetUrl = new URL(baseUrl);
  const cookies = Array.isArray(storageState.cookies) ? storageState.cookies : [];
  const cookieHeader = cookies
    .filter((cookie) => cookieAppliesToUrl(cookie, targetUrl))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  return cookieHeader ? { Cookie: cookieHeader } : {};
}

function cookieAppliesToUrl(cookie, url) {
  if (!cookie?.name || cookie.value === undefined) {
    return false;
  }

  if (cookie.secure && url.protocol !== "https:") {
    return false;
  }

  return domainMatches(cookie.domain, url.hostname);
}

function domainMatches(cookieDomain, hostname) {
  const normalizedDomain = String(cookieDomain ?? "").replace(/^\./, "").toLowerCase();
  const normalizedHost = hostname.toLowerCase();

  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cases = selectDogfoodCases(options).map((caseDef) => toEvalCase(caseDef, options));

  if (cases.length === 0) {
    throw new Error("No dogfood router cases selected.");
  }

  const report = await runAgentEval({
    baseUrl: options.baseUrl,
    reportPath: options.reportPath,
    routingOnly: true,
    cases,
    caseIds: options.caseIds,
    headers: buildAuthHeaders(options.baseUrl),
    includeRawResponse: false,
    redactReport: true,
    conversationPrefix: process.env.PIP_ROUTER_DOGFOOD_CONVERSATION_PREFIX || `router-dogfood-${Date.now()}`,
  });

  process.exitCode = report.failureCount === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
