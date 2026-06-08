import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("PRD final proof orchestrator", () => {
  it("keeps the one-command final proof available as a package script", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["prove:prd"]).toBe("node scripts/prove-prd-complete.mjs");
  });

  it("runs capture, preflight, final smoke, and completion check in order", async () => {
    const provePrdComplete = await loadProvePrdComplete();
    const spawnCapture = createSpawnCapture();
    const result = provePrdComplete({
      argv: [],
      env: {},
      stdout: () => undefined,
      spawn: spawnCapture.spawn,
    });

    expect(result).toBe(0);
    expect(spawnCapture.calls.map((call) => call.args.join(" "))).toEqual([
      "run capture:live-auth",
      "run check:live-smoke",
      "run test:e2e:live:final",
      "run check:prd-complete",
    ]);
    expect(spawnCapture.calls[0].env).toEqual(
      expect.objectContaining({
        SPENDABLE_LIVE_STORAGE_STATE: "/tmp/spendable-live-auth.json",
        SPENDABLE_LIVE_PROOF_REPORT: "/tmp/spendable-live-proof.json",
        SPENDABLE_LIVE_COMPLETE_PLAID: "1",
      }),
    );
  });

  it("can skip capture when the auth state already exists", async () => {
    const provePrdComplete = await loadProvePrdComplete();
    const spawnCapture = createSpawnCapture();
    const result = provePrdComplete({
      argv: ["--skip-capture"],
      env: {
        SPENDABLE_LIVE_STORAGE_STATE: "/tmp/existing-state.json",
      },
      stdout: () => undefined,
      spawn: spawnCapture.spawn,
    });

    expect(result).toBe(0);
    expect(spawnCapture.calls.map((call) => call.args.join(" "))).toEqual([
      "run check:live-smoke",
      "run test:e2e:live:final",
      "run check:prd-complete",
    ]);
    expect(spawnCapture.calls[0].env).toEqual(
      expect.objectContaining({
        SPENDABLE_LIVE_STORAGE_STATE: "/tmp/existing-state.json",
      }),
    );
  });

  it("stops at the first failing step", async () => {
    const provePrdComplete = await loadProvePrdComplete();
    const spawnCapture = createSpawnCapture(1);
    const result = provePrdComplete({
      argv: [],
      env: {},
      stdout: () => undefined,
      spawn: spawnCapture.spawn,
    });

    expect(result).toBe(1);
    expect(spawnCapture.calls).toHaveLength(1);
    expect(spawnCapture.calls[0].args.join(" ")).toBe("run capture:live-auth");
  });
});

async function loadProvePrdComplete() {
  const module = await import(
    pathToFileURL(join(process.cwd(), "scripts/prove-prd-complete.mjs")).href
  );

  return module.provePrdComplete as (input: {
    argv: string[];
    env: Record<string, string | undefined>;
    stdout: (line: string) => void;
    spawn: (command: string, args: string[], options: { env: Record<string, string | undefined>; stdio: string }) => {
      status: number | null;
    };
  }) => number;
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
