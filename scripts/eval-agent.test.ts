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
    expect(packageJson.scripts["eval:agent:major"]).toBe("node scripts/eval-agent.mjs --suite major-capabilities");
  });

  it("keeps the router dogfood commands available as package scripts", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["dogfood:router"]).toBe("vitest run src/lib/agent/intent-router-dogfood.test.ts");
    expect(packageJson.scripts["dogfood:router:live"]).toBe("vite-node scripts/dogfood-agent-router.mjs");
  });

  it("includes phone dogfood savings and account transcript cases", async () => {
    const { agentEvalCases } = await loadEvalHarness();
    const casesById = new Map(agentEvalCases.map((caseDef) => [caseDef.id, caseDef]));

    expect(casesById.get("phone-save-trip-bali")).toMatchObject({
      message: "Now I want to save for a trip to Bali.",
      expectedResponseMode: "clarify",
      expectedPendingActionType: "create_savings_goal",
      forbiddenTextPatterns: expect.arrayContaining(["I'm not sure", "\\bcushion\\b"]),
    });
    expect(casesById.get("phone-save-big-purchase")).toMatchObject({
      message: "I want to save money for a big purchase",
      expectedResponseMode: "clarify",
      expectedPendingActionType: "create_savings_goal",
      forbiddenTools: expect.arrayContaining(["get_pip_cash_snapshot"]),
    });
    expect(casesById.get("phone-why-monthly-savings")).toMatchObject({
      message: "Why does Pip need a savings cushion?",
      expectedTextPatterns: expect.arrayContaining(["monthly savings"]),
      forbiddenTextPatterns: expect.arrayContaining(["\\bcushion\\b"]),
    });
    expect(casesById.get("phone-show-bank-accounts")).toMatchObject({
      message: "Show my bank accounts",
      expectedTools: expect.arrayContaining(["get_connected_accounts"]),
      expectedCards: expect.arrayContaining(["account_connections"]),
      forbiddenTextPatterns: expect.arrayContaining(["\\bBank A\\b", "\\bBank B\\b"]),
    });
  });

  it("includes the verified Japan savings context transcript eval case", async () => {
    const { agentEvalCases } = await loadEvalHarness();
    const casesById = new Map(agentEvalCases.map((caseDef) => [caseDef.id, caseDef]));

    expect(casesById.get("phone-savings-japan-context")).toMatchObject({
      id: "phone-savings-japan-context",
      turns: [
        {
          message: "I need to save for a trip to Japan",
          expectedPendingActionType: "create_savings_goal",
          forbiddenTools: expect.arrayContaining(["get_recurring_activity"]),
        },
        {
          message: "Yes",
          expectedPendingActionType: "create_savings_goal",
          forbiddenTools: expect.arrayContaining(["get_recurring_activity"]),
        },
        {
          message: "Set the savings goal",
          expectedPendingActionType: "create_savings_goal",
          forbiddenTools: expect.arrayContaining(["get_recurring_activity"]),
        },
        {
          message: "$3000 by December 1st",
          expectedTools: expect.arrayContaining(["create_savings_goal"]),
          expectedCards: expect.arrayContaining(["savings_goal_plan"]),
          forbiddenTools: expect.arrayContaining(["get_recurring_activity"]),
        },
        {
          message: "How much do I need to hit that goal?",
          expectedTools: expect.arrayContaining(["list_savings_goals"]),
          expectedCards: expect.arrayContaining(["savings_goals_summary"]),
          expectedTextPatterns: expect.arrayContaining(["Japan"]),
        },
      ],
    });
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
        message: `Your ${"Free" + " Cash"} dashboard says you can afford $0.21k.`,
        responseMode: "chat_only",
        usedTools: [],
        cards: [],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("legacy cash wording");
    expect(result.failures.join("\n")).toContain("dashboard");
    expect(result.failures.join("\n")).toContain("you can afford");
    expect(result.failures.join("\n")).toContain("money shorthand");
  });

  it("routing-only cases skip visible-copy checks but still enforce tools and cards", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {
        routingOnly: true,
        expectedTools: ["get_true_balances"],
        expectedCards: ["true_balances"],
      },
      response: {
        message: `Your ${"Free" + " Cash"} dashboard says you can afford $0.21k.`,
        responseMode: "show_card",
        usedTools: ["get_true_balances"],
        cards: [{ type: "true_balances" }],
        promptChips: [],
      },
    });
    const anyCard = evaluateAgentResponse({
      caseDef: {
        routingOnly: true,
        expectedAnyCards: ["missing_card_nudge", "connect_account"],
      },
      response: {
        message: "I found a data-quality issue.",
        responseMode: "show_card",
        usedTools: ["get_data_quality"],
        cards: [{ type: "missing_card_nudge" }],
        promptChips: [],
      },
    });
    const wrongTool = evaluateAgentResponse({
      caseDef: {
        routingOnly: true,
        expectedTools: ["get_true_balances"],
        expectedCards: ["true_balances"],
      },
      response: {
        message: `Your ${"Free" + " Cash"} dashboard says you can afford $0.21k.`,
        responseMode: "show_card",
        usedTools: ["get_connected_accounts"],
        cards: [{ type: "account_connections" }],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(anyCard.ok).toBe(true);
    expect(anyCard.failures).toEqual([]);
    expect(wrongTool.ok).toBe(false);
    expect(wrongTool.failures.join("\n")).toContain("expected tool not used: get_true_balances");
    expect(wrongTool.failures.join("\n")).toContain("expected card not returned: true_balances");
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
        usedTools: ["get_pip_cash_drivers"],
        cards: [{ type: "pip_cash_explanation" }],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("follow-up question");
  });

  it("fails savings-goal creation claims unless create_savings_goal returned a goal card", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {},
      response: {
        message: "I set up your Japan savings goal.",
        responseMode: "chat_only",
        usedTools: [],
        cards: [],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("claims a savings goal was created without create_savings_goal");
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

  it("passes expected pending action and per-case forbidden text checks", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {
        expectedPendingActionType: "create_savings_goal",
        forbiddenTextPatterns: ["I'm not sure", "hidden cushion"],
      },
      response: {
        message: "What should we call this goal?",
        responseMode: "clarify",
        usedTools: [],
        cards: [],
        promptChips: [],
        conversationState: {
          pendingAction: {
            type: "create_savings_goal",
            name: "Trip",
          },
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails missing pending action and per-case forbidden text", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {
        expectedPendingActionType: "create_savings_goal",
        forbiddenTextPatterns: ["I'm not sure", "hidden cushion"],
      },
      response: {
        message: "I'm not sure. I can use your hidden cushion.",
        responseMode: "clarify",
        usedTools: [],
        cards: [],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("expected pending action type create_savings_goal but got none.");
    expect(result.failures.join("\n")).toContain("forbidden response text pattern found: I'm not sure");
    expect(result.failures.join("\n")).toContain("forbidden response text pattern found: hidden cushion");
  });

  it("fails repeated assistant messages, repeated chip sets, and adjacent tool loops", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const repeatedChips = [
      {
        id: "ai-recent-charges",
        label: "Recent charges",
        prompt: "Show my recent charges",
      },
    ];
    const result = evaluateAgentResponse({
      caseDef: {
        previousAssistantMessage: "I found these recent items.",
        previousPromptChips: repeatedChips,
        recentToolNames: ["get_recent_transactions"],
        forbiddenAdjacentSameTools: ["get_recent_transactions"],
        expectNoRepeatedAssistantMessage: true,
        expectNoRepeatedChipSet: true,
      },
      response: {
        message: "I found these recent items.",
        responseMode: "show_card",
        usedTools: ["get_recent_transactions"],
        cards: [{ type: "recent_transactions" }],
        promptChips: repeatedChips,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("assistant message repeats");
    expect(result.failures.join("\n")).toContain("prompt chips repeat");
    expect(result.failures.join("\n")).toContain("adjacent same-tool loop");
  });

  it("runs cases through fetch and writes a JSON report", async () => {
    const { runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-eval-"));
    const reportPath = join(tempDir, "report.json");
    const requests: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];

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
            conversationState: {
              pendingAction: {
                type: "create_savings_goal",
                name: "Trip",
              },
            },
          },
        ],
        conversationPrefix: "test-eval",
        log: () => undefined,
        headers: { Cookie: "sb-test-auth=secret" },
        includeRawResponse: false,
        redactReport: true,
        fetchImpl: async (url: string, options: { body?: string; headers?: Record<string, string> }) => {
          requests.push({
            url,
            headers: options.headers ?? {},
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
        headers: {
          Cookie: "sb-test-auth=secret",
        },
        body: {
          message: "hi",
          scenario: "default",
          conversationId: "test-eval-greeting",
          conversationState: {
            shownCards: [],
            lastToolNames: [],
            promptChips: [],
            pendingAction: {
              type: "create_savings_goal",
              name: "Trip",
            },
          },
        },
      });

      const writtenReport = JSON.parse(readFileSync(reportPath, "utf8"));

      expect(writtenReport).toMatchObject({
        status: "passed",
        baseUrl: "http://localhost:3999",
        caseCount: 1,
        failureCount: 0,
      });
      expect(writtenReport.cases[0].message).toBe("[redacted]");
      expect(writtenReport.cases[0]).not.toHaveProperty("rawResponse");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("marks the report failed when the rubric fails", async () => {
    const { runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-eval-"));
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
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-eval-"));
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

  it("can run the dedicated routing-only case pool", async () => {
    const { runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-eval-"));
    const reportPath = join(tempDir, "report.json");
    const messages: string[] = [];

    try {
      const report = await runAgentEval({
        baseUrl: "http://localhost:3999",
        reportPath,
        routingOnly: true,
        caseIds: "routing-bank-balance-natural",
        conversationPrefix: "test-eval",
        log: () => undefined,
        fetchImpl: async (_url: string, options: { body?: string }) => {
          const body = JSON.parse(options.body ?? "{}") as { message: string };
          messages.push(body.message);

          return {
            status: 200,
            ok: true,
            json: async () => ({
              message: `Your ${"Free" + " Cash"} dashboard says you can afford $0.21k.`,
              responseMode: "show_card",
              usedTools: ["get_true_balances"],
              cards: [{ type: "true_balances" }],
              promptChips: [],
            }),
          };
        },
      });

      expect(report.status).toBe("passed");
      expect(report.routingOnly).toBe(true);
      expect(messages).toEqual(["Show my bank balance"]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("runs transcript cases through fetch while carrying pending savings context", async () => {
    const { runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-eval-"));
    const reportPath = join(tempDir, "report.json");
    const requests: Array<{
      message?: string;
      history?: Array<{ role: string; content: string }>;
      conversationState?: {
        pendingAction?: {
          type?: string;
          name?: string;
          targetAmountCents?: number;
          targetDate?: string;
        };
      };
    }> = [];

    try {
      const report = await runAgentEval({
        baseUrl: "http://localhost:3999",
        reportPath,
        cases: [
          {
            id: "phone-savings-japan-context",
            description: "test transcript",
            turns: [
              {
                message: "I need to save for a trip to Japan",
                expectedPendingActionType: "create_savings_goal",
              },
              {
                message: "Yes",
                expectedPendingActionType: "create_savings_goal",
                forbiddenTools: ["get_recurring_activity"],
              },
              {
                message: "Set the savings goal",
                expectedPendingActionType: "create_savings_goal",
              },
              {
                message: "$3000 by December 1st",
                expectedTools: ["create_savings_goal"],
                expectedCards: ["savings_goal_plan"],
                forbiddenTools: ["get_recurring_activity"],
              },
              {
                message: "How much do I need to hit that goal?",
                expectedTools: ["list_savings_goals"],
                expectedCards: ["savings_goals_summary"],
                expectedTextPatterns: ["Japan"],
              },
            ],
          },
        ],
        conversationPrefix: "test-eval",
        log: () => undefined,
        fetchImpl: async (_url: string, options: { body?: string }) => {
          const body = JSON.parse(options.body ?? "{}") as typeof requests[number];
          requests.push(body);

          if (body.message === "I need to save for a trip to Japan") {
            return jsonResponse({
              message: "How much do you want to save for Japan?",
              responseMode: "clarify",
              usedTools: [],
              cards: [],
              promptChips: [],
              pendingAction: {
                type: "create_savings_goal",
                name: "Japan trip",
              },
            });
          }

          if (body.message !== "How much do I need to hit that goal?") {
            expect(body.conversationState?.pendingAction).toMatchObject({
              type: "create_savings_goal",
              name: "Japan trip",
            });
          }

          if (body.message === "$3000 by December 1st") {
            return jsonResponse({
              message: "I set up the savings goal plan.",
              responseMode: "show_card",
              usedTools: ["create_savings_goal"],
              cards: [
                {
                  type: "savings_goal_plan",
                  title: "Savings goal",
                  goalId: "goal-japan",
                  name: "Japan trip",
                  targetAmountCents: 300000,
                  currentAmountCents: 0,
                  remainingCents: 300000,
                  targetDate: "2026-12-01",
                  monthlyContributionCents: 0,
                  includeInSpendableCash: false,
                  summary: "$3,000 left for Japan trip.",
                },
              ],
              promptChips: [],
            });
          }

          if (body.message === "How much do I need to hit that goal?") {
            expect(body.history).toEqual(expect.arrayContaining([
              { role: "user", content: "$3000 by December 1st" },
              { role: "assistant", content: "I set up the savings goal plan." },
            ]));

            return jsonResponse({
              message: "I pulled your savings goals. Japan trip needs about $540/month.",
              responseMode: "show_card",
              usedTools: ["list_savings_goals"],
              cards: [
                {
                  type: "savings_goals_summary",
                  title: "Savings goals",
                  summary: "$3,000 left for Japan trip.",
                  activeGoalCount: 1,
                  protectedMonthlyContributionCents: 0,
                  goals: [
                    {
                      goalId: "goal-japan",
                      name: "Japan trip",
                      targetAmountCents: 300000,
                      currentAmountCents: 0,
                      remainingCents: 300000,
                      targetDate: "2026-12-01",
                      monthlyContributionCents: 0,
                      includeInSpendableCash: false,
                    },
                  ],
                },
              ],
              promptChips: [],
            });
          }

          return jsonResponse({
            message: "How much should I target for Japan trip?",
            responseMode: "clarify",
            usedTools: [],
            cards: [],
            promptChips: [],
            pendingAction: body.conversationState?.pendingAction,
          });
        },
      });

      expect(report.status).toBe("passed");
      expect(report.failureCount).toBe(0);
      expect(requests.map((request) => request.message)).toEqual([
        "I need to save for a trip to Japan",
        "Yes",
        "Set the savings goal",
        "$3000 by December 1st",
        "How much do I need to hit that goal?",
      ]);
      expect(requests[1].history).toEqual([
        { role: "user", content: "I need to save for a trip to Japan" },
        { role: "assistant", content: "How much do you want to save for Japan?" },
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("can run the dedicated major-capability scenario suite", async () => {
    const { majorCapabilityEvalCases, runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-eval-"));
    const reportPath = join(tempDir, "report.json");
    const messages: string[] = [];

    try {
      const report = await runAgentEval({
        baseUrl: "http://localhost:3999",
        reportPath,
        suite: "major-capabilities",
        conversationPrefix: "test-eval",
        log: () => undefined,
        fetchImpl: async (_url: string, options: { body?: string }) => {
          const body = JSON.parse(options.body ?? "{}") as { message: string };
          messages.push(body.message);
          const caseDef = majorCapabilityEvalCases.find((candidate) => candidate.message === body.message);
          const cardTypes = caseDef?.expectedCards ?? (caseDef?.expectedAnyCards?.slice(0, 1) ?? []);

          return {
            status: 200,
            ok: true,
            json: async () => ({
              message: "I checked that for this scenario.",
              responseMode: caseDef?.expectedResponseMode ?? (cardTypes.length > 0 ? "show_card" : "chat_only"),
              usedTools: caseDef?.expectedTools ?? [],
              cards: cardTypes.map((type) => ({ type, title: type })),
              promptChips: [],
            }),
          };
        },
      });

      expect(majorCapabilityEvalCases).toHaveLength(12);
      expect(report.status).toBe("passed");
      expect(report.failureCount).toBe(0);
      expect(report.suite).toBe("major-capabilities");
      expect(report.evaluationMethod).toBe("pass/fail per scenario with shared response-contract checks");
      expect(messages).toEqual(majorCapabilityEvalCases.map((caseDef) => caseDef.message));

      const writtenReport = JSON.parse(readFileSync(reportPath, "utf8"));
      expect(writtenReport).toMatchObject({
        suite: "major-capabilities",
        caseCount: 12,
        failureCount: 0,
        qualityBar: {
          requiredPassRate: "12/12",
          rerunPolicy: "fix root cause, rerun affected scenarios, then rerun complete suite",
        },
      });
      expect(writtenReport.cases[0]).toMatchObject({
        inputMessage: majorCapabilityEvalCases[0].message,
        responseMessage: "I checked that for this scenario.",
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function jsonResponse(payload: Record<string, unknown>) {
  return {
    status: 200,
    ok: true,
    json: async () => payload,
  };
}

async function loadEvalHarness() {
  const module = await import(pathToFileURL(scriptPath).href);

  return module as {
    agentEvalCases: Array<Record<string, unknown> & { id: string }>;
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
      routingOnly?: boolean;
      suite?: string;
      evaluationMethod?: string;
      cases: Array<{ failures: string[] }>;
    }>;
    majorCapabilityEvalCases: Array<{
      message: string;
      expectedTools?: string[];
      expectedCards?: string[];
      expectedAnyCards?: string[];
      expectedResponseMode?: string;
    }>;
  };
}
