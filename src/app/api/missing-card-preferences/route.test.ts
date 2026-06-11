import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  markPipCashSnapshotsStaleForUser: vi.fn(),
  recordProductEventSafely: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/financial-repository", () => ({
  markPipCashSnapshotsStaleForUser: routeMocks.markPipCashSnapshotsStaleForUser,
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: routeMocks.recordProductEventSafely,
}));

import { POST } from "@/app/api/missing-card-preferences/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/missing-card-preferences", () => {
  it("requires authentication before validating issuer names", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ issuerName: "   " }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects blank issuer names after authentication", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ issuerName: "   " }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Issuer name is required.",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("requires authentication before suppressing a nudge", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ issuerName: "Amex" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns 503 on valid suppression requests when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ issuerName: "Amex" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase is not configured.",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });


  it("inserts a trimmed missing-card preference when none exists", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" }, null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.markPipCashSnapshotsStaleForUser.mockResolvedValue(undefined);
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);

    const response = await POST(jsonRequest({ issuerName: " Amex " }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "suppressed",
      issuerName: "Amex",
    });
    expect(supabase.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      issuer_name: "Amex",
    });
    expect(routeMocks.markPipCashSnapshotsStaleForUser).toHaveBeenCalledWith(
      supabase,
      "user-1",
    );
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "missing_card_nudge_suppressed",
      {
        issuerName: "Amex",
      },
    );
  });

  it("keeps suppression idempotent when the issuer preference already exists", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" }, { id: "preference-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.recordProductEventSafely.mockResolvedValue(undefined);

    const response = await POST(jsonRequest({ issuerName: "Amex" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "suppressed",
      issuerName: "Amex",
    });
    expect(supabase.insert).not.toHaveBeenCalled();
    expect(routeMocks.markPipCashSnapshotsStaleForUser).not.toHaveBeenCalled();
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "missing_card_nudge_suppressed",
      {
        issuerName: "Amex",
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
  existingPreference: { id: string } | null = null,
) {
  const insert = vi.fn().mockResolvedValue({
    error: null,
  });

  return {
    insert,
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
          ilike: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: existingPreference,
              error: null,
            }),
          })),
        })),
      })),
      insert,
    })),
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/missing-card-preferences", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
