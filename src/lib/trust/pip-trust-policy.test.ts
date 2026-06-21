import { describe, expect, it } from "vitest";
import { composeTrustPolicyAnswer, pipTrustPolicy } from "@/lib/trust/pip-trust-policy";

describe("pipTrustPolicy", () => {
  it("keeps current public trust providers and boundaries centralized", () => {
    expect(pipTrustPolicy.bankDataProvider.name).toBe("Plaid");
    expect(pipTrustPolicy.aiProvider.role).toContain("AI does not own");
    expect(pipTrustPolicy.securityBoundaries).toContain("Financial connections are read-only.");
    expect(pipTrustPolicy.securityBoundaries.join(" ")).toContain("cannot move");
    expect(pipTrustPolicy.publicLinks.howNumberWorks).toBe("/how-the-number-works");
  });

  it("answers common trust questions from policy copy", () => {
    expect(composeTrustPolicyAnswer("Can Pip move money?")).toMatchObject({
      category: "security",
      href: "/security",
    });
    expect(composeTrustPolicyAnswer("Does AI calculate my number?")).toMatchObject({
      category: "ai",
      href: "/privacy",
    });
    expect(composeTrustPolicyAnswer("Which provider connects my bank?")).toMatchObject({
      category: "connection",
      href: "/security",
    });
  });

  it("keeps Android pricing answers free of prices and pricing links", () => {
    const answer = composeTrustPolicyAnswer("How much does Pip cost?", {
      platform: "android_webview",
    });

    expect(answer).toMatchObject({
      category: "pricing",
      message: "Purchases and subscriptions are not available in this Android build.",
      href: "/support",
    });
    expect(answer.message).not.toMatch(/\$2\.99|\$7\.99|pricing/i);
    expect(answer.href).not.toBe("/pricing");
  });

  it("answers web pricing questions with the single monthly price", () => {
    const answer = composeTrustPolicyAnswer("How much does Pip cost?");

    expect(answer).toMatchObject({
      category: "pricing",
      href: "/pricing",
    });
    expect(pipTrustPolicy.pricing).not.toHaveProperty("weekly");
    expect(answer.message).toContain("$7.99/month");
    expect(answer.message).not.toMatch(/\$2\.99|weekly/i);
  });
});
