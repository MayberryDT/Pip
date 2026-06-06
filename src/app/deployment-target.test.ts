import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("deployment target", () => {
  it("keeps the app configured for Netlify Next.js deploys", () => {
    const netlifyToml = readFileSync(join(process.cwd(), "netlify.toml"), "utf8");

    expect(netlifyToml).toContain('[build]');
    expect(netlifyToml).toContain('command = "npm run build"');
    expect(netlifyToml).toContain('publish = ".next"');
    expect(netlifyToml).toContain('NODE_VERSION = "24"');
  });

  it("does not install Vercel runtime, Vercel AI SDK, or Netlify Identity dependencies", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    });
    const scripts = Object.values(packageJson.scripts ?? {});

    expect(dependencies.some((name) => name === "vercel" || name.startsWith("@vercel/"))).toBe(
      false,
    );
    expect(dependencies.some((name) => name === "ai" || name.startsWith("@ai-sdk/"))).toBe(false);
    expect(dependencies.some((name) => name.includes("netlify-identity"))).toBe(false);
    expect(scripts.some((script) => /\bvercel\b/.test(script))).toBe(false);
  });
});
