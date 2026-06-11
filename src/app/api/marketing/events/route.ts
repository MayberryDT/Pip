import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { marketingEventSchema, recordMarketingEvent } from "@/lib/marketing/events";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = marketingEventSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid marketing event." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      status: "skipped",
    });
  }

  try {
    const supabase = createSupabaseAdminClient();
    await recordMarketingEvent(supabase, parsed.data);

    return NextResponse.json({
      status: "recorded",
    });
  } catch {
    return NextResponse.json({ error: "Marketing event failed." }, { status: 500 });
  }
}
