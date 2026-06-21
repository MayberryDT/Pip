import { z } from "zod";
import { deleteCurrentUserFinancialData } from "@/lib/data/financial-repository";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const accountDeletionSchema = z.object({
  confirmation: z.literal("DELETE"),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return sensitiveJson(accountDeletionUnavailableBody(), { status: 503 });
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return sensitiveJson({ error: "Invalid deletion request." }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return sensitiveJson({
        code: "AUTH_REQUIRED",
        error: "Sign in before deleting an account.",
      }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = accountDeletionSchema.safeParse(body);

    if (!parsed.success) {
      return sensitiveJson({ error: "Type DELETE to confirm account deletion." }, { status: 400 });
    }

    await deleteCurrentUserFinancialData(supabase);

    const signOutResult = await supabase.auth.signOut();

    if (signOutResult.error) {
      throw signOutResult.error;
    }

    const admin = createSupabaseAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

    if (deleteError && !isAlreadyDeletedError(deleteError)) {
      throw deleteError;
    }

    return sensitiveJson({ status: "deleted" });
  } catch (error) {
    const body = toErrorBody(error);

    if (body.code === "ACCOUNT_DELETION_UNAVAILABLE") {
      return sensitiveJson(body, { status: 503 });
    }

    console.error("[account-delete] account deletion failed", getSafeErrorMessage(error, "Account deletion failed."));
    return sensitiveJson(body, { status: 500 });
  }
}

function isAlreadyDeletedError(error: { message?: string; status?: number }): boolean {
  const message = error.message?.toLowerCase() ?? "";

  return error.status === 404 || message.includes("not found") || message.includes("does not exist");
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return accountDeletionUnavailableBody();
  }

  return {
    code: "ACCOUNT_DELETION_FAILED",
    error: "Account deletion failed.",
  };
}

function accountDeletionUnavailableBody() {
  return {
    code: "ACCOUNT_DELETION_UNAVAILABLE",
    error: "Account deletion is unavailable in this build.",
  };
}
