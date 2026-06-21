import { z } from "zod";
import { deleteUserFinancialDataByUserId } from "@/lib/data/financial-repository";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const accountDeletionSchema = z.object({
  confirmation: z.literal("DELETE"),
});

type AccountDeletionRequestRow = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
type AccountDeletionStatus = Database["public"]["Enums"]["account_deletion_request_status"];

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

    const admin = createSupabaseAdminClient();
    const deletionRequest = await ensureAccountDeletionRequest(admin, user.id);

    if (!hasDeletedData(deletionRequest)) {
      try {
        await deleteUserFinancialDataByUserId(admin, user.id);
        await markAccountDeletionStatus(admin, user.id, "data_deleted");
      } catch (error) {
        await markAccountDeletionStatus(admin, user.id, "failed", "DATA_DELETE_FAILED");
        throw error;
      }
    }

    if (!hasDeletedAuth(deletionRequest)) {
      await markAccountDeletionStatus(admin, user.id, "data_deleted", "AUTH_DELETE_STARTED");
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

      if (deleteError && !isAlreadyDeletedError(deleteError)) {
        await markAccountDeletionStatus(admin, user.id, "failed", "AUTH_DELETE_FAILED");
        throw deleteError;
      }

      await markAccountDeletionStatusBestEffort(admin, user.id, "auth_deleted");
    }

    await markAccountDeletionStatusBestEffort(admin, user.id, "completed");

    try {
      const signOutResult = await supabase.auth.signOut();

      if (signOutResult.error) {
        console.warn(
          "[account-delete] post-deletion sign-out failed",
          getSafeErrorMessage(signOutResult.error, "Sign-out failed."),
        );
      }
    } catch (error) {
      console.warn(
        "[account-delete] post-deletion sign-out failed",
        getSafeErrorMessage(error, "Sign-out failed."),
      );
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

async function ensureAccountDeletionRequest(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<AccountDeletionRequestRow> {
  const { data: existingRequest, error: loadError } = await admin
    .from("account_deletion_requests")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (loadError) {
    throw loadError;
  }

  if (existingRequest) {
    return existingRequest;
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("account_deletion_requests")
    .insert({
      user_id: userId,
      status: "requested",
      requested_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    if (isDuplicateKeyError(error)) {
      return loadAccountDeletionRequest(admin, userId);
    }

    throw error;
  }

  return data;
}

async function loadAccountDeletionRequest(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<AccountDeletionRequestRow> {
  const { data, error } = await admin
    .from("account_deletion_requests")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Account deletion request was not created.");
  }

  return data;
}

async function markAccountDeletionStatus(
  admin: SupabaseClient<Database>,
  userId: string,
  status: AccountDeletionStatus,
  lastErrorCode: string | null = null,
) {
  const now = new Date().toISOString();
  const payload: Database["public"]["Tables"]["account_deletion_requests"]["Update"] = {
    status,
    updated_at: now,
    last_error_code: lastErrorCode,
  };

  if (status === "data_deleted") {
    payload.data_deleted_at = now;
    payload.failed_at = null;
  }

  if (status === "auth_deleted") {
    payload.auth_deleted_at = now;
    payload.failed_at = null;
  }

  if (status === "completed") {
    payload.completed_at = now;
    payload.failed_at = null;
  }

  if (status === "failed") {
    payload.failed_at = now;

    if (lastErrorCode === "AUTH_DELETE_FAILED") {
      payload.auth_deleted_at = null;
      payload.completed_at = null;
    }

    if (lastErrorCode === "DATA_DELETE_FAILED") {
      payload.data_deleted_at = null;
      payload.auth_deleted_at = null;
      payload.completed_at = null;
    }
  }

  const { error } = await admin
    .from("account_deletion_requests")
    .update(payload)
    .eq("user_id", userId)
    .in("status", getAllowedCurrentStatusesForTransition(status, lastErrorCode));

  if (error) {
    throw error;
  }
}

async function markAccountDeletionStatusBestEffort(
  admin: SupabaseClient<Database>,
  userId: string,
  status: AccountDeletionStatus,
) {
  try {
    await markAccountDeletionStatus(admin, userId, status);
  } catch (error) {
    console.warn(
      "[account-delete] final deletion status update failed",
      getSafeErrorMessage(error, "Account deletion finalization failed."),
    );
  }
}

function getAllowedCurrentStatusesForTransition(
  status: AccountDeletionStatus,
  lastErrorCode: string | null,
): AccountDeletionStatus[] {
  if (status === "completed") {
    return ["requested", "data_deleted", "auth_deleted", "completed", "failed"];
  }

  if (status === "auth_deleted") {
    return ["requested", "data_deleted", "auth_deleted", "failed"];
  }

  if (status === "data_deleted") {
    return ["requested", "data_deleted", "failed"];
  }

  if (status === "failed" && lastErrorCode === "DATA_DELETE_FAILED") {
    return ["requested", "data_deleted", "failed"];
  }

  if (status === "failed") {
    return ["requested", "data_deleted", "failed"];
  }

  return [status];
}

function hasDeletedData(request: AccountDeletionRequestRow): boolean {
  return Boolean(request.data_deleted_at) ||
    request.status === "data_deleted" ||
    request.status === "auth_deleted" ||
    request.status === "completed";
}

function hasDeletedAuth(request: AccountDeletionRequestRow): boolean {
  return Boolean(request.auth_deleted_at) ||
    request.status === "auth_deleted" ||
    request.status === "completed";
}

function isAlreadyDeletedError(error: { message?: string; status?: number }): boolean {
  const message = error.message?.toLowerCase() ?? "";

  return error.status === 404 || message.includes("not found") || message.includes("does not exist");
}

function isDuplicateKeyError(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? "";

  return error.code === "23505" || message.includes("duplicate key");
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
