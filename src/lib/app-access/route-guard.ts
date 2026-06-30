import type { User } from "@supabase/supabase-js";
import { summarizeAppEntitlement } from "@/lib/access/app-entitlement";
import { loadActiveBillingSubscriptionForUser } from "@/lib/billing/billing-repository";
import {
  loadActiveAppAccessGrant,
  recordAppAccessGrantAccess,
} from "@/lib/data/app-access-grants";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupabaseConfigError } from "@/lib/supabase/env";

const appAccessRequiredBody = {
  error: "Pip subscription required.",
};

export async function getAppAccessFailureForUser(
  user: Pick<User, "id" | "email">,
): Promise<Response | null> {
  let supabase;

  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return sensitiveJson({ error: "Pip app access is temporarily unavailable." }, { status: 503 });
    }

    throw error;
  }

  const [grant, subscription] = await Promise.all([
    user.email ? loadActiveAppAccessGrant(supabase, user.email) : Promise.resolve(null),
    loadActiveBillingSubscriptionForUser(supabase, user.id),
  ]);
  const entitlement = summarizeAppEntitlement({ grant, subscription });

  if (!entitlement.hasAccess) {
    return sensitiveJson(appAccessRequiredBody, { status: 402 });
  }

  if (entitlement.source === "manual_grant" && grant) {
    await recordAppAccessGrantAccess(supabase, grant, user.id);
  }

  return null;
}
