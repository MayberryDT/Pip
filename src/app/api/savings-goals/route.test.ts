import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavingsGoal } from "@/lib/savings-goals/types";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  isSavingsGoalsEnabled: vi.fn(),
  listSavingsGoalsForUser: vi.fn(),
  createSavingsGoalForUser: vi.fn(),
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
  listSavingsGoalsForUser: routeMocks.listSavingsGoalsForUser,
  createSavingsGoalForUser: routeMocks.createSavingsGoalForUser,
}));

vi.mock("@/lib/data/financial-repository", () => ({
  getCurrentAppDate: () => "2026-06-18",
  markPipCashSnapshotsStaleForUser: routeMocks.markPipCashSnapshotsStaleForUser,
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: routeMocks.recordProductEventSafely,
}));

import { GET, POST } from "@/app/api/savings-goals/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("/api/savings-goals", () => {
  it("returns 404 when the feature is disabled", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Savings goals are not enabled.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires authentication before listing goals", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(routeMocks.listSavingsGoalsForUser).not.toHaveBeenCalled();
  });

  it("lists active and paused savings goals as plans", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.listSavingsGoalsForUser.mockResolvedValue([
      goal(),
      goal({ id: "goal-2", status: "archived" }),
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      goals: [
        {
          goal: {
            id: "goal-1",
            name: "Trip",
          },
          remainingCents: 400000,
        },
      ],
    });
  });

  it("rejects protected goals without a monthly contribution", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({
      name: "Trip",
      targetAmountCents: 500000,
      includeInSpendableCash: true,
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Protected savings goals need a monthly contribution.",
    });
    expect(routeMocks.createSavingsGoalForUser).not.toHaveBeenCalled();
  });

  it("creates a protected goal, marks snapshots stale, and records events", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSavingsGoalForUser.mockResolvedValue(goal({
      includeInSpendableCash: true,
      monthlyContributionCents: 40000,
    }));

    const response = await POST(jsonRequest({
      name: "Trip",
      targetAmountCents: 500000,
      currentAmountCents: 100000,
      monthlyContributionCents: 40000,
      includeInSpendableCash: true,
      targetDate: "2027-06-18",
    }));

    expect(response.status).toBe(201);
    expect(routeMocks.markPipCashSnapshotsStaleForUser).toHaveBeenCalledWith(supabase, "user-1");
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "savings_goal_created",
      expect.objectContaining({
        includeInSpendableCash: true,
      }),
    );
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "savings_goal_spendable_protection_enabled",
      expect.any(Object),
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
  return new Request("http://localhost/api/savings-goals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
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
