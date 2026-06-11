import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("PRD completion check", () => {
  it("keeps the completion check available as a package script", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["check:prd-complete"]).toBe(
      "node scripts/check-prd-complete.mjs",
    );
  });

  it("fails when the final live proof report is missing", async () => {
    const checkPrdComplete = await loadCheckPrdComplete();
    const output = createOutputCapture();
    const result = checkPrdComplete({
      env: {
        PIP_LIVE_PROOF_REPORT: "/tmp/pip-missing-proof.json",
      },
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(result).toBe(1);
    expect(output.errors.join("\n")).toContain("Missing proof report");
    expect(output.errors.join("\n")).toContain("npm run test:e2e:live:final");
  });

  it("fails when the proof report does not prove the final Plaid production smoke", async () => {
    const checkPrdComplete = await loadCheckPrdComplete();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-prd-complete-"));
    const proofReport = join(tempDir, "proof.json");
    writeFileSync(
      proofReport,
      JSON.stringify({
        status: "passed",
        generatedAt: new Date().toISOString(),
        baseUrl: "http://localhost:3000",
        latestVerifiedDeployUrl:
          "https://olderdeploy--pip-mayberrydt.netlify.app",
        latestVerifiedDeployId: "olderdeploy",
        storageStatePath: "/tmp/state.json",
        plaidAutomationRequired: false,
        plaidAutomationEnabled: false,
        command: "npm run test:e2e:live",
      }),
    );

    try {
      const output = createOutputCapture();
      const result = checkPrdComplete({
        env: {
          PIP_LIVE_PROOF_REPORT: proofReport,
        },
        stdout: output.stdout,
        stderr: output.stderr,
      });

      expect(result).toBe(1);
      expect(output.errors.join("\n")).toContain("production");
      expect(output.errors.join("\n")).toContain("Plaid automation");
      expect(output.errors.join("\n")).toContain("test:e2e:live:final");
      expect(output.errors.join("\n")).toContain("latest verified deploy");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("passes with a valid final production smoke proof report", async () => {
    const checkPrdComplete = await loadCheckPrdComplete();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-prd-complete-"));
    const proofReport = join(tempDir, "proof.json");
    writeFileSync(
      proofReport,
      JSON.stringify({
        status: "passed",
        generatedAt: new Date().toISOString(),
        baseUrl: "https://pip-mayberrydt.netlify.app",
        latestVerifiedDeployUrl:
          "https://6a265f4336389d2a1930a78b--pip-mayberrydt.netlify.app",
        latestVerifiedDeployId: "6a265f4336389d2a1930a78b",
        storageStatePath: "/tmp/pip-live-auth.json",
        plaidAutomationRequired: true,
        plaidAutomationEnabled: true,
        command: "npm run test:e2e:live:final",
      }),
    );

    try {
      const output = createOutputCapture();
      const result = checkPrdComplete({
        env: {
          PIP_LIVE_PROOF_REPORT: proofReport,
        },
        stdout: output.stdout,
        stderr: output.stderr,
      });

      expect(result).toBe(0);
      expect(output.logs.join("\n")).toContain("PRD completion check passed.");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

async function loadCheckPrdComplete() {
  const module = await import(
    pathToFileURL(join(process.cwd(), "scripts/check-prd-complete.mjs")).href
  );

  return module.checkPrdComplete as (input: {
    env: Record<string, string | undefined>;
    stdout: (line: string) => void;
    stderr: (line: string) => void;
  }) => number;
}

function createOutputCapture() {
  const logs: string[] = [];
  const errors: string[] = [];

  return {
    logs,
    errors,
    stdout: (line: string) => logs.push(line),
    stderr: (line: string) => errors.push(line),
  };
}
