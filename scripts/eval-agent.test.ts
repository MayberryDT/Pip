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

  it("does not treat card-data wording in guidance as a UI card promise", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {
        expectedTools: ["get_financial_guidance_context"],
        expectedCards: ["guidance_card"],
        expectedResponseMode: "guidance",
      },
      response: {
        message: "I’m seeing Spendable Cash Today around $104. It’s tight because data is missing some card details, and recurring bills are already held back.",
        responseMode: "guidance",
        usedTools: ["get_financial_guidance_context"],
        cards: [{ type: "guidance_card" }],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(true);
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

  it("fails false savings-goal creation claims without the create tool and card", async () => {
    const { evaluateAgentResponse } = await loadEvalHarness();
    const result = evaluateAgentResponse({
      caseDef: {
        forbidFalseSavingsCreate: true,
      },
      response: {
        message: "I set up your Japan savings goal.",
        responseMode: "chat_only",
        usedTools: [],
        cards: [],
        promptChips: [],
      },
    });
    const allowed = evaluateAgentResponse({
      caseDef: {
        forbidFalseSavingsCreate: true,
      },
      response: {
        message: "I set up your Japan savings goal.",
        responseMode: "show_card",
        usedTools: ["create_savings_goal"],
        cards: [{ type: "savings_goal_plan" }],
        promptChips: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("claimed savings goal creation without create_savings_goal");
    expect(allowed.ok).toBe(true);
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
            headers: { "user-agent": "Mozilla/5.0 PipAndroid/1 VersionCode/13" },
            conversationState: {
              pendingAction: {
                type: "create_savings_goal",
                name: "Japan trip",
                missing: ["target_amount"],
              },
            },
            expectNoCards: true,
            expectedResponseMode: "chat_only",
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
          "user-agent": "Mozilla/5.0 PipAndroid/1 VersionCode/13",
        },
        body: {
          message: "hi",
          scenario: "default",
          conversationId: "test-eval-greeting",
          conversationState: {
            pendingAction: {
              type: "create_savings_goal",
              name: "Japan trip",
              missing: ["target_amount"],
            },
            shownCards: [],
            lastToolNames: [],
            promptChips: [],
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

  it("scores redacted quality reports using the unredacted visible answer", async () => {
    const { runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-eval-"));
    const reportPath = join(tempDir, "quality-report.json");

    try {
      const report = await runAgentEval({
        baseUrl: "http://localhost:3999",
        reportPath,
        suite: "quality-working",
        cases: [
          {
            id: "guidance",
            description: "quality case",
            message: "Should I slow down this week?",
            group: "guidance",
            expectedTools: ["get_financial_guidance_context"],
            expectedCards: ["guidance_card"],
            expectedResponseMode: "guidance",
            quality: {
              dimensions: ["directness"],
              expectedTextPatterns: ["pressure"],
              maxWords: 45,
            },
          },
        ],
        conversationPrefix: "test-quality-eval",
        log: () => undefined,
        includeRawResponse: false,
        redactReport: true,
        fetchImpl: async () => ({
          status: 200,
          ok: true,
          json: async () => ({
            message: "My read: pressure is higher this week.",
            responseMode: "guidance",
            usedTools: ["get_financial_guidance_context"],
            cards: [
              {
                type: "guidance_card",
                title: "My read",
                stance: "watch",
                summary: "Pressure is higher this week.",
                rows: [],
              },
            ],
            promptChips: [],
          }),
        }),
      });

      expect(report.cases[0].message).toBe("[redacted]");
      expect(report.cases[0].qualityScore.total).toBeGreaterThanOrEqual(90);
      expect(report.quality.averageScore).toBeGreaterThanOrEqual(90);

      const writtenReport = JSON.parse(readFileSync(reportPath, "utf8"));

      expect(writtenReport.cases[0].message).toBe("[redacted]");
      expect(writtenReport.cases[0].qualityScore.total).toBeGreaterThanOrEqual(90);
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
              ...(caseDef?.expectedPendingActionType
                ? { pendingAction: { type: caseDef.expectedPendingActionType } }
                : {}),
            }),
          };
        },
      });

      expect(majorCapabilityEvalCases).toHaveLength(20);
      expect(majorCapabilityEvalCases.map((caseDef) => caseDef.capability)).toEqual([
        "Guest start and chat tone",
        "Spendable Cash explanation",
        "Calculation transparency",
        "Recent transaction read",
        "Spending breakdown",
        "Recurring bills and subscriptions",
        "Spendable Cash forecast",
        "Purchase simulation",
        "Financial guidance read",
        "Actionable cutback guidance",
        "Actual balances",
        "Connected account management",
        "New account connection",
        "Manual data refresh",
        "Data quality and missing-data detection",
        "Trust receipt",
        "Read-only money movement boundary",
        "Savings goal setup",
        "Savings goal review",
        "Privacy and destructive action safety",
      ]);
      expect(report.status).toBe("passed");
      expect(report.failureCount).toBe(0);
      expect(report.suite).toBe("major-capabilities");
      expect(report.evaluationMethod).toBe("pass/fail per scenario with shared response-contract checks");
      expect(messages).toEqual(majorCapabilityEvalCases.map((caseDef) => caseDef.message));

      const writtenReport = JSON.parse(readFileSync(reportPath, "utf8"));
      expect(writtenReport).toMatchObject({
        suite: "major-capabilities",
        caseCount: 20,
        failureCount: 0,
        qualityBar: {
          requiredPassRate: "all selected cases",
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

  it("uses canonical major-capability fixtures for the 20 capability gate", async () => {
    const { majorCapabilities, majorCapabilityEvalCases } = await loadEvalHarness();

    expect(majorCapabilities).toHaveLength(20);
    expect(majorCapabilityEvalCases).toHaveLength(20);
    expect(majorCapabilities.map((capability) => capability.id)).toEqual(
      majorCapabilityEvalCases.map((caseDef) => caseDef.capabilityId),
    );
    expect(new Set(majorCapabilities.map((capability) => capability.id)).size).toBe(20);
    expect(majorCapabilities.every((capability) => capability.tiers.includes("api"))).toBe(true);
    expect(majorCapabilities.every((capability) => capability.safetyClass)).toBe(true);
  });

  it("can run the expanded major-capability API matrix", async () => {
    const { buildMajorCapabilityExpandedCases, runAgentEval } = await loadEvalHarness();
    const expandedCases = buildMajorCapabilityExpandedCases();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-major-expanded-"));
    const reportPath = join(tempDir, "report.json");
    const messages: string[] = [];

    try {
      const report = await runAgentEval({
        baseUrl: "http://localhost:3999",
        reportPath,
        suite: "major-capabilities-expanded",
        conversationPrefix: "major-expanded-test",
        log: () => undefined,
        fetchImpl: async (_url: string, options: { body?: string }) => {
          const body = JSON.parse(options.body ?? "{}") as { message: string; scenario?: string };
          messages.push(body.message);
          const caseDef =
            expandedCases.find((candidate) => candidate.message === body.message && candidate.scenario === body.scenario) ??
            expandedCases.find((candidate) => candidate.message === body.message);
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
              ...(caseDef?.expectedPendingActionType
                ? { pendingAction: { type: caseDef.expectedPendingActionType } }
                : {}),
            }),
          };
        },
      });

      expect(report.suite).toBe("major-capabilities-expanded");
      expect(report.caseCount).toBeGreaterThan(60);
      expect(report.failureCount).toBe(0);
      expect(messages).toContain("What did I buy lately?");
      expect(messages).toContain("What charges hit this week?");
      expect(messages).toContain("What can I cut back on?");
      expect(messages).toContain("Erase everything you know about me");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("can run the major-capability multi-turn journey suite", async () => {
    const { majorCapabilityMultiTurnCases, runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-major-multiturn-"));
    const reportPath = join(tempDir, "report.json");

    try {
      const report = await runAgentEval({
        baseUrl: "http://localhost:3999",
        reportPath,
        suite: "major-capabilities-multiturn",
        conversationPrefix: "major-multiturn-test",
        log: () => undefined,
        fetchImpl: async (_url: string, options: { body?: string }) => {
          const body = JSON.parse(options.body ?? "{}") as { message: string };
          const caseDef = majorCapabilityMultiTurnCases.find((candidate) => candidate.message === body.message);
          const cardTypes = caseDef?.expectedCards ?? (caseDef?.expectedAnyCards?.slice(0, 1) ?? []);

          return {
            status: 200,
            ok: true,
            json: async () => ({
              message: "I checked that follow-up.",
              responseMode: caseDef?.expectedResponseMode ?? (cardTypes.length > 0 ? "show_card" : "chat_only"),
              usedTools: caseDef?.expectedTools ?? [],
              cards: cardTypes.map((type) => ({ type, title: type })),
              promptChips: [],
            }),
          };
        },
      });

      expect(report.suite).toBe("major-capabilities-multiturn");
      expect(report.caseCount).toBeGreaterThanOrEqual(12);
      expect(report.failureCount).toBe(0);
      expect(majorCapabilityMultiTurnCases.some((caseDef) => caseDef.history?.length > 0)).toBe(true);
      expect(
        majorCapabilityMultiTurnCases
          .filter((caseDef) => caseDef.safetyClass === "confirmation_only")
          .every((caseDef) => caseDef.forbiddenTools?.length),
      ).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("can run the non-destructive production-safe major subset with redacted reports", async () => {
    const { buildMajorCapabilityProductionSafeCases, runAgentEval } = await loadEvalHarness();
    const productionSafeCases = buildMajorCapabilityProductionSafeCases();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-major-prod-safe-"));
    const reportPath = join(tempDir, "report.json");

    try {
      const report = await runAgentEval({
        baseUrl: "https://spendwithpip.com",
        reportPath,
        suite: "major-capabilities-production-safe",
        conversationPrefix: "production-safe-test",
        log: () => undefined,
        fetchImpl: async (_url: string, options: { body?: string }) => {
          const body = JSON.parse(options.body ?? "{}") as { message: string };
          const caseDef = productionSafeCases.find((candidate) => candidate.message === body.message);

          return {
            status: 200,
            ok: true,
            json: async () => ({
              message: "I checked that safely.",
              responseMode: caseDef?.expectedResponseMode ?? "chat_only",
              usedTools: caseDef?.expectedTools ?? [],
              cards: [],
              promptChips: [],
            }),
          };
        },
      });

      const writtenReport = JSON.parse(readFileSync(reportPath, "utf8"));

      expect(report.suite).toBe("major-capabilities-production-safe");
      expect(report.failureCount).toBe(0);
      expect(report.caseCount).toBeGreaterThan(0);
      expect(report.caseCount).toBeLessThan(20);
      expect(writtenReport.cases.every((entry: { inputMessage: string }) => entry.inputMessage === "[redacted]")).toBe(
        true,
      );
      expect(writtenReport.cases.every((entry: Record<string, unknown>) => !("rawResponse" in entry))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("can run the dedicated quality working suite and preserve quality metadata", async () => {
    const { runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-quality-"));
    const reportPath = join(tempDir, "report.json");

    try {
      const report = await runAgentEval({
        baseUrl: "http://localhost:3999",
        reportPath,
        suite: "quality-working",
        caseIds: "quality-tone-1",
        conversationPrefix: "quality-test",
        includeRawResponse: false,
        log: () => undefined,
        fetchImpl: async () => ({
          status: 200,
          ok: true,
          json: async () => ({
            message: "Ask what changed or test a purchase.",
            responseMode: "chat_only",
            usedTools: [],
            cards: [],
            promptChips: [{ id: "ai-why", label: "What changed?", prompt: "What changed?" }],
          }),
        }),
      });

      expect(report.suite).toBe("quality-working");
      expect(report.quality).toMatchObject({
        averageScore: expect.any(Number),
      });
      expect(report.cases[0]).toMatchObject({
        id: "quality-tone-1",
        group: "tone",
        quality: {
          dimensions: ["directness", "brevity", "continuation"],
        },
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("sends selected agent quality variants as request headers", async () => {
    const { runAgentEval } = await loadEvalHarness();
    const tempDir = mkdtempSync(join(tmpdir(), "pip-agent-quality-"));
    const reportPath = join(tempDir, "report.json");
    const headers: Array<Record<string, string>> = [];

    try {
      await runAgentEval({
        baseUrl: "http://localhost:3999",
        reportPath,
        suite: "quality-working",
        caseIds: "quality-tone-1",
        variant: "direct-answer",
        conversationPrefix: "quality-test",
        log: () => undefined,
        fetchImpl: async (_url: string, options: { headers?: Record<string, string> }) => {
          headers.push(options.headers ?? {});

          return {
            status: 200,
            ok: true,
            json: async () => ({
              message: "Ask what changed.",
              responseMode: "chat_only",
              usedTools: [],
              cards: [],
              promptChips: [],
            }),
          };
        },
      });

      expect(headers[0]["x-pip-agent-variant"]).toBe("direct-answer");
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
      caseCount: number;
      routingOnly?: boolean;
      suite?: string;
      evaluationMethod?: string;
      cases: Array<{ failures: string[] }>;
    }>;
    buildMajorCapabilityExpandedCases: () => Array<{
      message: string;
      scenario?: string;
      expectedTools?: string[];
      expectedCards?: string[];
      expectedAnyCards?: string[];
      expectedResponseMode?: string;
      expectedPendingActionType?: string;
    }>;
    buildMajorCapabilityProductionSafeCases: () => Array<{
      message: string;
      expectedTools?: string[];
      expectedResponseMode?: string;
    }>;
    majorCapabilityMultiTurnCases: Array<{
      message: string;
      history?: unknown[];
      safetyClass?: string;
      forbiddenTools?: string[];
      expectedTools?: string[];
      expectedCards?: string[];
      expectedAnyCards?: string[];
      expectedResponseMode?: string;
    }>;
    majorCapabilities: Array<{
      id: string;
      tiers: string[];
      safetyClass: string;
    }>;
    majorCapabilityEvalCases: Array<{
      capabilityId: string;
      message: string;
      expectedTools?: string[];
      expectedCards?: string[];
      expectedAnyCards?: string[];
      expectedResponseMode?: string;
    }>;
  };
}
