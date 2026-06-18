#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import {
  auditUserAppData,
  createSupabaseAdminFromEnv,
  findUserByEmail,
  loadEnvFiles,
  parseArgs,
  summarizeAudit,
} from "../play-review/play-review-lib.mjs";

export async function runAuditUserData({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  try {
    loadEnvFiles({ env });
    const args = parseArgs(argv);
    const email = getRequiredEmail(args);
    const admin = createSupabaseAdminFromEnv(env);
    const user = await findUserByEmail(admin, email);

    if (!user) {
      stderr(`No Supabase auth user found for ${email}.`);
      return 1;
    }

    const rows = await auditUserAppData(admin, user.id);
    stdout(`User id: ${user.id}`);
    stdout(`Total user-scoped app rows: ${summarizeAudit(rows)}`);

    for (const row of rows) {
      stdout(`${row.table}: ${row.count}`);
    }

    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function getRequiredEmail(args) {
  const email = String(args.email ?? "").trim().toLowerCase();

  if (!email) {
    throw new Error("Pass --email=user@example.com.");
  }

  return email;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runAuditUserData();
}
