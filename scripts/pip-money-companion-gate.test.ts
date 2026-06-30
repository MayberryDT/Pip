// @ts-nocheck
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Pip money companion gate fixture", () => {
  it("exports exactly 137 unique cases ordered 1..137, from SCT-001 to DOGFOOD-010", async () => {
    const { pipMoneyCompanionGateCases } = await import("../tests/fixtures/pip-money-companion-gate.mjs");

    expect(pipMoneyCompanionGateCases).toHaveLength(137);
    expect(new Set(pipMoneyCompanionGateCases.map((testCase: { id: string }) => testCase.id)).size).toBe(137);
    expect(pipMoneyCompanionGateCases.map((testCase: { order: number }) => testCase.order)).toEqual(
      Array.from({ length: 137 }, (_, index) => index + 1),
    );
    expect(pipMoneyCompanionGateCases[0].id).toBe("SCT-001");
    expect(pipMoneyCompanionGateCases.at(-1)?.id).toBe("DOGFOOD-010");
  });
});

describe("Pip money companion gate runner", () => {
  it("writes manifest.json plus case-001.json for a passing case", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-money-gate-"));
    const { runPipMoneyCompanionGate, PIP_COMPANION_DIMENSIONS } = await import("./pip-money-companion-gate.mjs");

    try {
      const result = await runPipMoneyCompanionGate({
        runDir: tempDir,
        cases: [makeCase("SCT-001", 1)],
        adapter: async () => ({
          score: 100,
          breakdown: PIP_COMPANION_DIMENSIONS,
          observed: { spendableCashTodayCents: 7400 },
          hardZeroReasons: [],
          rootCauseHint: null,
        }),
        stdout: () => undefined,
        stderr: () => undefined,
      });

      const manifest = readJson(join(tempDir, "manifest.json"));
      const caseReport = readJson(join(tempDir, "case-001.json"));

      expect(result.status).toBe(0);
      expect(manifest.status).toBe("passed");
      expect(manifest.completedCaseIds).toEqual(["SCT-001"]);
      expect(caseReport).toMatchObject({
        caseId: "SCT-001",
        score: 100,
        passed: true,
        breakdown: PIP_COMPANION_DIMENSIONS,
        observed: { spendableCashTodayCents: 7400 },
        expected: { spendableCashTodayCents: 7400, hardZeroIf: [] },
        hardZeroReasons: [],
        rootCauseHint: null,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("stops immediately on score 94, marks manifest failed, and does not execute later cases", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-money-gate-"));
    const { runPipMoneyCompanionGate, PIP_COMPANION_DIMENSIONS } = await import("./pip-money-companion-gate.mjs");
    const executedCaseIds: string[] = [];

    try {
      const result = await runPipMoneyCompanionGate({
        runDir: tempDir,
        cases: [makeCase("SCT-001", 1), makeCase("SCT-002", 2), makeCase("SCT-003", 3)],
        adapter: async (testCase) => {
          executedCaseIds.push(testCase.id);

          return {
            score: testCase.id === "SCT-002" ? 94 : 100,
            breakdown: {
              ...PIP_COMPANION_DIMENSIONS,
              numericCorrectness: testCase.id === "SCT-002" ? 29 : PIP_COMPANION_DIMENSIONS.numericCorrectness,
            },
            observed: { id: testCase.id },
            hardZeroReasons: [],
            rootCauseHint: testCase.id === "SCT-002" ? "numericCorrectness" : null,
          };
        },
        stdout: () => undefined,
        stderr: () => undefined,
      });

      const manifest = readJson(join(tempDir, "manifest.json"));

      expect(result.status).toBe(1);
      expect(manifest.status).toBe("failed");
      expect(manifest.failedCaseId).toBe("SCT-002");
      expect(manifest.completedCaseIds).toEqual(["SCT-001"]);
      expect(executedCaseIds).toEqual(["SCT-001", "SCT-002"]);
      expect(existsSync(join(tempDir, "case-003.json"))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resumes from the failed case and refuses to resume if the fixture checksum changed", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-money-gate-"));
    const { runPipMoneyCompanionGate, PIP_COMPANION_DIMENSIONS } = await import("./pip-money-companion-gate.mjs");
    const cases = [makeCase("SCT-001", 1), makeCase("SCT-002", 2), makeCase("SCT-003", 3)];

    try {
      await runPipMoneyCompanionGate({
        runDir: tempDir,
        cases,
        adapter: async (testCase) => ({
          score: testCase.id === "SCT-002" ? 94 : 100,
          breakdown: PIP_COMPANION_DIMENSIONS,
          observed: { id: testCase.id },
          hardZeroReasons: [],
          rootCauseHint: testCase.id === "SCT-002" ? "numericCorrectness" : null,
        }),
        stdout: () => undefined,
        stderr: () => undefined,
      });

      const changedFixtureExecutions: string[] = [];
      const changedFixtureResult = await runPipMoneyCompanionGate({
        resumeManifestPath: join(tempDir, "manifest.json"),
        cases: [makeCase("SCT-001", 1), { ...makeCase("SCT-002", 2), title: "Changed case" }, makeCase("SCT-003", 3)],
        adapter: async (testCase) => {
          changedFixtureExecutions.push(testCase.id);

          return { score: 100, breakdown: PIP_COMPANION_DIMENSIONS, observed: {}, hardZeroReasons: [] };
        },
        stdout: () => undefined,
        stderr: () => undefined,
      });

      const resumedCaseIds: string[] = [];
      const resumedResult = await runPipMoneyCompanionGate({
        resumeManifestPath: join(tempDir, "manifest.json"),
        cases,
        adapter: async (testCase) => {
          resumedCaseIds.push(testCase.id);

          return {
            score: 100,
            breakdown: PIP_COMPANION_DIMENSIONS,
            observed: { id: testCase.id },
            hardZeroReasons: [],
            rootCauseHint: null,
          };
        },
        stdout: () => undefined,
        stderr: () => undefined,
      });

      expect(changedFixtureResult.status).toBe(1);
      expect(changedFixtureResult.error).toMatch(/fixture checksum changed/i);
      expect(changedFixtureExecutions).toEqual([]);
      expect(resumedResult.status).toBe(0);
      expect(resumedCaseIds).toEqual(["SCT-002", "SCT-003"]);
      expect(readJson(join(tempDir, "manifest.json")).status).toBe("passed");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("scores a hard-zero failure as 0 even if other dimensions are high", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-money-gate-"));
    const { runPipMoneyCompanionGate, PIP_COMPANION_DIMENSIONS } = await import("./pip-money-companion-gate.mjs");

    try {
      const result = await runPipMoneyCompanionGate({
        runDir: tempDir,
        cases: [makeCase("VOICE-013", 120)],
        adapter: async () => ({
          score: 98,
          breakdown: {
            ...PIP_COMPANION_DIMENSIONS,
            safetyBoundary: 3,
          },
          observed: { responseMessage: "Your Target purchase posted today." },
          hardZeroReasons: ["invented transaction"],
          rootCauseHint: "safetyBoundary",
        }),
        stdout: () => undefined,
        stderr: () => undefined,
      });

      const caseReport = readJson(join(tempDir, "case-120.json"));

      expect(result.status).toBe(1);
      expect(caseReport.score).toBe(0);
      expect(caseReport.passed).toBe(false);
      expect(caseReport.hardZeroReasons).toEqual(["invented transaction"]);
      expect(readJson(join(tempDir, "manifest.json")).failedCaseId).toBe("VOICE-013");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses the default adapter to run existing SCT verification instead of the unimplemented adapter", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-money-gate-"));
    const { runPipMoneyCompanionGate } = await import("./pip-money-companion-gate.mjs");
    const commands: string[] = [];

    try {
      const result = await runPipMoneyCompanionGate({
        runDir: tempDir,
        cases: [makeCase("SCT-002", 2)],
        spawn: (bin: string, args: string[]) => {
          commands.push([bin, ...args].join(" "));

          return { status: 0, stdout: "vitest ok", stderr: "" };
        },
        stdout: () => undefined,
        stderr: () => undefined,
      });

      const manifest = readJson(join(tempDir, "manifest.json"));
      const caseReport = readJson(join(tempDir, "case-002.json"));

      expect(result.status).toBe(0);
      expect(commands).toEqual([
        "npm run test -- src/lib/pip-cash/spendable-cash-today.test.ts src/lib/pip-cash/same-day-ledger.test.ts",
      ]);
      expect(manifest.status).toBe("passed");
      expect(caseReport).toMatchObject({
        caseId: "SCT-002",
        passed: true,
        score: 100,
        observed: {
          verificationMode: "existing-command-smoke",
          scoreMethod: "binary_command_pass_fail",
        },
      });
      expect(caseReport.observed.commands[0]).toMatchObject({
        command:
          "npm run test -- src/lib/pip-cash/spendable-cash-today.test.ts src/lib/pip-cash/same-day-ledger.test.ts",
        status: 0,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses the default adapter to run local sanitized DOGFOOD evidence", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-money-gate-"));
    const { runPipMoneyCompanionGate } = await import("./pip-money-companion-gate.mjs");
    const requestedUrls: string[] = [];

    try {
      const result = await runPipMoneyCompanionGate({
        runDir: tempDir,
        cases: [makeCase("DOGFOOD-001", 1)],
        baseUrl: "http://pip.local.test",
        spawn: () => {
          throw new Error("dogfood adapter should not spawn category test commands");
        },
        fetcher: async (url: string) => {
          requestedUrls.push(String(url));

          if (String(url).includes("/api/pip-cash")) {
            return jsonResponse(makeProductionScaleApiPayload());
          }

          return textResponse('<main class="pip-app-shell">Pip Spendable Cash Today</main>', "text/html");
        },
        stdout: () => undefined,
        stderr: () => undefined,
      });

      const manifest = readJson(join(tempDir, "manifest.json"));
      const caseReport = readJson(join(tempDir, "case-001.json"));

      expect(result.status).toBe(0);
      expect(manifest.status).toBe("passed");
      expect(manifest.completedCaseIds).toEqual(["DOGFOOD-001"]);
      expect(requestedUrls).toEqual([
        "http://pip.local.test/api/pip-cash?scenario=production-scale",
        "http://pip.local.test/app?scenario=production-scale",
      ]);
      expect(caseReport).toMatchObject({
        caseId: "DOGFOOD-001",
        score: 100,
        passed: true,
        observed: {
          verificationMode: "local-sanitized-dogfood-proxy",
          dogfoodScope: "production-scale-local-fake-data",
          noRealProviderDataUsed: true,
          scenario: "production-scale",
          trueBalanceCount: 4,
          sameDayDiscretionarySpendCents: 1800,
        },
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails local sanitized DOGFOOD evidence closed when the app is unavailable", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-money-gate-"));
    const { runPipMoneyCompanionGate } = await import("./pip-money-companion-gate.mjs");

    try {
      const result = await runPipMoneyCompanionGate({
        runDir: tempDir,
        cases: [makeCase("DOGFOOD-001", 1)],
        baseUrl: "http://pip.local.test",
        fetcher: async (url: string) => {
          if (String(url).includes("/api/pip-cash")) {
            return jsonResponse(makeProductionScaleApiPayload());
          }

          return textResponse("not found", "text/plain", 404);
        },
        stdout: () => undefined,
        stderr: () => undefined,
      });

      const manifest = readJson(join(tempDir, "manifest.json"));
      const caseReport = readJson(join(tempDir, "case-001.json"));

      expect(result.status).toBe(1);
      expect(manifest.status).toBe("failed");
      expect(manifest.failedCaseId).toBe("DOGFOOD-001");
      expect(caseReport.score).toBe(0);
      expect(caseReport.hardZeroReasons).toEqual(["localDogfoodEvidence"]);
      expect(caseReport.observed.checks).toContainEqual(
        expect.objectContaining({
          id: "app-smoke-ok",
          passed: false,
        }),
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("blocks unknown default-adapter cases during preflight without scoring", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pip-money-gate-"));
    const { runPipMoneyCompanionGate } = await import("./pip-money-companion-gate.mjs");

    try {
      const result = await runPipMoneyCompanionGate({
        runDir: tempDir,
        cases: [{ ...makeCase("UNKNOWN-001", 1), category: "unknown" }],
        spawn: () => {
          throw new Error("preflight should stop before spawning commands");
        },
        stdout: () => undefined,
        stderr: () => undefined,
      });

      const manifest = readJson(join(tempDir, "manifest.json"));
      const preflightReport = readJson(join(tempDir, "preflight.json"));

      expect(result.status).toBe(1);
      expect(result.error).toMatch(/preflight/i);
      expect(manifest.status).toBe("blocked");
      expect(manifest.cases).toEqual([]);
      expect(manifest.failures[0]).toContain("No default verification is wired for UNKNOWN-001");
      expect(manifest.preflight).toMatchObject({
        status: "failed",
        reportPath: join(tempDir, "preflight.json"),
      });
      expect(preflightReport).toMatchObject({
        status: "failed",
        missingHarness: [
          expect.objectContaining({
            caseId: "UNKNOWN-001",
            category: "unknown",
          }),
        ],
      });
      expect(existsSync(join(tempDir, "case-001.json"))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("exposes the package script", () => {
    const packageJson = readJson(join(process.cwd(), "package.json")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["test:pip-money-companion-gate"]).toBe(
      "node scripts/pip-money-companion-gate.mjs",
    );
  });
});

function makeCase(id: string, order: number) {
  return {
    id,
    order,
    title: `${id} gate case`,
    category: categoryForTestCase(id),
    setup: { date: "2026-06-20", userProfile: "healthy" },
    action: { type: "calculate" },
    expected: { spendableCashTodayCents: 7400, hardZeroIf: [] },
  };
}

function categoryForTestCase(id: string) {
  if (id.startsWith("DOGFOOD-")) return "dogfood";
  if (id.startsWith("SAVE-")) return "savings_goals";
  if (id.startsWith("BILL-")) return "recurring_bills";
  if (id.startsWith("SYNC-")) return "sync_freshness";
  if (id.startsWith("BUBBLE-")) return "opening_bubble";
  if (id.startsWith("VOICE-")) return "assistant_voice";

  return "spendable_cash_today";
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function makeProductionScaleApiPayload() {
  return {
    pipCashTodayCents: 2031,
    trueBalances: [
      { accountId: "checking", name: "Primary Checking", institutionName: "Cedar Test Bank", balanceCents: 618900 },
      { accountId: "savings", name: "Savings", institutionName: "Cedar Test Bank", balanceCents: 950000 },
      { accountId: "card", name: "Rewards Card", institutionName: "Harbor Test Card", balanceCents: -228100 },
      { accountId: "loan", name: "Auto Loan", institutionName: "Northstar Test Credit", balanceCents: -1080000 },
    ],
    spendableCashToday: {
      metricVersion: "v2",
      spendableCashTodayCents: 2031,
      baselineDailyAllowanceCents: 8200,
      sameDayDiscretionarySpendCents: 1800,
      sameDayPendingSpendCents: 900,
      billVarianceCents: 0,
      currentMonthVarianceCents: -5400,
      completedMonthCount: 5,
      savingsGoalMonthlyCents: 35000,
      drivers: [
        { id: "baseline", label: "Pattern", detail: "Pattern", amountCents: 8200, tone: "positive" },
        { id: "savings-goals", label: "Savings goals", detail: "Savings", amountCents: -35000, tone: "neutral" },
      ],
    },
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(value: string, contentType = "text/plain", status = 200) {
  return new Response(value, {
    status,
    headers: { "content-type": contentType },
  });
}
