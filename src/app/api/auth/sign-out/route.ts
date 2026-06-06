import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ status: "signed-out" });
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.json({
    status: "signed-out",
  });
}
