import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  archiveSavingsGoalForUser,
  createSavingsGoalForUser,
  listSavingsGoalsForUser,
  loadSavingsGoalForUser,
  mapSavingsGoalRow,
  updateSavingsGoalForUser,
} from "@/lib/data/savings-goals-repository";
import type { Database, SavingsGoalRow } from "@/lib/supabase/database.types";

describe("savings goals repository", () => {
  it("maps savings goal rows into domain objects", () => {
    expect(mapSavingsGoalRow(row())).toMatchObject({
      id: "goal-1",
      userId: "user-1",
      name: "Trip",
      targetAmountCents: 500000,
      targetDate: "2027-06-18",
      monthlyContributionCents: 40000,
      includeInSpendableCash: true,
      status: "active",
    });
  });

  it("lists goals scoped to the authenticated user", async () => {
    const calls: unknown[][] = [];
    const supabase = createClient({
      calls,
      listRows: [row()],
    });

    await expect(listSavingsGoalsForUser(supabase, "user-1")).resolves.toHaveLength(1);
    expect(calls).toContainEqual(["from", "savings_goals"]);
    expect(calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("creates a trimmed goal for the authenticated user", async () => {
    const calls: unknown[][] = [];
    const supabase = createClient({
      calls,
      singleRow: row({ name: "Trip" }),
    });

    await createSavingsGoalForUser(supabase, "user-1", {
      name: " Trip ",
      targetAmountCents: 500000,
      targetDate: "2027-06-18",
      currentAmountCents: 100000,
      monthlyContributionCents: 40000,
      includeInSpendableCash: true,
    });

    expect(calls).toContainEqual([
      "insert",
      expect.objectContaining({
        user_id: "user-1",
        name: "Trip",
        target_amount_cents: 500000,
        current_amount_cents: 100000,
        monthly_contribution_cents: 40000,
        include_in_spendable_cash: true,
      }),
    ]);
  });

  it("defaults new goals into the legacy spendable-cash column", async () => {
    const calls: unknown[][] = [];
    const supabase = createClient({
      calls,
      singleRow: row(),
    });

    await createSavingsGoalForUser(supabase, "user-1", {
      name: "Trip",
      targetAmountCents: 500000,
    });

    expect(calls).toContainEqual([
      "insert",
      expect.objectContaining({
        include_in_spendable_cash: true,
      }),
    ]);
  });

  it("loads one goal scoped to the authenticated user", async () => {
    const calls: unknown[][] = [];
    const supabase = createClient({
      calls,
      maybeSingleRow: row(),
    });

    await expect(loadSavingsGoalForUser(supabase, "user-1", "goal-1")).resolves.toMatchObject({
      id: "goal-1",
    });
    expect(calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(calls).toContainEqual(["eq", "id", "goal-1"]);
  });

  it("updates goals with user and goal id filters", async () => {
    const calls: unknown[][] = [];
    const supabase = createClient({
      calls,
      singleRow: row({ monthly_contribution_cents: 55000 }),
    });

    await updateSavingsGoalForUser(supabase, "user-1", "goal-1", {
      monthlyContributionCents: 55000,
      includeInSpendableCash: true,
    });

    expect(calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(calls).toContainEqual(["eq", "id", "goal-1"]);
    expect(calls).toContainEqual([
      "update",
      expect.objectContaining({
        monthly_contribution_cents: 55000,
        include_in_spendable_cash: true,
      }),
    ]);
  });

  it("archives goals instead of hard deleting them", async () => {
    const calls: unknown[][] = [];
    const supabase = createClient({
      calls,
      singleRow: row({ status: "archived", include_in_spendable_cash: false }),
    });

    await archiveSavingsGoalForUser(supabase, "user-1", "goal-1");

    expect(calls).toContainEqual([
      "update",
      expect.objectContaining({
        status: "archived",
        include_in_spendable_cash: false,
      }),
    ]);
  });
});

function row(overrides: Partial<SavingsGoalRow> = {}): SavingsGoalRow {
  return {
    id: "goal-1",
    user_id: "user-1",
    name: "Trip",
    target_amount_cents: 500000,
    target_date: "2027-06-18",
    starting_amount_cents: 0,
    current_amount_cents: 100000,
    monthly_contribution_cents: 40000,
    include_in_spendable_cash: true,
    status: "active",
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T00:00:00.000Z",
    ...overrides,
  };
}

function createClient(input: {
  calls: unknown[][];
  listRows?: SavingsGoalRow[];
  singleRow?: SavingsGoalRow;
  maybeSingleRow?: SavingsGoalRow | null;
}): SupabaseClient<Database> {
  const query = {
    select() {
      input.calls.push(["select"]);
      return query;
    },
    insert(payload: Record<string, unknown>) {
      input.calls.push(["insert", payload]);
      return query;
    },
    update(payload: Record<string, unknown>) {
      input.calls.push(["update", payload]);
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
        error: null,
      });
    },
    single() {
      return Promise.resolve({
        data: input.singleRow ?? row(),
        error: null,
      });
    },
    maybeSingle() {
      return Promise.resolve({
        data: input.maybeSingleRow ?? null,
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
