import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const pageMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getAdminAccessState: vi.fn(),
  loadAdminWaitlist: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  getAdminAccessState: pageMocks.getAdminAccessState,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: pageMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/admin/waitlist", () => ({
  loadAdminWaitlist: pageMocks.loadAdminWaitlist,
}));

import AdminPage from "@/app/admin/page";

afterEach(() => {
  vi.clearAllMocks();
});

describe("/admin page", () => {
  it("shows an admin sign-in state for signed-out visitors", async () => {
    pageMocks.getAdminAccessState.mockResolvedValue({ status: "signed-out" });

    const markup = renderToStaticMarkup(await AdminPage());

    expect(markup).toContain("Pip admin sign in");
    expect(markup).toContain("/api/auth/oauth/google?next=%2Fadmin");
    expect(pageMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("does not load admin data for forbidden users", async () => {
    pageMocks.getAdminAccessState.mockResolvedValue({
      status: "forbidden",
      email: "friend@example.com",
    });

    const markup = renderToStaticMarkup(await AdminPage());

    expect(markup).toContain("Admin access required");
    expect(markup).not.toContain("friend@example.com");
    expect(pageMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("renders the unavailable state without loading admin data", async () => {
    pageMocks.getAdminAccessState.mockResolvedValue({ status: "unavailable" });

    const markup = renderToStaticMarkup(await AdminPage());

    expect(markup).toContain("Admin access is unavailable");
    expect(pageMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("renders the control center for authorized admins", async () => {
    const admin = { kind: "admin" };
    pageMocks.getAdminAccessState.mockResolvedValue({
      status: "authorized",
      user: { id: "user-1", email: "mayberrydt@gmail.com", normalizedEmail: "mayberrydt@gmail.com" },
    });
    pageMocks.createSupabaseAdminClient.mockReturnValue(admin);
    pageMocks.loadAdminWaitlist.mockResolvedValue({
      rows: [],
      waitlistCount: 0,
      appWaitlistCount: 0,
      activeGrantCount: 0,
    });

    const markup = renderToStaticMarkup(await AdminPage());

    expect(markup).toContain("Pip Control Center");
    expect(pageMocks.loadAdminWaitlist).toHaveBeenCalledWith(admin);
  });
});
