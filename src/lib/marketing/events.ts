import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/lib/supabase/database.types";

export const marketingEventNames = [
  "marketing_page_view",
  "marketing_cta_clicked",
  "waitlist_signup_submitted",
  "waitlist_signup_succeeded",
  "waitlist_signup_failed",
  "blog_article_viewed",
  "blog_cta_clicked",
  "outbound_app_link_clicked",
  "distribb_webhook_received",
] as const;

const propertySchema = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);

export const marketingEventSchema = z.object({
  eventName: z.enum(marketingEventNames),
  properties: z.record(z.string(), propertySchema).optional(),
});

const allowedPropertyKeys = new Set([
  "page",
  "slug",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "cta_label",
  "href",
  "article_tags",
  "statusCode",
  "statusCodeClass",
  "sessionId",
]);

export type MarketingEventInput = z.infer<typeof marketingEventSchema>;

export async function recordMarketingEvent(
  supabase: SupabaseClient<Database>,
  input: MarketingEventInput,
) {
  const { error } = await supabase.from("marketing_events").insert({
    event_name: input.eventName,
    properties: sanitizeMarketingProperties(input.properties ?? {}),
  });

  if (error) {
    throw error;
  }

  return {
    status: "recorded" as const,
  };
}

export function sanitizeMarketingProperties(
  properties: Record<string, string | number | boolean | null>,
): Json {
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => allowedPropertyKeys.has(key))
      .map(([key, value]) => [key, value]),
  ) as Json;
}
