import { afterEach, describe, expect, it, vi } from "vitest";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";

const pageMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentPipCashState: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: pageMocks.isSupabaseConfigured,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: pageMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/current-snapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/current-snapshot")>();

  return {
    ...actual,
    getCurrentPipCashState: pageMocks.getCurrentPipCashState,
  };
});

import AppPage from "@/app/app/page";

afterEach(() => {
  vi.clearAllMocks();
});

describe("/app page data loading", () => {
  it("records freshness once when the server provides the initial Pip Cash result", async () => {
    const supabase = createSupabaseClient({ id: "user-1", email: "tester@example.com" });
    pageMocks.isSupabaseConfigured.mockReturnValue(true);
    pageMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    pageMocks.getCurrentPipCashState.mockResolvedValue(calculatePipCash(fakeSnapshot));

    await AppPage({
      searchParams: Promise.resolve({}),
    });

    expect(pageMocks.getCurrentPipCashState).toHaveBeenCalledWith({
      recordFreshnessViewed: true,
    });
  });
});

function createSupabaseClient(user: { id: string; email: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              privacy_consent_at: "2026-06-21T00:00:00.000Z",
            },
            error: null,
          }),
        })),
      })),
    })),
  };
}
