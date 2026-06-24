import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: authMocks.isSupabaseConfigured,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: authMocks.createSupabaseServerClient,
}));

import {
  getAdminAccessState,
  isConfiguredAdminEmail,
  parseAdminEmails,
} from "@/lib/admin/auth";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("admin auth", () => {
  it("normalizes the configured admin email allowlist", () => {
    expect(parseAdminEmails(" mayberrydt@gmail.com,Second@Example.com ,, ")).toEqual([
      "mayberrydt@gmail.com",
      "second@example.com",
    ]);
  });

  it("matches configured admin emails case-insensitively", () => {
    vi.stubEnv("PIP_ADMIN_EMAILS", "mayberrydt@gmail.com");

    expect(isConfiguredAdminEmail("MayberryDT@Gmail.com")).toBe(true);
    expect(isConfiguredAdminEmail("other@example.com")).toBe(false);
  });

  it("returns unavailable when Supabase is not configured", async () => {
    authMocks.isSupabaseConfigured.mockReturnValue(false);

    await expect(getAdminAccessState()).resolves.toEqual({ status: "unavailable" });
    expect(authMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns signed-out when there is no authenticated user", async () => {
    authMocks.isSupabaseConfigured.mockReturnValue(true);
    authMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    await expect(getAdminAccessState()).resolves.toEqual({ status: "signed-out" });
  });

  it("returns forbidden for signed-in non-admin users", async () => {
    vi.stubEnv("PIP_ADMIN_EMAILS", "mayberrydt@gmail.com");
    authMocks.isSupabaseConfigured.mockReturnValue(true);
    authMocks.createSupabaseServerClient.mockResolvedValue(
      createSupabaseClient({ id: "user-2", email: "friend@example.com" }),
    );

    await expect(getAdminAccessState()).resolves.toEqual({
      status: "forbidden",
      email: "friend@example.com",
    });
  });

  it("returns authorized for the configured owner account", async () => {
    vi.stubEnv("PIP_ADMIN_EMAILS", "mayberrydt@gmail.com");
    authMocks.isSupabaseConfigured.mockReturnValue(true);
    authMocks.createSupabaseServerClient.mockResolvedValue(
      createSupabaseClient({ id: "user-1", email: "MayberryDT@gmail.com" }),
    );

    await expect(getAdminAccessState()).resolves.toEqual({
      status: "authorized",
      user: {
        id: "user-1",
        email: "MayberryDT@gmail.com",
        normalizedEmail: "mayberrydt@gmail.com",
      },
    });
  });
});

function createSupabaseClient(user: { id: string; email: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
  };
}
