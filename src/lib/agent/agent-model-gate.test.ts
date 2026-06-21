import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAgentModelGatePlan,
  claimAgentModelGate,
  getAgentModelGateScope,
  toAgentModelGateResponse,
} from "@/lib/agent/agent-model-gate";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("agent model gate", () => {
  it("uses stricter guest quotas for generated chips and opening bubbles", () => {
    expect(buildAgentModelGatePlan({ onboardingStatus: "guest", requestKind: "prompt_chips" })).toMatchObject({
      minuteLimit: 3,
      dayLimit: 20,
    });
    expect(buildAgentModelGatePlan({ onboardingStatus: "guest", requestKind: "opening_bubble" })).toMatchObject({
      minuteLimit: 2,
      dayLimit: 12,
    });
  });

  it("gives signed-in chat requests higher quotas than guests", () => {
    const guest = buildAgentModelGatePlan({ onboardingStatus: "guest", requestKind: "chat" });
    const ready = buildAgentModelGatePlan({ onboardingStatus: "ready", requestKind: "chat" });

    expect(ready.minuteLimit).toBeGreaterThan(guest.minuteLimit);
    expect(ready.dayLimit).toBeGreaterThan(guest.dayLimit);
  });

  it("hashes user and client scopes without exposing raw identifiers", () => {
    const scope = getAgentModelGateScope({
      userId: "user-1",
      clientIp: "203.0.113.9",
      userAgent: "Test Browser",
      salt: "unit-test-salt",
    });

    expect(scope).not.toContain("user-1");
    expect(scope).not.toContain("203.0.113.9");
    expect(scope).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses client IP and user agent for guest scope hashes", () => {
    const base = {
      userId: null,
      salt: "unit-test-salt",
    };

    const first = getAgentModelGateScope({
      ...base,
      clientIp: "203.0.113.9",
      userAgent: "Browser A",
    });
    const second = getAgentModelGateScope({
      ...base,
      clientIp: "203.0.113.10",
      userAgent: "Browser A",
    });
    const third = getAgentModelGateScope({
      ...base,
      clientIp: "203.0.113.9",
      userAgent: "Browser B",
    });

    expect(first).not.toBe(second);
    expect(first).not.toBe(third);
  });

  it("requires an explicit salt in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      getAgentModelGateScope({
        userId: "user-1",
        clientIp: null,
        userAgent: null,
        salt: undefined,
      }),
    ).toThrow("PIP_RATE_LIMIT_SALT is required in production.");
  });

  it("returns a safe 429 response body for denied quota claims", () => {
    expect(toAgentModelGateResponse({
      outcome: "denied",
      retryAfterSeconds: 42,
      reason: "minute_limit",
    })).toEqual({
      status: 429,
      code: "agent-rate-limited",
      error: "Ask Pip is receiving too many requests. Try again shortly.",
      retryAfterSeconds: 42,
    });
  });

  it("returns unavailable when the model gate RPC fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("database unavailable"),
    });

    await expect(claimAgentModelGate({
      supabase: { rpc },
      scopeHash: "scope-hash",
      requestKind: "chat",
      plan: buildAgentModelGatePlan({ onboardingStatus: "guest", requestKind: "chat" }),
    })).resolves.toEqual({
      outcome: "unavailable",
      retryAfterSeconds: 30,
    });
    expect(warn).toHaveBeenCalledWith(
      "Agent model gate claim failed.",
      "database unavailable",
    );
  });

  it("returns unavailable when the model gate RPC throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rpc = vi.fn().mockRejectedValue(new Error("connection refused"));

    await expect(claimAgentModelGate({
      supabase: { rpc },
      scopeHash: "scope-hash",
      requestKind: "chat",
      plan: buildAgentModelGatePlan({ onboardingStatus: "guest", requestKind: "chat" }),
    })).resolves.toEqual({
      outcome: "unavailable",
      retryAfterSeconds: 30,
    });
    expect(warn).toHaveBeenCalledWith(
      "Agent model gate claim failed.",
      "connection refused",
    );
  });

  it("returns an allowed lease from the claim RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          allowed: true,
          denial_reason: null,
          retry_after_seconds: 0,
          lease_id: "lease-1",
        },
      ],
      error: null,
    });

    await expect(claimAgentModelGate({
      supabase: { rpc },
      scopeHash: "scope-hash",
      requestKind: "chat",
      plan: buildAgentModelGatePlan({ onboardingStatus: "ready", requestKind: "chat" }),
    })).resolves.toEqual({
      outcome: "allowed",
      leaseId: "lease-1",
    });

    expect(rpc).toHaveBeenCalledWith("claim_agent_model_gate", expect.objectContaining({
      p_scope_hash: "scope-hash",
      p_request_kind: "chat",
    }));
  });
});
