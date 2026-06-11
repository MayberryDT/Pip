import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/analyze-agent-conversations.mjs");

describe("Pip conversation analysis", () => {
  it("keeps the analysis command available as a package script", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["analyze:agent-conversations"]).toBe(
      "node scripts/analyze-agent-conversations.mjs",
    );
  });

  it("counts repeated assistant messages, repeated chips, and adjacent tool loops", async () => {
    const { analyzeAgentConversationTurns } = await loadAnalysisHarness();
    const repeatedChips = [
      {
        id: "ai-recent-charges",
        label: "Recent charges",
        prompt: "Show my recent charges",
      },
    ];
    const report = analyzeAgentConversationTurns({
      turns: [
        {
          id: "turn-1",
          conversationId: "conv-1",
          assistantMessage: "I found these recent items.",
          usedTools: ["get_recent_transactions"],
          promptChips: repeatedChips,
          createdAt: "2026-06-09T10:00:00.000Z",
        },
        {
          id: "turn-2",
          conversationId: "conv-1",
          assistantMessage: "I found these recent items.",
          usedTools: ["get_recent_transactions"],
          promptChips: repeatedChips,
          createdAt: "2026-06-09T10:01:00.000Z",
        },
      ],
    });

    expect(report.status).toBe("needs-review");
    expect(report.repeatedAssistantMessageCount).toBe(1);
    expect(report.repeatedChipSetCount).toBe(1);
    expect(report.adjacentSameToolCount).toBe(1);
    expect(report.conversations[0].findings.map((finding: { type: string }) => finding.type)).toEqual([
      "repeated-assistant-message",
      "repeated-chip-set",
      "adjacent-same-tool",
    ]);
  });

  it("loads JSONL turns and writes a report", async () => {
    const { runAgentConversationAnalysis } = await loadAnalysisHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-analysis-"));
    const logPath = join(tempDir, "turns.jsonl");
    const reportPath = join(tempDir, "report.json");

    try {
      writeFileSync(
        logPath,
        `${JSON.stringify({
          id: "turn-1",
          conversationId: "conv-1",
          assistantMessage: "I can help with Spendable Cash Today.",
          usedTools: [],
          promptChips: [],
          createdAt: "2026-06-09T10:00:00.000Z",
        })}\n`,
      );

      const report = runAgentConversationAnalysis({
        logPath,
        reportPath,
        log: () => undefined,
      });

      expect(report.status).toBe("clean");
      expect(JSON.parse(readFileSync(reportPath, "utf8"))).toMatchObject({
        status: "clean",
        conversationCount: 1,
        turnCount: 1,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

async function loadAnalysisHarness() {
  return import(`${pathToFileURL(scriptPath).href}?t=${Date.now()}`) as Promise<{
    analyzeAgentConversationTurns: (input: { turns: unknown[] }) => {
      status: string;
      repeatedAssistantMessageCount: number;
      repeatedChipSetCount: number;
      adjacentSameToolCount: number;
      conversations: Array<{
        findings: Array<{
          type: string;
        }>;
      }>;
    };
    runAgentConversationAnalysis: (input: {
      logPath: string;
      reportPath: string;
      log: () => void;
    }) => {
      status: string;
    };
  }>;
}
