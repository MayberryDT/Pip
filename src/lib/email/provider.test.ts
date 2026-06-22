import { describe, expect, it, vi } from "vitest";
import { sendEmailWithProvider, type EmailProvider } from "@/lib/email/provider";

describe("email provider wrapper", () => {
  it("returns skipped when no provider is available", async () => {
    const result = await sendEmailWithProvider(null, {
      to: "tyler@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
      tags: [{ name: "kind", value: "waitlist_confirmation" }],
    });

    expect(result).toEqual({ status: "skipped", provider: "none" });
  });

  it("passes message through to provider", async () => {
    const provider: EmailProvider = {
      name: "resend",
      send: vi.fn().mockResolvedValue({
        status: "sent",
        provider: "resend",
        providerMessageId: "msg_123",
      }),
    };

    const result = await sendEmailWithProvider(provider, {
      to: "tyler@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
      tags: [{ name: "kind", value: "waitlist_confirmation" }],
    });

    expect(provider.send).toHaveBeenCalledOnce();
    if (result.status !== "sent") {
      throw new Error("Expected provider send to return sent.");
    }
    expect(result.providerMessageId).toBe("msg_123");
  });
});
