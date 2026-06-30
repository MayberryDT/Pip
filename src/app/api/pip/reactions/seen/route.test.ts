import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  markPipReactionSeenForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/data/pip-reactions", () => ({
  markPipReactionSeenForUser: routeMocks.markPipReactionSeenForUser,
}));

import { POST } from "@/app/api/pip/reactions/seen/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/pip/reactions/seen", () => {
  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(request({ reactionId: reactionId() }));

    expect(response.status).toBe(503);
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    const response = await POST(request({ reactionId: reactionId() }));

    expect(response.status).toBe(401);
    expect(routeMocks.markPipReactionSeenForUser).not.toHaveBeenCalled();
  });

  it("marks the current user's reaction as seen", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.markPipReactionSeenForUser.mockResolvedValue({
      id: reactionId(),
      reactionType: "small_lift",
    });

    const response = await POST(request({ reactionId: reactionId() }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "seen",
      reaction: {
        reactionType: "small_lift",
      },
    });
    expect(routeMocks.markPipReactionSeenForUser).toHaveBeenCalledWith(supabase, {
      userId: "user-1",
      reactionId: reactionId(),
    });
  });

  it("returns 404 when the reaction does not belong to the user", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(
      createSupabaseClient({ id: "user-1" }),
    );
    routeMocks.markPipReactionSeenForUser.mockResolvedValue(null);

    const response = await POST(request({ reactionId: reactionId() }));

    expect(response.status).toBe(404);
  });
});

function request(body: unknown) {
  return new Request("http://localhost/api/pip/reactions/seen", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

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

function reactionId() {
  return "00000000-0000-4000-8000-000000000001";
}
