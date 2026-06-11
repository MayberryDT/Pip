import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("live authenticated smoke preflight", () => {
  it("fails when no storage-state file is configured", async () => {
    const runLiveSmokeEnvCheck = await loadRunLiveSmokeEnvCheck();
    const output = createOutputCapture();
    const result = runLiveSmokeEnvCheck({
      env: {},
      stdout: output.stdout,
      stderr: output.stderr,
      warn: output.warn,
    });

    expect(result).toBe(1);
    expect(output.errors.join("\n")).toContain("PIP_LIVE_STORAGE_STATE must point");
  });

  it("fails when the configured storage-state file does not exist", async () => {
    const runLiveSmokeEnvCheck = await loadRunLiveSmokeEnvCheck();
    const output = createOutputCapture();
    const result = runLiveSmokeEnvCheck({
      env: {
        PIP_LIVE_STORAGE_STATE: "/tmp/pip-missing-state.json",
      },
      stdout: output.stdout,
      stderr: output.stderr,
      warn: output.warn,
    });

    expect(result).toBe(1);
    expect(output.errors.join("\n")).toContain("does not exist");
  });

  it("rejects localhost base URLs unless explicitly allowed", async () => {
    const runLiveSmokeEnvCheck = await loadRunLiveSmokeEnvCheck();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-live-smoke-"));
    const storageState = join(tempDir, "state.json");
    writeStorageState(storageState);

    try {
      const output = createOutputCapture();
      const result = runLiveSmokeEnvCheck({
        env: {
          PIP_LIVE_STORAGE_STATE: storageState,
          PIP_LIVE_BASE_URL: "http://localhost:3000",
        },
        stdout: output.stdout,
        stderr: output.stderr,
        warn: output.warn,
      });

      expect(result).toBe(1);
      expect(output.errors.join("\n")).toContain("points to localhost");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when the configured storage-state file is empty", async () => {
    const runLiveSmokeEnvCheck = await loadRunLiveSmokeEnvCheck();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-live-smoke-"));
    const storageState = join(tempDir, "state.json");
    writeFileSync(storageState, JSON.stringify({ cookies: [], origins: [] }));

    try {
      const output = createOutputCapture();
      const result = runLiveSmokeEnvCheck({
        env: {
          PIP_LIVE_STORAGE_STATE: storageState,
        },
        stdout: output.stdout,
        stderr: output.stderr,
        warn: output.warn,
      });

      expect(result).toBe(1);
      expect(output.errors.join("\n")).toContain("looks empty");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when the configured storage-state file is not a Playwright state shape", async () => {
    const runLiveSmokeEnvCheck = await loadRunLiveSmokeEnvCheck();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-live-smoke-"));
    const storageState = join(tempDir, "state.json");
    writeFileSync(storageState, "{}");

    try {
      const output = createOutputCapture();
      const result = runLiveSmokeEnvCheck({
        env: {
          PIP_LIVE_STORAGE_STATE: storageState,
        },
        stdout: output.stdout,
        stderr: output.stderr,
        warn: output.warn,
      });

      expect(result).toBe(1);
      expect(output.errors.join("\n")).toContain("cookies");
      expect(output.errors.join("\n")).toContain("origins");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("passes for an existing storage-state file and production base URL", async () => {
    const runLiveSmokeEnvCheck = await loadRunLiveSmokeEnvCheck();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-live-smoke-"));
    const storageState = join(tempDir, "state.json");
    writeStorageState(storageState);

    try {
      const output = createOutputCapture();
      const result = runLiveSmokeEnvCheck({
        env: {
          PIP_LIVE_STORAGE_STATE: storageState,
          PIP_LIVE_COMPLETE_PLAID: "1",
        },
        stdout: output.stdout,
        stderr: output.stderr,
        warn: output.warn,
      });

      expect(result).toBe(0);
      expect(output.logs.join("\n")).toContain("Live authenticated smoke preflight passed.");
      expect(output.logs.join("\n")).toContain("Plaid automation: enabled");
      expect(output.warnings).toHaveLength(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

async function loadRunLiveSmokeEnvCheck() {
  const module = await import(pathToFileURL(join(process.cwd(), "scripts/check-live-smoke-env.mjs")).href);

  return module.runLiveSmokeEnvCheck as (input: {
    env: Record<string, string | undefined>;
    stdout: (line: string) => void;
    stderr: (line: string) => void;
    warn: (line: string) => void;
  }) => number;
}

function writeStorageState(path: string) {
  writeFileSync(
    path,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: "https://pip-mayberrydt.netlify.app",
          localStorage: [
            {
              name: "sb-qevvmulexfoebjmlxbts-auth-token",
              value: "test-session",
            },
          ],
        },
      ],
    }),
  );
}

function createOutputCapture() {
  const logs: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  return {
    logs,
    errors,
    warnings,
    stdout: (line: string) => logs.push(line),
    stderr: (line: string) => errors.push(line),
    warn: (line: string) => warnings.push(line),
  };
}
