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
type WaitlistSubmissionInput = WaitlistInput & {
  sourceKind?: "marketing_page" | "app_oauth";
  authUserId?: string;
};
type WaitlistRowForMerge = Pick<
  Database["public"]["Tables"]["marketing_waitlist"]["Row"],
  "normalized_email" | "app_waitlist_requested_at" | "app_waitlist_request_count"
>;
type WaitlistLastFields = Required<Pick<
  Database["public"]["Tables"]["marketing_waitlist"]["Update"],
  | "display_email"
  | "last_source_page"
  | "last_referrer"
  | "last_utm_source"
  | "last_utm_medium"
  | "last_utm_campaign"
  | "consent_text_version"
  | "status"
  | "last_submitted_at"
>> &
  Pick<
    Database["public"]["Tables"]["marketing_waitlist"]["Update"],
    | "newsletter_opt_in_at"
    | "newsletter_unsubscribed_at"
    | "newsletter_unsubscribe_reason"
  >;
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
  input: WaitlistSubmissionInput,
) {
  const normalizedEmail = normalizeWaitlistEmail(input.email);
  const sourceKind = input.sourceKind ?? "marketing_page";
  const submittedAt = new Date().toISOString();
  const existing = await loadExistingWaitlistRow(supabase, normalizedEmail);
  const baseLastFields = buildWaitlistLastFields(input, submittedAt, sourceKind);
  const appIntentFields = buildAppIntentFields(input, existing, submittedAt, sourceKind);

  if (existing) {
    await updateExistingWaitlistRow(supabase, normalizedEmail, {
      ...baseLastFields,
      ...appIntentFields,
    });
    return {
      status: "joined" as const,
      normalizedEmail,
    };
  }

  const { error } = await supabase.from("marketing_waitlist").insert({
    normalized_email: normalizedEmail,
    source_page: input.sourcePage,
    referrer: input.referrer || null,
    utm_source: input.utm?.utm_source || null,
    utm_medium: input.utm?.utm_medium || null,
    utm_campaign: input.utm?.utm_campaign || null,
    ...baseLastFields,
    ...appIntentFields,
  });

  if (isUniqueViolation(error)) {
    const retryExisting = await loadExistingWaitlistRow(supabase, normalizedEmail);
    await updateExistingWaitlistRow(supabase, normalizedEmail, {
      ...baseLastFields,
      ...buildAppIntentFields(input, retryExisting, submittedAt, sourceKind),
    });
    return {
      status: "joined" as const,
      normalizedEmail,
    };
  }

  if (error) {
    throw error;
  }

  return {
    status: "joined" as const,
    normalizedEmail,
  };
}

function buildWaitlistLastFields(
  input: WaitlistSubmissionInput,
  submittedAt: string,
  sourceKind: WaitlistSubmissionInput["sourceKind"],
): WaitlistLastFields {
  const fields: WaitlistLastFields = {
    display_email: input.email.trim(),
    last_source_page: input.sourcePage,
    last_referrer: input.referrer || null,
    last_utm_source: input.utm?.utm_source || null,
    last_utm_medium: input.utm?.utm_medium || null,
    last_utm_campaign: input.utm?.utm_campaign || null,
    consent_text_version: "2026-06-21-marketing-beta-waitlist",
    status: "joined",
    last_submitted_at: submittedAt,
  };

  if (sourceKind === "marketing_page") {
    fields.newsletter_opt_in_at = submittedAt;
    fields.newsletter_unsubscribed_at = null;
    fields.newsletter_unsubscribe_reason = null;
  }

  return fields;
}

function buildAppIntentFields(
  input: WaitlistSubmissionInput,
  existing: WaitlistRowForMerge | null,
  submittedAt: string,
  sourceKind: WaitlistSubmissionInput["sourceKind"],
): Database["public"]["Tables"]["marketing_waitlist"]["Update"] {
  if (sourceKind !== "app_oauth") {
    return {};
  }

  return {
    auth_user_id: input.authUserId ?? null,
    app_waitlist_requested_at: existing?.app_waitlist_requested_at ?? submittedAt,
    app_waitlist_last_requested_at: submittedAt,
    app_waitlist_request_count: (existing?.app_waitlist_request_count ?? 0) + 1,
  };
}

async function loadExistingWaitlistRow(
  supabase: SupabaseClient<Database>,
  normalizedEmail: string,
): Promise<WaitlistRowForMerge | null> {
  const { data, error } = await supabase
    .from("marketing_waitlist")
    .select("normalized_email, app_waitlist_requested_at, app_waitlist_request_count")
    .eq("normalized_email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function updateExistingWaitlistRow(
  supabase: SupabaseClient<Database>,
  normalizedEmail: string,
  fields: Database["public"]["Tables"]["marketing_waitlist"]["Update"],
) {
  const { error } = await supabase
    .from("marketing_waitlist")
    .update(fields)
    .eq("normalized_email", normalizedEmail);

  if (error) {
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
