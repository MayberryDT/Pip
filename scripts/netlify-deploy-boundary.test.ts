import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
    expect(safeDeployScript).toContain("copyNextStaticIntoServerFunction");
    expect(safeDeployScript).toContain("--no-build");
    expect(safeDeployScript).toContain(".netlify/static");
    expect(getFunctionBody(safeDeployScript, "cleanGeneratedNetlifyArtifacts")).toContain(
      '".netlify/static"',
    );
    expect(getFunctionBody(safeDeployScript, "cleanGeneratedNetlifyArtifacts")).toContain(
      '".netlify/deploy"',
    );
    expect(safeDeployScript).toContain("PIP_DEPLOY_MODE");
    expect(safeDeployScript).toContain("scripts/check-netlify-bundle.mjs");
    expect(bundleCheckScript).toContain("unzip");
    expect(bundleCheckScript).toContain("Netlify function artifacts include forbidden env files");
    expect(bundleCheckScript).toContain("Netlify Next server handler is missing required static assets");
    expect(netlifyIgnore).toContain(".env");
    expect(netlifyIgnore).toContain(".env.*");
  });

  it("ignores generated live browser auth state files", () => {
    const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");

    expect(gitignore).toContain("pip-live-auth*.json");
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

  it("fails when the generated Next server handler omits .next/static assets", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pip-netlify-bundle-"));
    mkdirSync(join(cwd, ".next/static/chunks"), { recursive: true });
    mkdirSync(join(cwd, ".netlify/functions-internal/___netlify-server-handler/.next"), {
      recursive: true,
    });
    writeFileSync(join(cwd, ".next/static/chunks/app.js"), "console.log('ok');");

    try {
      const runNetlifyBundleCheck = await loadNetlifyBundleCheck();
      const errors: string[] = [];

      expect(
        runNetlifyBundleCheck({
          cwd,
          stdout: () => undefined,
          stderr: (line) => errors.push(line),
        }),
      ).toBe(1);
      expect(errors.join("\n")).toContain("missing required static assets");
      expect(errors.join("\n")).toContain(".next/static");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

async function loadNetlifyBundleCheck() {
  const module = await import(pathToFileURL(join(process.cwd(), "scripts/check-netlify-bundle.mjs")).href);

  return module.runNetlifyBundleCheck as (input: {
    cwd: string;
    stdout: (line: string) => void;
    stderr: (line: string) => void;
  }) => number;
}

function getFunctionBody(source: string, functionName: string) {
  const functionStart = source.indexOf(`function ${functionName}()`);
  expect(functionStart).toBeGreaterThanOrEqual(0);

  const nextFunction = source.indexOf("\nfunction ", functionStart + 1);
  return source.slice(functionStart, nextFunction >= 0 ? nextFunction : undefined);
}
