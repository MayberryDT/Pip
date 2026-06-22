import { describe, expect, it } from "vitest";
import {
  buildAppWaitlistConfirmationEmail,
  buildInviteGrantedEmail,
  buildWaitlistConfirmationEmail,
} from "@/lib/email/templates";

describe("email templates", () => {
  it("renders public waitlist confirmation", () => {
    const message = buildWaitlistConfirmationEmail({
      email: "tyler@example.com",
      unsubscribeUrl: "https://spendwithpip.com/unsubscribe?token=abc",
      postalAddress: "123 Pip St, Denver, CO",
    });

    expect(message.subject).toBe("You're on the Pip waitlist");
    expect(message.text).toContain("You're on the Pip waitlist.");
    expect(message.html).toContain("You're on the Pip waitlist.");
    expect(message.html).toContain("unsubscribe");
  });

  it("renders app waitlist confirmation", () => {
    const message = buildAppWaitlistConfirmationEmail({
      email: "tyler@example.com",
      unsubscribeUrl: "https://spendwithpip.com/unsubscribe?token=abc",
      postalAddress: "123 Pip St, Denver, CO",
    });

    expect(message.subject).toBe("You're on the Pip app access list");
    expect(message.text).toContain("Google sign-in");
  });

  it("renders invite granted email", () => {
    const message = buildInviteGrantedEmail({
      email: "tyler@example.com",
      appUrl: "https://spendwithpip.com/app",
      unsubscribeUrl: "https://spendwithpip.com/unsubscribe?token=abc",
      postalAddress: "123 Pip St, Denver, CO",
    });

    expect(message.subject).toBe("Your Pip access is ready");
    expect(message.text).toContain("https://spendwithpip.com/app");
  });
});
