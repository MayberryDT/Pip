import { sensitiveJson } from "@/lib/security/http-cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return sensitiveJson({ status: "signed-out" });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return sensitiveJson({ error: "Sign-out failed." }, { status: 500 });
  }

  return sensitiveJson({
    status: "signed-out",
  });
}
