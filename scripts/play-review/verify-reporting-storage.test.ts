// @ts-nocheck
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  evaluateReportingStorageReadiness,
  getReportingStorageWarnings,
  parseSupabaseQueryJson,
  queryReportingStorageReadiness,
  requiredReportingTables,
  runVerifyReportingStorage,
} from "./verify-reporting-storage.mjs";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_DB_URL: "postgresql://postgres.example.test",
};

describe("verify-reporting-storage", () => {
  it("passes when migration, tables, RLS, grants, policies, and REST schema are ready", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const queryReadiness = vi.fn(async () => readyRows());
    const checkRestSchema = vi.fn(async () => undefined);

    await expect(
      runVerifyReportingStorage({
        env: { ...env },
        stdout: (line: string) => stdout.push(line),
        stderr: (line: string) => stderr.push(line),
        queryReadiness,
        checkRestSchema,
      }),
    ).resolves.toBe(0);

    expect(queryReadiness).toHaveBeenCalled();
    expect(checkRestSchema).toHaveBeenCalled();
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("Verified reporting storage");
  });

  it("fails clearly when reporting tables are missing", () => {
    const rows = readyRows({
      table_exists: false,
    });

    expect(evaluateReportingStorageReadiness(rows)).toEqual([
      "Missing public.ai_response_reports.",
      "Missing public.tester_feedback.",
    ]);
  });

  it("fails clearly when the reporting migration is missing", () => {
    const rows = readyRows({
      local_migration_applied: false,
      connector_migration_present: false,
      migration_applied: false,
    });

    expect(evaluateReportingStorageReadiness(rows)).toContain(
      "Migration 20260617200754 or play_store_preproduction_readiness is not recorded.",
    );
  });

  it("fails clearly when the deletion RPC is missing", () => {
    const rows = readyRows({
      deletion_rpc_exists: false,
    });

    expect(evaluateReportingStorageReadiness(rows)).toContain(
      "Missing public.delete_current_user_financial_data().",
    );
  });

  it("fails clearly on RLS, grant, and owner insert policy gaps", () => {
    const rows = readyRows({
      rls_enabled: false,
      authenticated_can_insert: false,
      has_owner_insert_policy: false,
    });

    expect(evaluateReportingStorageReadiness(rows)).toEqual([
      "RLS is not enabled on public.ai_response_reports.",
      "authenticated cannot insert into public.ai_response_reports.",
      "public.ai_response_reports is missing an auth.uid() = user_id insert policy.",
      "RLS is not enabled on public.tester_feedback.",
      "authenticated cannot insert into public.tester_feedback.",
      "public.tester_feedback is missing an auth.uid() = user_id insert policy.",
    ]);
  });

  it("fails when the REST schema-cache check cannot see a reporting table", async () => {
    const stderr: string[] = [];

    await expect(
      runVerifyReportingStorage({
        env: { ...env },
        stdout: () => undefined,
        stderr: (line: string) => stderr.push(line),
        queryReadiness: async () => readyRows(),
        checkRestSchema: async () => {
          throw new Error("REST schema check failed for public.ai_response_reports: table not found");
        },
      }),
    ).resolves.toBe(1);

    expect(stderr).toEqual([
      "REST schema check failed for public.ai_response_reports: table not found",
    ]);
  });

  it("warns when Supabase connector history has the migration by name but not local version", () => {
    const rows = readyRows({
      local_migration_applied: false,
      connector_migration_present: true,
      migration_applied: true,
    });

    expect(evaluateReportingStorageReadiness(rows)).toEqual([]);
    expect(getReportingStorageWarnings(rows)).toEqual([
      "Migration is recorded by name (play_store_preproduction_readiness) but not by local version 20260617200754.",
    ]);
  });

  it("queries Supabase CLI with a direct DB URL and parses JSON output", async () => {
    const execFile = vi.fn(() => JSON.stringify([
      {
        readiness: {
          localMigrationApplied: true,
          connectorMigrationPresent: false,
          deletionRpcExists: true,
          tables: readyRows().map(({ local_migration_applied, connector_migration_present, migration_applied, ...row }) => row),
        },
      },
    ]));

    await expect(
      queryReportingStorageReadiness({
        env: { ...env },
        execFile,
      }),
    ).resolves.toEqual(readyRows());

    expect(execFile).toHaveBeenCalledWith(
      "supabase",
      expect.arrayContaining(["db", "query", "--db-url", env.SUPABASE_DB_URL, "--output", "json"]),
      expect.any(Object),
    );
  });

  it("parses supported Supabase CLI JSON shapes", () => {
    expect(parseSupabaseQueryJson(JSON.stringify([{ x: 1 }]))).toEqual([{ x: 1 }]);
    expect(parseSupabaseQueryJson(JSON.stringify({ data: [{ x: 1 }] }))).toEqual([{ x: 1 }]);
    expect(parseSupabaseQueryJson(JSON.stringify({ result: [{ x: 1 }] }))).toEqual([{ x: 1 }]);
  });

  it("exposes a package script for Play reporting verification", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));

    expect(packageJson.scripts["play:reporting:verify"]).toBe(
      "node scripts/play-review/verify-reporting-storage.mjs",
    );
  });
});

function readyRows(overrides: Partial<Record<string, boolean>> = {}): Array<Record<string, boolean | string>> {
  return requiredReportingTables.map((table: string) => ({
    table_name: table,
    table_exists: true,
    rls_enabled: true,
    authenticated_can_select: true,
    authenticated_can_insert: true,
    authenticated_can_delete: true,
    has_owner_insert_policy: true,
    local_migration_applied: true,
    connector_migration_present: false,
    migration_applied: true,
    deletion_rpc_exists: true,
    ...overrides,
  }));
}
