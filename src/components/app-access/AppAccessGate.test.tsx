import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppAccessGate } from "@/components/app-access/AppAccessGate";
import {
  AppAccessSignOutButton,
  signOutAndRedirect,
} from "@/components/app-access/AppAccessSignOutButton";

describe("AppAccessGate", () => {
  it("shows an OAuth waitlist prompt without rendering chat UI for signed-out visitors", () => {
    const markup = renderToStaticMarkup(<AppAccessGate state="signed-out" />);

    expect(markup).toContain("Join the Pip waitlist");
    expect(markup).toContain("/api/auth/oauth/google");
    expect(markup).not.toContain("data-testid=\"agent-thread\"");
  });

  it("shows a blocked waitlist state for signed-in ungranted users", () => {
    const markup = renderToStaticMarkup(
      <AppAccessGate state="waitlisted" email="tester@example.com" />,
    );

    expect(markup).toContain("You’re on the Pip waitlist");
    expect(markup).toContain("tester@example.com");
    expect(markup).toContain("Sign out");
    expect(markup).not.toContain("data-testid=\"agent-thread\"");
  });

  it("shows an unavailable state without exposing the app", () => {
    const markup = renderToStaticMarkup(<AppAccessGate state="unavailable" />);

    expect(markup).toContain("Pip access is temporarily unavailable");
    expect(markup).not.toContain("data-testid=\"agent-thread\"");
  });
});

describe("AppAccessSignOutButton", () => {
  it("renders the blocked-state sign-out control", () => {
    const markup = renderToStaticMarkup(<AppAccessSignOutButton />);

    expect(markup).toContain("Sign out");
  });

  it("signs out through the JSON endpoint and returns to /app", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
    });
    const assign = vi.fn();

    await signOutAndRedirect({ fetcher, assign });

    expect(fetcher).toHaveBeenCalledWith("/api/auth/sign-out", {
      method: "POST",
    });
    expect(assign).toHaveBeenCalledWith("/app");
  });
});
