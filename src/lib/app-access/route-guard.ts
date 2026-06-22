import type { User } from "@supabase/supabase-js";
import {
  loadActiveAppAccessGrant,
  recordAppAccessGrantAccess,
} from "@/lib/data/app-access-grants";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupabaseConfigError } from "@/lib/supabase/env";

const appAccessRequiredBody = {
  error: "Pip app access is not active for this account.",
};

export async function getAppAccessFailureForUser(
  user: Pick<User, "id" | "email">,
): Promise<Response | null> {
  if (!user.email) {
    return sensitiveJson(appAccessRequiredBody, { status: 403 });
  }

  let supabase;

  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return sensitiveJson({ error: "Pip app access is temporarily unavailable." }, { status: 503 });
    }

    throw error;
  }

  const grant = await loadActiveAppAccessGrant(supabase, user.email);

  if (!grant) {
    return sensitiveJson(appAccessRequiredBody, { status: 403 });
  }

  await recordAppAccessGrantAccess(supabase, grant, user.id);

  return null;
}
