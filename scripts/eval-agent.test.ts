import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/eval-agent.mjs");

describe("Pip agent eval harness", () => {
  it("keeps the eval command available as a package script", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["eval:agent"]).toBe("node scripts/eval-agent.mjs");
  });

  it("passes a tool-backed forecast answer with the short forecast caveat", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {
        expectedTools: ["forecast_spendable_cash"],
        expectedCards: ["spendable_cash_forecast"],
      },
      response: {
        message: "Here is the 14-day forecast. Forecast only; not guaranteed.",
        responseMode: "show_card",
        usedTools: ["forecast_spendable_cash"],
        cards: [{ type: "spendable_cash_forecast" }],
        promptChips: [{ id: "show-breakdown", label: "Show breakdown", prompt: "Show my spending breakdown" }],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails banned language and money shorthand", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {},
      response: {
        message: "Your Free Cash dashboard says you can afford $0.21k.",
        responseMode: "chat_only",
        usedTools: [],
        cards: [],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("Free Cash");
    expect(result.failures.join("\n")).toContain("dashboard");
    expect(result.failures.join("\n")).toContain("you can afford");
    expect(result.failures.join("\n")).toContain("money shorthand");
  });

  it("fails third-person Pip self-reference in visible replies", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {},
      response: {
        message: "Pip turns your account data into Spendable Cash Today.",
        responseMode: "chat_only",
        usedTools: [],
        cards: [],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("third-person Pip self-reference");
  });

  it("fails detached metric openings that do not sound like Pip speaking", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {},
      response: {
        message: "Spendable Cash Today is $43.",
        responseMode: "chat_only",
        usedTools: [],
        cards: [],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("detached metric opening");
  });

  it("fails card replies that end with a follow-up question", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {},
      response: {
        message: "I found the main drivers. Want to see the math?",
        responseMode: "show_card",
        usedTools: ["get_free_cash_drivers"],
        cards: [{ type: "free_cash_explanation" }],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("follow-up question");
  });

  it("fails a fake show promise when no matching card is returned", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {},
      response: {
        message: "Here is your 7 day trend view.",
        responseMode: "chat_only",
        usedTools: [],
        cards: [],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("forecast detail");
    expect(result.failures.join("\n")).toContain("returned no cards");
  });

  it("fails required tool and card mismatches", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {
        expectedTools: ["get_spending_breakdown"],
        expectedCards: ["spending_breakdown"],
      },
      response: {
        message: "We can talk through that.",
        responseMode: "chat_only",
        usedTools: [],
        cards: [],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("expected tool not used: get_spending_breakdown");
    expect(result.failures).toContain("expected card not returned: spending_breakdown");
  });

  it("runs cases through fetch and writes a JSON report", async () => {
    const { runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "spendable-agent-eval-"));
    const reportPath = join(tempDir, "report.json");
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

    try {
      const report = await runAgentEval({
        baseUrl: "http://localhost:3999",
        reportPath,
        cases: [
          {
            id: "greeting",
            description: "test case",
            message: "hi",
            expectNoCards: true,
            expectedResponseMode: "chat_only",
          },
        ],
        conversationPrefix: "test-eval",
        log: () => undefined,
        fetchImpl: async (url: string, options: { body?: string }) => {
          requests.push({
            url,
            body: JSON.parse(options.body ?? "{}") as Record<string, unknown>,
          });

          return {
            status: 200,
            ok: true,
            json: async () => ({
              message: "Hi. I can help with Spendable Cash.",
              responseMode: "chat_only",
              usedTools: [],
              cards: [],
              promptChips: [],
            }),
          };
        },
      });

      expect(report.status).toBe("passed");
      expect(report.failureCount).toBe(0);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        url: "http://localhost:3999/api/agent",
        body: {
          message: "hi",
          scenario: "default",
          conversationId: "test-eval-greeting",
          conversationState: {
            shownCards: [],
            lastToolNames: [],
          },
        },
      });

      expect(JSON.parse(readFileSync(reportPath, "utf8"))).toMatchObject({
        status: "passed",
        baseUrl: "http://localhost:3999",
        caseCount: 1,
        failureCount: 0,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("marks the report failed when the rubric fails", async () => {
    const { runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "spendable-agent-eval-"));
    const reportPath = join(tempDir, "report.json");

    try {
      const report = await runAgentEval({
        baseUrl: "http://localhost:3999",
        reportPath,
        cases: [
          {
            id: "forecast",
            description: "test case",
            message: "Show forecast",
            expectedTools: ["forecast_spendable_cash"],
            expectedCards: ["spendable_cash_forecast"],
          },
        ],
        conversationPrefix: "test-eval",
        log: () => undefined,
        fetchImpl: async () => ({
          status: 200,
          ok: true,
          json: async () => ({
            message: "Here is your forecast.",
            responseMode: "chat_only",
            usedTools: [],
            cards: [],
            promptChips: [],
          }),
        }),
      });

      expect(report.status).toBe("failed");
      expect(report.failureCount).toBe(1);
      expect(report.cases[0].failures.join("\n")).toContain("expected tool not used");
      expect(report.cases[0].failures.join("\n")).toContain("expected card not returned");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("can run a selected subset of eval case ids", async () => {
    const { runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "spendable-agent-eval-"));
    const reportPath = join(tempDir, "report.json");
    const messages: string[] = [];

    try {
      const report = await runAgentEval({
        baseUrl: "http://localhost:3999",
        reportPath,
        caseIds: "greeting,how-it-works",
        cases: [
          {
            id: "greeting",
            description: "test case",
            message: "hi",
            expectNoCards: true,
            expectedResponseMode: "chat_only",
          },
          {
            id: "how-it-works",
            description: "test case",
            message: "Tell me how Pip works",
            expectNoCards: true,
          },
        ],
        conversationPrefix: "test-eval",
        log: () => undefined,
        fetchImpl: async (_url: string, options: { body?: string }) => {
          const body = JSON.parse(options.body ?? "{}") as { message: string };
          messages.push(body.message);

          return {
            status: 200,
            ok: true,
            json: async () => ({
              message: "I can help with Spendable Cash.",
              responseMode: "chat_only",
              usedTools: [],
              cards: [],
              promptChips: [],
            }),
          };
        },
      });

      expect(report.status).toBe("passed");
      expect(messages).toEqual(["hi", "Tell me how Pip works"]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

async function loadEvalHarness() {
  const module = await import(pathToFileURL(scriptPath).href);

  return module as {
    evaluateAgentResponse: (input: {
      caseDef: Record<string, unknown>;
      response: Record<string, unknown>;
      httpStatus?: number;
      httpOk?: boolean;
      error?: string | null;
    }) => {
      ok: boolean;
      failures: string[];
      message: string;
      responseMode: string;
      usedTools: string[];
      cardTypes: string[];
    };
    runAgentEval: (input: Record<string, unknown>) => Promise<{
      status: "passed" | "failed";
      failureCount: number;
      cases: Array<{ failures: string[] }>;
    }>;
  };
}
