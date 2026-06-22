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
const restrictFinancialWritesMigration = readFileSync(
  join(migrationDir, "20260621123000_restrict_financial_table_writes.sql"),
  "utf8",
);
const rlsSmokeTest = readFileSync(join(process.cwd(), "supabase/rls_smoke_test.sql"), "utf8");

describe("Supabase financial-data schema", () => {
  it("enables RLS on user-scoped financial tables", () => {
    [
      "user_settings",
      "connected_institutions",
      "accounts",
      "account_preferences",
      "savings_goals",
      "recurring_obligation_rules",
      "transactions",
      "pip_cash_snapshots",
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
      connected_institutions: ["select"],
      accounts: ["select"],
      account_preferences: ["select", "insert", "update", "delete"],
      savings_goals: ["select", "insert", "update", "delete"],
      recurring_obligation_rules: ["select", "insert", "update", "delete"],
      transactions: ["select"],
      pip_cash_snapshots: ["select"],
      sync_runs: ["select"],
      missing_card_preferences: ["select", "insert", "delete"],
      product_events: ["select", "insert", "delete"],
      data_deletion_requests: ["select", "insert"],
      agent_chat_turns: ["select", "insert"],
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

  it("removes authenticated browser writes from provider-derived financial tables", () => {
    const readOnlyTables = [
      "connected_institutions",
      "accounts",
      "transactions",
      "sync_runs",
      "pip_cash_snapshots",
    ];

    readOnlyTables.forEach((tableName) => {
      ["insert", "update", "delete"].forEach((operation) => {
        expect(normalizeSql(allMigrations)).toContain(
          normalizeSql(`revoke ${operation} on public.${tableName} from authenticated`),
        );
      });
    });
    expect(restrictFinancialWritesMigration).not.toContain("public.free_cash_snapshots");
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
    expect(allMigrations).toContain("delete from public.recurring_obligation_rules where user_id = current_user_id;");
    expect(allMigrations).toContain("delete from public.savings_goals where user_id = current_user_id;");
    expect(allMigrations).toContain("delete from public.sync_runs where user_id = current_user_id;");
    expect(allMigrations).toContain("delete from public.account_preferences where user_id = current_user_id;");
    expect(allMigrations).toContain("delete from public.transactions where user_id = current_user_id;");
    expect(allMigrations).toContain("delete from public.connected_institutions where user_id = current_user_id;");
    expect(normalizeSql(restrictFinancialWritesMigration)).toContain(
      normalizeSql(`
        create or replace function public.delete_current_user_financial_data()
        returns void
        language plpgsql
        security definer
      `),
    );
    expect(restrictFinancialWritesMigration).toContain(
      "revoke all on function public.delete_current_user_financial_data() from public, anon;",
    );
    expect(restrictFinancialWritesMigration).toContain(
      "grant execute on function public.delete_current_user_financial_data() to authenticated;",
    );
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

  it("adds server-written marketing tables without direct public policies", () => {
    [
      "marketing_waitlist",
      "marketing_events",
      "marketing_content_drafts",
    ].forEach((tableName) => {
      expect(allMigrations).toContain(`create table if not exists public.${tableName}`);
      expect(allMigrations).toContain(`alter table public.${tableName} enable row level security;`);
      expect(normalizeSql(allMigrations)).not.toContain(
        normalizeSql(`on public.${tableName} for insert to anon`),
      );
      expect(normalizeSql(allMigrations)).not.toContain(
        normalizeSql(`on public.${tableName} for insert to authenticated`),
      );
    });
    expect(allMigrations).toContain("'waitlist_signup_succeeded'");
    expect(allMigrations).toContain("'distribb_webhook_received'");
    expect(allMigrations).toContain("create table if not exists public.app_access_grants");
    expect(allMigrations).toContain("app_waitlist_requested_at timestamptz");
    expect(allMigrations).toContain("app_waitlist_request_count integer not null default 0");
    expect(allMigrations).toContain("alter table public.app_access_grants enable row level security");
    expect(allMigrations).toContain("newsletter_opt_in_at timestamptz");
    expect(allMigrations).toContain("waitlist_confirmation_reserved_at timestamptz");
    expect(allMigrations).toContain("waitlist_confirmation_sent_at timestamptz");
    expect(allMigrations).toContain("app_waitlist_confirmation_reserved_at timestamptz");
    expect(allMigrations).toContain("invite_email_reserved_at timestamptz");
    expect(allMigrations).toContain("email_suppressed_at timestamptz");
    expect(allMigrations).toContain("provider_event_id text unique");
    expect(allMigrations).toContain("create table if not exists public.email_events");
    expect(allMigrations).toContain("alter table public.email_events enable row level security");
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

  it("keeps the agent model gate service-role only", () => {
    expect(allMigrations).toContain("create table if not exists public.agent_model_gate_windows");
    expect(allMigrations).toContain("create table if not exists public.agent_model_gate_leases");
    expect(allMigrations).toContain("alter table public.agent_model_gate_windows enable row level security;");
    expect(allMigrations).toContain("alter table public.agent_model_gate_leases enable row level security;");
    expect(allMigrations).toContain(
      "revoke all on table public.agent_model_gate_windows from public, anon, authenticated;",
    );
    expect(allMigrations).toContain(
      "revoke all on table public.agent_model_gate_leases from public, anon, authenticated;",
    );
    expect(allMigrations).toContain(
      "grant execute on function public.claim_agent_model_gate(text, text, integer, integer, integer, integer, timestamptz)\nto service_role;",
    );
    expect(allMigrations).toContain(
      "grant execute on function public.release_agent_model_gate(uuid, timestamptz)\nto service_role;",
    );
    expect(normalizeSql(allMigrations)).not.toContain(
      normalizeSql("grant execute on function public.claim_agent_model_gate(text, text, integer, integer, integer, integer, timestamptz) to authenticated"),
    );
    expect(normalizeSql(allMigrations)).not.toContain(
      normalizeSql("grant execute on function public.claim_agent_model_gate(text, text, integer, integer, integer, integer, timestamptz) to anon"),
    );
    expect(normalizeSql(allMigrations)).not.toContain(
      normalizeSql("grant execute on function public.release_agent_model_gate(uuid, timestamptz) to authenticated"),
    );
    expect(normalizeSql(allMigrations)).not.toContain(
      normalizeSql("grant execute on function public.release_agent_model_gate(uuid, timestamptz) to anon"),
    );
  });

  it("keeps the agent chat purge function service-role only", () => {
    expect(allMigrations).toContain("create or replace function public.purge_agent_chat_turns");
    expect(normalizeSql(allMigrations)).toContain(
      normalizeSql(`
        create or replace function public.purge_agent_chat_turns(p_retention_days integer default 30)
        returns integer
        language plpgsql
        security definer
      `),
    );
    expect(allMigrations).toContain(
      "revoke all on function public.purge_agent_chat_turns(integer) from public, anon, authenticated;",
    );
    expect(allMigrations).toContain(
      "grant execute on function public.purge_agent_chat_turns(integer) to service_role;",
    );
    expect(normalizeSql(allMigrations)).not.toContain(
      normalizeSql("grant execute on function public.purge_agent_chat_turns(integer) to authenticated"),
    );
    expect(normalizeSql(allMigrations)).not.toContain(
      normalizeSql("grant execute on function public.purge_agent_chat_turns(integer) to anon"),
    );
  });

  it("keeps account deletion saga records service-role only", () => {
    expect(allMigrations).toContain("create type public.account_deletion_request_status as enum");
    expect(allMigrations).toContain("create table if not exists public.account_deletion_requests");
    expect(allMigrations).toContain("user_id uuid not null");
    expect(allMigrations).toContain("status public.account_deletion_request_status not null default 'requested'");
    expect(allMigrations).toContain("last_error_code text");
    expect(allMigrations).toContain("data_deleted_at timestamptz");
    expect(allMigrations).toContain("auth_deleted_at timestamptz");
    expect(allMigrations).toContain("completed_at timestamptz");
    expect(allMigrations).toContain("unique (user_id)");
    expect(allMigrations).toContain("alter table public.account_deletion_requests enable row level security;");
    expect(allMigrations).toContain(
      "revoke all on table public.account_deletion_requests from public, anon, authenticated;",
    );
    expect(allMigrations).toContain(
      "grant select, insert, update, delete on public.account_deletion_requests to service_role;",
    );
    expect(normalizeSql(allMigrations)).not.toContain(
      normalizeSql("on public.account_deletion_requests for select to authenticated"),
    );
  });

  it("indexes foreign keys that beta sync and account joins use", () => {
    [
      "create index if not exists accounts_institution_id_idx on public.accounts(institution_id);",
      "create index if not exists beta_invites_accepted_by_user_id_idx on public.beta_invites(accepted_by_user_id);",
      "create index if not exists pip_cash_snapshots_source_sync_run_id_idx on public.pip_cash_snapshots(source_sync_run_id);",
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
      "account_preferences",
      "savings_goals",
      "transactions",
      "sync_runs",
      "pip_cash_snapshots",
      "missing_card_preferences",
      "product_events",
      "data_deletion_requests",
    ].forEach((tableName) => {
      expect(normalizedSmokeTest).toContain(`public.${tableName}`);
      expect(normalizedSmokeTest).toContain(`visible_${tableName}`);
    });

    expect(normalizedSmokeTest).toContain("attempted_cross_user_account_update");
    expect(normalizedSmokeTest).toContain("attempted_cross_user_savings_goal_update");
    expect(normalizedSmokeTest).toContain("attempted_cross_user_transaction_delete");
    expect(normalizedSmokeTest).toContain("attempted_cross_user_event_delete");
    expect(normalizedSmokeTest).toContain("visible_other_user_accounts");
    expect(normalizedSmokeTest).toContain("visible_other_user_savings_goals");
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
