import { afterEach, describe, expect, it, vi } from "vitest";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot, negativePipCashSnapshot } from "@/lib/fake-data";

const routeMocks = vi.hoisted(() => ({
  getCurrentPipCashResult: vi.fn(),
}));

vi.mock("@/lib/data/current-snapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/current-snapshot")>();

  return {
    ...actual,
    getCurrentPipCashResult: routeMocks.getCurrentPipCashResult,
  };
});

import { GET } from "@/app/api/pip-cash/route";
import {
  AuthenticationRequiredError,
  NoFinancialDataError,
} from "@/lib/data/current-snapshot";

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/pip-cash", () => {
  it("returns the default fake Spendable Cash result for explicit prototype access", async () => {
    routeMocks.getCurrentPipCashResult.mockResolvedValue(calculatePipCash(fakeSnapshot));

    const response = await GET(new Request("http://localhost/api/pip-cash"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pipCashTodayCents).toBe(4300);
    expect(payload.trueBalances).toEqual(expect.any(Array));
    expect(routeMocks.getCurrentPipCashResult).toHaveBeenCalledWith({ scenario: undefined });
  });

  it("returns 401 instead of fake data when live beta auth is missing", async () => {
    routeMocks.getCurrentPipCashResult.mockRejectedValue(new AuthenticationRequiredError());

    const response = await GET(new Request("http://localhost/api/pip-cash"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
  });

  it("supports the negative fake scenario for stress-state testing", async () => {
    routeMocks.getCurrentPipCashResult.mockResolvedValue(calculatePipCash(negativePipCashSnapshot));

    const response = await GET(new Request("http://localhost/api/pip-cash?scenario=negative"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pipCashTodayCents).toBeLessThan(0);
    expect(payload.warnings).toEqual(expect.any(Array));
    expect(routeMocks.getCurrentPipCashResult).toHaveBeenCalledWith({ scenario: "negative" });
  });

  it("returns a connect-data error instead of fake data for authenticated users with no rows", async () => {
    routeMocks.getCurrentPipCashResult.mockRejectedValue(new NoFinancialDataError());

    const response = await GET(new Request("http://localhost/api/pip-cash"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "no-financial-data",
      error: "Connect financial data before using live Spendable Cash Today.",
    });
  });
});
