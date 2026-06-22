import { describe, expect, it, vi } from "vitest";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";

describe("unsubscribe token", () => {
  it("round-trips a normalized email", () => {
    vi.stubEnv("PIP_EMAIL_UNSUBSCRIBE_SECRET", "secret");

    const token = createUnsubscribeToken("Tyler@Example.com");

    expect(verifyUnsubscribeToken(token)).toBe("tyler@example.com");
  });

  it("rejects tampered tokens", () => {
    vi.stubEnv("PIP_EMAIL_UNSUBSCRIBE_SECRET", "secret");

    const token = createUnsubscribeToken("tyler@example.com");

    expect(verifyUnsubscribeToken(`${token}x`)).toBeNull();
  });
});
