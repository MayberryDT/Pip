#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import {
  auditUserAppData,
  createSupabaseAdminFromEnv,
  deleteAuthUser,
  deleteUserAppData,
  findUserByEmail,
  loadEnvFiles,
  parseArgs,
  summarizeAudit,
} from "../play-review/play-review-lib.mjs";

export async function runDeleteUserData({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  try {
    loadEnvFiles({ env });
    const args = parseArgs(argv);
    const email = getRequiredEmail(args);

    if (args.confirm !== "DELETE") {
      throw new Error("Pass --confirm=DELETE to delete user data.");
    }

    const admin = createSupabaseAdminFromEnv(env);
    const user = await findUserByEmail(admin, email);

    if (!user) {
      stderr(`No Supabase auth user found for ${email}.`);
      return 1;
    }

    const beforeRows = await auditUserAppData(admin, user.id);
    await deleteUserAppData(admin, user.id);
    await deleteAuthUser(admin, user.id);

    stdout(`Deleted app data and auth user for ${email}.`);
    stdout(`Deleted user id: ${user.id}`);
    stdout(`User-scoped app rows before deletion: ${summarizeAudit(beforeRows)}`);
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
  process.exitCode = await runDeleteUserData();
}
