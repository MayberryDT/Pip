import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  upsertUserSettings: vi.fn(),
  markPipCashSnapshotsStaleForUser: vi.fn(),
  recordProductEventSafely: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/financial-repository", () => ({
  upsertUserSettings: routeMocks.upsertUserSettings,
  markPipCashSnapshotsStaleForUser: routeMocks.markPipCashSnapshotsStaleForUser,
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: routeMocks.recordProductEventSafely,
}));

import { GET, PUT } from "@/app/api/settings/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("/api/settings", () => {
  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires authentication before reading settings", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns defaults when an authenticated user has no saved settings", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" }, null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      protectedSavingsMonthlyCents: 20000,
      manualRefreshOnly: true,
      privacyConsentAt: null,
    });
  });

  it("requires authentication before validating protected-savings updates", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await PUT(jsonRequest({ protectedSavingsMonthlyCents: -1 }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.upsertUserSettings).not.toHaveBeenCalled();
    expect(routeMocks.markPipCashSnapshotsStaleForUser).not.toHaveBeenCalled();
    expect(routeMocks.recordProductEventSafely).not.toHaveBeenCalled();
  });

  it("rejects invalid protected-savings updates after authentication", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await PUT(jsonRequest({ protectedSavingsMonthlyCents: -1 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid settings.",
    });
    expect(routeMocks.upsertUserSettings).not.toHaveBeenCalled();
    expect(routeMocks.markPipCashSnapshotsStaleForUser).not.toHaveBeenCalled();
    expect(routeMocks.recordProductEventSafely).not.toHaveBeenCalled();
  });

  it("returns 503 on valid updates when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await PUT(jsonRequest({ protectedSavingsMonthlyCents: 35000 }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires authentication before updating settings", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await PUT(jsonRequest({ protectedSavingsMonthlyCents: 35000 }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.upsertUserSettings).not.toHaveBeenCalled();
    expect(routeMocks.markPipCashSnapshotsStaleForUser).not.toHaveBeenCalled();
    expect(routeMocks.recordProductEventSafely).not.toHaveBeenCalled();
  });

  it("updates protected savings and records the beta event for authenticated users", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.upsertUserSettings.mockResolvedValue({
      asOfDate: "2026-06-06",
      protectedSavingsMonthlyCents: 35000,
    });
    routeMocks.markPipCashSnapshotsStaleForUser.mockResolvedValue(undefined);
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);

    const response = await PUT(jsonRequest({ protectedSavingsMonthlyCents: 35000 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      asOfDate: "2026-06-06",
      protectedSavingsMonthlyCents: 35000,
    });
    expect(routeMocks.upsertUserSettings).toHaveBeenCalledWith(supabase, "user-1", {
      protectedSavingsMonthlyCents: 35000,
    });
    expect(routeMocks.markPipCashSnapshotsStaleForUser).toHaveBeenCalledWith(
      supabase,
      "user-1",
    );
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "settings_updated",
      {
        protectedSavingsMonthlyCents: 35000,
      },
    );
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createSupabaseClient(
  user: { id: string } | null,
  settings: Record<string, unknown> | null = {
    protected_savings_monthly_cents: 20000,
    manual_refresh_only: true,
    privacy_consent_at: null,
  },
) {
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
            data: settings,
            error: null,
          }),
        })),
      })),
    })),
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/settings", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
