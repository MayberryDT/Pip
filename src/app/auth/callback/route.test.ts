import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  return {
    createSupabaseServerClient: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
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

  it("exchanges the code and respects a same-origin next path", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET(
      new Request("http://localhost/auth/callback?code=abc123&next=/welcome"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/welcome");
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("redirects successful OAuth callbacks to the canonical public site origin", async () => {
    enableSupabaseEnv();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://free-cash-mayberrydt.netlify.app");
    const supabase = createSupabaseClient({ error: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET(
      new Request(
        "https://main--free-cash-mayberrydt.netlify.app/auth/callback?code=abc123&next=/welcome",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://free-cash-mayberrydt.netlify.app/welcome");
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
  });

  it("redirects failed OAuth callbacks to the canonical public site origin", async () => {
    enableSupabaseEnv();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://free-cash-mayberrydt.netlify.app");
    const supabase = createSupabaseClient({ error: new Error("bad code") });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET(
      new Request("https://main--free-cash-mayberrydt.netlify.app/auth/callback?code=bad"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://free-cash-mayberrydt.netlify.app/?auth=callback-failed",
    );
  });

  it("verifies an email OTP token and respects next", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

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
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("verifies a token hash callback", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

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

    const absoluteResponse = await GET(
      new Request("http://localhost/auth/callback?code=abc123&next=https://evil.example"),
    );
    const protocolRelativeResponse = await GET(
      new Request("http://localhost/auth/callback?code=abc123&next=//evil.example"),
    );

    expect(absoluteResponse.headers.get("location")).toBe("http://localhost/");
    expect(protocolRelativeResponse.headers.get("location")).toBe("http://localhost/");
  });

  it("redirects to an auth error if code exchange fails", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: new Error("bad code") });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/auth/callback?code=bad"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/?auth=callback-failed");
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("redirects to an auth error if OTP verification fails", async () => {
    enableSupabaseEnv();
    const supabase = createSupabaseClient({ error: new Error("bad token") });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await GET(
      new Request("http://localhost/auth/callback?email=mayberrydt%40gmail.com&token=bad&type=magiclink"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/?auth=callback-failed");
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
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
      signOut: vi.fn().mockResolvedValue({
        error: null,
      }),
    },
  };
}
