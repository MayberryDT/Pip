import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  acceptCurrentUserInvite: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/auth/beta-invites", () => ({
  acceptCurrentUserInvite: routeMocks.acceptCurrentUserInvite,
}));

import { GET } from "@/app/auth/callback/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /auth/callback", () => {
  it("redirects home without auth params and avoids Supabase work", async () => {
    enableSupabaseEnv();

    const response = await GET(new Request("http://localhost/auth/callback"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(routeMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("redirects home when Supabase is disabled", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");

    const response = await GET(new Request("http://localhost/auth/callback?code=abc"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("exchanges the code, accepts the invite, and respects a same-origin next path", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.acceptCurrentUserInvite.mockResolvedValue(undefined);

    const response = await GET(
      new Request("http://localhost/auth/callback?code=abc123&next=/welcome"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/welcome");
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(routeMocks.acceptCurrentUserInvite).toHaveBeenCalledWith({
      id: "user-1",
      email: "mayberrydt@gmail.com",
    });
  });

  it("verifies an email OTP token, accepts the invite, and respects next", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.acceptCurrentUserInvite.mockResolvedValue(undefined);

    const response = await GET(
      new Request(
        "http://localhost/auth/callback?email=mayberrydt%40gmail.com&token=123456&type=magiclink&next=/welcome",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/welcome");
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: "mayberrydt@gmail.com",
      token: "123456",
      type: "magiclink",
    });
    expect(routeMocks.acceptCurrentUserInvite).toHaveBeenCalledWith({
      id: "user-1",
      email: "mayberrydt@gmail.com",
    });
  });

  it("verifies a token hash callback", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.acceptCurrentUserInvite.mockResolvedValue(undefined);

    const response = await GET(
      new Request("http://localhost/auth/callback?token_hash=hashed-token&type=email"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hashed-token",
      type: "email",
    });
  });

  it("keeps next redirects inside the app", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.acceptCurrentUserInvite.mockResolvedValue(undefined);

    const absoluteResponse = await GET(
      new Request("http://localhost/auth/callback?code=abc123&next=https://evil.example"),
    );
    const protocolRelativeResponse = await GET(
      new Request("http://localhost/auth/callback?code=abc123&next=//evil.example"),
    );

    expect(absoluteResponse.headers.get("location")).toBe("http://localhost/");
    expect(protocolRelativeResponse.headers.get("location")).toBe("http://localhost/");
  });

  it("does not accept the invite if code exchange fails", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: new Error("bad code") });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/auth/callback?code=bad"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(routeMocks.acceptCurrentUserInvite).not.toHaveBeenCalled();
  });

  it("does not accept the invite if OTP verification fails", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: new Error("bad token") });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET(
      new Request("http://localhost/auth/callback?email=mayberrydt%40gmail.com&token=bad&type=magiclink"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(routeMocks.acceptCurrentUserInvite).not.toHaveBeenCalled();
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("FREE_CASH_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createSupabaseClient(input: { error: Error | null }) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: {
          user: input.error
            ? null
            : {
                id: "user-1",
                email: "mayberrydt@gmail.com",
              },
        },
        error: input.error,
      }),
      verifyOtp: vi.fn().mockResolvedValue({
        data: {
          user: input.error
            ? null
            : {
                id: "user-1",
                email: "mayberrydt@gmail.com",
              },
        },
        error: input.error,
      }),
    },
  };
}
