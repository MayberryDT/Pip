import { afterEach, describe, expect, it, vi } from "vitest";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot, negativePipCashSnapshot } from "@/lib/fake-data";

const routeMocks = vi.hoisted(() => ({
  getCurrentPipCashState: vi.fn(),
}));

vi.mock("@/lib/data/current-snapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/current-snapshot")>();

  return {
    ...actual,
    getCurrentPipCashState: routeMocks.getCurrentPipCashState,
  };
});

import { GET } from "@/app/api/pip-cash/route";
import {
  AuthenticationRequiredError,
  NoFinancialDataError,
} from "@/lib/data/current-snapshot";
import { SupabaseConfigError } from "@/lib/supabase/env";

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/pip-cash", () => {
  it("returns the default fake Spendable Cash result for explicit prototype access", async () => {
    routeMocks.getCurrentPipCashState.mockResolvedValue(calculatePipCash(fakeSnapshot));

    const response = await GET(new Request("http://localhost/api/pip-cash"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(payload.pipCashTodayCents).toBe(4300);
    expect(payload.trueBalances).toEqual(expect.any(Array));
    expect(routeMocks.getCurrentPipCashState).toHaveBeenCalledWith({ scenario: undefined });
  });

  it("does not opt client reads into freshness-view telemetry", async () => {
    routeMocks.getCurrentPipCashState.mockResolvedValue(calculatePipCash(fakeSnapshot));

    await GET(new Request("http://localhost/api/pip-cash"));

    expect(routeMocks.getCurrentPipCashState).toHaveBeenCalledWith({ scenario: undefined });
  });

  it("returns 401 instead of fake data when live beta auth is missing", async () => {
    routeMocks.getCurrentPipCashState.mockRejectedValue(new AuthenticationRequiredError());

    const response = await GET(new Request("http://localhost/api/pip-cash"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
  });

  it("returns 503 instead of fake data when Supabase is not configured", async () => {
    routeMocks.getCurrentPipCashState.mockRejectedValue(new SupabaseConfigError());

    const response = await GET(new Request("http://localhost/api/pip-cash?scenario=negative"));

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      code: "supabase-config-missing",
      error: "Set Supabase env or PIP_SUPABASE_MODE=off before using fake Pip Cash data.",
    });
  });

  it("supports the negative fake scenario for stress-state testing", async () => {
    routeMocks.getCurrentPipCashState.mockResolvedValue(calculatePipCash(negativePipCashSnapshot));

    const response = await GET(new Request("http://localhost/api/pip-cash?scenario=negative"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pipCashTodayCents).toBeLessThan(0);
    expect(payload.warnings).toEqual(expect.any(Array));
    expect(routeMocks.getCurrentPipCashState).toHaveBeenCalledWith({ scenario: "negative" });
  });

  it("returns a connect-data error instead of fake data for authenticated users with no rows", async () => {
    routeMocks.getCurrentPipCashState.mockRejectedValue(new NoFinancialDataError());

    const response = await GET(new Request("http://localhost/api/pip-cash"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "no-financial-data",
      error: "Connect financial data before using live Spendable Cash Today.",
    });
  });

  it("can include freshness and an unseen reaction", async () => {
    routeMocks.getCurrentPipCashState.mockResolvedValue({
      ...calculatePipCash(fakeSnapshot),
      freshness: {
        state: "syncing",
        hasPendingSyncJob: true,
        hasStaleInstitution: false,
      },
      reaction: {
        id: "reaction-1",
        reactionType: "small_lift",
        trigger: "manual_refresh",
        currentState: "healthy",
        spendableDeltaCents: 700,
        behaviorAdjustmentDeltaCents: 0,
        shortfallDeltaCents: 0,
        intensity: 1,
        summary: "You spent lightly lately, so today has more room.",
        createdAt: "2026-06-11T10:00:00.000Z",
      },
    });

    const response = await GET(new Request("http://localhost/api/pip-cash"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.freshness).toMatchObject({
      state: "syncing",
      hasPendingSyncJob: true,
    });
    expect(payload.reaction).toMatchObject({
      id: "reaction-1",
      reactionType: "small_lift",
    });
  });
});
