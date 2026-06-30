import { createHash, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { JWKPublicKey } from "plaid";
import {
  hashWebhookBody,
  verifyPlaidWebhookRequest,
} from "@/lib/providers/plaid/webhook-verification";

describe("Plaid webhook verification", () => {
  it("verifies a Plaid ES256 webhook token against the raw request body hash", async () => {
    const now = new Date("2026-06-05T12:00:00.000Z");
    const bodyText = JSON.stringify({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "item-1",
    });
    const keyPair = await createSigningKeyPair("key-1", now);
    const token = await signPlaidWebhookToken({
      bodyText,
      keyId: "key-1",
      privateKey: keyPair.privateKey,
      issuedAt: Math.floor(now.getTime() / 1000),
    });

    await expect(
      verifyPlaidWebhookRequest({
        bodyText,
        verificationHeader: token,
        keyLoader: async () => keyPair.publicJwk,
        now,
      }),
    ).resolves.toEqual({
      status: "verified",
      keyId: "key-1",
      bodySha256: hashWebhookBody(bodyText),
      issuedAt: Math.floor(now.getTime() / 1000),
    });
  });

  it("rejects tokens when the signed body hash does not match", async () => {
    const now = new Date("2026-06-05T12:00:00.000Z");
    const keyPair = await createSigningKeyPair("key-1", now);
    const token = await signPlaidWebhookToken({
      bodyText: JSON.stringify({ webhook_code: "SYNC_UPDATES_AVAILABLE" }),
      keyId: "key-1",
      privateKey: keyPair.privateKey,
      issuedAt: Math.floor(now.getTime() / 1000),
    });

    await expect(
      verifyPlaidWebhookRequest({
        bodyText: JSON.stringify({ webhook_code: "DEFAULT_UPDATE" }),
        verificationHeader: token,
        keyLoader: async () => keyPair.publicJwk,
        now,
      }),
    ).rejects.toMatchObject({
      name: "PlaidWebhookVerificationError",
      message: "Plaid webhook body hash did not match.",
    });
  });

  it("rejects stale Plaid webhook tokens", async () => {
    const now = new Date("2026-06-05T12:00:00.000Z");
    const bodyText = JSON.stringify({ webhook_code: "SYNC_UPDATES_AVAILABLE" });
    const keyPair = await createSigningKeyPair("key-1", now);
    const token = await signPlaidWebhookToken({
      bodyText,
      keyId: "key-1",
      privateKey: keyPair.privateKey,
      issuedAt: Math.floor(now.getTime() / 1000) - 301,
    });

    await expect(
      verifyPlaidWebhookRequest({
        bodyText,
        verificationHeader: token,
        keyLoader: async () => keyPair.publicJwk,
        now,
      }),
    ).rejects.toMatchObject({
      name: "PlaidWebhookVerificationError",
      message: "Plaid webhook verification token is too old.",
    });
  });
});

async function createSigningKeyPair(
  keyId: string,
  now: Date,
): Promise<{
  privateKey: CryptoKey;
  publicJwk: JWKPublicKey;
}> {
  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
  const createdAt = Math.floor(now.getTime() / 1000) - 60;

  return {
    privateKey: keyPair.privateKey,
    publicJwk: {
      alg: "ES256",
      crv: "P-256",
      kid: keyId,
      kty: "EC",
      use: "sig",
      x: publicJwk.x ?? "",
      y: publicJwk.y ?? "",
      created_at: createdAt,
      expired_at: createdAt + 3600,
    },
  };
}

async function signPlaidWebhookToken(input: {
  bodyText: string;
  keyId: string;
  privateKey: CryptoKey;
  issuedAt: number;
}): Promise<string> {
  const header = encodeBase64UrlJson({
    alg: "ES256",
    kid: input.keyId,
    typ: "JWT",
  });
  const payload = encodeBase64UrlJson({
    iat: input.issuedAt,
    request_body_sha256: createHash("sha256").update(input.bodyText).digest("hex"),
  });
  const signingInput = `${header}.${payload}`;
  const signature = await webcrypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    input.privateKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function encodeBase64UrlJson(value: Record<string, unknown>): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlEncode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}
