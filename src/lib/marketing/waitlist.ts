import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

export const waitlistInputSchema = z.object({
  email: z.string().trim().email().max(320),
  sourcePage: z.string().trim().min(1).max(200),
  referrer: z.string().trim().max(500).nullable().optional(),
  utm: z
    .object({
      utm_source: z.string().trim().max(120).nullable().optional(),
      utm_medium: z.string().trim().max(120).nullable().optional(),
      utm_campaign: z.string().trim().max(160).nullable().optional(),
    })
    .optional(),
});

type WaitlistInput = z.infer<typeof waitlistInputSchema>;
type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitWindowMs = 60_000;
const maxSubmissionsPerWindow = 6;
const rateLimitStore = new Map<string, RateLimitEntry>();

export function normalizeWaitlistEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getMarketingRateLimitKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";
  const userAgent = request.headers.get("user-agent")?.trim() ?? "";

  return createHash("sha256")
    .update(`${forwardedFor || realIp || "unknown"}:${userAgent}`)
    .digest("hex");
}

export function checkMarketingRateLimit(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds?: number } {
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + rateLimitWindowMs,
    });
    return { allowed: true };
  }

  if (existing.count >= maxSubmissionsPerWindow) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true };
}

export async function submitMarketingWaitlist(
  supabase: SupabaseClient<Database>,
  input: WaitlistInput,
) {
  const normalizedEmail = normalizeWaitlistEmail(input.email);
  const { error } = await supabase.from("marketing_waitlist").upsert(
    {
      normalized_email: normalizedEmail,
      display_email: input.email.trim(),
      source_page: input.sourcePage,
      referrer: input.referrer || null,
      utm_source: input.utm?.utm_source || null,
      utm_medium: input.utm?.utm_medium || null,
      utm_campaign: input.utm?.utm_campaign || null,
      consent_text_version: "2026-06-11-marketing-beta",
      status: "joined",
      last_submitted_at: new Date().toISOString(),
    },
    {
      onConflict: "normalized_email",
    },
  );

  if (error) {
    throw error;
  }

  return {
    status: "joined" as const,
  };
}
