#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import {
  createSupabaseAdminFromEnv,
  loadEnvFiles,
} from "../play-review/play-review-lib.mjs";

const defaultRetentionDays = 30;
const maxRetentionDays = 3650;

export async function runPurgeAgentChatTurns({
  env = process.env,
  stdout = console.log,
  stderr = console.error,
  createAdminClient = createSupabaseAdminFromEnv,
} = {}) {
  try {
    loadEnvFiles({ env });
    const retentionDays = parseRetentionDays(env.PIP_AGENT_CHAT_RETENTION_DAYS);
    const admin = createAdminClient(env);
    const { data, error } = await admin.rpc("purge_agent_chat_turns", {
      p_retention_days: retentionDays,
    });

    if (error) {
      throw error;
    }

    stdout(`Purged ${data ?? 0} agent chat turns older than ${retentionDays} days.`);
    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function parseRetentionDays(rawValue) {
  const value = rawValue === undefined || rawValue === "" ? defaultRetentionDays : Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > maxRetentionDays) {
    throw new Error("PIP_AGENT_CHAT_RETENTION_DAYS must be between 1 and 3650.");
  }

  return value;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runPurgeAgentChatTurns();
}
