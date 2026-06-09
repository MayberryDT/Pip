import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentResponse } from "@/lib/agent/card-types";
import type { Database, Json } from "@/lib/supabase/database.types";

export const productEventNames = [
  "free_cash_viewed",
  "prompt_chip_selected",
  "agent_question_asked",
  "agent_follow_up_asked",
  "purchase_simulation_requested",
  "true_balances_revealed",
  "missing_card_nudge_shown",
  "missing_card_nudge_suppressed",
  "connect_session_created",
  "connect_session_failed",
  "plaid_link_started",
  "plaid_link_event",
  "plaid_link_succeeded",
  "plaid_link_failed",
  "plaid_exchange_succeeded",
  "plaid_exchange_failed",
  "plaid_sync_succeeded",
  "plaid_sync_failed",
  "negative_free_cash_follow_up",
  "settings_updated",
  "manual_sync_succeeded",
  "manual_sync_partial",
  "manual_sync_failed",
] as const;

export type ProductEventName = (typeof productEventNames)[number];

export const clientReportedProductEventNames = [
  "free_cash_viewed",
  "prompt_chip_selected",
  "plaid_link_started",
  "plaid_link_event",
  "plaid_link_succeeded",
  "plaid_link_failed",
  "plaid_exchange_succeeded",
  "plaid_exchange_failed",
  "plaid_sync_succeeded",
  "plaid_sync_failed",
] as const;

export type ClientReportedProductEventName = (typeof clientReportedProductEventNames)[number];

export async function recordProductEvent(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventName: ProductEventName,
  properties: Json = {},
) {
  const { error } = await supabase.from("product_events").insert({
    user_id: userId,
    event_name: eventName,
    properties,
  });

  if (error) {
    throw error;
  }
}

export async function recordProductEventSafely(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventName: ProductEventName,
  properties: Json = {},
) {
  try {
    await recordProductEvent(supabase, userId, eventName, properties);
  } catch (error) {
    console.warn("Product event logging failed.", getSafeEventErrorMessage(error));
  }
}

export function getAgentProductEventNames(
  response: AgentResponse,
  freeCashTodayCents: number,
  context: { isFollowUp?: boolean; isShortfall?: boolean } = {},
): ProductEventName[] {
  const names = new Set<ProductEventName>(["agent_question_asked"]);
  const cardTypes = response.cards.map((card) => card.type);

  if (context.isFollowUp) {
    names.add("agent_follow_up_asked");
  }

  if (cardTypes.includes("purchase_simulation")) {
    names.add("purchase_simulation_requested");
  }

  if (cardTypes.includes("true_balances")) {
    names.add("true_balances_revealed");
  }

  if (cardTypes.includes("missing_card_nudge")) {
    names.add("missing_card_nudge_shown");
  }

  if (freeCashTodayCents < 0 || context.isShortfall) {
    names.add("negative_free_cash_follow_up");
  }

  return [...names];
}

function getSafeEventErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown product event logging error.";
  }

  return sanitizeEventLogMessage(error.message);
}

function sanitizeEventLogMessage(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(
      /\b(access[_-]?token|secret|private[_-]?key)\s*[:=]\s*["']?[^"',}\s]+/gi,
      "$1=[redacted]",
    )
    .slice(0, 180);
}
