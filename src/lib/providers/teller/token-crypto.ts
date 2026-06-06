import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ProviderUnavailableError } from "@/lib/providers/provider-errors";

const TOKEN_CIPHER_VERSION = "v1";
const IV_BYTES = 12;

export function encryptProviderToken(token: string, keyBase64 = process.env.FREE_CASH_PROVIDER_TOKEN_KEY_BASE64): string {
  const key = getTokenKey(keyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    TOKEN_CIPHER_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptProviderToken(ciphertext: string, keyBase64 = process.env.FREE_CASH_PROVIDER_TOKEN_KEY_BASE64): string {
  const [version, ivBase64, authTagBase64, tokenBase64] = ciphertext.split(":");

  if (version !== TOKEN_CIPHER_VERSION || !ivBase64 || !authTagBase64 || !tokenBase64) {
    throw new Error("Unsupported provider token ciphertext.");
  }

  const decipher = createDecipheriv("aes-256-gcm", getTokenKey(keyBase64), Buffer.from(ivBase64, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(tokenBase64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getTokenKey(keyBase64: string | undefined): Buffer {
  if (!keyBase64) {
    throw new ProviderUnavailableError(
      "teller",
      "Set FREE_CASH_PROVIDER_TOKEN_KEY_BASE64 before storing provider tokens.",
    );
  }

  const key = Buffer.from(keyBase64, "base64");

  if (key.length !== 32) {
    throw new ProviderUnavailableError(
      "teller",
      "FREE_CASH_PROVIDER_TOKEN_KEY_BASE64 must decode to 32 bytes.",
    );
  }

  return key;
}
