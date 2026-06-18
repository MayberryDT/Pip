import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

export const defaultPlayReviewerEmail = "play-review@animasai.co";
export const defaultPlayDeleteTestEmail = "play-delete-test@animasai.co";

const userScopedTables = [
  "ai_response_reports",
  "tester_feedback",
  "plaid_webhook_events",
  "pip_reaction_events",
  "pip_sync_jobs",
  "agent_chat_turns",
  "product_events",
  "pip_cash_snapshots",
  "sync_runs",
  "missing_card_preferences",
  "account_preferences",
  "transactions",
  "accounts",
  "connected_institutions",
  "user_settings",
  "data_deletion_requests",
];

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (const arg of argv) {
    const [rawKey, ...valueParts] = arg.replace(/^--/, "").split("=");
    args[rawKey] = valueParts.length > 0 ? valueParts.join("=") : "true";
  }

  return args;
}

export function loadEnvFiles({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  for (const fileName of [".env", ".env.local"]) {
    const path = resolve(cwd, fileName);

    if (!existsSync(path)) {
      continue;
    }

    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

      if (!match || env[match[1]] !== undefined) {
        continue;
      }

      env[match[1]] = stripQuotes(match[2].trim());
    }
  }

  return env;
}

export function createSupabaseAdminFromEnv(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getReviewerEmail(args, env = process.env) {
  return String(args.email ?? env.PIP_PLAY_REVIEWER_EMAIL ?? defaultPlayReviewerEmail)
    .trim()
    .toLowerCase();
}

export function getReviewerPassword(args, env = process.env) {
  const password = String(args.password ?? env.PIP_PLAY_REVIEWER_PASSWORD ?? "").trim();

  if (!password) {
    throw new Error("Set PIP_PLAY_REVIEWER_PASSWORD or pass --password=...");
  }

  return password;
}

export async function findUserByEmail(admin, email) {
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;

  while (page < 100) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw error;
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);

    if (match || data.users.length < 1000) {
      return match ?? null;
    }

    page += 1;
  }

  return null;
}

export async function ensureReviewerUser(admin, {
  email,
  password,
}) {
  const existing = await findUserByEmail(admin, email);

  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        ...(existing.user_metadata ?? {}),
        playReviewer: true,
      },
    });

    if (error) {
      throw error;
    }

    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      playReviewer: true,
    },
  });

  if (error) {
    throw error;
  }

  return data.user;
}

