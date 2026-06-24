import { describe, expect, it } from "vitest";
import { summarizeAdminWaitlistRows } from "@/lib/admin/waitlist";

describe("summarizeAdminWaitlistRows", () => {
  it("marks waitlist rows with active access grants", () => {
    const rows = summarizeAdminWaitlistRows(
      [
        {
          normalized_email: "friend@example.com",
          display_email: "Friend@Example.com",
          source_page: "/",
          last_source_page: "/app",
          app_waitlist_requested_at: "2026-06-24T10:00:00.000Z",
          app_waitlist_last_requested_at: "2026-06-24T11:00:00.000Z",
          app_waitlist_request_count: 2,
          newsletter_opt_in_at: "2026-06-24T09:00:00.000Z",
          invite_email_sent_at: "2026-06-24T12:00:00.000Z",
          email_suppressed_at: null,
          status: "joined",
          created_at: "2026-06-24T09:00:00.000Z",
          last_submitted_at: "2026-06-24T11:00:00.000Z",
        },
      ],
      [
        {
          normalized_email: "friend@example.com",
          display_email: "Friend@Example.com",
          status: "active",
          source: "admin",
          granted_at: "2026-06-24T12:00:00.000Z",
          revoked_at: null,
          first_accessed_at: null,
          last_accessed_at: null,
        },
      ],
    );

    expect(rows).toEqual([
      {
        email: "Friend@Example.com",
        normalizedEmail: "friend@example.com",
        sourcePage: "/",
        lastSourcePage: "/app",
        status: "joined",
        appWaitlistRequestedAt: "2026-06-24T10:00:00.000Z",
        appWaitlistLastRequestedAt: "2026-06-24T11:00:00.000Z",
        appWaitlistRequestCount: 2,
        newsletterOptInAt: "2026-06-24T09:00:00.000Z",
        inviteEmailSentAt: "2026-06-24T12:00:00.000Z",
        emailSuppressedAt: null,
        accessStatus: "active",
        accessGrantedAt: "2026-06-24T12:00:00.000Z",
        accessRevokedAt: null,
        firstAccessedAt: null,
        lastAccessedAt: null,
      },
    ]);
  });

  it("sorts app waitlist requests before older marketing-only rows", () => {
    const rows = summarizeAdminWaitlistRows(
      [
        {
          normalized_email: "marketing@example.com",
          display_email: "marketing@example.com",
          source_page: "/",
          last_source_page: "/",
          app_waitlist_requested_at: null,
          app_waitlist_last_requested_at: null,
          app_waitlist_request_count: 0,
          newsletter_opt_in_at: "2026-06-24T08:00:00.000Z",
          invite_email_sent_at: null,
          email_suppressed_at: null,
          status: "joined",
          created_at: "2026-06-24T08:00:00.000Z",
          last_submitted_at: "2026-06-24T08:00:00.000Z",
        },
        {
          normalized_email: "app@example.com",
          display_email: "app@example.com",
          source_page: "/app",
          last_source_page: "/app",
          app_waitlist_requested_at: "2026-06-24T07:00:00.000Z",
          app_waitlist_last_requested_at: "2026-06-24T07:00:00.000Z",
          app_waitlist_request_count: 1,
          newsletter_opt_in_at: null,
          invite_email_sent_at: null,
          email_suppressed_at: null,
          status: "joined",
          created_at: "2026-06-24T07:00:00.000Z",
          last_submitted_at: "2026-06-24T07:00:00.000Z",
        },
      ],
      [],
    );

    expect(rows.map((row) => row.normalizedEmail)).toEqual(["app@example.com", "marketing@example.com"]);
    expect(rows[0]?.accessStatus).toBe("none");
  });
});
