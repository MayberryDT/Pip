import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("privacy:reconcile-account-deletions script", () => {
  it("is wired in package.json", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["privacy:reconcile-account-deletions"]).toBe(
      "node scripts/privacy/reconcile-account-deletions.mjs",
    );
  });

  it("dry-runs recoverable rows whose auth user is already gone", async () => {
    const { runReconcileAccountDeletions } = await import("./reconcile-account-deletions.mjs");
    const admin = createAdmin({
      rows: [
        {
          user_id: "user-1",
          status: "data_deleted",
          auth_deleted_at: null,
        },
      ],
      authUsers: {},
    });
    const stdout = vi.fn();

    const exitCode = await runReconcileAccountDeletions({
      createAdminClient: () => admin,
      stdout,
      stderr: vi.fn(),
      now: new Date("2026-06-21T12:00:00.000Z"),
    });

    expect(exitCode).toBe(0);
    expect(admin._updates).toEqual([]);
    expect(stdout).toHaveBeenCalledWith("Would mark account deletion completed for user-1.");
  });

  it("marks recoverable rows completed when dry-run is disabled and auth user is gone", async () => {
    const { runReconcileAccountDeletions } = await import("./reconcile-account-deletions.mjs");
    const admin = createAdmin({
      rows: [
        {
          user_id: "user-1",
          status: "auth_deleted",
          auth_deleted_at: "2026-06-21T10:00:00.000Z",
        },
      ],
      authUsers: {},
    });

    const exitCode = await runReconcileAccountDeletions({
      argv: ["--dry-run=false"],
      createAdminClient: () => admin,
      stdout: vi.fn(),
      stderr: vi.fn(),
      now: new Date("2026-06-21T12:00:00.000Z"),
    });

    expect(exitCode).toBe(0);
    expect(admin._updates).toEqual([
      {
        userId: "user-1",
        allowedStatuses: ["data_deleted", "auth_deleted"],
        payload: {
          status: "completed",
          auth_deleted_at: "2026-06-21T10:00:00.000Z",
          completed_at: "2026-06-21T12:00:00.000Z",
          failed_at: null,
          last_error_code: null,
          updated_at: "2026-06-21T12:00:00.000Z",
        },
      },
    ]);
  });

  it("skips rows while the auth user still exists", async () => {
    const { runReconcileAccountDeletions } = await import("./reconcile-account-deletions.mjs");
    const admin = createAdmin({
      rows: [
        {
          user_id: "user-1",
          status: "data_deleted",
          auth_deleted_at: null,
        },
      ],
      authUsers: {
        "user-1": { id: "user-1" },
      },
    });

    const exitCode = await runReconcileAccountDeletions({
      argv: ["--dry-run=false"],
      createAdminClient: () => admin,
      stdout: vi.fn(),
      stderr: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(admin._updates).toEqual([]);
  });
});

type DeletionRow = {
  user_id: string;
  status: string;
  auth_deleted_at: string | null;
};

function createAdmin(input: {
  rows: DeletionRow[];
  authUsers: Record<string, { id: string } | undefined>;
}) {
  const updates: Array<{
    userId: string;
    allowedStatuses: string[];
    payload: Record<string, unknown>;
  }> = [];

  return {
    _updates: updates,
    auth: {
      admin: {
        getUserById: vi.fn().mockImplementation((userId: string) => {
          const user = input.authUsers[userId];

          if (user) {
            return Promise.resolve({ data: { user }, error: null });
          }

          return Promise.resolve({
            data: { user: null },
            error: {
              status: 404,
              message: "User not found",
            },
          });
        }),
      },
    },
    from(tableName: string) {
      expect(tableName).toBe("account_deletion_requests");

      return {
        select() {
          return {
            in(_column: string, _statuses: string[]) {
              return {
                limit: vi.fn().mockResolvedValue({
                  data: input.rows,
                  error: null,
                }),
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(_column: string, userId: string) {
              return {
                in(_statusColumn: string, allowedStatuses: string[]) {
                  updates.push({
                    userId,
                    allowedStatuses,
                    payload,
                  });

                  return Promise.resolve({
                    data: null,
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
}
