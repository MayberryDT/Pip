import { describe, expect, it, vi } from "vitest";
import {
  grantAppAccess,
  loadActiveAppAccessGrant,
  normalizeAppAccessEmail,
  recordAppAccessGrantAccess,
  revokeAppAccess,
} from "@/lib/data/app-access-grants";

describe("app access grants", () => {
  it("normalizes access grant email addresses", () => {
    expect(normalizeAppAccessEmail(" Tester@Example.COM ")).toBe("tester@example.com");
  });

  it("grants app access by normalized email and clears prior revoked state", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        normalized_email: "tester@example.com",
        status: "active",
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    const supabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe("app_access_grants");
        return { upsert };
      }),
    };

    await grantAppAccess(supabase as never, {
      email: " Tester@Example.COM ",
      source: "operator",
      note: "early tester",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_email: "tester@example.com",
        display_email: "Tester@Example.COM",
        status: "active",
        source: "operator",
        note: "early tester",
        revoked_at: null,
      }),
      { onConflict: "normalized_email" },
    );
  });

  it("loads only active grants", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        normalized_email: "tester@example.com",
        status: "revoked",
      },
      error: null,
    });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    };

    await expect(loadActiveAppAccessGrant(supabase as never, "tester@example.com")).resolves.toBeNull();
  });

  it("revokes app access by normalized email", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe("app_access_grants");
        return { update };
      }),
    };

    await revokeAppAccess(supabase as never, " Tester@Example.COM ");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "revoked",
        revoked_at: expect.any(String),
      }),
    );
    expect(eq).toHaveBeenCalledWith("normalized_email", "tester@example.com");
  });

  it("records accepted app access without replacing first access time", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ update })),
    };

    await recordAppAccessGrantAccess(
      supabase as never,
      {
        normalized_email: "tester@example.com",
        first_accessed_at: "2026-06-21T12:00:00.000Z",
      } as never,
      "user-1",
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        auth_user_id: "user-1",
        first_accessed_at: "2026-06-21T12:00:00.000Z",
        last_accessed_at: expect.any(String),
      }),
    );
  });
});
