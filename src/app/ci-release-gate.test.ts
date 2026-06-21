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

  it("exposes the required non-secret release checks as package scripts", () => {
    const packageJson = readJson("package.json") as {
      scripts?: Record<string, string>;
    };

    [
      "test",
      "build",
      "check:deployment",
      "check:db-schema-names",
      "play:android-copy:verify",
    ].forEach((scriptName) => {
      expect(packageJson.scripts?.[scriptName]).toBeTruthy();
    });
  });
});

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));
}
