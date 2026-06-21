import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  loadLocalOperatorAgentChats: vi.fn(),
  loadOperatorAgentChats: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/data/agent-chat-turns", () => ({
  loadLocalOperatorAgentChats: routeMocks.loadLocalOperatorAgentChats,
  loadOperatorAgentChats: routeMocks.loadOperatorAgentChats,
}));

import { GET } from "@/app/api/operator/agent-chats/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/operator/agent-chats", () => {
  it("stays closed when operator access is not configured", async () => {
    const response = await GET(jsonRequest("anything"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Operator access is not configured.",
    });
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("requires the configured operator bearer token", async () => {
    vi.stubEnv("PIP_OPERATOR_TOKEN", "operator-secret");

    const response = await GET(jsonRequest("wrong-token"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Operator authentication required.",
    });
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("loads local chat turns when Supabase is disabled", async () => {
    vi.stubEnv("PIP_OPERATOR_TOKEN", "operator-secret");
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    routeMocks.loadLocalOperatorAgentChats.mockResolvedValue([
      {
        id: "turn-1",
        conversationId: "web-1",
        userMessage: "Why this number?",
      },
    ]);

    const response = await GET(jsonRequest("operator-secret", "?limit=10&conversationId=web-1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      source: "local-dev",
      turns: [
        {
          id: "turn-1",
          conversationId: "web-1",
        },
      ],
    });
    expect(routeMocks.loadLocalOperatorAgentChats).toHaveBeenCalledWith({
      limit: 10,
      conversationId: "web-1",
      userId: undefined,
    });
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("loads Supabase chat turns through the server-side admin client", async () => {
    enableSupabaseEnv();
    vi.stubEnv("PIP_OPERATOR_TOKEN", "operator-secret");
    const admin = { kind: "admin" };
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.loadOperatorAgentChats.mockResolvedValue([
      {
        id: "turn-2",
        userId: "user-1",
        conversationId: "web-2",
        userMessage: "Can I spend $50?",
      },
    ]);

    const response = await GET(jsonRequest("operator-secret", "?limit=20&userId=user-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "supabase",
      turns: [
        {
          id: "turn-2",
          userId: "user-1",
        },
      ],
    });
    expect(routeMocks.createSupabaseAdminClient).toHaveBeenCalled();
    expect(routeMocks.loadOperatorAgentChats).toHaveBeenCalledWith(admin, {
      limit: 20,
      conversationId: undefined,
      userId: "user-1",
    });
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function jsonRequest(token: string, query = "") {
  return new Request(`http://localhost/api/operator/agent-chats${query}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}
