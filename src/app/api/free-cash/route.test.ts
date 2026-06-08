import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { fakeSnapshot, negativeFreeCashSnapshot } from "@/lib/fake-data";

const routeMocks = vi.hoisted(() => ({
  getCurrentFreeCashResult: vi.fn(),
}));

vi.mock("@/lib/data/current-snapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/current-snapshot")>();

  return {
    ...actual,
    getCurrentFreeCashResult: routeMocks.getCurrentFreeCashResult,
  };
});

import { GET } from "@/app/api/free-cash/route";
import {
  AuthenticationRequiredError,
  NoFinancialDataError,
} from "@/lib/data/current-snapshot";

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/free-cash", () => {
  it("returns the default fake Spendable Cash result for explicit prototype access", async () => {
    routeMocks.getCurrentFreeCashResult.mockResolvedValue(calculateFreeCash(fakeSnapshot));

    const response = await GET(new Request("http://localhost/api/free-cash"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.freeCashTodayCents).toBe(4300);
    expect(payload.trueBalances).toEqual(expect.any(Array));
    expect(routeMocks.getCurrentFreeCashResult).toHaveBeenCalledWith({ scenario: undefined });
  });

  it("returns 401 instead of fake data when live beta auth is missing", async () => {
    routeMocks.getCurrentFreeCashResult.mockRejectedValue(new AuthenticationRequiredError());

    const response = await GET(new Request("http://localhost/api/free-cash"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
  });

  it("supports the negative fake scenario for stress-state testing", async () => {
    routeMocks.getCurrentFreeCashResult.mockResolvedValue(calculateFreeCash(negativeFreeCashSnapshot));

    const response = await GET(new Request("http://localhost/api/free-cash?scenario=negative"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.freeCashTodayCents).toBeLessThan(0);
    expect(payload.warnings).toEqual(expect.any(Array));
    expect(routeMocks.getCurrentFreeCashResult).toHaveBeenCalledWith({ scenario: "negative" });
  });

  it("returns a connect-data error instead of fake data for authenticated users with no rows", async () => {
    routeMocks.getCurrentFreeCashResult.mockRejectedValue(new NoFinancialDataError());

    const response = await GET(new Request("http://localhost/api/free-cash"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "no-financial-data",
      error: "Connect financial data before using live Spendable Cash Today.",
    });
  });
});
