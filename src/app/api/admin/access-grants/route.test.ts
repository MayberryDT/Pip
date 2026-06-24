import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getAdminAccessState: vi.fn(),
  grantAppAccess: vi.fn(),
  sendInviteGrantedEmail: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  getAdminAccessState: routeMocks.getAdminAccessState,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/data/app-access-grants", () => ({
  grantAppAccess: routeMocks.grantAppAccess,
  normalizeAppAccessEmail: (email: string) => email.trim().toLowerCase(),
}));

vi.mock("@/lib/email/transactional", () => ({
  sendInviteGrantedEmail: routeMocks.sendInviteGrantedEmail,
}));

import { POST } from "@/app/api/admin/access-grants/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/admin/access-grants", () => {
  it("requires a signed-in admin user", async () => {
    routeMocks.getAdminAccessState.mockResolvedValue({ status: "signed-out" });

    const response = await POST(jsonRequest({ email: "person@example.com" }));

    expect(response.status).toBe(401);
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("forbids signed-in non-admin users", async () => {
    routeMocks.getAdminAccessState.mockResolvedValue({
      status: "forbidden",
      email: "friend@example.com",
    });

    const response = await POST(jsonRequest({ email: "person@example.com" }));

    expect(response.status).toBe(403);
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects cross-site browser origins before using admin privileges", async () => {
    routeMocks.getAdminAccessState.mockResolvedValue({
      status: "authorized",
      user: { id: "user-1", email: "mayberrydt@gmail.com", normalizedEmail: "mayberrydt@gmail.com" },
    });

    const response = await POST(
      jsonRequest(
        { email: "person@example.com" },
        {
          origin: "https://evil.example",
        },
      ),
    );

    expect(response.status).toBe(403);
    expect(routeMocks.getAdminAccessState).not.toHaveBeenCalled();
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects invalid email input", async () => {
    routeMocks.getAdminAccessState.mockResolvedValue({
      status: "authorized",
      user: { id: "user-1", email: "mayberrydt@gmail.com", normalizedEmail: "mayberrydt@gmail.com" },
    });

    const response = await POST(jsonRequest({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("grants access and sends the invite email", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://spendwithpip.com");
    routeMocks.getAdminAccessState.mockResolvedValue({
      status: "authorized",
      user: { id: "user-1", email: "mayberrydt@gmail.com", normalizedEmail: "mayberrydt@gmail.com" },
    });
    const supabase = { kind: "admin" };
    routeMocks.createSupabaseAdminClient.mockReturnValue(supabase);
    routeMocks.grantAppAccess.mockResolvedValue({ normalized_email: "person@example.com", status: "active" });
    routeMocks.sendInviteGrantedEmail.mockResolvedValue({
      status: "sent",
      provider: "resend",
      providerMessageId: "msg_123",
    });

    const response = await POST(jsonRequest({ email: "Person@Example.com", note: "first private beta user" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "granted",
      normalizedEmail: "person@example.com",
      appUrl: "https://spendwithpip.com/app",
      inviteEmailStatus: "sent",
    });
    expect(routeMocks.grantAppAccess).toHaveBeenCalledWith(supabase, {
      email: "Person@Example.com",
      source: "admin",
      note: "Admin mayberrydt@gmail.com: first private beta user",
    });
    expect(routeMocks.sendInviteGrantedEmail).toHaveBeenCalledWith(supabase, {
      email: "Person@Example.com",
      normalizedEmail: "person@example.com",
      appUrl: "https://spendwithpip.com/app",
    });
  });

  it("keeps the successful grant visible when invite delivery fails", async () => {
    routeMocks.getAdminAccessState.mockResolvedValue({
      status: "authorized",
      user: { id: "user-1", email: "mayberrydt@gmail.com", normalizedEmail: "mayberrydt@gmail.com" },
    });
    routeMocks.createSupabaseAdminClient.mockReturnValue({ kind: "admin" });
    routeMocks.grantAppAccess.mockResolvedValue({ normalized_email: "person@example.com", status: "active" });
    routeMocks.sendInviteGrantedEmail.mockResolvedValue({
      status: "failed",
      provider: "resend",
      errorMessage: "domain not verified",
    });

    const response = await POST(jsonRequest({ email: "person@example.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "granted",
      normalizedEmail: "person@example.com",
      inviteEmailStatus: "failed",
    });
  });
});

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://spendwithpip.com/api/admin/access-grants", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
