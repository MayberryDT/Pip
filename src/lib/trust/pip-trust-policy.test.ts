import { describe, expect, it } from "vitest";
import { composeTrustPolicyAnswer, pipTrustPolicy } from "@/lib/trust/pip-trust-policy";

describe("pipTrustPolicy", () => {
  it("keeps current public trust providers and boundaries centralized", () => {
    expect(pipTrustPolicy.bankDataProvider.name).toBe("Plaid");
    expect(pipTrustPolicy.aiProvider.role).toContain("AI does not own");
    expect(pipTrustPolicy.securityBoundaries).toContain("Financial connections are read-only.");
    expect(pipTrustPolicy.securityBoundaries.join(" ")).toContain("cannot move");
    expect(pipTrustPolicy.publicLinks.howNumberWorks).toBe("http://localhost:3000/how-the-number-works");
  });

  it("answers common trust questions from policy copy", () => {
    expect(composeTrustPolicyAnswer("Can Pip move money?")).toMatchObject({
      category: "security",
      href: "http://localhost:3000/security",
    });
    expect(composeTrustPolicyAnswer("Does AI calculate my number?")).toMatchObject({
      category: "ai",
      href: "http://localhost:3000/privacy",
    });
    expect(composeTrustPolicyAnswer("Which provider connects my bank?")).toMatchObject({
      category: "connection",
      href: "http://localhost:3000/security",
    });
  });

  it("answers pricing questions with the single monthly price", () => {
    const answer = composeTrustPolicyAnswer("How much does Pip cost?", {
      platform: "web",
    });

    expect(answer).toMatchObject({
      category: "pricing",
      href: "http://localhost:3000/pricing",
    });
    expect(answer.message).toContain("$7.99/month");
  });

  it("answers web pricing questions with the single monthly price", () => {
    const answer = composeTrustPolicyAnswer("How much does Pip cost?");

    expect(answer).toMatchObject({
      category: "pricing",
      href: "http://localhost:3000/pricing",
    });
    expect(pipTrustPolicy.pricing).not.toHaveProperty("weekly");
    expect(pipTrustPolicy.subscriptionSummary).toContain("managed through Stripe");
    expect(answer.message).toContain("$7.99/month");
    expect(answer.message).toContain("Stripe");
    expect(answer.message).not.toMatch(/\$2\.99|weekly/i);
  });
});
