import { NextResponse } from "next/server";
import { z } from "zod";
import { clientReportedProductEventNames, recordProductEvent } from "@/lib/data/product-events";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const propertyValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const eventSchema = z.object({
  eventName: z.enum(clientReportedProductEventNames),
  properties: z.record(z.string(), propertyValueSchema).optional(),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ status: "skipped" });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = eventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid event." }, { status: 400 });
    }

    await recordProductEvent(
      supabase,
      user.id,
      parsed.data.eventName,
      parsed.data.properties ?? {},
    );

    return NextResponse.json({ status: "recorded" });
  } catch (error) {
    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      error: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
    };
  }

  return {
    error: "Event request failed.",
  };
}
