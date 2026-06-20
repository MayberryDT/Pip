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

  it("redacts authorization headers without leaving bearer tokens behind", () => {
    expect(sanitizeSensitiveText("Authorization: Bearer abc123")).toBe(
      "Authorization=[redacted]",
    );
    expect(sanitizeSensitiveText("authorization=Basic abc123")).toBe(
      "authorization=[redacted]",
    );
  });

  it("falls back for non-error values", () => {
    expect(getSafeErrorMessage(null, "Request failed.")).toBe("Request failed.");
  });

  it("sanitizes message-shaped errors from data clients", () => {
    expect(
      getSafeErrorMessage(
        {
          message: "Insert failed with access_token=provider-secret sk-test-secret",
        },
        "Request failed.",
      ),
    ).toBe("Insert failed with access_token=[redacted] [redacted]");
  });
});
