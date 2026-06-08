import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("Netlify deployment secret boundary", () => {
  it("uses a safe deploy command instead of direct local-env Netlify deploys", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const safeDeployScript = readFileSync(
      join(process.cwd(), "scripts/safe-netlify-deploy.mjs"),
      "utf8",
    );
    const bundleCheckScript = readFileSync(
      join(process.cwd(), "scripts/check-netlify-bundle.mjs"),
      "utf8",
    );
    const netlifyIgnore = readFileSync(join(process.cwd(), ".netlifyignore"), "utf8");

    expect(packageJson.scripts["deploy:netlify"]).toBe("node scripts/safe-netlify-deploy.mjs");
    expect(packageJson.scripts["check:netlify-bundle"]).toBe("node scripts/check-netlify-bundle.mjs");
    expect(safeDeployScript).toContain("hideLocalEnvFiles");
    expect(safeDeployScript).toContain("restoreLocalEnvFiles");
    expect(safeDeployScript).toContain("--skip-functions-cache");
    expect(safeDeployScript).toContain("FREE_CASH_DEPLOY_MODE");
    expect(safeDeployScript).toContain("scripts/check-netlify-bundle.mjs");
    expect(bundleCheckScript).toContain("unzip");
    expect(bundleCheckScript).toContain("Netlify function artifacts include forbidden env files");
    expect(netlifyIgnore).toContain(".env");
    expect(netlifyIgnore).toContain(".env.*");
  });

  it("ignores generated live browser auth state files", () => {
    const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");

    expect(gitignore).toContain("spendable-live-auth*.json");
    expect(gitignore).toContain("*.storage-state.json");
  });

  it("keeps generated local Netlify function artifacts free of env files when artifacts exist", () => {
    if (!existsSync(join(process.cwd(), ".netlify/functions"))) {
      return;
    }

    return import(pathToFileURL(join(process.cwd(), "scripts/check-netlify-bundle.mjs")).href).then(
      (module) => {
        const runNetlifyBundleCheck = module.runNetlifyBundleCheck as (input: {
          cwd: string;
          stdout: (line: string) => void;
          stderr: (line: string) => void;
        }) => number;

        expect(
          runNetlifyBundleCheck({
            cwd: process.cwd(),
            stdout: () => undefined,
            stderr: () => undefined,
          }),
        ).toBe(0);
      },
    );
  });
});
