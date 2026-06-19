#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import {
  auditUserAppData,
  createSupabaseAdminFromEnv,
  evaluateReviewerReadiness,
  findUserByEmail,
  getReviewerEmail,
  loadReviewerReadiness,
  loadEnvFiles,
  parseArgs,
  summarizeAudit,
} from "./play-review-lib.mjs";

const requiredSeedTables = ["user_settings", "connected_institutions", "accounts", "transactions"];

export async function runVerifyReviewerAccount({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  try {
    loadEnvFiles({ env });
    const args = parseArgs(argv);
    const admin = createSupabaseAdminFromEnv(env);
    const email = getReviewerEmail(args, env);
    const user = await findUserByEmail(admin, email);

    if (!user) {
      stderr(`Missing Play reviewer auth user: ${email}`);
      return 1;
    }

    const auditRows = await auditUserAppData(admin, user.id);
    const reviewerReadiness = await loadReviewerReadiness(admin, user.id);
    const readinessFailures = evaluateReviewerReadiness(reviewerReadiness);
    const missingTables = requiredSeedTables.filter((table) => {
      const row = auditRows.find((item) => item.table === table);

      return !row || row.count === 0;
    });

    stdout(`Verified Play reviewer auth user: ${email}`);
    stdout(`User id: ${user.id}`);
    stdout(`App rows: ${summarizeAudit(auditRows)}`);

    if (readinessFailures.length > 0) {
      for (const failure of readinessFailures) {
        stderr(failure);
      }
      return 1;
    }

    if (missingTables.length > 0) {
      stderr(`Reviewer account is missing seeded rows in: ${missingTables.join(", ")}`);
      return 1;
    }

    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runVerifyReviewerAccount();
}
