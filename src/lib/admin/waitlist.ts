import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type WaitlistRow = Pick<
  Database["public"]["Tables"]["marketing_waitlist"]["Row"],
  | "normalized_email"
  | "display_email"
  | "source_page"
  | "last_source_page"
  | "app_waitlist_requested_at"
  | "app_waitlist_last_requested_at"
  | "app_waitlist_request_count"
  | "newsletter_opt_in_at"
  | "invite_email_sent_at"
  | "email_suppressed_at"
  | "status"
  | "created_at"
  | "last_submitted_at"
>;

type AccessGrantRow = Pick<
  Database["public"]["Tables"]["app_access_grants"]["Row"],
  | "normalized_email"
  | "display_email"
  | "status"
  | "source"
  | "granted_at"
  | "revoked_at"
  | "first_accessed_at"
  | "last_accessed_at"
>;

const adminWaitlistSelect =
  "normalized_email,display_email,source_page,last_source_page,app_waitlist_requested_at,app_waitlist_last_requested_at,app_waitlist_request_count,newsletter_opt_in_at,invite_email_sent_at,email_suppressed_at,status,created_at,last_submitted_at";
const adminAccessGrantSelect =
  "normalized_email,display_email,status,source,granted_at,revoked_at,first_accessed_at,last_accessed_at";

export type AdminWaitlistRow = {
  email: string;
  normalizedEmail: string;
  sourcePage: string;
  lastSourcePage: string | null;
  status: string;
  appWaitlistRequestedAt: string | null;
  appWaitlistLastRequestedAt: string | null;
  appWaitlistRequestCount: number;
  newsletterOptInAt: string | null;
  inviteEmailSentAt: string | null;
  emailSuppressedAt: string | null;
  accessStatus: "none" | "active" | "revoked";
  accessGrantedAt: string | null;
  accessRevokedAt: string | null;
  firstAccessedAt: string | null;
  lastAccessedAt: string | null;
};

export type AdminWaitlistSummary = {
  rows: AdminWaitlistRow[];
  waitlistCount: number;
  appWaitlistCount: number;
  activeGrantCount: number;
};

export async function loadAdminWaitlist(
  supabase: SupabaseClient<Database>,
): Promise<AdminWaitlistSummary> {
  const [waitlistResult, grantsResult] = await Promise.all([
    supabase
      .from("marketing_waitlist")
      .select(adminWaitlistSelect)
      .order("last_submitted_at", { ascending: false })
      .limit(500),
    supabase
      .from("app_access_grants")
      .select(adminAccessGrantSelect)
      .order("granted_at", { ascending: false })
      .limit(500),
  ]);

  if (waitlistResult.error) {
    throw waitlistResult.error;
  }

  if (grantsResult.error) {
    throw grantsResult.error;
  }

  const rows = summarizeAdminWaitlistRows(waitlistResult.data ?? [], grantsResult.data ?? []);

  return {
    rows,
    waitlistCount: rows.length,
    appWaitlistCount: rows.filter((row) => row.appWaitlistRequestedAt).length,
    activeGrantCount: rows.filter((row) => row.accessStatus === "active").length,
  };
}

export function summarizeAdminWaitlistRows(
  waitlistRows: WaitlistRow[],
  grants: AccessGrantRow[],
): AdminWaitlistRow[] {
  const grantsByEmail = new Map(grants.map((grant) => [grant.normalized_email, grant]));

  return waitlistRows
    .map((row) => {
      const grant = grantsByEmail.get(row.normalized_email);

      return {
        email: row.display_email,
        normalizedEmail: row.normalized_email,
        sourcePage: row.source_page,
        lastSourcePage: row.last_source_page,
        status: row.status,
        appWaitlistRequestedAt: row.app_waitlist_requested_at,
        appWaitlistLastRequestedAt: row.app_waitlist_last_requested_at,
        appWaitlistRequestCount: row.app_waitlist_request_count,
        newsletterOptInAt: row.newsletter_opt_in_at,
        inviteEmailSentAt: row.invite_email_sent_at,
        emailSuppressedAt: row.email_suppressed_at,
        accessStatus: getAccessStatus(grant),
        accessGrantedAt: grant?.granted_at ?? null,
        accessRevokedAt: grant?.revoked_at ?? null,
        firstAccessedAt: grant?.first_accessed_at ?? null,
        lastAccessedAt: grant?.last_accessed_at ?? null,
      };
    })
    .sort(compareAdminWaitlistRows);
}

function getAccessStatus(grant: AccessGrantRow | undefined): AdminWaitlistRow["accessStatus"] {
  if (!grant) {
    return "none";
  }

  return grant.status === "active" ? "active" : "revoked";
}

function compareAdminWaitlistRows(left: AdminWaitlistRow, right: AdminWaitlistRow): number {
  const leftHasAppRequest = Boolean(left.appWaitlistRequestedAt);
  const rightHasAppRequest = Boolean(right.appWaitlistRequestedAt);

  if (leftHasAppRequest !== rightHasAppRequest) {
    return leftHasAppRequest ? -1 : 1;
  }

  const leftTime = Date.parse(left.appWaitlistLastRequestedAt ?? left.newsletterOptInAt ?? "");
  const rightTime = Date.parse(right.appWaitlistLastRequestedAt ?? right.newsletterOptInAt ?? "");

  return normalizeSortTime(rightTime) - normalizeSortTime(leftTime);
}

function normalizeSortTime(time: number): number {
  return Number.isFinite(time) ? time : 0;
}
