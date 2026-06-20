import { NextResponse } from "next/server";
import { deleteCurrentUserFinancialData } from "@/lib/data/financial-repository";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
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
    if (!(error instanceof SupabaseConfigError)) {
      console.error("[delete-data] deletion failed", getSafeErrorMessage(error, "Delete-data request failed."));
    }

    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      error: error.message,
    };
  }

  return {
    error: "Delete-data request failed.",
  };
}
