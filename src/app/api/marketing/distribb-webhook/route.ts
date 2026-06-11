import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { recordMarketingEvent } from "@/lib/marketing/events";

const draftPayloadSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  payload: z.unknown().optional(),
});

export async function POST(request: Request) {
  const expectedSecret = process.env.DISTRIBB_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return NextResponse.json({ error: "Distribb webhook is not configured." }, { status: 503 });
  }

  const receivedSecret = request.headers.get("x-distribb-secret");

  if (receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = draftPayloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid draft payload." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      status: "skipped",
    });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("marketing_content_drafts").insert({
      source: "distribb",
      slug: parsed.data.slug ?? null,
      title: parsed.data.title ?? null,
      payload: (parsed.data.payload ?? body) as never,
      status: "received",
    });

    if (error) {
      throw error;
    }

    await recordMarketingEvent(supabase, {
      eventName: "distribb_webhook_received",
      properties: {
        slug: parsed.data.slug ?? null,
      },
    });

    return NextResponse.json({
      status: "received",
    });
  } catch {
    return NextResponse.json({ error: "Draft intake failed." }, { status: 500 });
  }
}
