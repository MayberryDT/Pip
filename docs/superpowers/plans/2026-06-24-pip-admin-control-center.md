# Pip Admin Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `https://spendwithpip.com/admin` as a signed-in, owner-only Pip control center for viewing waitlist contacts and granting app access.

**Architecture:** Keep all privileged work on trusted server boundaries. The browser uses the normal Supabase session cookie; server code verifies the signed-in email against `PIP_ADMIN_EMAILS`, then uses the existing service-role app access helpers and invite email flow. The existing `/app` gate continues to rely on `app_access_grants`; this plan only adds an admin surface around it.

**Tech Stack:** Next.js App Router, React client component for admin interactions, Supabase SSR auth, Supabase service-role server client, Vitest, existing Resend-backed transactional email helpers.

---

## File Structure

- Create `src/lib/admin/auth.ts`
  - Parses `PIP_ADMIN_EMAILS`.
  - Reads the current Supabase user from the server session.
  - Returns a typed admin access state without exposing secrets to the client.
- Create `src/lib/admin/auth.test.ts`
  - Covers configured admin, signed-out user, forbidden signed-in user, and missing Supabase config.
- Modify `src/lib/url/safe-next-path.ts`
  - Allows `/admin` as a safe OAuth `next` destination.
- Modify `src/lib/url/safe-next-path.test.ts`
  - Covers `/admin` and `/admin?...` as safe local redirects.
- Modify `.env.example`
  - Documents `PIP_ADMIN_EMAILS`.
- Create `src/lib/admin/waitlist.ts`
  - Loads waitlist rows and access grants through the admin client.
  - Produces UI-ready rows with access status and invite metadata.
- Create `src/lib/admin/waitlist.test.ts`
  - Tests the pure row-merging behavior.
- Create `src/app/api/admin/access-grants/route.ts`
  - Cookie-authenticated admin route for granting access from the UI.
  - Reuses `grantAppAccess` and `sendInviteGrantedEmail`.
- Create `src/app/api/admin/access-grants/route.test.ts`
  - Covers unauthorized, forbidden, invalid request, successful grant, and email-send failure visibility.
- Modify `src/app/security-headers.test.ts`
  - Adds the new admin route to the sensitive JSON route list.
- Create `src/components/admin/AdminControlCenter.tsx`
  - Client UI for searching waitlist rows and granting access.
- Create `src/components/admin/AdminControlCenter.test.tsx`
  - Verifies waitlist rows, status labels, and promote button rendering.
- Create `src/app/admin/page.tsx`
  - Server page for `/admin`; checks admin access before loading data.
- Create `src/app/admin/page.test.tsx`
  - Covers signed-out, forbidden, unavailable, and authorized render states.
- Modify `README.md`
  - Adds short operator docs for `/admin` and `PIP_ADMIN_EMAILS`.

## Definition of Done

- `mayberrydt@gmail.com` can sign in with Google, return to `/admin`, see waitlist rows, and grant app access without using `PIP_OPERATOR_TOKEN`.
- Non-admin signed-in users and signed-out visitors cannot load waitlist rows or call the admin grant API.
- The browser never receives the Supabase service-role key, `PIP_OPERATOR_TOKEN`, or `PIP_ADMIN_EMAILS`.
- The admin grant API rejects cross-site browser POSTs by checking the `Origin` header when present.
- Every successful grant records source `admin`, an audit note naming the admin email, and the existing invite email status.
- `/app` access remains controlled only by `app_access_grants`; this feature does not loosen the product gate.

## Risk Controls

- **Privilege leak:** Keep all waitlist reads and grants in server code using `createSupabaseAdminClient()`. Client code only receives pre-rendered rows and posts to same-origin admin routes.
- **CSRF grant attempt:** Reject requests with an `Origin` header that does not match the request origin. Keep JSON-only request parsing so cross-site forms cannot trigger grants.
- **Wrong-account grant:** Use normalized email everywhere and show both display and normalized email in the operator list.
- **Email delivery failure:** Treat grant creation as durable even when invite delivery fails; surface `inviteEmailStatus` in the UI so Tyler can manually follow up.
- **Accidental public indexing:** Set `/admin` metadata to `robots: { index: false, follow: false }` and do not add public navigation links.
- **Emergency disable:** Clearing `PIP_ADMIN_EMAILS` makes every signed-in account fail the admin allowlist while leaving the rest of Pip online.
- **Rollback:** Revert the `/admin` page and `/api/admin/access-grants` route if production verification shows admin data leaking, non-admin access, broken `/app` gating, or OAuth return regression. Existing `/api/operator/access-grants` remains the fallback manual grant path.

