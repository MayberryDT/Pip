import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

import { POST } from "@/app/api/auth/consent/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/consent", () => {
  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
  });

  it("requires an authenticated user before recording consent", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("records privacy consent for the authenticated user", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "accepted",
    });
    expect(supabase.from).toHaveBeenCalledWith("user_settings");
    const upsertPayload = supabase.upsertPayload;
    if (!upsertPayload) {
      throw new Error("Expected the consent route to upsert user_settings.");
    }
    expect(upsertPayload).toMatchObject({
      user_id: "user-1",
    });
    expect(typeof upsertPayload.privacy_consent_at).toBe("string");
    expect(upsertPayload.protected_savings_monthly_cents).toBe(20000);
  });

  it("records the protected-savings amount chosen during onboarding", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ protectedSavingsMonthlyCents: 35000 }));

    expect(response.status).toBe(200);
    expect(supabase.upsertPayload).toMatchObject({
      user_id: "user-1",
      protected_savings_monthly_cents: 35000,
    });
  });

  it("requires authentication before validating onboarding protected-savings amounts", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ protectedSavingsMonthlyCents: -1 }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects invalid onboarding protected-savings amounts after authentication", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ protectedSavingsMonthlyCents: -1 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid consent settings.",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("FREE_CASH_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createSupabaseClient(user: { id: string } | null) {
  const supabase = {
    upsertPayload: undefined as undefined | Record<string, unknown>,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      upsert: vi.fn((payload: Record<string, unknown>) => {
        supabase.upsertPayload = payload;
        return Promise.resolve({
          error: null,
        });
      }),
    })),
  };

  return supabase;
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/consent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
