import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("live auth state capture helper", () => {
  it("keeps a package script for capturing Google storage state", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["capture:live-auth"]).toBe(
      "node scripts/capture-live-auth-state.mjs",
    );
  });

  it("starts Playwright codegen with production URL and default storage path", async () => {
    const captureLiveAuthState = await loadCaptureLiveAuthState();
    const output = createOutputCapture();
    const spawnCapture = createSpawnCapture();
    const result = captureLiveAuthState({
      argv: [],
      env: {},
      stdout: output.stdout,
      stderr: output.stderr,
      spawn: spawnCapture.spawn,
    });

    expect(result).toBe(0);
    expect(output.logs.join("\n")).toContain("Opening Playwright codegen");
    expect(spawnCapture.calls).toEqual([
      {
        command: "npx",
        args: [
          "playwright",
          "codegen",
          "--channel",
          "chrome",
          "https://pip-mayberrydt.netlify.app",
          "--save-storage=/tmp/pip-live-auth.json",
        ],
        env: {},
        stdio: "inherit",
      },
    ]);
  });

  it("allows explicit base URL and storage-state path", async () => {
    const captureLiveAuthState = await loadCaptureLiveAuthState();
    const spawnCapture = createSpawnCapture();
    const result = captureLiveAuthState({
      argv: [
        "--base-url=https://deploy.example",
        "--storage-state",
        "/tmp/custom-auth.json",
      ],
      env: {},
      stdout: () => undefined,
      stderr: () => undefined,
      spawn: spawnCapture.spawn,
    });

    expect(result).toBe(0);
    expect(spawnCapture.calls[0].args).toEqual([
      "playwright",
      "codegen",
      "--channel",
      "chrome",
      "https://deploy.example",
      "--save-storage=/tmp/custom-auth.json",
    ]);
  });

  it("refuses localhost capture unless explicitly allowed", async () => {
    const captureLiveAuthState = await loadCaptureLiveAuthState();
    const output = createOutputCapture();
    const spawnCapture = createSpawnCapture();
    const result = captureLiveAuthState({
      argv: [],
      env: {
        PIP_LIVE_BASE_URL: "http://localhost:3000",
      },
      stdout: output.stdout,
      stderr: output.stderr,
      spawn: spawnCapture.spawn,
    });

    expect(result).toBe(1);
    expect(spawnCapture.calls).toEqual([]);
    expect(output.errors.join("\n")).toContain("Refusing to capture");
  });
});

async function loadCaptureLiveAuthState() {
  const module = await import(
    pathToFileURL(join(process.cwd(), "scripts/capture-live-auth-state.mjs")).href
  );

  return module.captureLiveAuthState as (input: {
    argv: string[];
    env: Record<string, string | undefined>;
    stdout: (line: string) => void;
    stderr: (line: string) => void;
    spawn: (command: string, args: string[], options: { env: Record<string, string | undefined>; stdio: string }) => {
      status: number | null;
    };
  }) => number;
}

function createSpawnCapture() {
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
        status: 0,
      };
    },
  };
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
