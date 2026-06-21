import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AgentModelGateRequestKind = "chat" | "prompt_chips" | "opening_bubble";
export type AgentModelGateOnboardingStatus = "guest" | "needs-consent" | "ready";

export type AgentModelGatePlan = {
  minuteLimit: number;
  dayLimit: number;
  globalConcurrencyLimit: number;
  leaseTtlSeconds: number;
};

export type AgentModelGateClaim =
  | {
      outcome: "allowed";
      leaseId: string;
    }
  | {
      outcome: "denied";
      reason: string;
      retryAfterSeconds: number;
    }
  | {
      outcome: "unavailable";
      retryAfterSeconds: number;
    };

type AgentModelGateRpcClient = {
  rpc: (
    name: "claim_agent_model_gate" | "release_agent_model_gate",
    args: Record<string, unknown>,
  ) => Promise<{
    data: AgentModelGateRpcRow[] | null;
    error: Error | null;
  }>;
};

type AgentModelGateRpcRow = {
  allowed: boolean;
  denial_reason: string | null;
  retry_after_seconds: number | null;
  lease_id: string | null;
};

export function buildAgentModelGatePlan(input: {
  onboardingStatus: AgentModelGateOnboardingStatus;
  requestKind: AgentModelGateRequestKind;
}): AgentModelGatePlan {
  if (input.onboardingStatus === "guest" && input.requestKind === "opening_bubble") {
    return { minuteLimit: 2, dayLimit: 12, globalConcurrencyLimit: 12, leaseTtlSeconds: 45 };
  }

  if (input.onboardingStatus === "guest" && input.requestKind === "prompt_chips") {
    return { minuteLimit: 3, dayLimit: 20, globalConcurrencyLimit: 12, leaseTtlSeconds: 45 };
  }

  if (input.onboardingStatus === "guest") {
    return { minuteLimit: 5, dayLimit: 40, globalConcurrencyLimit: 12, leaseTtlSeconds: 45 };
  }

  return { minuteLimit: 12, dayLimit: 250, globalConcurrencyLimit: 24, leaseTtlSeconds: 60 };
}

export function getAgentModelGateScope(input: {
  userId?: string | null;
  clientIp: string | null;
  userAgent: string | null;
  salt: string | undefined;
}): string {
  if (!input.salt && process.env.NODE_ENV === "production") {
    throw new Error("PIP_RATE_LIMIT_SALT is required in production.");
  }

  const rawScope = input.userId
    ? `user:${input.userId}`
    : `guest:${input.clientIp ?? "unknown"}:${input.userAgent ?? "unknown"}`;
  const salt = input.salt || "pip-agent-model-gate";

  return createHash("sha256").update(`${salt}:${rawScope}`).digest("hex");
}

export function getClientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    null;
}

export async function claimAgentModelGate(input: {
  supabase?: AgentModelGateRpcClient;
  scopeHash: string;
  requestKind: AgentModelGateRequestKind;
  plan: AgentModelGatePlan;
}): Promise<AgentModelGateClaim> {
  try {
    const supabase = input.supabase ?? (createSupabaseAdminClient() as unknown as AgentModelGateRpcClient);
    const { data, error } = await supabase.rpc("claim_agent_model_gate", {
      p_scope_hash: input.scopeHash,
      p_request_kind: input.requestKind,
      p_minute_limit: input.plan.minuteLimit,
      p_day_limit: input.plan.dayLimit,
      p_global_concurrency_limit: input.plan.globalConcurrencyLimit,
      p_lease_ttl_seconds: input.plan.leaseTtlSeconds,
    });

    if (error) {
      console.warn("Agent model gate claim failed.", getSafeGateErrorMessage(error));
      return { outcome: "unavailable", retryAfterSeconds: 30 };
    }

    const claim = data?.[0];
    if (!claim) {
      return { outcome: "unavailable", retryAfterSeconds: 30 };
    }

    if (!claim.allowed) {
      return {
        outcome: "denied",
        reason: claim.denial_reason ?? "rate_limit",
        retryAfterSeconds: Math.max(1, Number(claim.retry_after_seconds ?? 60)),
      };
    }

    if (!claim.lease_id) {
      return { outcome: "unavailable", retryAfterSeconds: 30 };
    }

    return {
      outcome: "allowed",
      leaseId: claim.lease_id,
    };
  } catch (error) {
    console.warn("Agent model gate claim failed.", getSafeGateErrorMessage(error));
    return { outcome: "unavailable", retryAfterSeconds: 30 };
  }
}

export async function releaseAgentModelGate(
  leaseId: string | undefined,
  supabase?: AgentModelGateRpcClient,
) {
  if (!leaseId) {
    return;
  }

  try {
    const client = supabase ?? (createSupabaseAdminClient() as unknown as AgentModelGateRpcClient);
    const { error } = await client.rpc("release_agent_model_gate", {
      p_lease_id: leaseId,
    });

    if (error) {
      console.warn("Agent model gate lease release failed.", error.message);
    }
  } catch (error) {
    console.warn("Agent model gate lease release failed.", error);
  }
}

export function toAgentModelGateResponse(claim: Exclude<AgentModelGateClaim, { outcome: "allowed" }>) {
  if (claim.outcome === "unavailable") {
    return {
      status: 503,
      code: "agent-model-gate-unavailable",
      error: "Ask Pip is temporarily unavailable. Try again shortly.",
      retryAfterSeconds: claim.retryAfterSeconds,
    };
  }

  return {
    status: 429,
    code: "agent-rate-limited",
    error: "Ask Pip is receiving too many requests. Try again shortly.",
    retryAfterSeconds: claim.retryAfterSeconds,
  };
}

function getSafeGateErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown model gate error.";
}
