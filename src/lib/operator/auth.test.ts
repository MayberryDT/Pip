import { describe, expect, it, vi } from "vitest";
import { getOperatorAuthFailure } from "@/lib/operator/auth";

describe("operator auth", () => {
  it("fails closed when the operator token is not configured", async () => {
    const failure = getOperatorAuthFailure(requestWithToken("anything"));

    expect(failure?.status).toBe(503);
    await expect(failure?.json()).resolves.toEqual({
      error: "Operator access is not configured.",
    });
  });

  it("rejects missing or wrong bearer tokens", async () => {
    vi.stubEnv("PIP_OPERATOR_TOKEN", "operator-secret");

    const missing = getOperatorAuthFailure(new Request("https://spendwithpip.com/api/operator/test"));
    const wrong = getOperatorAuthFailure(requestWithToken("wrong-token"));

    expect(missing?.status).toBe(401);
    expect(wrong?.status).toBe(401);
    await expect(wrong?.json()).resolves.toEqual({
      error: "Operator authentication required.",
    });
  });

  it("accepts the configured bearer token", () => {
    vi.stubEnv("PIP_OPERATOR_TOKEN", "operator-secret");

    expect(getOperatorAuthFailure(requestWithToken("operator-secret"))).toBeNull();
  });
});

function requestWithToken(token: string) {
  return new Request("https://spendwithpip.com/api/operator/test", {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}
