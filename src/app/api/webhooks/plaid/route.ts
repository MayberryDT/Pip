import { NextResponse } from "next/server";
import { z } from "zod";
import { getPipSyncFeatureFlags } from "@/lib/data/feature-flags";
import { enqueuePipSyncJob } from "@/lib/data/sync-jobs";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { createPlaidClient } from "@/lib/providers/plaid/config";
import { loadPlaidCredentialByItemId } from "@/lib/providers/plaid/credential-store";
import {
  hashWebhookBody,
  verifyPlaidWebhookRequest,
} from "@/lib/providers/plaid/webhook-verification";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

const plaidWebhookSchema = z
  .object({
    webhook_type: z.string().min(1).max(80),
    webhook_code: z.string().min(1).max(120),
    item_id: z.string().min(1).max(180).optional(),
    environment: z.string().min(1).max(40).optional(),
  })
  .passthrough();

const plaidRefreshWebhookCodes = new Set(["SYNC_UPDATES_AVAILABLE"]);
const plaidRepairWebhookCodes = new Set([
  "ERROR",
  "ITEM_LOGIN_REQUIRED",
  "PENDING_EXPIRATION",
  "PENDING_DISCONNECT",
  "USER_PERMISSION_REVOKED",
  "USER_ACCOUNT_REVOKED",
]);

type PlaidWebhookVerificationStatus =
  Database["public"]["Enums"]["plaid_webhook_verification_status"];
type PlaidWebhookProcessingStatus =
  Database["public"]["Enums"]["plaid_webhook_processing_status"];

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const bodyText = await request.text();
  const body = parseJsonObject(bodyText);
  const parsed = plaidWebhookSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Plaid webhook payload." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const flags = getPipSyncFeatureFlags();
  const bodySha256 = hashWebhookBody(bodyText);
  let verificationStatus: PlaidWebhookVerificationStatus = "failed";

  try {
    if (flags.plaidWebhookVerify) {
      await verifyPlaidWebhookRequest({
        bodyText,
        verificationHeader: request.headers.get("Plaid-Verification"),
        client: createPlaidClient(),
      });
      verificationStatus = "verified";
    } else if (canBypassPlaidWebhookVerification()) {
      verificationStatus = "bypassed_dev";
    } else {
      throw new Error("Plaid webhook verification cannot be bypassed in production.");
    }
  } catch (error) {
    await recordWebhookEvent(admin, {
      payload: parsed.data as Json,
      verificationStatus: "failed",
      processingStatus: "failed",
      bodySha256,
      errorMessage: getSafeErrorMessage(error, "Plaid webhook verification failed."),
    });

    return NextResponse.json({ error: "Plaid webhook verification failed." }, { status: 401 });
  }

  const webhookEvent = await recordWebhookEvent(admin, {
    payload: parsed.data as Json,
    verificationStatus,
    processingStatus: "received",
    bodySha256,
  });
  const credential = parsed.data.item_id
    ? await loadPlaidCredentialByItemId(parsed.data.item_id, admin)
    : null;
  const jobReason = getWebhookJobReason(parsed.data.webhook_type, parsed.data.webhook_code);

  if (!jobReason || !credential || !flags.syncJobsEnabled) {
    const reason = !jobReason
      ? "unsupported"
      : !credential
        ? "unknown-item"
        : "sync-jobs-disabled";

    await updateWebhookEvent(admin, webhookEvent.id, {
      processingStatus: "ignored",
      userId: credential?.userId,
      errorMessage: reason,
    });

    if (credential) {
      await recordProductEventSafely(admin, credential.userId, "plaid_webhook_ignored", {
        webhookType: parsed.data.webhook_type,
        webhookCode: parsed.data.webhook_code,
        itemId: parsed.data.item_id,
        reason,
      });
    }

    return NextResponse.json({
      status: "ignored",
      reason,
    });
  }

  try {
    const { job, created } = await enqueuePipSyncJob(admin, {
      userId: credential.userId,
      provider: "plaid",
      reason: jobReason,
      institutionId: credential.institutionId,
      sourceWebhookEventId: webhookEvent.id,
      dedupeKey: `plaid-webhook:${parsed.data.item_id}:${parsed.data.webhook_type}:${parsed.data.webhook_code}`,
      priority: jobReason === "repair" ? 25 : 50,
    });

    await updateWebhookEvent(admin, webhookEvent.id, {
      processingStatus: "enqueued",
      sourceSyncJobId: job.id,
      userId: credential.userId,
    });
    await recordProductEventSafely(admin, credential.userId, "plaid_webhook_received", {
      webhookType: parsed.data.webhook_type,
      webhookCode: parsed.data.webhook_code,
      itemId: parsed.data.item_id,
      institutionId: credential.institutionId,
      syncJobId: job.id,
      created,
    });

    return NextResponse.json({
      status: "enqueued",
      syncJobId: job.id,
      created,
    });
  } catch (error) {
    const message = getSafeErrorMessage(error, "Plaid webhook enqueue failed.");

    await updateWebhookEvent(admin, webhookEvent.id, {
      processingStatus: "failed",
      userId: credential.userId,
      errorMessage: message,
    });
    await recordProductEventSafely(admin, credential.userId, "plaid_webhook_failed", {
      webhookType: parsed.data.webhook_type,
      webhookCode: parsed.data.webhook_code,
      itemId: parsed.data.item_id,
      institutionId: credential.institutionId,
      error: message,
    });

    return NextResponse.json({ error: "Plaid webhook processing failed." }, { status: 500 });
  }
}

async function recordWebhookEvent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    payload: Json;
    verificationStatus: PlaidWebhookVerificationStatus;
    processingStatus: PlaidWebhookProcessingStatus;
    bodySha256: string;
    errorMessage?: string;
  },
) {
  const payload = input.payload;
  const webhookType = getPayloadString(payload, "webhook_type") ?? "unknown";
  const webhookCode = getPayloadString(payload, "webhook_code") ?? "unknown";
  const { data, error } = await supabase
    .from("plaid_webhook_events")
    .insert({
      item_id: getPayloadString(payload, "item_id"),
      webhook_type: webhookType,
      webhook_code: webhookCode,
      environment: getPayloadString(payload, "environment"),
      payload,
      body_sha256: input.bodySha256,
      verification_status: input.verificationStatus,
      processing_status: input.processingStatus,
      error_message: input.errorMessage ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateWebhookEvent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  eventId: string,
  input: {
    processingStatus: PlaidWebhookProcessingStatus;
    userId?: string;
    sourceSyncJobId?: string;
    errorMessage?: string;
  },
) {
  const { error } = await supabase
    .from("plaid_webhook_events")
    .update({
      processing_status: input.processingStatus,
      user_id: input.userId ?? null,
      processed_at: new Date().toISOString(),
      source_sync_job_id: input.sourceSyncJobId ?? null,
      error_message: input.errorMessage ?? null,
    })
    .eq("id", eventId);

  if (error) {
    throw error;
  }
}

function parseJsonObject(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

function getWebhookJobReason(
  webhookType: string,
  webhookCode: string,
): "plaid_webhook" | "repair" | null {
  if (webhookType === "TRANSACTIONS" && plaidRefreshWebhookCodes.has(webhookCode)) {
    return "plaid_webhook";
  }

  if (webhookType === "ITEM" && plaidRepairWebhookCodes.has(webhookCode)) {
    return "repair";
  }

  return null;
}

function getPayloadString(payload: Json, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = payload[key];

  return typeof value === "string" ? value : null;
}

function canBypassPlaidWebhookVerification(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.CONTEXT !== "production";
}
