import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  recordProductEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/product-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/product-events")>();

  return {
    ...actual,
    recordProductEvent: routeMocks.recordProductEvent,
  };
});

import { POST } from "@/app/api/events/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/events", () => {
  it("requires authentication before validating browser events", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    const response = await POST(jsonRequest({ eventName: "made_up_event" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("rejects invalid events after authentication", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));

    const response = await POST(jsonRequest({ eventName: "made_up_event" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid event.",
    });
    expect(routeMocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("rejects server-derived product events from the browser endpoint after authentication", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));

    const response = await POST(jsonRequest({ eventName: "true_balances_revealed" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid event.",
    });
    expect(routeMocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("skips event writes when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ eventName: "pip_cash_viewed" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "skipped",
    });
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires authentication before recording product events", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    const response = await POST(jsonRequest({ eventName: "prompt_chip_selected" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(routeMocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("records authenticated primitive event properties", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.recordProductEvent.mockResolvedValue(undefined);

    const response = await POST(
      jsonRequest({
        eventName: "prompt_chip_selected",
        properties: {
          chipId: "why",
          negative: false,
          amount: 4300,
          unused: null,
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "recorded",
    });
    expect(routeMocks.recordProductEvent).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "prompt_chip_selected",
      {
        chipId: "why",
        negative: false,
        amount: 4300,
        unused: null,
      },
    );
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

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

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
