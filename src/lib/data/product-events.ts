import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentResponse } from "@/lib/agent/card-types";
import { getSafeErrorMessage, sanitizeSensitiveText } from "@/lib/security/error-messages";
import type { Database, Json } from "@/lib/supabase/database.types";

export const productEventNames = [
  "pip_cash_viewed",
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
  "negative_pip_cash_follow_up",
  "financial_guidance_requested",
  "financial_guidance_context_built",
  "financial_guidance_card_drafted",
  "financial_guidance_card_shown",
  "financial_guidance_card_repaired",
  "financial_guidance_card_rejected",
  "financial_guidance_followup",
  "settings_updated",
  "manual_sync_succeeded",
  "manual_sync_partial",
  "manual_sync_failed",
  "account_connections_viewed",
  "account_connection_started",
  "account_connection_succeeded",
  "account_connection_failed",
  "account_repair_started",
  "account_repair_succeeded",
  "account_repair_failed",
  "account_selection_started",
  "account_selection_succeeded",
  "account_selection_failed",
  "account_inclusion_updated",
  "account_protected_savings_updated",
  "institution_removal_requested",
  "institution_removed",
  "institution_removal_failed",
  "pip_sync_job_created",
  "pip_sync_job_completed",
  "pip_sync_job_failed",
  "pip_reaction_created",
  "pip_reaction_seen",
  "pip_freshness_viewed",
  "monthly_savings_selected",
  "monthly_savings_updated",
  "savings_goal_created",
  "savings_goal_updated",
  "savings_goal_archived",
  "recurring_obligation_corrected",
  "plaid_webhook_received",
  "plaid_webhook_ignored",
  "plaid_webhook_failed",
  "app_open_sync_decision",
] as const;

export type ProductEventName = (typeof productEventNames)[number];

export const clientReportedProductEventNames = [
  "pip_cash_viewed",
  "prompt_chip_selected",
  "plaid_link_started",
  "plaid_link_event",
  "plaid_link_succeeded",
  "plaid_link_failed",
  "plaid_exchange_succeeded",
  "plaid_exchange_failed",
  "plaid_sync_succeeded",
  "plaid_sync_failed",
  "account_connection_started",
  "account_connection_succeeded",
  "account_connection_failed",
  "account_repair_started",
  "account_repair_succeeded",
  "account_repair_failed",
  "account_selection_started",
  "account_selection_succeeded",
  "account_selection_failed",
  "monthly_savings_selected",
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
    properties: sanitizeEventProperties(properties),
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
  pipCashTodayCents: number,
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

  if (cardTypes.includes("account_connections")) {
    names.add("account_connections_viewed");
  }

  if (cardTypes.includes("missing_card_nudge")) {
    names.add("missing_card_nudge_shown");
  }

  if (
    response.usedTools.includes("get_financial_guidance_context") ||
    response.responseMode === "guidance" ||
    Boolean(response.audit.guidance)
  ) {
    names.add("financial_guidance_requested");
    names.add("financial_guidance_context_built");

    if (context.isFollowUp) {
      names.add("financial_guidance_followup");
    }
  }

  if (
    response.audit.guidance?.validationOutcome === "shown" &&
    response.audit.guidance?.guidanceSource === "model_draft"
  ) {
    names.add("financial_guidance_card_drafted");
  }

  if (
    response.audit.guidance?.validationOutcome === "repaired" &&
    response.audit.guidance?.guidanceSource === "model_draft"
  ) {
    names.add("financial_guidance_card_drafted");
    names.add("financial_guidance_card_repaired");
  }

  if (cardTypes.includes("guidance_card")) {
    names.add("financial_guidance_card_shown");
  }

  if (response.audit.guidance?.validationOutcome === "rejected") {
    names.add("financial_guidance_card_rejected");
  }

  if (pipCashTodayCents < 0 || context.isShortfall) {
    names.add("negative_pip_cash_follow_up");
  }

  return [...names];
}

function getSafeEventErrorMessage(error: unknown): string {
  return getSafeErrorMessage(error, "Unknown product event logging error.").slice(0, 180);
}

function sanitizeEventProperties(value: Json): Json {
  if (typeof value === "string") {
    return sanitizeSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeEventProperties);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        entry === undefined ? entry : sanitizeEventProperty(key, entry),
      ]),
    ) as Json;
  }

  return value;
}

function sanitizeEventProperty(key: string, value: Json): Json {
  if (isSensitivePropertyKey(key)) {
    return "[redacted]";
  }

  return sanitizeEventProperties(value);
}

function isSensitivePropertyKey(key: string): boolean {
  return /(?:access[_-]?token|public[_-]?token|refresh[_-]?token|secret|private[_-]?key|authorization)/i.test(key);
}
