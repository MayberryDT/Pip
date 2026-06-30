import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoginPanel } from "@/components/auth/LoginPanel";

describe("LoginPanel", () => {
  it("renders the web sign-in path without reviewer shortcuts", () => {
    const markup = renderToStaticMarkup(<LoginPanel />);

    expect(markup).toContain("Continue with Google");
    expect(markup).toContain("/api/auth/oauth/google");
    expect(markup).not.toContain("Play reviewer sign-in");
  });
});
