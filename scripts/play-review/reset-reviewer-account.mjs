#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import {
  auditUserAppData,
  createSupabaseAdminFromEnv,
  ensureReviewerUser,
  getReviewerEmail,
  getReviewerPassword,
  loadEnvFiles,
  parseArgs,
  seedReviewerAppData,
  summarizeAudit,
} from "./play-review-lib.mjs";

export async function runResetReviewerAccount({
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
    const password = getReviewerPassword(args, env);
    const user = await ensureReviewerUser(admin, {
      email,
      password,
    });

    await seedReviewerAppData(admin, user.id);

    const auditRows = await auditUserAppData(admin, user.id);
    stdout(`Reset Play reviewer account: ${email}`);
    stdout(`User id: ${user.id}`);
    stdout(`Seeded app rows: ${summarizeAudit(auditRows)}`);
    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runResetReviewerAccount();
}
