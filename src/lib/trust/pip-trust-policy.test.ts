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
});
