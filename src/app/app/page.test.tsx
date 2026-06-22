import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { fakeSnapshot } from "@/lib/fake-data";

const pageMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentPipCashState: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  loadActiveAppAccessGrant: vi.fn(),
  recordAppAccessGrantAccess: vi.fn(),
  submitMarketingWaitlist: vi.fn(),
  sendAppWaitlistConfirmation: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({
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

vi.mock("@/lib/marketing/waitlist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/marketing/waitlist")>();

  return {
    ...actual,
    submitMarketingWaitlist: pageMocks.submitMarketingWaitlist,
  };
});

vi.mock("@/lib/email/transactional", () => ({
  sendAppWaitlistConfirmation: pageMocks.sendAppWaitlistConfirmation,
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

  it("shows the OAuth waitlist gate instead of Pip chat for signed-out visitors", async () => {
    const supabase = createSupabaseClient(null);
    pageMocks.isSupabaseConfigured.mockReturnValue(true);
    pageMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const page = await AppPage({
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Join the Pip waitlist");
    expect(markup).toContain("/api/auth/oauth/google");
    expect(markup).not.toContain("data-testid=\"agent-thread\"");
    expect(pageMocks.getCurrentPipCashState).not.toHaveBeenCalled();
  });

  it("records signed-in ungranted users to the app waitlist and blocks the app", async () => {
    const supabase = createSupabaseClient({ id: "user-1", email: "tester@example.com" });
    const admin = { kind: "admin" };
    pageMocks.isSupabaseConfigured.mockReturnValue(true);
    pageMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    pageMocks.createSupabaseAdminClient.mockReturnValue(admin);
    pageMocks.loadActiveAppAccessGrant.mockResolvedValue(null);
    pageMocks.submitMarketingWaitlist.mockResolvedValue({
      status: "joined",
      normalizedEmail: "tester@example.com",
    });

    const page = await AppPage({
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("You’re on the Pip waitlist");
    expect(markup).not.toContain("data-testid=\"agent-thread\"");
    expect(pageMocks.submitMarketingWaitlist).toHaveBeenCalledWith(admin, {
      email: "tester@example.com",
      sourcePage: "/app",
      sourceKind: "app_oauth",
      authUserId: "user-1",
    });
    expect(pageMocks.sendAppWaitlistConfirmation).toHaveBeenCalledWith(admin, {
      email: "tester@example.com",
      normalizedEmail: "tester@example.com",
    });
    expect(pageMocks.getCurrentPipCashState).not.toHaveBeenCalled();
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
