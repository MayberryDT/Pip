import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import SupportPage from "@/app/support/page";
import TermsPage from "@/app/terms/page";

describe("private-beta legal pages", () => {
  it("states the minimum privacy, deletion, and money-movement boundaries", () => {
    const privacy = renderToStaticMarkup(<PrivacyPage />);
    const terms = renderToStaticMarkup(<TermsPage />);
    const support = renderToStaticMarkup(<SupportPage />);

    expect(privacy).toContain("does not store bank usernames or passwords");
    expect(privacy).toContain("Provider tokens and credentials are handled server-side only");
    expect(privacy).toContain("provider tokens");
    expect(terms).toContain("not financial, tax, investment, credit, or legal advice");
    expect(terms).toContain("does not initiate payments");
    expect(support).toContain("refresh or repair the connection");
    expect(support).toContain("delete-data control");
  });
});
