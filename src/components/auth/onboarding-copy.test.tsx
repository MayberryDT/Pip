import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConsentGate } from "@/components/auth/ConsentGate";
import { LoginPanel } from "@/components/auth/LoginPanel";

describe("onboarding copy", () => {
  it("keeps sign-in focused on Pip accuracy without exposing balances by default", () => {
    const markup = renderToStaticMarkup(<LoginPanel />);

    expect(markup).toContain("Hi, I’m Pip. I’ll help you find the money");
    expect(markup).toContain("Connect checking and cards");
    expect(markup).toContain("without making balances the default number");
    expect(markup).toContain("Sign in with Google to set up Pip");
    expect(markup).toContain("Continue with Google");
    expect(markup).toContain("pip-waving.png");
  });

  it("explains consent, server-side provider tokens, no money movement, and protected savings", () => {
    const markup = renderToStaticMarkup(<ConsentGate email="tester@example.com" />);

    expect(markup).toContain("provider tokens on the server");
    expect(markup).toContain("never stores bank credentials or moves money");
    expect(markup).toContain("Connecting checking accounts and cards makes Spendable Cash Today more accurate");
    expect(markup).toContain("Savings cushion");
    expect(markup).toContain("Use $200 cushion");
    expect(markup).toContain("pip-waving.png");
  });
});
