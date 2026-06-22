import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailConfig, isEmailConfigured } from "@/lib/email/env";

describe("email env", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off when PIP_EMAIL_MODE is off", () => {
    vi.stubEnv("PIP_EMAIL_MODE", "off");
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("PIP_EMAIL_FROM", "Pip <hello@spendwithpip.com>");
    vi.stubEnv("PIP_EMAIL_POSTAL_ADDRESS", "123 Pip St, Denver, CO");

    expect(isEmailConfigured()).toBe(false);
  });

  it("requires Resend key, from address, postal address, and unsubscribe secret", () => {
    expect(isEmailConfigured()).toBe(false);
    expect(() => getEmailConfig()).toThrow(
      "Set RESEND_API_KEY, PIP_EMAIL_FROM, PIP_EMAIL_POSTAL_ADDRESS, and PIP_EMAIL_UNSUBSCRIBE_SECRET",
    );
  });

  it("returns configured email settings", () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("PIP_EMAIL_FROM", "Pip <hello@spendwithpip.com>");
    vi.stubEnv("PIP_EMAIL_REPLY_TO", "support@spendwithpip.com");
    vi.stubEnv("PIP_EMAIL_POSTAL_ADDRESS", "123 Pip St, Denver, CO");
    vi.stubEnv("PIP_EMAIL_UNSUBSCRIBE_SECRET", "unsubscribe-secret");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_123");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://spendwithpip.com");

    expect(getEmailConfig()).toEqual({
      provider: "resend",
      apiKey: "resend-key",
      from: "Pip <hello@spendwithpip.com>",
      replyTo: "support@spendwithpip.com",
      postalAddress: "123 Pip St, Denver, CO",
      unsubscribeSecret: "unsubscribe-secret",
      resendWebhookSecret: "whsec_123",
      siteUrl: "https://spendwithpip.com",
    });
  });
});
