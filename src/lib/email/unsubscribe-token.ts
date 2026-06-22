import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeWaitlistEmail } from "@/lib/marketing/waitlist";

export function createUnsubscribeToken(email: string): string {
  const normalizedEmail = normalizeWaitlistEmail(email);
  const payload = Buffer.from(normalizedEmail, "utf8").toString("base64url");
  const signature = sign(payload);

  return `${payload}.${signature}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [payload, signature, extra] = token.split(".");

  if (!payload || !signature || extra) {
    return null;
  }

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  return Buffer.from(payload, "base64url").toString("utf8");
}

function sign(payload: string): string {
  const secret = process.env.PIP_EMAIL_UNSUBSCRIBE_SECRET;

  if (!secret) {
    throw new Error("Set PIP_EMAIL_UNSUBSCRIBE_SECRET to create unsubscribe links.");
  }

  return createHmac("sha256", secret).update(payload).digest("base64url");
}
