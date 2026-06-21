import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import SupportPage from "@/app/support/page";
import TermsPage from "@/app/terms/page";
import DeleteAccountPage from "@/app/delete-account/page";

describe("public legal and support pages", () => {
  it("states the minimum privacy, deletion, and money-movement boundaries", () => {
    const privacy = renderToStaticMarkup(<PrivacyPage />);
    const terms = renderToStaticMarkup(<TermsPage />);
    const support = renderToStaticMarkup(<SupportPage />);
    const deletion = renderToStaticMarkup(<DeleteAccountPage />);

    expect(privacy).toContain("does not store bank usernames or passwords");
    expect(privacy).toContain("Provider tokens are handled server-side only");
    expect(privacy).toContain("provider tokens");
    expect(privacy).toContain("Supabase user ID");
    expect(privacy).toContain("Supabase provides authentication");
    expect(privacy).toContain("Netlify provides hosting");
    expect(privacy).toContain("Plaid provides read-only account connection data");
    expect(privacy).toContain("OpenAI or Netlify AI Gateway");
    expect(privacy).toContain("IP address");
    expect(privacy).toContain("Android build version");
    expect(privacy).toContain("encrypted connections in transit");
    expect(privacy).toContain("delete your account from the in-app settings panel");
    expect(privacy).toContain("AI response reports");
    expect(privacy).toContain("does not intentionally train a Pip-owned AI model");
    expect(terms).toContain("not financial, tax, investment, credit, or legal advice");
    expect(terms).toContain("cannot move, withdraw, transfer");
    expect(terms).toContain("No Guarantee");
    expect(terms).toContain("does not make loan, credit, underwriting, insurance, or investment decisions");
    expect(terms).toContain("Android Play test build is consumption-only");
    expect(support).toContain("ask Pip in the chat to refresh data or repair the connection");
    expect(support).toContain("how the number works");
    expect(support).toContain("Open Settings in the app and type DELETE");
    expect(support).toContain("AI Response Reports");
    expect(support).not.toContain("Billing Support");
    expect(support).not.toContain('href="/pricing"');
    expect(deletion).toContain("To delete your Pip account");
    expect(deletion).toContain("typing DELETE");
    expect(deletion).toContain("If account deletion cannot complete, Pip keeps the request retryable");
    expect([privacy, terms, support, deletion].join("\n")).not.toMatch(/\b(?:beta|waitlist)\b|join-beta/i);
    expect([privacy, terms, support, deletion].join("\n")).not.toMatch(/\$2\.99|\$7\.99|href="\/pricing"|View pricing|Pricing details/);
  });
});
