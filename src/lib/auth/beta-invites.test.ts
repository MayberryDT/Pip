import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/auth/beta-invites";

describe("beta invite auth", () => {
  it("normalizes emails before invite lookup", () => {
    expect(normalizeEmail(" Tyler@Example.COM ")).toBe("tyler@example.com");
  });

  it("keeps sign-in invite-gated before sending an OTP", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/auth/sign-in/route.ts"),
      "utf8",
    );

    expect(source).toContain("assertInvitedEmail");
    expect(source.indexOf("assertInvitedEmail")).toBeLessThan(source.indexOf("signInWithOtp"));
    expect(source).toContain("shouldCreateUser: true");
  });

  it("accepts the invite during the auth callback", () => {
    const source = readFileSync(join(process.cwd(), "src/app/auth/callback/route.ts"), "utf8");

    expect(source).toContain("exchangeCodeForSession");
    expect(source).toContain("acceptCurrentUserInvite");
  });

  it("keeps invite table checks on the server admin client", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/auth/beta-invites.ts"), "utf8");

    expect(source).toContain("createSupabaseAdminClient");
    expect(source).toContain('from("beta_invites")');
    expect(source).not.toContain(".rpc(");
  });
});