---

### Task 1: Add Admin Auth Helper

**Files:**
- Create: `src/lib/admin/auth.ts`
- Create: `src/lib/admin/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/admin/auth.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: authMocks.isSupabaseConfigured,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: authMocks.createSupabaseServerClient,
}));

import {
  getAdminAccessState,
  isConfiguredAdminEmail,
  parseAdminEmails,
} from "@/lib/admin/auth";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("admin auth", () => {
  it("normalizes the configured admin email allowlist", () => {
    expect(parseAdminEmails(" mayberrydt@gmail.com,Second@Example.com ,, ")).toEqual([
      "mayberrydt@gmail.com",
      "second@example.com",
    ]);
  });

  it("matches configured admin emails case-insensitively", () => {
    vi.stubEnv("PIP_ADMIN_EMAILS", "mayberrydt@gmail.com");

    expect(isConfiguredAdminEmail("MayberryDT@Gmail.com")).toBe(true);
    expect(isConfiguredAdminEmail("other@example.com")).toBe(false);
  });

  it("returns unavailable when Supabase is not configured", async () => {
    authMocks.isSupabaseConfigured.mockReturnValue(false);

    await expect(getAdminAccessState()).resolves.toEqual({ status: "unavailable" });
    expect(authMocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns signed-out when there is no authenticated user", async () => {
    authMocks.isSupabaseConfigured.mockReturnValue(true);
    authMocks.createSupabaseServerClient.mockResolvedValue(createSupabaseClient(null));

    await expect(getAdminAccessState()).resolves.toEqual({ status: "signed-out" });
  });

  it("returns forbidden for signed-in non-admin users", async () => {
    vi.stubEnv("PIP_ADMIN_EMAILS", "mayberrydt@gmail.com");
    authMocks.isSupabaseConfigured.mockReturnValue(true);
    authMocks.createSupabaseServerClient.mockResolvedValue(
      createSupabaseClient({ id: "user-2", email: "friend@example.com" }),
    );

    await expect(getAdminAccessState()).resolves.toEqual({
      status: "forbidden",
      email: "friend@example.com",
    });
  });

  it("returns authorized for the configured owner account", async () => {
    vi.stubEnv("PIP_ADMIN_EMAILS", "mayberrydt@gmail.com");
    authMocks.isSupabaseConfigured.mockReturnValue(true);
    authMocks.createSupabaseServerClient.mockResolvedValue(
      createSupabaseClient({ id: "user-1", email: "MayberryDT@gmail.com" }),
    );

    await expect(getAdminAccessState()).resolves.toEqual({
      status: "authorized",
      user: {
        id: "user-1",
        email: "MayberryDT@gmail.com",
        normalizedEmail: "mayberrydt@gmail.com",
      },
    });
  });
});

function createSupabaseClient(user: { id: string; email: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
  };
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- src/lib/admin/auth.test.ts
```

Expected: fail because `src/lib/admin/auth.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/admin/auth.ts`:

```ts
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminAccessState =
  | { status: "authorized"; user: AdminUser }
  | { status: "signed-out" }
  | { status: "forbidden"; email: string | null }
  | { status: "unavailable" };

export type AdminUser = {
  id: string;
  email: string;
  normalizedEmail: string;
};

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAdminEmails(value = process.env.PIP_ADMIN_EMAILS ?? ""): string[] {
  return value
    .split(",")
    .map(normalizeAdminEmail)
    .filter(Boolean);
}

export function isConfiguredAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  return parseAdminEmails().includes(normalizeAdminEmail(email));
}

export async function getAdminAccessState(): Promise<AdminAccessState> {
  if (!isSupabaseConfigured()) {
    return { status: "unavailable" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { status: "signed-out" };
  }

  if (!isConfiguredAdminEmail(user.email)) {
    return { status: "forbidden", email: user.email ?? null };
  }

  return {
    status: "authorized",
    user: {
      id: user.id,
      email: user.email ?? "",
      normalizedEmail: normalizeAdminEmail(user.email ?? ""),
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
npm test -- src/lib/admin/auth.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/auth.ts src/lib/admin/auth.test.ts
git commit -m "feat: add Pip admin auth helper"
```

---

### Task 2: Allow Admin OAuth Return Path and Document Env

