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
