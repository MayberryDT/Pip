import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavingsGoal } from "@/lib/savings-goals/types";

const routeMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
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

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
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

import { shouldStalePipCashForGoalChange } from "@/app/api/savings-goals/route-helpers";
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

  it("creates an active goal without a monthly contribution and marks snapshots stale", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    const supabase = createSupabaseClient({ id: "user-1" });
    const admin = { from: vi.fn() };
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.createSavingsGoalForUser.mockResolvedValue(goal({
      includeInSpendableCash: true,
      monthlyContributionCents: 0,
    }));

    const response = await POST(jsonRequest({
      name: "Trip",
      targetAmountCents: 500000,
      includeInSpendableCash: true,
      targetDate: "2027-06-18",
    }));

    expect(response.status).toBe(201);
    expect(routeMocks.markPipCashSnapshotsStaleForUser).toHaveBeenCalledWith(supabase, "user-1", admin);
  });

  it("creates a protected goal, marks snapshots stale, and records events", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    const supabase = createSupabaseClient({ id: "user-1" });
    const admin = { from: vi.fn() };
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
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
    expect(routeMocks.markPipCashSnapshotsStaleForUser).toHaveBeenCalledWith(supabase, "user-1", admin);
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

  it("marks snapshots stale for active created goals even when the legacy include flag is false", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    const supabase = createSupabaseClient({ id: "user-1" });
    const admin = { from: vi.fn() };
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.createSavingsGoalForUser.mockResolvedValue(goal({
      includeInSpendableCash: false,
      monthlyContributionCents: 40000,
    }));

    const response = await POST(jsonRequest({
      name: "Trip",
      targetAmountCents: 500000,
      currentAmountCents: 100000,
      monthlyContributionCents: 40000,
      includeInSpendableCash: false,
      targetDate: "2027-06-18",
    }));

    expect(response.status).toBe(201);
    expect(routeMocks.markPipCashSnapshotsStaleForUser).toHaveBeenCalledWith(supabase, "user-1", admin);
  });

  it("logs savings-goal create failures without exposing secret-shaped values", async () => {
    enableSupabaseEnv();
    routeMocks.isSavingsGoalsEnabled.mockReturnValue(true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("create failed access_token=provider-secret sk-test-secret");
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSavingsGoalForUser.mockRejectedValue(error);

    try {
      const response = await POST(jsonRequest({
        name: "Trip",
        targetAmountCents: 500000,
        currentAmountCents: 100000,
        monthlyContributionCents: 40000,
        includeInSpendableCash: false,
        targetDate: "2027-06-18",
      }));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "Savings goals request failed.",
      });
      expect(routeMocks.recordProductEventSafely).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "[savings-goals] request failed",
        "create failed access_token=[redacted] [redacted]",
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("savings goal route helpers", () => {
  it("stales Pip Cash for active goal creates even when the legacy include flag is false", () => {
    expect(shouldStalePipCashForGoalChange(null, goal({
      includeInSpendableCash: false,
      monthlyContributionCents: 40000,
    }))).toBe(true);
  });

  it.each([
    ["target date", { targetDate: "2027-07-18" }],
    ["target amount", { targetAmountCents: 600000 }],
    ["current amount", { currentAmountCents: 125000 }],
    ["monthly amount", { monthlyContributionCents: 45000 }],
  ])("stales Pip Cash when an active goal's %s changes without changing the legacy include flag", (_label, overrides) => {
    expect(shouldStalePipCashForGoalChange(
      goal({ includeInSpendableCash: false }),
      goal({ includeInSpendableCash: false, ...overrides }),
    )).toBe(true);
  });

  it.each([
    ["paused", "active"],
    ["archived", "active"],
    ["active", "paused"],
    ["active", "archived"],
  ] as const)("stales Pip Cash for status transitions from %s to %s", (beforeStatus, afterStatus) => {
    expect(shouldStalePipCashForGoalChange(
      goal({ includeInSpendableCash: false, status: beforeStatus }),
      goal({ includeInSpendableCash: false, status: afterStatus }),
    )).toBe(true);
  });

  it.each(["paused", "archived"] as const)("does not stale Pip Cash for %s goal amount changes", (status) => {
    expect(shouldStalePipCashForGoalChange(
      goal({ status, currentAmountCents: 100000 }),
      goal({ status, currentAmountCents: 125000 }),
    )).toBe(false);
  });

  it("does not stale Pip Cash for legacy include flag changes alone", () => {
    expect(shouldStalePipCashForGoalChange(
      goal({ includeInSpendableCash: false }),
      goal({ includeInSpendableCash: true }),
    )).toBe(false);
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