**Files:**
- Modify: `src/lib/url/safe-next-path.ts`
- Modify: `src/lib/url/safe-next-path.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Update the failing redirect tests**

Modify `src/lib/url/safe-next-path.test.ts`:

```ts
  it.each([
    ["/app", "/app"],
    ["/app?auth=ok", "/app?auth=ok"],
    ["/app/settings", "/app/settings"],
    ["/app/settings?tab=accounts", "/app/settings?tab=accounts"],
    ["/admin", "/admin"],
    ["/admin?view=waitlist", "/admin?view=waitlist"],
  ])("allows app or admin destination %j", (next, expected) => {
    expect(getSafeAuthNextPath(next, origin)).toBe(expected);
  });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- src/lib/url/safe-next-path.test.ts
```

Expected: fail because `/admin` still falls back to `/app`.

- [ ] **Step 3: Update the safe-path allowlist**

Modify the bottom of `src/lib/url/safe-next-path.ts`:

```ts
function isAllowedAuthNextPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/") || pathname === "/admin";
}
```

- [ ] **Step 4: Document the admin env var**

Add this to `.env.example` near `PIP_OPERATOR_TOKEN`:

```bash
PIP_ADMIN_EMAILS=
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
npm test -- src/lib/url/safe-next-path.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/url/safe-next-path.ts src/lib/url/safe-next-path.test.ts .env.example
git commit -m "feat: allow admin OAuth return path"
```

---

### Task 3: Build Admin Waitlist Read Model

**Files:**
- Create: `src/lib/admin/waitlist.ts`
- Create: `src/lib/admin/waitlist.test.ts`

- [ ] **Step 1: Write the row-merging tests**

Create `src/lib/admin/waitlist.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- src/lib/admin/waitlist.test.ts
```

Expected: fail because `src/lib/admin/waitlist.ts` does not exist.

- [ ] **Step 3: Implement the read model**

Create `src/lib/admin/waitlist.ts`:

```ts
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
      .select(
        [
          "normalized_email",
          "display_email",
          "source_page",
          "last_source_page",
          "app_waitlist_requested_at",
          "app_waitlist_last_requested_at",
          "app_waitlist_request_count",
          "newsletter_opt_in_at",
          "invite_email_sent_at",
          "email_suppressed_at",
          "status",
          "created_at",
          "last_submitted_at",
        ].join(", "),
      )
      .order("last_submitted_at", { ascending: false })
      .limit(500),
    supabase
      .from("app_access_grants")
      .select(
        [
          "normalized_email",
          "display_email",
          "status",
          "source",
          "granted_at",
          "revoked_at",
          "first_accessed_at",
          "last_accessed_at",
        ].join(", "),
      )
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
```

- [ ] **Step 4: Run the tests**

Run:

```bash
npm test -- src/lib/admin/waitlist.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/waitlist.ts src/lib/admin/waitlist.test.ts
git commit -m "feat: add admin waitlist read model"
```

---

### Task 4: Add Admin Grant API

**Files:**
- Create: `src/app/api/admin/access-grants/route.ts`
- Create: `src/app/api/admin/access-grants/route.test.ts`
- Modify: `src/app/security-headers.test.ts`

- [ ] **Step 1: Write the route tests**

Create `src/app/api/admin/access-grants/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getAdminAccessState: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  grantAppAccess: vi.fn(),
  sendInviteGrantedEmail: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  getAdminAccessState: routeMocks.getAdminAccessState,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/data/app-access-grants", () => ({
  grantAppAccess: routeMocks.grantAppAccess,
  normalizeAppAccessEmail: (email: string) => email.trim().toLowerCase(),
}));

vi.mock("@/lib/email/transactional", () => ({
  sendInviteGrantedEmail: routeMocks.sendInviteGrantedEmail,
}));

