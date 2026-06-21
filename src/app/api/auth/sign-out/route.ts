import { sensitiveJson } from "@/lib/security/http-cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return sensitiveJson({ status: "signed-out" });
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return sensitiveJson({
    status: "signed-out",
  });
}
