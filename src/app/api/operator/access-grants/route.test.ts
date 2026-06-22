import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  grantAppAccess: vi.fn(),
  revokeAppAccess: vi.fn(),
  sendInviteGrantedEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/data/app-access-grants", () => ({
  grantAppAccess: routeMocks.grantAppAccess,
  normalizeAppAccessEmail: (email: string) => email.trim().toLowerCase(),
  revokeAppAccess: routeMocks.revokeAppAccess,
}));

vi.mock("@/lib/email/transactional", () => ({
  sendInviteGrantedEmail: routeMocks.sendInviteGrantedEmail,
}));

import { POST } from "@/app/api/operator/access-grants/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/operator/access-grants", () => {
  it("requires the configured operator bearer token", async () => {
    enableSupabaseEnv();
    vi.stubEnv("PIP_OPERATOR_TOKEN", "operator-secret");

    const response = await POST(jsonRequest("wrong-token", { email: "tester@example.com", action: "grant" }));

    expect(response.status).toBe(401);
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects invalid grant requests", async () => {
    enableSupabaseEnv();
    vi.stubEnv("PIP_OPERATOR_TOKEN", "operator-secret");

    const response = await POST(jsonRequest("operator-secret", { email: "nope", action: "grant" }));

    expect(response.status).toBe(400);
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("grants app access by email and returns the app URL", async () => {
    enableSupabaseEnv();
    vi.stubEnv("PIP_OPERATOR_TOKEN", "operator-secret");
    const admin = { kind: "admin" };
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.grantAppAccess.mockResolvedValue({
      normalized_email: "tester@example.com",
      status: "active",
    });
    routeMocks.sendInviteGrantedEmail.mockResolvedValue({
      status: "sent",
      provider: "resend",
      providerMessageId: "msg_123",
    });

    const response = await POST(
      jsonRequest("operator-secret", {
        email: "Tester@Example.COM",
        action: "grant",
        note: "met at launch",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "granted",
      normalizedEmail: "tester@example.com",
      appUrl: "https://spendwithpip.com/app",
      inviteEmailStatus: "sent",
    });
    expect(routeMocks.grantAppAccess).toHaveBeenCalledWith(admin, {
      email: "Tester@Example.COM",
      source: "operator",
      note: "met at launch",
    });
    expect(routeMocks.sendInviteGrantedEmail).toHaveBeenCalledWith(admin, {
      email: "Tester@Example.COM",
      normalizedEmail: "tester@example.com",
      appUrl: "https://spendwithpip.com/app",
    });
  });

  it("keeps a successful grant visible when invite email delivery fails", async () => {
    enableSupabaseEnv();
    vi.stubEnv("PIP_OPERATOR_TOKEN", "operator-secret");
    const admin = { kind: "admin" };
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.grantAppAccess.mockResolvedValue({
      normalized_email: "tester@example.com",
      status: "active",
    });
    routeMocks.sendInviteGrantedEmail.mockResolvedValue({
      status: "failed",
      provider: "resend",
      errorMessage: "domain not verified",
    });

    const response = await POST(
      jsonRequest("operator-secret", {
        email: "Tester@Example.COM",
        action: "grant",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "granted",
      normalizedEmail: "tester@example.com",
      inviteEmailStatus: "failed",
    });
  });

  it("revokes app access by email", async () => {
    enableSupabaseEnv();
    vi.stubEnv("PIP_OPERATOR_TOKEN", "operator-secret");
    const admin = { kind: "admin" };
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.revokeAppAccess.mockResolvedValue(undefined);

    const response = await POST(
      jsonRequest("operator-secret", {
        email: "Tester@Example.COM",
        action: "revoke",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "revoked",
      normalizedEmail: "tester@example.com",
    });
    expect(routeMocks.revokeAppAccess).toHaveBeenCalledWith(admin, "Tester@Example.COM");
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://spendwithpip.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
}

function jsonRequest(token: string, body: unknown) {
  return new Request("https://spendwithpip.com/api/operator/access-grants", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
