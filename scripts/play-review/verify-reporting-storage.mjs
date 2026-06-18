#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createSupabaseAdminFromEnv,
  loadEnvFiles,
} from "./play-review-lib.mjs";

export const requiredReportingTables = ["ai_response_reports", "tester_feedback"];
export const localReportingMigrationVersion = "20260617200754";
export const reportingMigrationName = "play_store_preproduction_readiness";

export function getReportingStorageReadinessSql() {
  return `
with required_tables(table_name) as (
  values ('ai_response_reports'), ('tester_feedback')
),
table_state as (
  select
    required_tables.table_name,
    pg_class.oid is not null as table_exists,
    coalesce(pg_class.relrowsecurity, false) as rls_enabled
  from required_tables
  left join pg_namespace
    on pg_namespace.nspname = 'public'
  left join pg_class
    on pg_class.relnamespace = pg_namespace.oid
   and pg_class.relname = required_tables.table_name
),
table_grants as (
  select
    table_name,
    has_table_privilege('authenticated', format('public.%I', table_name), 'select') as authenticated_can_select,
    has_table_privilege('authenticated', format('public.%I', table_name), 'insert') as authenticated_can_insert,
    has_table_privilege('authenticated', format('public.%I', table_name), 'delete') as authenticated_can_delete
  from required_tables
),
insert_policies as (
  select
    tablename as table_name,
    bool_or(
      cmd = 'INSERT'
      and roles @> array['authenticated']::name[]
      and coalesce(with_check, '') ilike '%auth.uid%'
      and coalesce(with_check, '') ilike '%user_id%'
    ) as has_owner_insert_policy
  from pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from required_tables)
  group by tablename
),
migration_state as (
  select
    exists(
      select 1
      from supabase_migrations.schema_migrations
      where version = '${localReportingMigrationVersion}'
    ) as local_migration_applied,
    exists(
      select 1
      from supabase_migrations.schema_migrations
      where name = '${reportingMigrationName}'
    ) as connector_migration_present
)
select jsonb_build_object(
  'localMigrationApplied', migration_state.local_migration_applied,
  'connectorMigrationPresent', migration_state.connector_migration_present,
  'tables', jsonb_agg(
    jsonb_build_object(
      'table_name', table_state.table_name,
      'table_exists', table_state.table_exists,
      'rls_enabled', table_state.rls_enabled,
      'authenticated_can_select', table_grants.authenticated_can_select,
      'authenticated_can_insert', table_grants.authenticated_can_insert,
      'authenticated_can_delete', table_grants.authenticated_can_delete,
      'has_owner_insert_policy', coalesce(insert_policies.has_owner_insert_policy, false)
    )
    order by table_state.table_name
  )
) as readiness
from table_state
join table_grants using (table_name)
left join insert_policies using (table_name)
cross join migration_state
group by migration_state.local_migration_applied, migration_state.connector_migration_present;
`.trim();
}

export async function queryReportingStorageReadiness({
  env = process.env,
  execFile = execFileSync,
} = {}) {
  const dbUrl = env.SUPABASE_DB_URL ?? env.SUPABASE_DIRECT_DATABASE_URL ?? env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error(
      "Set SUPABASE_DB_URL, SUPABASE_DIRECT_DATABASE_URL, or DATABASE_URL to run reporting storage metadata checks.",
    );
  }

  try {
    const output = execFile(
      "supabase",
      ["db", "query", "--db-url", dbUrl, "--output", "json", getReportingStorageReadinessSql()],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    return normalizeReadinessRows(parseSupabaseQueryJson(output));
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error
      ? String(error.stderr ?? "").trim()
      : "";
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`Supabase reporting storage query failed: ${stderr || message}`);
  }
}

export function parseSupabaseQueryJson(output) {
  const parsed = JSON.parse(String(output || "[]"));

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.data)) {
      return parsed.data;
    }

    if (Array.isArray(parsed.result)) {
      return parsed.result;
    }
  }

  return [parsed];
}

