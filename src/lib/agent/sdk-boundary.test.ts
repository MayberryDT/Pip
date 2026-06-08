import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI SDK boundary", () => {
  it("uses the OpenAI Agents SDK without Vercel AI SDK dependencies", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(dependencies.openai).toBeDefined();
    expect(dependencies["@openai/agents"]).toBeDefined();
    expect(dependencies["@openai/agents-core"]).toBeUndefined();
    expect(dependencies.ai).toBeUndefined();
    expect(Object.keys(dependencies).some((name) => name.startsWith("@ai-sdk/"))).toBe(false);
  });

  it("keeps Responses API reasoning item ids out of store=false tool continuations", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/agent/ai-agent.ts"),
      "utf8",
    );

    expect(source).toContain('reasoningItemIdPolicy: "omit"');
    expect(source).toContain("store: false");
  });

  it("does not expose a mock AI runtime switch in the app agent path", () => {
    const agentSource = readFileSync(
      join(process.cwd(), "src/lib/agent/ai-agent.ts"),
      "utf8",
    );
    const routeSource = readFileSync(
      join(process.cwd(), "src/app/api/agent/route.ts"),
      "utf8",
    );

    expect(agentSource).not.toMatch(/\bFREE_CASH_AI_MODE\b/);
    expect(routeSource).not.toContain("x-free-cash-ai-mode");
    expect(routeSource).not.toContain("createMockModelClient");
  });
});
