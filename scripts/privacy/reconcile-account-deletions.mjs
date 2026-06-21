#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import {
  createSupabaseAdminFromEnv,
  loadEnvFiles,
  parseArgs,
} from "../play-review/play-review-lib.mjs";

const recoverableStatuses = ["data_deleted", "auth_deleted"];
const defaultLimit = 50;
const maxLimit = 500;

export async function runReconcileAccountDeletions({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = console.log,
  stderr = console.error,
  createAdminClient = createSupabaseAdminFromEnv,
  now = new Date(),
} = {}) {
  try {
    loadEnvFiles({ env });
    const args = parseArgs(argv);
    const dryRun = args["dry-run"] !== "false";
    const limit = parseLimit(args.limit);
    const admin = createAdminClient(env);
    const rows = await loadRecoverableDeletionRows(admin, limit);
    let completed = 0;
    let eligible = 0;
    let skipped = 0;

    for (const row of rows) {
      const authMissing = await isAuthUserMissing(admin, row.user_id);

      if (!authMissing) {
        skipped += 1;
        stdout(`Skipped ${row.user_id}; auth user still exists.`);
        continue;
      }

      eligible += 1;

      if (dryRun) {
        stdout(`Would mark account deletion completed for ${row.user_id}.`);
        continue;
      }

      await markCompleted(admin, row, now);
      completed += 1;
      stdout(`Marked account deletion completed for ${row.user_id}.`);
    }

    stdout(`Account deletion reconciliation complete: completed=${completed}, eligible=${eligible}, skipped=${skipped}, dryRun=${dryRun}.`);
    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function loadRecoverableDeletionRows(admin, limit) {
  const { data, error } = await admin
    .from("account_deletion_requests")
    .select("user_id,status,auth_deleted_at")
    .in("status", recoverableStatuses)
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function isAuthUserMissing(admin, userId) {
  const { data, error } = await admin.auth.admin.getUserById(userId);

  if (!error && data?.user) {
    return false;
  }

  if (isAlreadyDeletedError(error)) {
    return true;
  }

  throw error ?? new Error(`Could not verify auth user ${userId}.`);
}

async function markCompleted(admin, row, now) {
  const nowIso = now.toISOString();
  const { error } = await admin
    .from("account_deletion_requests")
    .update({
      status: "completed",
      auth_deleted_at: row.auth_deleted_at ?? nowIso,
      completed_at: nowIso,
      failed_at: null,
      last_error_code: null,
      updated_at: nowIso,
    })
    .eq("user_id", row.user_id)
    .in("status", recoverableStatuses);

  if (error) {
    throw error;
  }
}

function parseLimit(rawValue) {
  const value = rawValue === undefined || rawValue === "" ? defaultLimit : Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > maxLimit) {
    throw new Error(`--limit must be between 1 and ${maxLimit}.`);
  }

  return value;
}

function isAlreadyDeletedError(error) {
  const message = error?.message?.toLowerCase() ?? "";

  return error?.status === 404 || message.includes("not found") || message.includes("does not exist");
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runReconcileAccountDeletions();
}
