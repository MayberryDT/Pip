import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runMajorCapabilityDogfood } from "./run-major-capability-dogfood.mjs";

describe("major capability dogfood orchestrator", () => {
  it("exposes major dogfood commands as package scripts", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["dogfood:major"]).toBe("node scripts/run-major-capability-dogfood.mjs");
    expect(packageJson.scripts["dogfood:major:api"]).toBe(
      "npm run eval:agent:major && npm run eval:agent -- --suite major-capabilities-expanded && npm run eval:agent -- --suite major-capabilities-multiturn",
    );
    expect(packageJson.scripts["dogfood:major:production-safe"]).toBe(
      "npm run eval:agent -- --suite major-capabilities-production-safe",
    );
  });

  it("fails when required browser evidence is missing", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-major-dogfood-"));

    try {
      const result = runMajorCapabilityDogfood({
        runDir: tempDir,
        requireBrowserEvidence: true,
        spawn: () => ({ status: 0 }),
        stdout: () => undefined,
        stderr: () => undefined,
      });
      const manifest = readManifest(tempDir);

      expect(result.status).toBe(1);
      expect(manifest.status).toBe("failed");
      expect(manifest.failures).toContain("missing browser evidence");
      expect(manifest.tiers.find((tier: { name: string }) => tier.name === "browser-iab")).toMatchObject({
        status: 1,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("writes a passed manifest when all default tiers pass", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-major-dogfood-"));
    const browserEvidencePath = writeBrowserEvidence(tempDir);
    const commands: string[] = [];

    try {
      const result = runMajorCapabilityDogfood({
        runDir: tempDir,
        browserEvidencePath,
        requireBrowserEvidence: true,
        spawn: (bin: string, args: string[]) => {
          commands.push([bin, ...args].join(" "));
          return { status: 0 };
        },
        stdout: () => undefined,
        stderr: () => undefined,
      });
      const manifest = readManifest(tempDir);

      expect(result.status).toBe(0);
      expect(manifest.status).toBe("passed");
      expect(manifest.tiers.map((tier: { name: string }) => tier.name)).toEqual([
        "api-primary",
        "api-expanded",
        "api-multiturn",
        "router-dogfood",
        "android-static",
        "browser-iab",
      ]);
      expect(commands).toContain("npm run eval:agent:major");
      expect(commands).toContain("npm run dogfood:router");
      expect(manifest.runDir).toBe(tempDir);
      expect(manifest.officialBrowserBackend).toBe("iab");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when a deterministic tier fails", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-major-dogfood-"));
    const browserEvidencePath = writeBrowserEvidence(tempDir);

    try {
      const result = runMajorCapabilityDogfood({
        runDir: tempDir,
        browserEvidencePath,
        requireBrowserEvidence: true,
        spawn: (bin: string, args: string[]) => ({
          status: [bin, ...args].join(" ").includes("major-capabilities-expanded") ? 1 : 0,
        }),
        stdout: () => undefined,
        stderr: () => undefined,
      });
      const manifest = readManifest(tempDir);

      expect(result.status).toBe(1);
      expect(manifest.status).toBe("failed");
      expect(manifest.failures).toContain("api-expanded failed");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not pass with failure records missing affected and final reruns", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-major-dogfood-"));
    const browserEvidencePath = writeBrowserEvidence(tempDir);

    try {
      const result = runMajorCapabilityDogfood({
        runDir: tempDir,
        browserEvidencePath,
        requireBrowserEvidence: true,
        failureRecords: [{ caseId: "major-forecast", rootCause: "trend wording missed forecast" }],
        spawn: () => ({ status: 0 }),
        stdout: () => undefined,
        stderr: () => undefined,
      });
      const manifest = readManifest(tempDir);

      expect(result.status).toBe(1);
      expect(manifest.status).toBe("failed");
      expect(manifest.failures).toContain("failure major-forecast missing affected rerun evidence");
      expect(manifest.failures).toContain("failure major-forecast missing final complete rerun evidence");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("adds production and live reviewer tiers only when requested", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-major-dogfood-"));
    const browserEvidencePath = writeBrowserEvidence(tempDir);

    try {
      const result = runMajorCapabilityDogfood({
        runDir: tempDir,
        browserEvidencePath,
        requireBrowserEvidence: true,
        includeProductionSafe: true,
        includeLiveReviewer: true,
        spawn: () => ({ status: 0 }),
        stdout: () => undefined,
        stderr: () => undefined,
      });
      const manifest = readManifest(tempDir);

      expect(result.status).toBe(0);
      expect(manifest.tiers.map((tier: { name: string }) => tier.name)).toContain("production-safe");
      expect(manifest.tiers.map((tier: { name: string }) => tier.name)).toContain("reviewer-account");
      expect(manifest.tiers.map((tier: { name: string }) => tier.name)).toContain("reporting-storage");
      expect(manifest.tiers.map((tier: { name: string }) => tier.name)).not.toContain("ui-playwright-regression");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function writeBrowserEvidence(dir: string) {
  const path = join(dir, "browser-evidence.json");

  writeFileSync(
    path,
    JSON.stringify({
      validatedBy: "codex_in_app_browser",
      backend: "iab",
      requiredCapabilities: ["guest_start"],
      viewports: [
        {
          name: "mobile",
          passed: true,
          consoleErrors: [],
          networkFailures: [],
          checkedCapabilities: ["guest_start"],
        },
        {
          name: "desktop",
          passed: true,
          consoleErrors: [],
          networkFailures: [],
          checkedCapabilities: ["guest_start"],
        },
      ],
    }),
  );

  return path;
}

function readManifest(dir: string) {
  return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
}
