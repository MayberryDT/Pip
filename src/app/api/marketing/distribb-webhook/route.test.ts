import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

import { POST } from "@/app/api/marketing/distribb-webhook/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/marketing/distribb-webhook", () => {
  it("requires configuration and a matching secret", async () => {
    const unconfigured = await POST(jsonRequest({}, "secret"));

    expect(unconfigured.status).toBe(503);

    vi.stubEnv("DISTRIBB_WEBHOOK_SECRET", "secret");
    const unauthorized = await POST(jsonRequest({}, "wrong"));

    expect(unauthorized.status).toBe(401);
  });

  it("rejects invalid draft payloads", async () => {
    vi.stubEnv("DISTRIBB_WEBHOOK_SECRET", "secret");

    const response = await POST(
      jsonRequest(
        {
          slug: "No Spaces Allowed",
        },
        "secret",
      ),
    );

    expect(response.status).toBe(400);
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("skips draft storage when Supabase is disabled locally", async () => {
    vi.stubEnv("DISTRIBB_WEBHOOK_SECRET", "secret");
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(
      jsonRequest(
        {
          slug: "draft-from-distribb",
          title: "Draft from Distribb",
        },
        "secret",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "skipped" });
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("stores only a received draft payload", async () => {
    enableEnv();
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "marketing_content_drafts") {
        return { insert };
      }

      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });
    routeMocks.createSupabaseAdminClient.mockReturnValue({ from });

    const response = await POST(
      jsonRequest(
        {
          slug: "draft-from-distribb",
          title: "Draft from Distribb",
          payload: {
            body: "Draft only",
          },
        },
        "secret",
      ),
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      source: "distribb",
      slug: "draft-from-distribb",
      title: "Draft from Distribb",
      payload: {
        body: "Draft only",
      },
      status: "received",
    });
    expect(from).not.toHaveBeenCalledWith("articles");
  });
});

function enableEnv() {
  vi.stubEnv("DISTRIBB_WEBHOOK_SECRET", "secret");
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
}

function jsonRequest(body: unknown, secret: string | null) {
  return new Request("https://spendwithpip.com/api/marketing/distribb-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-distribb-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}
