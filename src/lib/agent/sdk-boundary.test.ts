import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI SDK boundary", () => {
  it("uses the OpenAI SDK directly without OpenAI Agents SDK or Vercel AI SDK dependencies", () => {
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
    expect(dependencies["@openai/agents"]).toBeUndefined();
    expect(dependencies["@openai/agents-core"]).toBeUndefined();
    expect(dependencies.ai).toBeUndefined();
    expect(Object.keys(dependencies).some((name) => name.startsWith("@ai-sdk/"))).toBe(false);
  });
});
