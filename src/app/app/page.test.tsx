import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";

const pageMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentPipCashState: vi.fn(),
  isLocalFakeAppMode: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  loadActiveBillingSubscriptionForUser: vi.fn(),
  loadActiveAppAccessGrant: vi.fn(),
  recordAppAccessGrantAccess: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({
  isLocalFakeAppMode: pageMocks.isLocalFakeAppMode,
  isSupabaseConfigured: pageMocks.isSupabaseConfigured,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: pageMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: pageMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/data/app-access-grants", () => ({
  loadActiveAppAccessGrant: pageMocks.loadActiveAppAccessGrant,
  recordAppAccessGrantAccess: pageMocks.recordAppAccessGrantAccess,
}));

vi.mock("@/lib/billing/billing-repository", () => ({
  isSubscriptionActive: (subscription: { status: string } | null) =>
    subscription?.status === "active" || subscription?.status === "trialing",
  loadActiveBillingSubscriptionForUser: pageMocks.loadActiveBillingSubscriptionForUser,
}));

vi.mock("@/lib/data/current-snapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/current-snapshot")>();

  return {
    ...actual,
    getCurrentPipCashState: pageMocks.getCurrentPipCashState,
  };
});

import AppPage from "@/app/app/page";

beforeEach(() => {
  pageMocks.isLocalFakeAppMode.mockReturnValue(false);
  pageMocks.loadActiveBillingSubscriptionForUser.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/app page data loading", () => {
  it("fails closed instead of exposing Pip chat when Supabase is not configured", async () => {
    pageMocks.isSupabaseConfigured.mockReturnValue(false);

    const page = await AppPage({
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Pip access is temporarily unavailable");
    expect(markup).not.toContain("data-testid=\"agent-thread\"");
    expect(pageMocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(pageMocks.getCurrentPipCashState).not.toHaveBeenCalled();
  });

  it("ignores dev onboarding shortcuts during local staging verification", async () => {
    vi.stubEnv("PIP_LOCAL_STAGING", "1");
    pageMocks.isSupabaseConfigured.mockReturnValue(false);

    const page = await AppPage({
      searchParams: Promise.resolve({ onboarding: "demo" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Pip access is temporarily unavailable");
    expect(markup).not.toContain("Spendable Cash Today");
    expect(pageMocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(pageMocks.getCurrentPipCashState).not.toHaveBeenCalled();
  });

  it("allows explicit local fake app mode without exposing it as the default Supabase-missing state", async () => {
    pageMocks.isSupabaseConfigured.mockReturnValue(false);
    pageMocks.isLocalFakeAppMode.mockReturnValue(true);

    const page = await AppPage({
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("data-testid=\"agent-thread\"");
    expect(markup).toContain("Spendable Cash Today");
    expect(markup).not.toContain("Pip access is temporarily unavailable");
    expect(pageMocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(pageMocks.getCurrentPipCashState).not.toHaveBeenCalled();
  });

  it("shows the OAuth app gate instead of Pip chat for signed-out visitors", async () => {
    const supabase = createSupabaseClient(null);
    pageMocks.isSupabaseConfigured.mockReturnValue(true);
    pageMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const page = await AppPage({
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Start Pip");
    expect(markup).toContain("/api/auth/oauth/google");
    expect(markup).not.toContain("data-testid=\"agent-thread\"");
    expect(pageMocks.getCurrentPipCashState).not.toHaveBeenCalled();
  });

  it("shows billing for signed-in users without a manual grant or subscription", async () => {
    const supabase = createSupabaseClient({ id: "user-1", email: "tester@example.com" });
    const admin = { kind: "admin" };
    pageMocks.isSupabaseConfigured.mockReturnValue(true);
    pageMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    pageMocks.createSupabaseAdminClient.mockReturnValue(admin);
    pageMocks.loadActiveAppAccessGrant.mockResolvedValue(null);

    const page = await AppPage({
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Start your Pip subscription");
    expect(markup).toContain("Subscribe with Stripe");
    expect(markup).not.toContain("data-testid=\"agent-thread\"");
    expect(pageMocks.loadActiveBillingSubscriptionForUser).toHaveBeenCalledWith(admin, "user-1");
    expect(pageMocks.getCurrentPipCashState).not.toHaveBeenCalled();
  });

  it("allows active paid subscriptions without a manual grant", async () => {
    const supabase = createSupabaseClient({ id: "user-1", email: "tester@example.com" });
    const admin = { kind: "admin" };
    pageMocks.isSupabaseConfigured.mockReturnValue(true);
    pageMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    pageMocks.createSupabaseAdminClient.mockReturnValue(admin);
    pageMocks.loadActiveAppAccessGrant.mockResolvedValue(null);
    pageMocks.loadActiveBillingSubscriptionForUser.mockResolvedValue({
      status: "active",
      currentPeriodEnd: null,
    });
    pageMocks.getCurrentPipCashState.mockResolvedValue(calculatePipCash(fakeSnapshot));

    const page = await AppPage({
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("data-testid=\"agent-thread\"");
    expect(pageMocks.recordAppAccessGrantAccess).not.toHaveBeenCalled();
    expect(pageMocks.getCurrentPipCashState).toHaveBeenCalledWith({
      recordFreshnessViewed: true,
    });
  });

  it("records freshness once when the server provides the initial Pip Cash result", async () => {
    const supabase = createSupabaseClient({ id: "user-1", email: "tester@example.com" });
    const admin = { kind: "admin" };
    pageMocks.isSupabaseConfigured.mockReturnValue(true);
    pageMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    pageMocks.createSupabaseAdminClient.mockReturnValue(admin);
    pageMocks.loadActiveAppAccessGrant.mockResolvedValue({
      normalized_email: "tester@example.com",
      status: "active",
      first_accessed_at: null,
    });
    pageMocks.recordAppAccessGrantAccess.mockResolvedValue(undefined);
    pageMocks.getCurrentPipCashState.mockResolvedValue(calculatePipCash(fakeSnapshot));

    await AppPage({
      searchParams: Promise.resolve({}),
    });

    expect(pageMocks.recordAppAccessGrantAccess).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        normalized_email: "tester@example.com",
      }),
      "user-1",
    );
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
