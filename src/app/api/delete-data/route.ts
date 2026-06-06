import { NextResponse } from "next/server";
import { deleteCurrentUserFinancialData } from "@/lib/data/financial-repository";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error: "Supabase is not configured.",
      },
      { status: 503 },
    );
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

    await deleteCurrentUserFinancialData(supabase);

    return NextResponse.json({
      status: "deleted",
    });
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
    error: "Delete-data request failed.",
  };
}
