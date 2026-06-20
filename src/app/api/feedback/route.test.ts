import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

import { POST } from "@/app/api/feedback/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/feedback", () => {
  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ message: "Looks good." }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "FEEDBACK_UNAVAILABLE",
      error: "Feedback is unavailable in this build.",
    });
  });

  it("requires authentication before accepting feedback", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    const response = await POST(jsonRequest({ message: "Looks good." }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "AUTH_REQUIRED",
      error: "Sign in to send feedback.",
    });
  });

  it("rejects blank feedback", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));

    const response = await POST(jsonRequest({ message: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_FEEDBACK",
      error: "Enter feedback before sending.",
    });
  });

  it("returns a safe save failure when feedback insert fails", async () => {
    enableSupabaseEnv();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const supabase = createSupabaseClient({ id: "user-1", email: "play-review@animasai.co" });
    supabase.insert.mockResolvedValue({
      error: new Error("relation tester_feedback does not exist: access_token=provider-secret"),
    });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ message: "The report panel did not scroll." }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "FEEDBACK_SAVE_FAILED",
      error: "I couldn’t save that feedback. You can keep using Pip.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[feedback] feedback save failed",
      expect.stringContaining("relation tester_feedback does not exist"),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[feedback] feedback save failed",
      expect.not.stringContaining("provider-secret"),
    );
  });

  it("records Android metadata with authenticated tester feedback", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1", email: "play-review@animasai.co" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(
      jsonRequest(
        { message: "The number loaded." },
        {
          "user-agent": "Mozilla/5.0 PipAndroid/1 VersionCode/13",
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "sent",
    });
    expect(supabase.from).toHaveBeenCalledWith("tester_feedback");
    expect(supabase.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      email: "play-review@animasai.co",
      message: "The number loaded.",
      platform: "android_webview",
      app_version: "android-version-code-13",
      user_agent: "Mozilla/5.0 PipAndroid/1 VersionCode/13",
    });
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createSupabaseClient(user: { id: string; email?: string } | null) {
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
    from: vi.fn().mockReturnValue({
      insert,
    }),
  };
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://spendwithpip.com/api/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
