import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CI release gate", () => {
  it("pins framework versions and Node runtime exactly", () => {
    const packageJson = readJson("package.json") as {
      dependencies?: Record<string, string>;
      engines?: Record<string, string>;
    };
    const packageLock = readJson("package-lock.json") as {
      packages?: Record<string, { version?: string; dependencies?: Record<string, string> }>;
    };

    expect(packageJson.engines?.node).toBe("24.x");

    [
      ["next", "16.2.7"],
      ["react", "19.2.7"],
      ["react-dom", "19.2.7"],
    ].forEach(([dependency, version]) => {
      expect(packageJson.dependencies?.[dependency]).toBe(version);
      expect(packageLock.packages?.[""]?.dependencies?.[dependency]).toBe(version);
      expect(packageLock.packages?.[`node_modules/${dependency}`]?.version).toBe(version);
      expect(packageJson.dependencies?.[dependency]).not.toBe("latest");
    });
  });

  it("runs the required non-secret CI checks on Node 24", () => {
    const workflow = readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");

    expect(workflow).toContain("node-version: \"24\"");
    expect(workflow).toContain("cache: npm");
    [
      "npm ci",
      "npm test",
      "npm run build",
      "npm run check:db-schema-names",
    ].forEach((command) => {
      expect(workflow).toContain(`run: ${command}`);
    });

    [
      "prove:prd",
      "check:prd-complete",
      "eval:agent",
      "dogfood:",
      "secrets.",
      "${{ secrets",
    ].forEach((forbiddenCommand) => {
      expect(workflow).not.toContain(forbiddenCommand);
    });
  });
});

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));
}
