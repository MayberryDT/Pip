#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeRoots = ["src/app", "src/components", "src/lib"];
const migrationDir = "supabase/migrations";

export function checkDbSchemaNames({
  cwd = process.cwd(),
  stdout = console.log,
  stderr = console.error,
  skipWhenProjectFilesMissing = false,
} = {}) {
  const errors = [];
  const migrationsPath = join(cwd, migrationDir);

  if (!existsSync(migrationsPath)) {
    if (skipWhenProjectFilesMissing) {
      return 0;
    }

    errors.push(`Missing migrations directory: ${migrationDir}`);
    return finish(errors, stdout, stderr);
  }

  const runtimeFiles = runtimeRoots
    .map((root) => join(cwd, root))
    .filter((path) => existsSync(path))
    .flatMap((root) => listFiles(root))
    .filter((path) => isRuntimeSource(path));

  if (runtimeFiles.length === 0 && skipWhenProjectFilesMissing) {
    return 0;
  }

  const runtimeMatches = searchFiles(runtimeFiles, ["free_cash_snapshots", "pip_cash_snapshots"]);
  const freeRuntimeMatches = runtimeMatches.filter((match) => match.text.includes("free_cash_snapshots"));
  const pipRuntimeMatches = runtimeMatches.filter((match) => match.text.includes("pip_cash_snapshots"));

  if (freeRuntimeMatches.length > 0) {
    errors.push("Runtime source must not reference free_cash_snapshots:");
    freeRuntimeMatches.forEach((match) => errors.push(`  - ${formatMatch(cwd, match)}`));
  }

  if (pipRuntimeMatches.length === 0) {
    errors.push("Runtime source must reference pip_cash_snapshots for cached Spendable Cash Today snapshots.");
  }

  const migrationFiles = readdirSync(migrationsPath)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => join(migrationsPath, fileName));
  const migrations = migrationFiles
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const normalizedMigrations = normalizeSql(migrations);

  if (!normalizedMigrations.includes("rename to pip_cash_snapshots")) {
    errors.push("Migrations must rename the historical free_cash_snapshots table to pip_cash_snapshots.");
  }

  if (!normalizedMigrations.includes("rename column free_cash_today_cents to pip_cash_today_cents")) {
    errors.push("Migrations must rename free_cash_today_cents to pip_cash_today_cents.");
  }

  if (
    normalizedMigrations.includes("public.free_cash_snapshots") &&
    !normalizedMigrations.includes("public.free_cash_snapshots or public.pip_cash_snapshots") &&
    !normalizedMigrations.includes("rename to pip_cash_snapshots")
  ) {
    errors.push("Historical free_cash_snapshots migration references need a later pip_cash_snapshots rename.");
  }

  if (!normalizedMigrations.includes("on public.pip_cash_snapshots")) {
    errors.push("Migrations must define policies or indexes against public.pip_cash_snapshots.");
  }

  return finish(errors, stdout, stderr);
}

function finish(errors, stdout, stderr) {
  if (errors.length > 0) {
    stderr("DB schema name check failed.");
    errors.forEach((error) => stderr(`- ${error}`));
    return 1;
  }

  stdout("DB schema name check passed.");
  return 0;
}

function listFiles(path) {
  const stat = statSync(path);

  if (stat.isFile()) {
    return [path];
  }

  return readdirSync(path)
    .flatMap((entry) => listFiles(join(path, entry)));
}

function isRuntimeSource(path) {
  return (
    /\.(ts|tsx|js|jsx|mjs)$/.test(path) &&
    !/\.test\.(ts|tsx|js|jsx|mjs)$/.test(path)
  );
}

function searchFiles(files, needles) {
  return files.flatMap((path) => {
    const lines = readFileSync(path, "utf8").split(/\r?\n/);

    return lines.flatMap((text, index) =>
      needles.some((needle) => text.includes(needle))
        ? [{ path, line: index + 1, text: text.trim() }]
        : [],
    );
  });
}

function formatMatch(cwd, match) {
  return `${relative(cwd, match.path)}:${match.line}: ${match.text}`;
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = checkDbSchemaNames();
}
