import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  checkMarketingRateLimit,
  getMarketingRateLimitKey,
  submitMarketingWaitlist,
  waitlistInputSchema,
} from "@/lib/marketing/waitlist";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = waitlistInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const rateLimit = checkMarketingRateLimit(getMarketingRateLimitKey(request));

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many signup attempts. Try again in a minute.", retryAfterSeconds: rateLimit.retryAfterSeconds },
      { status: 429 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      status: "skipped",
    });
  }

  try {
    const supabase = createSupabaseAdminClient();
    await submitMarketingWaitlist(supabase, parsed.data);

    return NextResponse.json({
      status: "joined",
    });
  } catch {
    return NextResponse.json({ error: "Waitlist signup failed." }, { status: 500 });
  }
}
