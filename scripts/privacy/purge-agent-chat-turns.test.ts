import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("privacy:purge-agent-chats script", () => {
  it("is wired in package.json", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["privacy:purge-agent-chats"]).toBe(
      "node scripts/privacy/purge-agent-chat-turns.mjs",
    );
  });

  it("calls the purge RPC with the configured retention window", async () => {
    const { runPurgeAgentChatTurns } = await import("./purge-agent-chat-turns.mjs");
    const rpc = vi.fn().mockResolvedValue({ data: 12, error: null });

    const exitCode = await runPurgeAgentChatTurns({
      env: {
        PIP_AGENT_CHAT_RETENTION_DAYS: "45",
      },
      createAdminClient: () => ({ rpc }),
      stdout: vi.fn(),
      stderr: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(rpc).toHaveBeenCalledWith("purge_agent_chat_turns", {
      p_retention_days: 45,
    });
  });

  it("rejects invalid retention windows", async () => {
    const { runPurgeAgentChatTurns } = await import("./purge-agent-chat-turns.mjs");
    const rpc = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runPurgeAgentChatTurns({
      env: {
        PIP_AGENT_CHAT_RETENTION_DAYS: "0",
      },
      createAdminClient: () => ({ rpc }),
      stdout: vi.fn(),
      stderr,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith("PIP_AGENT_CHAT_RETENTION_DAYS must be between 1 and 3650.");
    expect(rpc).not.toHaveBeenCalled();
  });
});
