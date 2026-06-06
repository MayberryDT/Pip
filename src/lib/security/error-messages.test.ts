import { describe, expect, it } from "vitest";
import { getSafeErrorMessage, sanitizeSensitiveText } from "@/lib/security/error-messages";

describe("safe error messages", () => {
  it("redacts provider and model secret-shaped values", () => {
    expect(
      sanitizeSensitiveText(
        "Failed with sk-proj-secret access_token=provider-token public_token=public-token private_key=key authorization=Bearer-secret Bearer abc123",
      ),
    ).toBe(
      "Failed with [redacted] access_token=[redacted] public_token=[redacted] private_key=[redacted] authorization=[redacted] Bearer [redacted]",
    );
  });

  it("falls back for non-error values", () => {
    expect(getSafeErrorMessage(null, "Request failed.")).toBe("Request failed.");
  });
});