export async function seedReviewerAppData(admin, userId) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  await deleteUserAppData(admin, userId);
  await expectNoError(
    admin.from("user_settings").upsert({
      user_id: userId,
      protected_savings_monthly_cents: 20000,
      manual_refresh_only: true,
      privacy_consent_at: now.toISOString(),
      updated_at: now.toISOString(),
    }),
  );

  const institution = await expectSingle(
    admin
      .from("connected_institutions")
      .insert({
        user_id: userId,
        provider: "plaid",
        institution_name: "Play Review Bank",
        provider_institution_id: "play-review-bank",
        status: "connected",
        last_successful_sync_at: now.toISOString(),
        stale_after: new Date(now.getTime() + 86_400_000).toISOString(),
      })
      .select("id")
      .single(),
  );

  const accounts = await expectRows(
    admin
      .from("accounts")
      .insert([
        {
          user_id: userId,
          institution_id: institution.id,
          provider_account_id: "play-review-checking",
          name: "Play Review Checking",
          institution_name: "Play Review Bank",
          kind: "checking",
          balance_cents: 64200,
          available_balance_cents: 61200,
          last_four: "1012",
          is_protected_savings: false,
          raw_provider_data: {
            seededFor: "play-review",
          },
        },
        {
          user_id: userId,
          institution_id: institution.id,
          provider_account_id: "play-review-savings",
          name: "Protected Savings",
          institution_name: "Play Review Bank",
          kind: "savings",
          balance_cents: 37500,
          available_balance_cents: 37500,
          last_four: "7711",
          is_protected_savings: true,
          raw_provider_data: {
            seededFor: "play-review",
          },
        },
        {
          user_id: userId,
          institution_id: institution.id,
          provider_account_id: "play-review-card",
          name: "Everyday Card",
          institution_name: "Play Review Bank",
          kind: "credit_card",
          balance_cents: -18420,
          available_balance_cents: 281580,
          last_four: "2448",
          is_protected_savings: false,
          raw_provider_data: {
            seededFor: "play-review",
          },
        },
      ])
      .select("id, provider_account_id"),
  );
  const checking = accounts.find((account) => account.provider_account_id === "play-review-checking");

  if (!checking) {
    throw new Error("Seed failed to create the checking account.");
  }

  await expectNoError(
    admin.from("transactions").insert([
      {
        user_id: userId,
        account_id: checking.id,
        provider_transaction_id: "play-review-payroll",
        date: yesterday,
        description: "Payroll deposit",
        merchant_name: "Employer",
        amount_cents: 125000,
        category: "income",
        kind: "income",
        pending: false,
        metadata: {},
        raw_provider_data: {},
      },
      {
        user_id: userId,
        account_id: checking.id,
        provider_transaction_id: "play-review-card-payment",
        date: today,
        description: "Everyday Card payment",
        merchant_name: "Everyday Card",
        amount_cents: -18420,
        category: "credit card payment",
        kind: "credit_card_payment",
        pending: false,
        metadata: {
          issuerName: "Everyday Card",
          matchedConnectedCard: true,
        },
        raw_provider_data: {},
      },
      {
        user_id: userId,
        account_id: checking.id,
        provider_transaction_id: "play-review-grocery",
        date: today,
        description: "Grocery Market",
        merchant_name: "Grocery Market",
        amount_cents: -3842,
        category: "groceries",
        kind: "purchase",
        pending: false,
        metadata: {},
        raw_provider_data: {},
      },
      {
        user_id: userId,
        account_id: checking.id,
        provider_transaction_id: "play-review-rent",
        date: today,
        description: "Rent payment",
        merchant_name: "Apartment",
        amount_cents: -145000,
        category: "rent",
        kind: "rent",
        pending: false,
        metadata: {},
        raw_provider_data: {},
      },
    ]),
  );
}

export async function deleteUserAppData(admin, userId) {
  const { data: syncJobs, error: syncJobsError } = await admin
    .from("pip_sync_jobs")
    .select("id")
    .eq("user_id", userId);

  if (syncJobsError) {
    throw syncJobsError;
  }

  const syncJobIds = (syncJobs ?? []).map((row) => row.id);

  if (syncJobIds.length > 0) {
    await expectNoError(
      admin.from("plaid_webhook_events").delete().in("source_sync_job_id", syncJobIds),
    );
  }

  for (const table of userScopedTables) {
    await expectNoError(admin.from(table).delete().eq("user_id", userId));
  }
}

export async function auditUserAppData(admin, userId) {
  const rows = [];

  for (const table of userScopedTables) {
    const { count, error } = await admin
      .from(table)
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    rows.push({
      table,
      count: count ?? 0,
    });
  }

  return rows;
}

export async function deleteAuthUser(admin, userId) {
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error && !isAlreadyDeletedError(error)) {
    throw error;
  }
}

export function summarizeAudit(rows) {
  return rows.reduce((total, row) => total + row.count, 0);
}

async function expectRows(promise) {
  const { data, error } = await promise;

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function expectSingle(promise) {
  const { data, error } = await promise;

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Expected one Supabase row.");
  }

  return data;
}

async function expectNoError(promise) {
  const { error } = await promise;

  if (error) {
    throw error;
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isAlreadyDeletedError(error) {
  const message = error.message?.toLowerCase() ?? "";

  return error.status === 404 || message.includes("not found") || message.includes("does not exist");
}
