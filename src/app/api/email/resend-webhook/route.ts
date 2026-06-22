import { Resend } from "resend";
import { logEmailEvent } from "@/lib/email/events";
import { hardSuppressEmail } from "@/lib/email/suppression";
import { normalizeWaitlistEmail } from "@/lib/marketing/waitlist";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ResendWebhookEvent = {
  type: string;
  data?: {
    email_id?: string;
    to?: string[];
    bounce?: {
      type?: string;
      subType?: string;
      message?: string;
    };
  };
};

type ProviderEventType = "provider_delivery" | "provider_bounce" | "provider_complaint";
type ProviderEventStatus = "delivered" | "bounced" | "complained" | "ignored";

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!apiKey || !webhookSecret) {
    return sensitiveJson({ error: "Resend webhook is not configured." }, { status: 503 });
  }

  const payload = await request.text();
  const providerEventId = request.headers.get("svix-id");
  const resend = new Resend(apiKey);

  let event: ResendWebhookEvent;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    }) as ResendWebhookEvent;
  } catch {
    return sensitiveJson({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const to = event.data?.to?.[0];
  const normalizedEmail = to ? normalizeWaitlistEmail(to) : null;

  if (!providerEventId || !normalizedEmail) {
    return sensitiveJson({ status: "ignored" });
  }

  const eventType = mapResendEventType(event.type);

  if (!eventType) {
    return sensitiveJson({ status: "ignored" });
  }

  const supabase = createSupabaseAdminClient();

  if (event.type === "email.bounced") {
    await hardSuppressEmail(supabase, { normalizedEmail, reason: "provider_bounce" });
  }

  if (event.type === "email.complained") {
    await hardSuppressEmail(supabase, { normalizedEmail, reason: "provider_complaint" });
  }

  try {
    await logEmailEvent(supabase, {
      normalizedEmail,
      eventType,
      provider: "resend",
      providerEventId,
      providerMessageId: event.data?.email_id ?? null,
      status: mapEventStatus(event.type),
      metadata: {
        resendType: event.type,
        bounce: event.data?.bounce ?? null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return sensitiveJson({ status: "duplicate" });
    }

    throw error;
  }

  return sensitiveJson({ status: "processed" });
}

function mapResendEventType(type: string): ProviderEventType | null {
  if (type === "email.delivered") return "provider_delivery";
  if (type === "email.bounced") return "provider_bounce";
  if (type === "email.complained") return "provider_complaint";
  return null;
}

function mapEventStatus(type: string): ProviderEventStatus {
  if (type === "email.delivered") return "delivered";
  if (type === "email.bounced") return "bounced";
  if (type === "email.complained") return "complained";
  return "ignored";
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
