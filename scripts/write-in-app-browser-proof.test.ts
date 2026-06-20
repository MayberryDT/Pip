import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = join(process.cwd(), "scripts/write-in-app-browser-proof.mjs");

describe("write in-app Browser proof", () => {
  it("rejects evidence that was not captured through the iab backend", async () => {
    const { writeInAppBrowserProof } = await loadProofWriter();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-iab-proof-"));
    const evidencePath = join(tempDir, "evidence.json");
    const proofPath = join(tempDir, "proof.json");
    const errors: string[] = [];

    writeFileSync(
      evidencePath,
      JSON.stringify({
        validatedBy: "codex_in_app_browser",
        backend: "standalone_playwright",
      }),
    );

    try {
      const result = writeInAppBrowserProof({
        argv: ["--evidence", evidencePath, "--proof-report", proofPath],
        stdout: () => undefined,
        stderr: (message: string) => errors.push(message),
      });

      expect(result).toBe(1);
      expect(errors.join("\n")).toContain("backend must be iab");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("writes proof for valid iab evidence", async () => {
    const { writeInAppBrowserProof } = await loadProofWriter();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-iab-proof-"));
    const evidencePath = join(tempDir, "evidence.json");
    const proofPath = join(tempDir, "proof.json");

    writeFileSync(
      evidencePath,
      JSON.stringify({
        validatedBy: "codex_in_app_browser",
        backend: "iab",
        authenticatedSyncStatus: { ok: true },
      }),
    );

    try {
      const result = writeInAppBrowserProof({
        argv: ["--evidence", evidencePath, "--proof-report", proofPath],
        stdout: () => undefined,
      });
      const proof = JSON.parse(readFileSync(proofPath, "utf8"));

      expect(result).toBe(0);
      expect(proof).toMatchObject({
        status: "passed",
        proofMethod: "in_app_browser",
        validatedBy: "codex_in_app_browser",
        evidence: {
          backend: "iab",
        },
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

async function loadProofWriter() {
  const module = await import(pathToFileURL(scriptPath).href);

  return module as {
    writeInAppBrowserProof: (input: {
      argv?: string[];
      stdout?: (message: string) => void;
      stderr?: (message: string) => void;
    }) => number;
  };
}
