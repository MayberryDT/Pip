import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = join(process.cwd(), "supabase/migrations");
const migration = readFileSync(
  join(migrationDir, "20260605000000_free_cash_foundation.sql"),
  "utf8",
);
const allMigrations = readdirSync(migrationDir)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => readFileSync(join(migrationDir, fileName), "utf8"))
  .join("\n");
const restrictBetaRpcMigration = readFileSync(
  join(migrationDir, "20260606003800_restrict_beta_invite_rpcs.sql"),
  "utf8",
);
const rlsSmokeTest = readFileSync(join(process.cwd(), "supabase/rls_smoke_test.sql"), "utf8");

describe("Supabase financial-data schema", () => {
  it("enables RLS on user-scoped financial tables", () => {
    [
      "user_settings",
      "connected_institutions",
      "accounts",
      "transactions",
      "free_cash_snapshots",
      "sync_runs",
      "missing_card_preferences",
      "product_events",
      "data_deletion_requests",
    ].forEach((tableName) => {
      expect(allMigrations).toContain(`alter table public.${tableName} enable row level security;`);
      expect(allMigrations).toContain(`on public.${tableName}`);
    });
  });

  it("defines owner-scoped policies for every user-owned financial table operation used by the app", () => {
    const policyMatrix = {
      user_settings: ["select", "insert", "update", "delete"],
      connected_institutions: ["select", "insert", "update", "delete"],
      accounts: ["select", "insert", "update", "delete"],
      transactions: ["select", "insert", "update", "delete"],
      free_cash_snapshots: ["select", "insert", "update", "delete"],
      sync_runs: ["select", "insert", "update", "delete"],
      missing_card_preferences: ["select", "insert", "delete"],
      product_events: ["select", "insert", "delete"],
      data_deletion_requests: ["select", "insert"],
    };

    Object.entries(policyMatrix).forEach(([tableName, operations]) => {
      operations.forEach((operation) => {
        expect(normalizeSql(allMigrations)).toContain(
          normalizeSql(`on public.${tableName} for ${operation} to authenticated`),
        );
        expect(getPolicyBlock(tableName, operation)).toContain(
          "((select auth.uid()) = user_id)",
        );
      });
    });
  });

  it("keeps provider credentials in a private service-role-only schema", () => {
    expect(migration).toContain("create schema if not exists private;");
    expect(migration).toContain("create table private.provider_credentials");
    expect(migration).toContain(
      "institution_id uuid primary key references public.connected_institutions(id) on delete cascade",
    );
    expect(migration).toContain("user_id uuid not null references auth.users(id) on delete cascade");
    expect(migration).toContain("revoke all on schema private from anon, authenticated;");
    expect(migration).toContain("to service_role");
    expect(allMigrations).toContain("grant usage on schema private to service_role;");
    expect(allMigrations).toContain(
      "grant select, insert, update, delete on private.provider_credentials to service_role;",
    );
    expect(migration).not.toContain("on private.provider_credentials\nfor all\nto authenticated");
    expect(allMigrations).not.toContain("grant select on private.provider_credentials to authenticated");
  });

  it("uses auth.uid policies for user-owned rows", () => {
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("using ((select auth.uid()) = user_id)");
    expect(migration).toContain("with check ((select auth.uid()) = user_id)");
  });

  it("creates the authenticated delete-data function required before beta", () => {
    expect(migration).toContain("create or replace function public.delete_current_user_financial_data()");
    expect(allMigrations).toContain("grant execute on function public.delete_current_user_financial_data() to authenticated;");
    expect(allMigrations).toContain("delete from public.product_events where user_id = current_user_id;");
    expect(allMigrations).toContain("delete from public.sync_runs where user_id = current_user_id;");
    expect(allMigrations).toContain("delete from public.transactions where user_id = current_user_id;");
    expect(allMigrations).toContain("delete from public.connected_institutions where user_id = current_user_id;");
    expect(migration).toContain(
      "institution_id uuid primary key references public.connected_institutions(id) on delete cascade",
    );
    expect(normalizeSql(allMigrations)).toContain(
      normalizeSql("on public.product_events for delete to authenticated using ((select auth.uid()) = user_id);"),
    );
    expect(normalizeSql(allMigrations)).toContain(
      normalizeSql("on public.sync_runs for delete to authenticated using ((select auth.uid()) = user_id);"),
    );
  });

  it("keeps legacy beta invite data private while runtime signup stays open", () => {
    expect(migration).toContain("create table public.beta_invites");
    expect(migration).toContain("email text not null unique");
    expect(migration).toContain("accepted_by_user_id uuid references auth.users(id) on delete set null");
    expect(migration).toContain("Users can view their accepted invite.");
    expect(restrictBetaRpcMigration).toContain(
      "revoke all on function public.is_beta_invited(text) from public, anon, authenticated;",
    );
    expect(restrictBetaRpcMigration).toContain(
      "revoke all on function public.accept_current_user_invite() from public, anon, authenticated;",
    );
  });

  it("creates sync logs and stale connection fields for provider operations", () => {
    expect(migration).toContain("create table public.sync_runs");
    expect(allMigrations).toContain("alter type public.sync_status add value if not exists 'partial';");
    expect(migration).toContain("duration_ms integer");
    expect(migration).toContain("account_count integer not null default 0");
    expect(migration).toContain("transaction_count integer not null default 0");
    expect(migration).toContain("last_successful_sync_at timestamptz");
    expect(migration).toContain("stale_after timestamptz");
  });

  it("indexes foreign keys that beta sync and account joins use", () => {
    [
      "create index if not exists accounts_institution_id_idx on public.accounts(institution_id);",
      "create index if not exists beta_invites_accepted_by_user_id_idx on public.beta_invites(accepted_by_user_id);",
      "create index if not exists free_cash_snapshots_source_sync_run_id_idx on public.free_cash_snapshots(source_sync_run_id);",
      "create index if not exists sync_runs_institution_id_idx on public.sync_runs(institution_id);",
    ].forEach((statement) => {
      expect(normalizeSql(allMigrations)).toContain(normalizeSql(statement));
    });
  });

  it("keeps a rollback-only RLS smoke test for cross-user financial-data isolation", () => {
    const normalizedSmokeTest = normalizeSql(rlsSmokeTest);

    expect(normalizedSmokeTest).toContain("begin;");
    expect(normalizedSmokeTest).toContain("rollback;");
    expect(normalizedSmokeTest).toContain("set local role authenticated;");
    expect(normalizedSmokeTest).toContain("set local request.jwt.claim.sub");
    expect(normalizedSmokeTest).not.toContain("commit;");

    [
      "user_settings",
      "connected_institutions",
      "accounts",
      "transactions",
      "sync_runs",
      "free_cash_snapshots",
      "missing_card_preferences",
      "product_events",
      "data_deletion_requests",
    ].forEach((tableName) => {
      expect(normalizedSmokeTest).toContain(`public.${tableName}`);
      expect(normalizedSmokeTest).toContain(`visible_${tableName}`);
    });

    expect(normalizedSmokeTest).toContain("attempted_cross_user_account_update");
    expect(normalizedSmokeTest).toContain("attempted_cross_user_transaction_delete");
    expect(normalizedSmokeTest).toContain("attempted_cross_user_event_delete");
    expect(normalizedSmokeTest).toContain("visible_other_user_accounts");
    expect(normalizedSmokeTest).toContain("visible_other_user_transactions");
  });
});

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function getPolicyBlock(tableName: string, operation: string): string {
  const normalized = normalizeSql(allMigrations);
  const block = normalized
    .split("create policy ")
    .find((candidate) =>
      candidate.includes(`on public.${tableName} for ${operation} to authenticated`),
    );

  if (!block) {
    throw new Error(`Missing ${operation} policy for ${tableName}.`);
  }

  return block;
}