export function normalizeReadinessRows(value) {
  if (Array.isArray(value) && value.length === 1 && value[0]?.readiness) {
    return normalizeReadinessRows(value[0].readiness);
  }

  if (value?.tables && Array.isArray(value.tables)) {
    const localMigrationApplied = toBoolean(value.localMigrationApplied);
    const connectorMigrationPresent = toBoolean(value.connectorMigrationPresent);
    const migrationApplied = localMigrationApplied || connectorMigrationPresent;

    return value.tables.map((row) => ({
      ...row,
      local_migration_applied: localMigrationApplied,
      connector_migration_present: connectorMigrationPresent,
      migration_applied: migrationApplied,
    }));
  }

  if (Array.isArray(value)) {
    return value.map((row) => {
      const localMigrationApplied = toBoolean(
        row.local_migration_applied ?? row.localMigrationApplied,
      );
      const connectorMigrationPresent = toBoolean(
        row.connector_migration_present ?? row.connectorMigrationPresent,
      );
      const migrationApplied = toBoolean(row.migration_applied ?? row.migrationApplied)
        || localMigrationApplied
        || connectorMigrationPresent;

      return {
        ...row,
        local_migration_applied: localMigrationApplied,
        connector_migration_present: connectorMigrationPresent,
        migration_applied: migrationApplied,
      };
    });
  }

  return [];
}

export function evaluateReportingStorageReadiness(readinessRows) {
  const rows = normalizeReadinessRows(readinessRows);
  const failures = [];
  const migrationApplied = rows.some((row) => toBoolean(row.migration_applied));

  if (!migrationApplied) {
    failures.push(
      `Migration ${localReportingMigrationVersion} or ${reportingMigrationName} is not recorded.`,
    );
  }

  for (const table of requiredReportingTables) {
    const row = rows.find((item) => item.table_name === table || item.tableName === table);

    if (!row) {
      failures.push(`Missing readiness result for public.${table}.`);
      continue;
    }

    if (!toBoolean(row.table_exists ?? row.tableExists)) {
      failures.push(`Missing public.${table}.`);
      continue;
    }

    if (!toBoolean(row.rls_enabled ?? row.rlsEnabled)) {
      failures.push(`RLS is not enabled on public.${table}.`);
    }

    if (!toBoolean(row.authenticated_can_select ?? row.authenticatedCanSelect)) {
      failures.push(`authenticated cannot select from public.${table}.`);
    }

    if (!toBoolean(row.authenticated_can_insert ?? row.authenticatedCanInsert)) {
      failures.push(`authenticated cannot insert into public.${table}.`);
    }

    if (!toBoolean(row.authenticated_can_delete ?? row.authenticatedCanDelete)) {
      failures.push(`authenticated cannot delete from public.${table}.`);
    }

    if (!toBoolean(row.has_owner_insert_policy ?? row.hasOwnerInsertPolicy)) {
      failures.push(`public.${table} is missing an auth.uid() = user_id insert policy.`);
    }
  }

  return failures;
}

export function getReportingStorageWarnings(readinessRows) {
  const rows = normalizeReadinessRows(readinessRows);

  if (
    rows.some((row) => toBoolean(row.connector_migration_present))
    && rows.every((row) => !toBoolean(row.local_migration_applied))
  ) {
    return [
      `Migration is recorded by name (${reportingMigrationName}) but not by local version ${localReportingMigrationVersion}.`,
    ];
  }

  return [];
}

export async function checkReportingRestSchema(admin, {
  tables = requiredReportingTables,
} = {}) {
  for (const table of tables) {
    const { error } = await admin
      .from(table)
      .select("id", { head: true, count: "exact" });

    if (error) {
      throw new Error(
        `REST schema check failed for public.${table}: ${error.message ?? error.code ?? String(error)}`,
      );
    }
  }
}

export async function runVerifyReportingStorage({
  env = process.env,
  stdout = console.log,
  stderr = console.error,
  queryReadiness = queryReportingStorageReadiness,
  checkRestSchema = checkReportingRestSchema,
} = {}) {
  try {
    loadEnvFiles({ env });
    const admin = createSupabaseAdminFromEnv(env);
    const readinessRows = await queryReadiness({ env });
    const failures = evaluateReportingStorageReadiness(readinessRows);

    if (failures.length > 0) {
      stderr("Reporting storage is not ready:");
      for (const failure of failures) {
        stderr(`- ${failure}`);
      }

      return 1;
    }

    await checkRestSchema(admin);

    stdout(`Verified reporting storage: ${requiredReportingTables.join(", ")}.`);
    for (const warning of getReportingStorageWarnings(readinessRows)) {
      stdout(`Warning: ${warning}`);
    }

    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function toBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runVerifyReportingStorage();
}
