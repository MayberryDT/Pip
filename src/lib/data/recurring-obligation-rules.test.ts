import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ignoreRecurringObligationForUser,
  listRecurringObligationRulesForUser,
  mapRecurringObligationRuleRow,
  normalizeMerchantKey,
  upsertRecurringObligationRuleForUser,
} from "@/lib/data/recurring-obligation-rules";
import type { Database, RecurringObligationRuleRow } from "@/lib/supabase/database.types";

describe("recurring obligation rules repository", () => {
  it("maps recurring obligation rule rows into domain objects", () => {
    expect(mapRecurringObligationRuleRow(row())).toMatchObject({
      id: "rule-1",
      userId: "user-1",
      merchantKey: "city-power",
      label: "City Power",
      expectedAmountCents: 8400,
      cadence: "monthly",
      source: "user_confirmed",
      status: "active",
    });
  });

  it("lists rules scoped to the authenticated user", async () => {
    const calls: unknown[][] = [];
    const supabase = createClient({ calls, listRows: [row()] });

    await expect(listRecurringObligationRulesForUser(supabase, "user-1")).resolves.toHaveLength(1);
    expect(calls).toContainEqual(["from", "recurring_obligation_rules"]);
    expect(calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(calls).toContainEqual(["order", "updated_at", { ascending: false }]);
  });

  it("returns an empty list when the rules table is not deployed yet", async () => {
    const calls: unknown[][] = [];
    const supabase = createClient({
      calls,
      listError: {
        code: "42P01",
        message: 'relation "public.recurring_obligation_rules" does not exist',
      },
    });

    await expect(listRecurringObligationRulesForUser(supabase, "user-1")).resolves.toEqual([]);
  });

  it("returns an empty list when the rules table is missing from the PostgREST schema cache", async () => {
    const calls: unknown[][] = [];
    const supabase = createClient({
      calls,
      listError: {
        code: "PGRST205",
        message: "Could not find the table 'public.recurring_obligation_rules' in the schema cache",
      },
    });

    await expect(listRecurringObligationRulesForUser(supabase, "user-1")).resolves.toEqual([]);
  });

  it("still throws recurring rule permission errors", async () => {
    const calls: unknown[][] = [];
    const error = {
      code: "42501",
      message: "permission denied for table recurring_obligation_rules",
    };
    const supabase = createClient({ calls, listError: error });

    await expect(listRecurringObligationRulesForUser(supabase, "user-1")).rejects.toBe(error);
  });

  it("upserts user-confirmed monthly bill rules by user and merchant", async () => {
    const calls: unknown[][] = [];
    const supabase = createClient({ calls, singleRow: row() });

    await upsertRecurringObligationRuleForUser(supabase, "user-1", {
      merchantKey: "City Power",
      label: " City Power ",
      expectedAmountCents: 8400,
      expectedDay: 3,
    });

    expect(calls).toContainEqual([
      "upsert",
      expect.objectContaining({
        user_id: "user-1",
        merchant_key: "city-power",
        label: "City Power",
        expected_amount_cents: 8400,
        expected_day: 3,
        cadence: "monthly",
        source: "user_confirmed",
        status: "active",
      }),
      { onConflict: "user_id,merchant_key" },
    ]);
  });

  it("marks merchants as ignored bill corrections", async () => {
    const calls: unknown[][] = [];
    const supabase = createClient({
      calls,
      singleRow: row({
        source: "user_correction",
        status: "ignored",
      }),
    });

    await ignoreRecurringObligationForUser(supabase, "user-1", "Target");

    expect(calls).toContainEqual([
      "upsert",
      expect.objectContaining({
        user_id: "user-1",
        merchant_key: "target",
        label: "Target",
        expected_amount_cents: 0,
        source: "user_correction",
        status: "ignored",
      }),
      { onConflict: "user_id,merchant_key" },
    ]);
  });

  it("normalizes merchant keys consistently", () => {
    expect(normalizeMerchantKey("  City Power, Inc. ")).toBe("city-power-inc");
  });
});

function row(overrides: Partial<RecurringObligationRuleRow> = {}): RecurringObligationRuleRow {
  return {
    id: "rule-1",
    user_id: "user-1",
    merchant_key: "city-power",
    label: "City Power",
    expected_amount_cents: 8400,
    expected_day: 3,
    cadence: "monthly",
    source: "user_confirmed",
    status: "active",
    last_confirmed_at: "2026-06-20T00:00:00.000Z",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    ...overrides,
  };
}

function createClient(input: {
  calls: unknown[][];
  listRows?: RecurringObligationRuleRow[];
  listError?: { code?: string; message?: string };
  singleRow?: RecurringObligationRuleRow;
}): SupabaseClient<Database> {
  const query = {
    select() {
      input.calls.push(["select"]);
      return query;
    },
    upsert(payload: Record<string, unknown>, options: Record<string, unknown>) {
      input.calls.push(["upsert", payload, options]);
      return query;
    },
    eq(column: string, value: unknown) {
      input.calls.push(["eq", column, value]);
      return query;
    },
    order(column: string, options: Record<string, unknown>) {
      input.calls.push(["order", column, options]);
      return Promise.resolve({
        data: input.listRows ?? [],
        error: input.listError ?? null,
      });
    },
    single() {
      return Promise.resolve({
        data: input.singleRow ?? row(),
        error: null,
      });
    },
  };

  return {
    from(tableName: string) {
      input.calls.push(["from", tableName]);
      return query;
    },
  } as unknown as SupabaseClient<Database>;
}
