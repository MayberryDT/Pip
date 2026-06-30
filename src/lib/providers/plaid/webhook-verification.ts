import { createHash, webcrypto } from "node:crypto";
import type { JWKPublicKey } from "plaid";
import { createPlaidClient, getPlaidConfig, type PlaidClient } from "@/lib/providers/plaid/config";

const PLAID_WEBHOOK_MAX_AGE_SECONDS = 5 * 60;
const PLAID_WEBHOOK_CLOCK_SKEW_SECONDS = 60;

export type PlaidWebhookVerificationResult = {
  status: "verified";
  keyId: string;
  bodySha256: string;
  issuedAt: number;
};

export class PlaidWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaidWebhookVerificationError";
  }
}

export async function verifyPlaidWebhookRequest(input: {
  bodyText: string;
  verificationHeader: string | null;
  client?: PlaidClient;
  keyLoader?: (keyId: string) => Promise<JWKPublicKey>;
  now?: Date;
}): Promise<PlaidWebhookVerificationResult> {
  const token = input.verificationHeader?.trim();

  if (!token) {
    throw new PlaidWebhookVerificationError("Missing Plaid webhook verification header.");
  }

  const parsed = parseJwt(token);
  const keyId = getStringClaim(parsed.header, "kid");
  const algorithm = getStringClaim(parsed.header, "alg");

  if (!keyId) {
    throw new PlaidWebhookVerificationError("Plaid webhook verification header is missing kid.");
  }

  if (algorithm !== "ES256") {
    throw new PlaidWebhookVerificationError("Unsupported Plaid webhook signature algorithm.");
  }

  const bodySha256 = hashWebhookBody(input.bodyText);
  const signedBodySha256 = getStringClaim(parsed.payload, "request_body_sha256");

  if (signedBodySha256 !== bodySha256) {
    throw new PlaidWebhookVerificationError("Plaid webhook body hash did not match.");
  }

  const issuedAt = getNumberClaim(parsed.payload, "iat");

  if (!issuedAt) {
    throw new PlaidWebhookVerificationError("Plaid webhook verification payload is missing iat.");
  }

  assertIssuedAtFresh(issuedAt, input.now ?? new Date());

  const key = input.keyLoader
    ? await input.keyLoader(keyId)
    : await loadPlaidWebhookVerificationKey(keyId, input.client);

  assertKeyUsable(key, keyId, input.now ?? new Date());

  const validSignature = await verifyJwtSignature({
    key,
    signingInput: parsed.signingInput,
    signature: parsed.signature,
  });

  if (!validSignature) {
    throw new PlaidWebhookVerificationError("Plaid webhook signature was invalid.");
  }

  return {
    status: "verified",
    keyId,
    bodySha256,
    issuedAt,
  };
}

export function hashWebhookBody(bodyText: string): string {
  return createHash("sha256").update(bodyText, "utf8").digest("hex");
}

async function loadPlaidWebhookVerificationKey(
  keyId: string,
  client: PlaidClient = createPlaidClient(getPlaidConfig()),
): Promise<JWKPublicKey> {
  const response = await client.webhookVerificationKeyGet({
    key_id: keyId,
  });

  return response.data.key;
}

async function verifyJwtSignature(input: {
  key: JWKPublicKey;
  signingInput: string;
  signature: Uint8Array;
}): Promise<boolean> {
  const publicKey = await webcrypto.subtle.importKey(
    "jwk",
    {
      kty: input.key.kty,
      crv: input.key.crv,
      x: input.key.x,
      y: input.key.y,
      use: input.key.use,
      alg: input.key.alg,
    },
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["verify"],
  );

  return webcrypto.subtle.verify(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    publicKey,
    input.signature,
    new TextEncoder().encode(input.signingInput),
  );
}

function parseJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Uint8Array;
} {
  const parts = token.split(".");

  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new PlaidWebhookVerificationError("Malformed Plaid webhook verification token.");
  }

  return {
    header: parseBase64UrlJson(parts[0]),
    payload: parseBase64UrlJson(parts[1]),
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: base64UrlDecode(parts[2]),
  };
}

function parseBase64UrlJson(encoded: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded)));

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JWT part was not an object.");
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new PlaidWebhookVerificationError("Plaid webhook verification token was not valid JSON.");
  }
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

  return Buffer.from(padded, "base64");
}

function getStringClaim(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function getNumberClaim(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assertIssuedAtFresh(issuedAt: number, now: Date) {
  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (issuedAt > nowSeconds + PLAID_WEBHOOK_CLOCK_SKEW_SECONDS) {
    throw new PlaidWebhookVerificationError("Plaid webhook verification token is from the future.");
  }

  if (nowSeconds - issuedAt > PLAID_WEBHOOK_MAX_AGE_SECONDS) {
    throw new PlaidWebhookVerificationError("Plaid webhook verification token is too old.");
  }
}

function assertKeyUsable(key: JWKPublicKey, expectedKeyId: string, now: Date) {
  if (key.kid !== expectedKeyId || key.kty !== "EC" || key.crv !== "P-256") {
    throw new PlaidWebhookVerificationError("Plaid webhook verification key was not usable.");
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (key.expired_at && key.expired_at <= nowSeconds) {
    throw new PlaidWebhookVerificationError("Plaid webhook verification key is expired.");
  }
}