import { POST } from "@/app/api/admin/access-grants/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/admin/access-grants", () => {
  it("requires a signed-in admin user", async () => {
    routeMocks.getAdminAccessState.mockResolvedValue({ status: "signed-out" });

    const response = await POST(jsonRequest({ email: "person@example.com" }));

    expect(response.status).toBe(401);
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("forbids signed-in non-admin users", async () => {
    routeMocks.getAdminAccessState.mockResolvedValue({
      status: "forbidden",
      email: "friend@example.com",
    });

    const response = await POST(jsonRequest({ email: "person@example.com" }));

    expect(response.status).toBe(403);
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects cross-site browser origins before using admin privileges", async () => {
    routeMocks.getAdminAccessState.mockResolvedValue({
      status: "authorized",
      user: { id: "user-1", email: "mayberrydt@gmail.com", normalizedEmail: "mayberrydt@gmail.com" },
    });

    const response = await POST(
      jsonRequest(
        { email: "person@example.com" },
        {
          origin: "https://evil.example",
        },
      ),
    );

    expect(response.status).toBe(403);
    expect(routeMocks.getAdminAccessState).not.toHaveBeenCalled();
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects invalid email input", async () => {
    routeMocks.getAdminAccessState.mockResolvedValue({
      status: "authorized",
      user: { id: "user-1", email: "mayberrydt@gmail.com", normalizedEmail: "mayberrydt@gmail.com" },
    });

    const response = await POST(jsonRequest({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(routeMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("grants access and sends the invite email", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://spendwithpip.com");
    routeMocks.getAdminAccessState.mockResolvedValue({
      status: "authorized",
      user: { id: "user-1", email: "mayberrydt@gmail.com", normalizedEmail: "mayberrydt@gmail.com" },
    });
    const supabase = { kind: "admin" };
    routeMocks.createSupabaseAdminClient.mockReturnValue(supabase);
    routeMocks.grantAppAccess.mockResolvedValue({ normalized_email: "person@example.com", status: "active" });
    routeMocks.sendInviteGrantedEmail.mockResolvedValue({
      status: "sent",
      provider: "resend",
      providerMessageId: "msg_123",
    });

    const response = await POST(jsonRequest({ email: "Person@Example.com", note: "first private beta user" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "granted",
      normalizedEmail: "person@example.com",
      appUrl: "https://spendwithpip.com/app",
      inviteEmailStatus: "sent",
    });
    expect(routeMocks.grantAppAccess).toHaveBeenCalledWith(supabase, {
      email: "Person@Example.com",
      source: "admin",
      note: "Admin mayberrydt@gmail.com: first private beta user",
    });
    expect(routeMocks.sendInviteGrantedEmail).toHaveBeenCalledWith(supabase, {
      email: "Person@Example.com",
      normalizedEmail: "person@example.com",
      appUrl: "https://spendwithpip.com/app",
    });
  });

  it("keeps the successful grant visible when invite delivery fails", async () => {
    routeMocks.getAdminAccessState.mockResolvedValue({
      status: "authorized",
      user: { id: "user-1", email: "mayberrydt@gmail.com", normalizedEmail: "mayberrydt@gmail.com" },
    });
    routeMocks.createSupabaseAdminClient.mockReturnValue({ kind: "admin" });
    routeMocks.grantAppAccess.mockResolvedValue({ normalized_email: "person@example.com", status: "active" });
    routeMocks.sendInviteGrantedEmail.mockResolvedValue({
      status: "failed",
      provider: "resend",
      errorMessage: "domain not verified",
    });

    const response = await POST(jsonRequest({ email: "person@example.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "granted",
      normalizedEmail: "person@example.com",
      inviteEmailStatus: "failed",
    });
  });
});

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://spendwithpip.com/api/admin/access-grants", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 2: Run route tests to verify they fail**

Run:

```bash
npm test -- src/app/api/admin/access-grants/route.test.ts
```

Expected: fail because the route does not exist.

- [ ] **Step 3: Implement the route**

Create `src/app/api/admin/access-grants/route.ts`:

```ts
import { z } from "zod";
import { getAdminAccessState } from "@/lib/admin/auth";
import { grantAppAccess, normalizeAppAccessEmail } from "@/lib/data/app-access-grants";
import { sendInviteGrantedEmail } from "@/lib/email/transactional";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupabaseConfigError } from "@/lib/supabase/env";

const adminGrantRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  if (!isTrustedAdminOrigin(request)) {
    return sensitiveJson({ error: "Admin request origin rejected." }, { status: 403 });
  }

  const adminState = await getAdminAccessState();

  if (adminState.status === "signed-out") {
    return sensitiveJson({ error: "Admin sign-in required." }, { status: 401 });
  }

  if (adminState.status === "forbidden") {
    return sensitiveJson({ error: "Admin access required." }, { status: 403 });
  }

  if (adminState.status === "unavailable") {
    return sensitiveJson({ error: "Admin access is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminGrantRequestSchema.safeParse(body);

  if (!parsed.success) {
    return sensitiveJson({ error: "Invalid admin grant request." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const normalizedEmail = normalizeAppAccessEmail(parsed.data.email);

    await grantAppAccess(supabase, {
      email: parsed.data.email,
      source: "admin",
      note: buildAdminGrantNote(adminState.user.normalizedEmail, parsed.data.note ?? null),
    });

    const appUrl = new URL("/app", process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin).toString();
    const inviteEmail = await sendInviteGrantedEmail(supabase, {
      email: parsed.data.email,
      normalizedEmail,
      appUrl,
    });

    return sensitiveJson({
      status: "granted",
      normalizedEmail,
      appUrl,
      inviteEmailStatus: inviteEmail.status,
    });
  } catch (error) {
    return sensitiveJson(toErrorBody(error), { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return { error: error.message };
  }

  if (error instanceof Error) {
    return { error: error.message };
  }

  return { error: "Admin app access grant request failed." };
}

function isTrustedAdminOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  return origin === new URL(request.url).origin;
}

function buildAdminGrantNote(adminEmail: string, note: string | null): string {
  return note ? `Admin ${adminEmail}: ${note}` : `Admin ${adminEmail}: Granted from /admin`;
}
```

- [ ] **Step 4: Add the route to sensitive response coverage**

Modify `src/app/security-headers.test.ts` and add this path to `sensitiveRouteFiles`:

```ts
  "src/app/api/admin/access-grants/route.ts",
```

- [ ] **Step 5: Run route and security tests**

Run:

```bash
npm test -- src/app/api/admin/access-grants/route.test.ts src/app/security-headers.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/access-grants/route.ts src/app/api/admin/access-grants/route.test.ts src/app/security-headers.test.ts
git commit -m "feat: add signed-in admin access grant route"
```

---

### Task 5: Build the Admin Control Center UI

**Files:**
- Create: `src/components/admin/AdminControlCenter.tsx`
- Create: `src/components/admin/AdminControlCenter.test.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/page.test.tsx`

- [ ] **Step 1: Write component tests**

Create `src/components/admin/AdminControlCenter.test.tsx`:

```ts
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminControlCenter } from "@/components/admin/AdminControlCenter";

const rows = [
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
    inviteEmailSentAt: null,
    emailSuppressedAt: null,
    accessStatus: "none" as const,
    accessGrantedAt: null,
    accessRevokedAt: null,
    firstAccessedAt: null,
    lastAccessedAt: null,
  },
  {
    email: "Active@Example.com",
    normalizedEmail: "active@example.com",
    sourcePage: "/app",
    lastSourcePage: "/app",
    status: "joined",
    appWaitlistRequestedAt: "2026-06-24T12:00:00.000Z",
    appWaitlistLastRequestedAt: "2026-06-24T12:00:00.000Z",
    appWaitlistRequestCount: 1,
    newsletterOptInAt: null,
    inviteEmailSentAt: "2026-06-24T12:10:00.000Z",
    emailSuppressedAt: null,
    accessStatus: "active" as const,
    accessGrantedAt: "2026-06-24T12:05:00.000Z",
    accessRevokedAt: null,
    firstAccessedAt: null,
    lastAccessedAt: null,
  },
];

describe("AdminControlCenter", () => {
  it("renders waitlist rows and access status", () => {
    const markup = renderToStaticMarkup(
      <AdminControlCenter
        rows={rows}
        summary={{ waitlistCount: 2, appWaitlistCount: 2, activeGrantCount: 1 }}
      />,
    );

    expect(markup).toContain("Pip Control Center");
    expect(markup).toContain("Friend@Example.com");
    expect(markup).toContain("Active@Example.com");
    expect(markup).toContain("Grant access");
    expect(markup).toContain("Active");
  });

  it("renders an empty state when there are no waitlist rows", () => {
    const markup = renderToStaticMarkup(
      <AdminControlCenter
        rows={[]}
        summary={{ waitlistCount: 0, appWaitlistCount: 0, activeGrantCount: 0 }}
      />,
    );

    expect(markup).toContain("No waitlist rows yet.");
  });
});
```

- [ ] **Step 2: Run component tests to verify they fail**

Run:

```bash
npm test -- src/components/admin/AdminControlCenter.test.tsx
```

Expected: fail because the component does not exist.

- [ ] **Step 3: Implement the client component**

Create `src/components/admin/AdminControlCenter.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Search, ShieldCheck, UserPlus } from "lucide-react";
import type { AdminWaitlistRow } from "@/lib/admin/waitlist";

type AdminControlCenterProps = {
  rows: AdminWaitlistRow[];
  summary: {
    waitlistCount: number;
    appWaitlistCount: number;
    activeGrantCount: number;
  };
};

type GrantStatus = {
  email: string;
  message: string;
};

export function AdminControlCenter({ rows, summary }: AdminControlCenterProps) {
  const [query, setQuery] = useState("");
  const [grantingEmail, setGrantingEmail] = useState<string | null>(null);
  const [grantStatus, setGrantStatus] = useState<GrantStatus | null>(null);
  const [localRows, setLocalRows] = useState(rows);
  const [localActiveGrantCount, setLocalActiveGrantCount] = useState(summary.activeGrantCount);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return localRows;
    }

    return localRows.filter((row) =>
      [row.email, row.normalizedEmail, row.sourcePage, row.lastSourcePage ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [localRows, query]);

  async function grantAccess(row: AdminWaitlistRow) {
    if (grantingEmail) {
      return;
    }

    setGrantingEmail(row.normalizedEmail);
    setGrantStatus(null);

    try {
      const response = await fetch("/api/admin/access-grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: row.email,
          note: "Granted from /admin",
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getPayloadError(payload));
      }

      setLocalRows((currentRows) =>
        currentRows.map((currentRow) =>
          currentRow.normalizedEmail === row.normalizedEmail
            ? {
                ...currentRow,
                accessStatus: "active",
                accessGrantedAt: new Date().toISOString(),
                inviteEmailSentAt:
                  payload && typeof payload === "object" && payload.inviteEmailStatus === "sent"
                    ? new Date().toISOString()
                    : currentRow.inviteEmailSentAt,
              }
            : currentRow,
        ),
      );
      if (row.accessStatus !== "active") {
        setLocalActiveGrantCount((currentCount) => currentCount + 1);
      }
      setGrantStatus({
        email: row.normalizedEmail,
        message: getGrantMessage(payload),
      });
    } catch (error) {
      setGrantStatus({
        email: row.normalizedEmail,
        message: error instanceof Error ? error.message : "Grant failed.",
      });
    } finally {
      setGrantingEmail(null);
    }
  }

  return (
    <main className="pip-app-shell min-h-screen px-5 py-6 text-ink">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div className="glass-panel px-5 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-taupe">Admin</p>
              <h1 className="font-display mt-2 text-[2.4rem] leading-none text-ink">Pip Control Center</h1>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Waitlist" value={summary.waitlistCount} />
              <Metric label="App requests" value={summary.appWaitlistCount} />
              <Metric label="Active" value={localActiveGrantCount} />
            </div>
          </div>
        </div>

        <div className="glass-panel px-4 py-4">
          <label className="flex min-h-12 items-center gap-2 rounded-full border border-line bg-white/75 px-4">
            <Search aria-hidden="true" size={17} strokeWidth={2.4} />
            <span className="sr-only">Search waitlist</span>
            <input
              className="h-10 min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-taupe"
              placeholder="Search email or source"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {filteredRows.length > 0 ? (
          <div className="grid gap-3">
            {filteredRows.map((row) => (
              <article className="glass-panel px-4 py-4" key={row.normalizedEmail}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-bold text-ink">{row.email}</p>
                    <p className="mt-1 text-xs font-semibold text-taupe">
                      {row.lastSourcePage ?? row.sourcePage} · {formatDate(row.appWaitlistLastRequestedAt ?? row.newsletterOptInAt)}
                    </p>
                    {grantStatus?.email === row.normalizedEmail ? (
                      <p className="mt-2 text-xs font-semibold text-taupe" role="status">
                        {grantStatus.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={row.accessStatus} />
                    <button
                      className="focus-ring ui-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-bold text-paper disabled:bg-ink/35"
                      disabled={row.accessStatus === "active" || grantingEmail === row.normalizedEmail}
                      type="button"
                      onClick={() => grantAccess(row)}
                    >
                      <UserPlus aria-hidden="true" size={16} strokeWidth={2.4} />
                      <span>{grantingEmail === row.normalizedEmail ? "Granting..." : "Grant access"}</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="glass-panel px-5 py-6 text-sm font-semibold text-taupe">No waitlist rows yet.</div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[0.9rem] border border-line bg-white/60 px-3 py-2">
      <p className="text-lg font-black text-ink">{value}</p>
      <p className="text-[0.68rem] font-bold uppercase tracking-normal text-taupe">{label}</p>
    </div>
  );
}

function StatusPill({ status }: { status: AdminWaitlistRow["accessStatus"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-moss/30 bg-moss/10 px-3 text-xs font-bold text-moss">
        <ShieldCheck aria-hidden="true" size={14} strokeWidth={2.4} />
        Active
      </span>
    );
  }

  return (
    <span className="inline-flex min-h-9 items-center rounded-full border border-line bg-white/55 px-3 text-xs font-bold text-taupe">
      {status === "revoked" ? "Revoked" : "Waitlisted"}
    </span>
  );
}

function formatDate(value: string | null): string {
  if (!value) {
    return "No timestamp";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getPayloadError(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return "Grant failed.";
}

function getGrantMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && "inviteEmailStatus" in payload) {
    return `Access granted. Invite email: ${String(payload.inviteEmailStatus)}.`;
  }

  return "Access granted.";
}
```

- [ ] **Step 4: Write page tests**

Create `src/app/admin/page.test.tsx`:

```ts
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const pageMocks = vi.hoisted(() => ({
  getAdminAccessState: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  loadAdminWaitlist: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  getAdminAccessState: pageMocks.getAdminAccessState,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: pageMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/admin/waitlist", () => ({
  loadAdminWaitlist: pageMocks.loadAdminWaitlist,
}));

import AdminPage from "@/app/admin/page";

afterEach(() => {
  vi.clearAllMocks();
});

describe("/admin page", () => {
  it("shows an admin sign-in state for signed-out visitors", async () => {
    pageMocks.getAdminAccessState.mockResolvedValue({ status: "signed-out" });

    const markup = renderToStaticMarkup(await AdminPage());

    expect(markup).toContain("Pip admin sign in");
    expect(markup).toContain("/api/auth/oauth/google?next=%2Fadmin");
    expect(pageMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("does not load admin data for forbidden users", async () => {
    pageMocks.getAdminAccessState.mockResolvedValue({
      status: "forbidden",
      email: "friend@example.com",
    });

    const markup = renderToStaticMarkup(await AdminPage());

    expect(markup).toContain("Admin access required");
    expect(markup).not.toContain("friend@example.com");
    expect(pageMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("renders the control center for authorized admins", async () => {
    const admin = { kind: "admin" };
    pageMocks.getAdminAccessState.mockResolvedValue({
      status: "authorized",
      user: { id: "user-1", email: "mayberrydt@gmail.com", normalizedEmail: "mayberrydt@gmail.com" },
    });
    pageMocks.createSupabaseAdminClient.mockReturnValue(admin);
    pageMocks.loadAdminWaitlist.mockResolvedValue({
      rows: [],
      waitlistCount: 0,
      appWaitlistCount: 0,
      activeGrantCount: 0,
    });

    const markup = renderToStaticMarkup(await AdminPage());

    expect(markup).toContain("Pip Control Center");
    expect(pageMocks.loadAdminWaitlist).toHaveBeenCalledWith(admin);
  });
});
```

- [ ] **Step 5: Run page tests to verify they fail**

Run:

```bash
npm test -- src/app/admin/page.test.tsx src/components/admin/AdminControlCenter.test.tsx
```

Expected: fail because `/admin` page does not exist yet.

- [ ] **Step 6: Implement the server page**

Create `src/app/admin/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AdminControlCenter } from "@/components/admin/AdminControlCenter";
import { getAdminAccessState } from "@/lib/admin/auth";
import { loadAdminWaitlist } from "@/lib/admin/waitlist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pip admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  const adminState = await getAdminAccessState();

  if (adminState.status === "signed-out") {
    return <AdminShell title="Pip admin sign in" actionHref="/api/auth/oauth/google?next=%2Fadmin" actionLabel="Sign in with Google" />;
  }

  if (adminState.status === "forbidden") {
    return <AdminShell title="Admin access required" />;
  }

  if (adminState.status === "unavailable") {
    return <AdminShell title="Admin access is unavailable" />;
  }

  const supabase = createSupabaseAdminClient();
  const waitlist = await loadAdminWaitlist(supabase);

  return (
    <AdminControlCenter
      rows={waitlist.rows}
      summary={{
        waitlistCount: waitlist.waitlistCount,
        appWaitlistCount: waitlist.appWaitlistCount,
        activeGrantCount: waitlist.activeGrantCount,
      }}
    />
  );
}

function AdminShell({
  title,
  actionHref,
  actionLabel,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <main className="pip-app-shell grid min-h-screen place-items-center px-5 py-8 text-ink">
      <section className="glass-panel w-full max-w-[430px] space-y-5 px-5 py-6">
        <img src="/brand/pip-logo.png" alt="Pip" width={757} height={634} className="h-16 w-auto object-contain" />
        <div>
          <p className="text-xs font-bold uppercase tracking-normal text-taupe">Admin</p>
          <h1 className="font-display mt-2 text-[2rem] leading-none text-ink">{title}</h1>
        </div>
        {actionHref && actionLabel ? (
          <a
            className="focus-ring ui-pressable inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-bold text-paper"
            href={actionHref}
          >
            {actionLabel}
          </a>
        ) : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Run UI tests**

Run:

```bash
npm test -- src/app/admin/page.test.tsx src/components/admin/AdminControlCenter.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/page.test.tsx src/components/admin/AdminControlCenter.tsx src/components/admin/AdminControlCenter.test.tsx
git commit -m "feat: add Pip admin control center"
```

---

### Task 6: Documentation and Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add admin docs**

Add this after the existing operator access-grants bullets in `README.md`:

```md
Admin control center:

- `/admin` is a private owner surface for waitlist review and access grants.
- Set `PIP_ADMIN_EMAILS=mayberrydt@gmail.com` in production before enabling it.
- Admin access uses the signed-in Supabase Google session; the browser never receives `PIP_OPERATOR_TOKEN` or the Supabase service-role key.
- The Grant access action writes `app_access_grants` through the server admin client and sends the existing invite email.
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm test -- \
  src/lib/admin/auth.test.ts \
  src/lib/url/safe-next-path.test.ts \
  src/lib/admin/waitlist.test.ts \
  src/app/api/admin/access-grants/route.test.ts \
  src/components/admin/AdminControlCenter.test.tsx \
  src/app/admin/page.test.tsx \
  src/app/security-headers.test.ts
```

Expected: pass.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: pass.

- [ ] **Step 4: Build**

Run:

```bash
npm run build
```

Expected: build completes successfully.

- [ ] **Step 5: Browser verification with the in-app Browser**

Start the local app with production-like env available, then use the Codex in-app Browser with the `iab` backend:

```bash
npm run dev:local-staging
```

Expected manual checks:

- `/admin` signed out shows the Google sign-in state.
- Google sign-in can return to `/admin` because `/admin` is accepted as a safe `next` path.
- A non-admin signed-in account sees the blocked state and no waitlist rows.
- `mayberrydt@gmail.com` sees the waitlist rows.
- Clicking Grant access changes the row status to Active and reports the invite email status.
- `/app` opens for the newly granted email after that user signs in with the same Google address.
- A cross-site `Origin` POST to `/api/admin/access-grants` returns `403` and does not create an access grant.

- [ ] **Step 6: Deployment env verification**

Confirm production has:

```bash
PIP_ADMIN_EMAILS=mayberrydt@gmail.com
```

Also confirm the existing production env remains present:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
PIP_EMAIL_MODE
RESEND_API_KEY
PIP_EMAIL_FROM
PIP_EMAIL_POSTAL_ADDRESS
PIP_EMAIL_UNSUBSCRIBE_SECRET
```

- [ ] **Step 7: Commit docs**

```bash
git add README.md
git commit -m "docs: document Pip admin control center"
```

---

## Final Verification Gate

Run:

```bash
npm test
npm run build
```

Then verify `/admin` with the in-app Browser using the `iab` backend. Do not use standalone Playwright or a shell-launched browser for this browser verification unless Tyler explicitly approves that fallback.

Expected result: `mayberrydt@gmail.com` can open `/admin`, view waitlist contacts, grant app access, and the recipient can access `/app` after signing in with the granted email. Non-admin accounts cannot see waitlist rows or call the admin grant route successfully.

---

## Self-Review

- Spec coverage: The plan covers `/admin`, admin-only access using `mayberrydt@gmail.com` via `PIP_ADMIN_EMAILS`, waitlist visibility, and promotion from waitlist to app access.
- Security coverage: The service-role client stays server-side; the browser uses only the Supabase session cookie and a same-origin admin route. The existing bearer-token operator route remains available and unchanged.
- Scope control: The plan does not add collaborator management, billing controls, analytics dashboards, revoke UI, or broader customer support tooling. Those can be later admin modules after the waitlist grant path works.
- Type consistency: `AdminWaitlistRow`, `AdminWaitlistSummary`, and `AdminAccessState` are defined before use and reused by the page, route, and component.
