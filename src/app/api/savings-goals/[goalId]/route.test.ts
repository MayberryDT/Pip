import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavingsGoal } from "@/lib/savings-goals/types";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  isSavingsGoalsEnabled: vi.fn(),
  loadSavingsGoalForUser: vi.fn(),
  updateSavingsGoalForUser: vi.fn(),
  archiveSavingsGoalForUser: vi.fn(),
  markPipCashSnapshotsStaleForUser: vi.fn(),
  recordProductEventSafely: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/savings-goals/feature-flags", () => ({
  isSavingsGoalsEnabled: routeMocks.isSavingsGoalsEnabled,
}));

vi.mock("@/lib/data/savings-goals-repository", () => ({
  loadSavingsGoalForUser: routeMocks.loadSavingsGoalForUser,
  updateSavingsGoalForUser: routeMocks.updateSavingsGoalForUser,
  archiveSavingsGoalForUser: routeMocks.archiveSavingsGoalForUser,
}));

vi.mock("@/lib/data/financial-repository", () => ({
  getCurrentAppDate: () => "2026-06-18",
  markPipCashSnapshotsStaleForUser: routeMocks.markPipCashSnapshotsStaleForUser,
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: routeMocks.recordProductEventSafely,
}));

import { DELETE, PATCH } from "@/app/api/savings-goals/[goalId]/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("/api/savings-goals/[goalId]", () => {
  it("returns 404 when the goal does not exist", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));
    routeMocks.loadSavingsGoalForUser.mockResolvedValue(null);

    const response = await PATCH(jsonRequest({ name: "Trip" }), routeContext());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Savings goal not found.",
    });
    expect(routeMocks.updateSavingsGoalForUser).not.toHaveBeenCalled();
  });

  it("updates tracked-only metadata without marking snapshots stale", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.loadSavingsGoalForUser.mockResolvedValue(goal());
    routeMocks.updateSavingsGoalForUser.mockResolvedValue(goal({ name: "Italy Trip" }));

    const response = await PATCH(jsonRequest({ name: "Italy Trip" }), routeContext());

    expect(response.status).toBe(200);
    expect(routeMocks.markPipCashSnapshotsStaleForUser).not.toHaveBeenCalled();
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "savings_goal_updated",
      expect.any(Object),
    );
  });

  it("marks snapshots stale when protection is enabled", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.loadSavingsGoalForUser.mockResolvedValue(goal());
    routeMocks.updateSavingsGoalForUser.mockResolvedValue(goal({
      includeInSpendableCash: true,
      monthlyContributionCents: 40000,
    }));

    const response = await PATCH(jsonRequest({
      includeInSpendableCash: true,
      monthlyContributionCents: 40000,
    }), routeContext());

    expect(response.status).toBe(200);
    expect(routeMocks.markPipCashSnapshotsStaleForUser).toHaveBeenCalledWith(supabase, "user-1");
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "savings_goal_spendable_protection_enabled",
      expect.any(Object),
    );
  });

  it("archives a protected goal and marks snapshots stale", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.loadSavingsGoalForUser.mockResolvedValue(goal({
      includeInSpendableCash: true,
      monthlyContributionCents: 40000,
    }));
    routeMocks.archiveSavingsGoalForUser.mockResolvedValue(goal({
      status: "archived",
      includeInSpendableCash: false,
    }));

    const response = await DELETE(new Request("http://localhost/api/savings-goals/goal-1"), routeContext());

    expect(response.status).toBe(200);
    expect(routeMocks.markPipCashSnapshotsStaleForUser).toHaveBeenCalledWith(supabase, "user-1");
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "savings_goal_archived",
      expect.objectContaining({
        wasProtected: true,
      }),
    );
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createSupabaseClient(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: null,
      }),
    },
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/savings-goals/goal-1", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function routeContext() {
  return {
    params: Promise.resolve({
      goalId: "goal-1",
    }),
  };
}

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "goal-1",
    userId: "user-1",
    name: "Trip",
    targetAmountCents: 500000,
    targetDate: "2027-06-18",
    startingAmountCents: 0,
    currentAmountCents: 100000,
    monthlyContributionCents: 40000,
    includeInSpendableCash: false,
    status: "active",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
    ...overrides,
  };
}
