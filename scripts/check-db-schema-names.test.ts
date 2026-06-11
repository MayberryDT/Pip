import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error The checked script is authored as executable ESM JavaScript.
import { checkDbSchemaNames } from "./check-db-schema-names.mjs";

describe("check-db-schema-names", () => {
  it("passes when runtime uses pip_cash_snapshots and migrations rename the historical table", () => {
    const cwd = createProject({
      runtimeTable: "pip_cash_snapshots",
      migrationSql: `
        create table public.free_cash_snapshots (free_cash_today_cents integer);
        alter table public.free_cash_snapshots rename to pip_cash_snapshots;
        alter table public.pip_cash_snapshots rename column free_cash_today_cents to pip_cash_today_cents;
        create policy "Users can view their Pip Cash snapshots."
        on public.pip_cash_snapshots for select to authenticated using (true);
      `,
    });

    const result = runCheck(cwd);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("DB schema name check passed.");
  });

  it("fails when runtime still references free_cash_snapshots", () => {
    const cwd = createProject({
      runtimeTable: "free_cash_snapshots",
      migrationSql: `
        create table public.free_cash_snapshots (free_cash_today_cents integer);
        alter table public.free_cash_snapshots rename to pip_cash_snapshots;
        alter table public.pip_cash_snapshots rename column free_cash_today_cents to pip_cash_today_cents;
        create policy "Users can view their Pip Cash snapshots."
        on public.pip_cash_snapshots for select to authenticated using (true);
      `,
    });

    const result = runCheck(cwd);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Runtime source must not reference free_cash_snapshots");
  });

  it("fails when migrations do not prove the historical table reaches pip_cash_snapshots", () => {
    const cwd = createProject({
      runtimeTable: "pip_cash_snapshots",
      migrationSql: `
        create table public.free_cash_snapshots (free_cash_today_cents integer);
      `,
    });

    const result = runCheck(cwd);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Migrations must rename the historical free_cash_snapshots table");
  });
});

function createProject(input: { runtimeTable: string; migrationSql: string }): string {
  const cwd = mkdtempSync(join(tmpdir(), "pip-schema-check-"));

  mkdirSync(join(cwd, "src/lib/data"), { recursive: true });
  mkdirSync(join(cwd, "supabase/migrations"), { recursive: true });
  writeFileSync(
    join(cwd, "src/lib/data/repository.ts"),
    `export const tableName = "${input.runtimeTable}";\n`,
  );
  writeFileSync(
    join(cwd, "supabase/migrations/20260610080000_rebrand.sql"),
    input.migrationSql,
  );

  return cwd;
}

function runCheck(cwd: string) {
  const output = {
    stdout: [] as string[],
    stderr: [] as string[],
  };
  const status = checkDbSchemaNames({
    cwd,
    stdout: (line: string) => output.stdout.push(line),
    stderr: (line: string) => output.stderr.push(line),
  });

  return {
    status,
    stdout: output.stdout.join("\n"),
    stderr: output.stderr.join("\n"),
  };
}
