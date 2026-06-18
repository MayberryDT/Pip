import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

import { POST } from "@/app/api/ai-reports/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/ai-reports", () => {
  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest(validReportBody()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "REPORTING_UNAVAILABLE",
      error: "Reporting is unavailable in this build.",
    });
  });

  it("requires authentication before accepting reports", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    const response = await POST(jsonRequest(validReportBody()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "AUTH_REQUIRED",
      error: "Sign in to report an assistant response.",
    });
  });

  it("rejects invalid report bodies", async () => {
    enableSupabaseEnv();
    routeMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient({ id: "user-1" }));

    const response = await POST(jsonRequest({ ...validReportBody(), reason: "made_up" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_REPORT",
      error: "Choose a report reason before sending.",
    });
  });

  it("returns a safe save failure when the report insert fails", async () => {
    enableSupabaseEnv();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const supabase = createSupabaseClient({ id: "user-1" });
    supabase.insert.mockResolvedValue({
      error: new Error("relation ai_response_reports does not exist"),
    });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest(validReportBody()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "REPORT_SAVE_FAILED",
      error: "I couldn’t save that report. You can keep using Pip.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[ai-reports] report save failed",
      expect.any(Error),
    );
  });

  it("records Android metadata with the authenticated user report", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(
      jsonRequest(validReportBody(), {
        "user-agent": "Mozilla/5.0 PipAndroid/1 VersionCode/12",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "reported",
    });
    expect(supabase.from).toHaveBeenCalledWith("ai_response_reports");
    expect(supabase.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      conversation_id: "conversation-1",
      message_id: "message-1",
      reason: "confusing_or_misleading",
      details: "The math did not match.",
      response_excerpt: "You can spend it.",
      platform: "android_webview",
      app_version: "android-version-code-12",
      user_agent: "Mozilla/5.0 PipAndroid/1 VersionCode/12",
    });
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createSupabaseClient(user: { id: string } | null) {
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

function validReportBody() {
  return {
    conversationId: "conversation-1",
    messageId: "message-1",
    reason: "confusing_or_misleading",
    details: "The math did not match.",
    responseExcerpt: "You can spend it.",
  };
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://spendwithpip.com/api/ai-reports", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
