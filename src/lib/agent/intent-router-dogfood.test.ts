import { describe, expect, it } from "vitest";
import { __agentTestHooks } from "@/lib/agent/ai-agent";
import {
  inferConversationJob,
  summarizeConversationState,
} from "@/lib/agent/conversation-state";
import { intentCatalog } from "@/lib/agent/intent-catalog";
import { resolveIntentRoute } from "@/lib/agent/intent-router";
import {
  agentRouterDogfoodCases,
  conversationJobDogfoodCases,
  DOGFOOD_MIN_CASE_COUNT,
  forcedToolDogfoodCases,
} from "../../../tests/fixtures/agent-routing/dogfood-cases";

function route(message: string) {
  return resolveIntentRoute({
    message,
    hasSnapshot: true,
    mode: "hybrid",
  });
}

describe("intent router dogfood corpus", () => {
  it("keeps a large enough phrase corpus to catch magic-phrase regressions", () => {
    expect(agentRouterDogfoodCases.length).toBeGreaterThanOrEqual(DOGFOOD_MIN_CASE_COUNT);
  });

  it("does not expect retired account inclusion or savings protection routes", () => {
    const retiredIntentIds = new Set(["account.inclusion", "account.protected_savings"]);
    const retiredToolNames = new Set([
      "set_account_inclusion",
      "set_account_protected_savings",
      "set_savings_goal_protection",
    ]);

    expect(
      agentRouterDogfoodCases.filter((caseDef) => retiredIntentIds.has(caseDef.expectedIntentId ?? "")),
    ).toEqual([]);
    expect(
      agentRouterDogfoodCases.filter((caseDef) => retiredToolNames.has(caseDef.expectedToolName ?? "")),
    ).toEqual([]);
  });

  it("covers every catalog routeable intent", () => {
    const coveredIntentIds = new Set(
      agentRouterDogfoodCases
        .map((caseDef) => caseDef.expectedIntentId)
        .filter(Boolean),
    );

    for (const entry of intentCatalog) {
      if (!entry.toolName) {
        continue;
      }

      expect(coveredIntentIds, `missing dogfood coverage for ${entry.id}`).toContain(entry.id);
    }
  });

  it.each(agentRouterDogfoodCases)("routes dogfood phrase $id", (caseDef) => {
    const decision = route(caseDef.message);
    const detail = JSON.stringify({ caseDef, decision }, null, 2);

    if (caseDef.expectedDecision === "abstain") {
      expect(decision.kind, detail).toBe("abstain");
      return;
    }

    expect(decision.kind, detail).toBe("route");

    if (decision.kind !== "route") {
      return;
    }

    expect(decision.intentId, detail).toBe(caseDef.expectedIntentId);
    expect(decision.toolName, detail).toBe(caseDef.expectedToolName);

    for (const cardType of caseDef.expectedCardTypes ?? []) {
      expect(decision.cardTypes, detail).toContain(cardType);
    }

    for (const intentId of caseDef.forbiddenIntentIds ?? []) {
      expect(decision.intentId, detail).not.toBe(intentId);
    }

    for (const toolName of caseDef.forbiddenToolNames ?? []) {
      expect(decision.toolName, detail).not.toBe(toolName);
    }
  });

  it.each(forcedToolDogfoodCases)("hands dogfood phrase $id to the agent forced-tool boundary", (caseDef) => {
    const forcedTool = __agentTestHooks.getForcedAgentTool({
      message: caseDef.message,
    });
    const detail = JSON.stringify({ caseDef, forcedTool }, null, 2);

    expect(forcedTool, detail).toMatchObject({
      toolName: caseDef.expectedToolName,
    });

    for (const toolName of caseDef.forbiddenToolNames ?? []) {
      expect(forcedTool?.toolName, detail).not.toBe(toolName);
    }
  });

  it.each(conversationJobDogfoodCases)("keeps dogfood phrase $id aligned with conversation jobs", (caseDef) => {
    const messageJob = inferConversationJob(caseDef.message);
    const responseSummary = summarizeConversationState({
      message: caseDef.message,
      responseToolNames: caseDef.expectedToolName ? [caseDef.expectedToolName] : undefined,
    });
    const detail = JSON.stringify({ caseDef, messageJob, responseSummary }, null, 2);

    expect(messageJob, detail).toBe(caseDef.expectedConversationJob);
    expect(responseSummary.currentJob, detail).toBe(caseDef.expectedConversationJob);
  });
});
