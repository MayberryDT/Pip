import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticationRequiredError,
  getCurrentFinancialSnapshot,
  getCurrentFreeCashResult,
  NoFinancialDataError,
} from "@/lib/data/current-snapshot";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";

const mocks = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  loadCachedFreeCashResultForUser: vi.fn(),
  loadFinancialSnapshotForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/financial-repository", () => ({
  loadCachedFreeCashResultForUser: mocks.loadCachedFreeCashResultForUser,
  loadFinancialSnapshotForUser: mocks.loadFinancialSnapshotForUser,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentFreeCashResult", () => {
  it("uses fake data when Supabase is disabled", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);

    await expect(getCurrentFreeCashResult({})).resolves.toMatchObject({
      freeCashTodayCents: 4300,
    });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.loadCachedFreeCashResultForUser).not.toHaveBeenCalled();
    expect(mocks.loadFinancialSnapshotForUser).not.toHaveBeenCalled();
  });

  it("requires authentication instead of returning fake data when Supabase is configured", async () => {
    const supabase = createSupabaseClient(null);

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);

    await expect(getCurrentFreeCashResult({ scenario: "negative" })).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(mocks.loadCachedFreeCashResultForUser).not.toHaveBeenCalled();
    expect(mocks.loadFinancialSnapshotForUser).not.toHaveBeenCalled();
  });

  it("returns the latest cached result for authenticated users without loading full rows", async () => {
    const supabase = createSupabaseClient({ id: "user-1" });
    const cachedResult = {
      ...calculateFreeCash(fakeSnapshot),
      freeCashTodayCents: 1234,
    };

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.loadCachedFreeCashResultForUser.mockResolvedValue(cachedResult);

    await expect(getCurrentFreeCashResult({})).resolves.toMatchObject({
      freeCashTodayCents: 1234,
    });
    expect(mocks.loadCachedFreeCashResultForUser).toHaveBeenCalledWith(supabase, "user-1");
    expect(mocks.loadFinancialSnapshotForUser).not.toHaveBeenCalled();
  });

  it("recomputes from normalized rows when no cached result exists", async () => {
    const supabase = createSupabaseClient({ id: "user-1" });

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.loadCachedFreeCashResultForUser.mockResolvedValue(null);
    mocks.loadFinancialSnapshotForUser.mockResolvedValue(fakeSnapshot);

    await expect(getCurrentFreeCashResult({})).resolves.toMatchObject({
      freeCashTodayCents: 4300,
    });
    expect(mocks.loadFinancialSnapshotForUser).toHaveBeenCalledWith(supabase, "user-1");
  });

  it("does not fall back to fake Free Cash for authenticated users without financial rows", async () => {
    const supabase = createSupabaseClient({ id: "user-1" });

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.loadCachedFreeCashResultForUser.mockResolvedValue(null);
    mocks.loadFinancialSnapshotForUser.mockResolvedValue(null);

    await expect(getCurrentFreeCashResult({})).rejects.toBeInstanceOf(NoFinancialDataError);
  });
});

describe("getCurrentFinancialSnapshot", () => {
  it("requires authentication instead of returning fake transactions when Supabase is configured", async () => {
    const supabase = createSupabaseClient(null);

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);

    await expect(getCurrentFinancialSnapshot({ scenario: "negative" })).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(mocks.loadFinancialSnapshotForUser).not.toHaveBeenCalled();
  });

  it("does not fall back to fake transactions for authenticated users without financial rows", async () => {
    const supabase = createSupabaseClient({ id: "user-1" });

    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.loadFinancialSnapshotForUser.mockResolvedValue(null);

    await expect(getCurrentFinancialSnapshot({})).rejects.toBeInstanceOf(NoFinancialDataError);
  });
});

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
