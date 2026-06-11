import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("live authenticated smoke runner", () => {
  it("keeps the final PRD proof command guarded in package scripts and README", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

    expect(packageJson.scripts["test:e2e:live:final"]).toBe(
      "node scripts/run-live-smoke.mjs --require-plaid --complete-plaid",
    );
    expect(readme).toContain("npm run test:e2e:live:final");
    expect(readme).toContain("Requires PIP_LIVE_STORAGE_STATE");
  });

  it("requires Plaid automation when final PRD proof is requested", async () => {
    const runLiveSmoke = await loadRunLiveSmoke();
    const output = createOutputCapture();
    const result = runLiveSmoke({
      argv: ["--require-plaid"],
      env: {},
      stdout: output.stdout,
      stderr: output.stderr,
      warn: output.warn,
      spawn: createSpawnCapture().spawn,
    });

    expect(result).toBe(1);
    expect(output.errors.join("\n")).toContain("requires Plaid automation");
  });

  it("runs the live e2e command after preflight passes", async () => {
    const runLiveSmoke = await loadRunLiveSmoke();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-live-runner-"));
    const storageState = join(tempDir, "state.json");
    const proofReport = join(tempDir, "proof.json");
    writeStorageState(storageState);

    try {
      const output = createOutputCapture();
      const spawnCapture = createSpawnCapture();
      const result = runLiveSmoke({
        argv: ["--require-plaid", "--complete-plaid"],
        env: {
          PIP_LIVE_STORAGE_STATE: storageState,
          PIP_LIVE_PROOF_REPORT: proofReport,
        },
        stdout: output.stdout,
        stderr: output.stderr,
        warn: output.warn,
        spawn: spawnCapture.spawn,
      });

      expect(result).toBe(0);
      expect(output.logs.join("\n")).toContain("Live authenticated smoke preflight passed.");
      expect(spawnCapture.calls).toEqual([
        {
          command: "npm",
          args: ["run", "test:e2e:live"],
          env: expect.objectContaining({
            PIP_LIVE_STORAGE_STATE: storageState,
            PIP_LIVE_COMPLETE_PLAID: "1",
            PIP_LIVE_PROOF_REPORT: proofReport,
          }),
          stdio: "inherit",
        },
      ]);
      expect(output.logs.join("\n")).toContain("proof report written");
      expect(JSON.parse(readFileSync(proofReport, "utf8"))).toMatchObject({
        status: "passed",
        baseUrl: "https://pip-mayberrydt.netlify.app",
        latestVerifiedDeployUrl:
          "https://6a265f4336389d2a1930a78b--pip-mayberrydt.netlify.app",
        latestVerifiedDeployId: "6a265f4336389d2a1930a78b",
        storageStatePath: storageState,
        plaidAutomationRequired: true,
        plaidAutomationEnabled: true,
        command: "npm run test:e2e:live:final",
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write a proof report when the live e2e command fails", async () => {
    const runLiveSmoke = await loadRunLiveSmoke();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-live-runner-"));
    const storageState = join(tempDir, "state.json");
    const proofReport = join(tempDir, "proof.json");
    writeStorageState(storageState);

    try {
      const result = runLiveSmoke({
        argv: ["--require-plaid", "--complete-plaid"],
        env: {
          PIP_LIVE_STORAGE_STATE: storageState,
          PIP_LIVE_PROOF_REPORT: proofReport,
        },
        stdout: () => undefined,
        stderr: () => undefined,
        warn: () => undefined,
        spawn: createSpawnCapture(1).spawn,
      });

      expect(result).toBe(1);
      expect(existsSync(proofReport)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

async function loadRunLiveSmoke() {
  const module = await import(pathToFileURL(join(process.cwd(), "scripts/run-live-smoke.mjs")).href);

  return module.runLiveSmoke as (input: {
    argv: string[];
    env: Record<string, string | undefined>;
    stdout: (line: string) => void;
    stderr: (line: string) => void;
    warn: (line: string) => void;
    spawn: (command: string, args: string[], options: { env: Record<string, string | undefined>; stdio: string }) => {
      status: number | null;
    };
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

function createSpawnCapture(status = 0) {
  const calls: Array<{
    command: string;
    args: string[];
    env: Record<string, string | undefined>;
    stdio: string;
  }> = [];

  return {
    calls,
    spawn(command: string, args: string[], options: { env: Record<string, string | undefined>; stdio: string }) {
      calls.push({
        command,
        args,
        env: options.env,
        stdio: options.stdio,
      });

      return {
        status,
      };
    },
  };
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
