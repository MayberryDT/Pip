import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  deleteCurrentUserFinancialData: vi.fn(),
  deleteUserFinancialDataByUserId: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/data/financial-repository", () => ({
  deleteCurrentUserFinancialData: routeMocks.deleteCurrentUserFinancialData,
  deleteUserFinancialDataByUserId: routeMocks.deleteUserFinancialDataByUserId,
}));

import { POST } from "@/app/api/account/delete/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/account/delete", () => {
  it("returns 503 when Supabase is disabled", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "ACCOUNT_DELETION_UNAVAILABLE",
      error: "Account deletion is unavailable in this build.",
    });
  });

  it("requires authentication before validating deletion confirmation", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase(null);
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ confirmation: "NOPE" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "AUTH_REQUIRED",
      error: "Sign in before deleting an account.",
    });
    expect(routeMocks.deleteCurrentUserFinancialData).not.toHaveBeenCalled();
  });

  it("requires the typed DELETE confirmation", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const response = await POST(jsonRequest({ confirmation: "delete" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Type DELETE to confirm account deletion.",
    });
    expect(routeMocks.deleteCurrentUserFinancialData).not.toHaveBeenCalled();
  });

  it("deletes app data by user id, deletes auth, then signs out", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase({ id: "user-1" });
    const admin = createAdminSupabase({ deleteUserError: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.deleteUserFinancialDataByUserId.mockResolvedValue(undefined);

    const response = await POST(jsonRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      status: "deleted",
    });
    expect(routeMocks.deleteCurrentUserFinancialData).not.toHaveBeenCalled();
    expect(routeMocks.deleteUserFinancialDataByUserId).toHaveBeenCalledWith(admin, "user-1");
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("user-1");
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(admin._operations).toEqual([
      ["selectRequest", "user-1"],
      ["insertRequest", expect.objectContaining({ user_id: "user-1", status: "requested" })],
      ["updateRequest", "user-1", expect.objectContaining({ status: "data_deleted" })],
      ["updateRequest", "user-1", expect.objectContaining({ status: "data_deleted", last_error_code: "AUTH_DELETE_STARTED" })],
      ["updateRequest", "user-1", expect.objectContaining({ status: "auth_deleted" })],
      ["updateRequest", "user-1", expect.objectContaining({ status: "completed" })],
    ]);
  });

  it("treats an already-deleted auth user as success", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase({ id: "user-1" });
    const admin = createAdminSupabase({
      deleteUserError: {
        status: 404,
        message: "User not found",
      },
    });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.deleteUserFinancialDataByUserId.mockResolvedValue(undefined);

    const response = await POST(jsonRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "deleted",
    });
  });

  it("does not sign out when auth deletion fails", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase({ id: "user-1" });
    const admin = createAdminSupabase({
      deleteUserError: {
        status: 500,
        message: "auth delete failed",
      },
    });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.deleteUserFinancialDataByUserId.mockResolvedValue(undefined);

    const response = await POST(jsonRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      code: "ACCOUNT_DELETION_FAILED",
      error: "Account deletion failed.",
    });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(admin._operations).toContainEqual([
      "updateRequest",
      "user-1",
      expect.objectContaining({
        status: "failed",
        last_error_code: "AUTH_DELETE_FAILED",
      }),
    ]);
  });

  it("treats browser sign-out failure as nonfatal after deletion completes", async () => {
    enableSupabaseEnv();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const supabase = createServerSupabase(
      { id: "user-1" },
      {
        signOutError: new Error("sign-out failed"),
      },
    );
    const admin = createAdminSupabase({ deleteUserError: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.deleteUserFinancialDataByUserId.mockResolvedValue(undefined);

    try {
      const response = await POST(jsonRequest({ confirmation: "DELETE" }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: "deleted",
      });
      expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("user-1");
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(admin._operations).toContainEqual([
        "updateRequest",
        "user-1",
        expect.objectContaining({
          status: "completed",
        }),
      ]);
      expect(warn).toHaveBeenCalledWith("[account-delete] post-deletion sign-out failed", "sign-out failed");
    } finally {
      warn.mockRestore();
    }
  });

  it("does not delete auth or sign out when app-data deletion fails", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase({ id: "user-1" });
    const admin = createAdminSupabase({ deleteUserError: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.deleteUserFinancialDataByUserId.mockRejectedValue(new Error("data delete failed"));

    const response = await POST(jsonRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(500);
    expect(routeMocks.deleteUserFinancialDataByUserId).toHaveBeenCalledWith(admin, "user-1");
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(admin._operations).toContainEqual([
      "updateRequest",
      "user-1",
      expect.objectContaining({
        status: "failed",
        last_error_code: "DATA_DELETE_FAILED",
      }),
    ]);
  });

  it("resumes from data-deleted requests by retrying auth deletion", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase({ id: "user-1" });
    const admin = createAdminSupabase({
      deleteUserError: null,
      existingRequest: {
        user_id: "user-1",
        status: "data_deleted",
        data_deleted_at: "2026-06-21T00:00:00.000Z",
      },
    });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(jsonRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(200);
    expect(routeMocks.deleteUserFinancialDataByUserId).not.toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("user-1");
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it("reloads the saga row when a concurrent request creates it first", async () => {
    enableSupabaseEnv();
    const supabase = createServerSupabase({ id: "user-1" });
    const admin = createAdminSupabase({
      deleteUserError: null,
      insertRequestError: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
      duplicateReloadRequest: {
        user_id: "user-1",
        status: "requested",
        data_deleted_at: null,
        auth_deleted_at: null,
        completed_at: null,
      },
    });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
    routeMocks.deleteUserFinancialDataByUserId.mockResolvedValue(undefined);

    const response = await POST(jsonRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(200);
    expect(admin._operations).toContainEqual(["insertRequest", expect.objectContaining({ user_id: "user-1" })]);
    expect(admin._operations).toContainEqual(["selectRequest", "user-1", "duplicate-reload"]);
  });

  it("logs deletion failures without exposing secret-shaped values", async () => {
    enableSupabaseEnv();
    const error = new Error("delete failed with access_token=provider-secret sk-test-secret");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const supabase = createServerSupabase({ id: "user-1" });
    routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
    routeMocks.deleteUserFinancialDataByUserId.mockRejectedValue(error);
    routeMocks.createSupabaseAdminClient.mockReturnValue(createAdminSupabase({ deleteUserError: null }));

    try {
      const response = await POST(jsonRequest({ confirmation: "DELETE" }));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        code: "ACCOUNT_DELETION_FAILED",
        error: "Account deletion failed.",
      });
      expect(consoleError.mock.calls[0]?.[0]).toBe("[account-delete] account deletion failed");
      expect(consoleError.mock.calls[0]?.[1]).toContain("access_token=[redacted]");
      expect(consoleError.mock.calls[0]?.[1]).not.toBe(error);
    } finally {
      consoleError.mockRestore();
    }
  });
});

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createServerSupabase(
  user: { id: string } | null,
  input: {
    signOutError?: Error;
  } = {},
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({
        error: input.signOutError ?? null,
      }),
    },
  };
}

function createAdminSupabase(input: {
  deleteUserError: { status?: number; message?: string } | null;
  existingRequest?: Partial<AccountDeletionRequest> | null;
  insertRequestError?: { code?: string; message?: string } | null;
  duplicateReloadRequest?: Partial<AccountDeletionRequest> | null;
}) {
  const operations: unknown[][] = [];
  const existingRequest = input.existingRequest ?? null;

  return {
    _operations: operations,
    auth: {
      admin: {
        deleteUser: vi.fn().mockResolvedValue({ error: input.deleteUserError }),
      },
    },
    from(tableName: string) {
      expect(tableName).toBe("account_deletion_requests");

      return createAccountDeletionRequestQuery(operations, {
        existingRequest,
        insertRequestError: input.insertRequestError ?? null,
        duplicateReloadRequest: input.duplicateReloadRequest ?? null,
      });
    },
  };
}

type AccountDeletionRequest = {
  user_id: string;
  status: string;
  data_deleted_at: string | null;
  auth_deleted_at: string | null;
  completed_at: string | null;
};

function createAccountDeletionRequestQuery(
  operations: unknown[][],
  input: {
    existingRequest: Partial<AccountDeletionRequest> | null;
    insertRequestError: { code?: string; message?: string } | null;
    duplicateReloadRequest: Partial<AccountDeletionRequest> | null;
  },
) {
  let selectCount = 0;
  const query = {
    select() {
      return query;
    },
    eq(_column: string, userId: string) {
      return {
        maybeSingle: vi.fn().mockImplementation(() => {
          selectCount += 1;
          const isDuplicateReload = selectCount > 1 ||
            (
              operations.some((operation) => operation[0] === "insertRequest") &&
              Boolean(input.duplicateReloadRequest)
            );
          operations.push(isDuplicateReload
            ? ["selectRequest", userId, "duplicate-reload"]
            : ["selectRequest", userId]);

          return Promise.resolve({
            data: isDuplicateReload
              ? input.duplicateReloadRequest ?? input.existingRequest
              : input.existingRequest,
            error: null,
          });
        }),
      };
    },
    insert(payload: Record<string, unknown>) {
      operations.push(["insertRequest", payload]);

      return {
        select() {
          return {
            single: vi.fn().mockResolvedValue({
              data: input.insertRequestError
                ? null
                : {
                    ...payload,
                    data_deleted_at: null,
                    auth_deleted_at: null,
                    completed_at: null,
                  },
              error: input.insertRequestError,
            }),
          };
        },
      };
    },
    update(payload: Record<string, unknown>) {
      return {
        eq(_column: string, userId: string) {
          operations.push(["updateRequest", userId, payload]);

          return Promise.resolve({
            data: null,
            error: null,
          });
        },
      };
    },
  };

  return query;
}

function jsonRequest(body: unknown): Request {
  return new Request("https://spendwithpip.com/api/account/delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
