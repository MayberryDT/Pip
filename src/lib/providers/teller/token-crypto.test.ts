import { describe, expect, it } from "vitest";
import { decryptProviderToken, encryptProviderToken } from "@/lib/providers/teller/token-crypto";

describe("provider token encryption", () => {
  it("round-trips a Teller access token with AES-GCM", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const ciphertext = encryptProviderToken("token_secret", key);

    expect(ciphertext).not.toContain("token_secret");
    expect(decryptProviderToken(ciphertext, key)).toBe("token_secret");
  });
});
