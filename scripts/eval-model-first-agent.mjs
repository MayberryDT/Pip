#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { modelFirstAgentGateCases } from "../tests/fixtures/model-first-agent-gate.mjs";

export const PASS_THRESHOLD = 95;

export const MODEL_FIRST_AGENT_RUBRIC = Object.freeze({
  modelFirstVisibleResponse: 25,
  financeGrounding: 25,
  savingsActionSafety: 20,
  confirmationSafety: 10,
  responseSurface: 10,
  exceptionDiscipline: 10,
});

const RUBRIC_TOTAL = Object.values(MODEL_FIRST_AGENT_RUBRIC).reduce((sum, value) => sum + value, 0);

if (RUBRIC_TOTAL !== 100) {
  throw new Error(`Model-first rubric must total 100 points; found ${RUBRIC_TOTAL}`);
}

export function scoreModelFirstAgentCase(caseInput, responseInput, options = {}) {
  const caseDef = caseInput?.caseDef || caseInput || {};
  const response = responseInput || caseInput?.response || caseDef.mockResponse || caseDef.expectedResponse || caseDef.expectation || {};
  const expected = caseDef.expected || caseInput?.expected || {};
  const threshold = options.threshold || PASS_THRESHOLD;
  const context = createScoringContext({ caseDef, expected, response });
  const violations = [];
  const dimensionScores = {
    modelFirstVisibleResponse: scoreModelFirstVisibleResponse(context, violations),
    financeGrounding: scoreFinanceGrounding(context, violations),
    savingsActionSafety: scoreSavingsActionSafety(context, violations),
    confirmationSafety: scoreConfirmationSafety(context, violations),
    responseSurface: scoreResponseSurface(context, violations),
    exceptionDiscipline: scoreExceptionDiscipline(context, violations),
  };
  const score = round(Object.values(dimensionScores).reduce((sum, value) => sum + value, 0));

  return {
    id: caseDef.id || "adhoc",
    category: caseDef.category || "adhoc",
    score,
    passed: score >= threshold,
    threshold,
    violations: [...new Set(violations)],
    dimensionScores,
  };
}

export function scoreModelFirstResponse({ response, expected = {}, id = "adhoc", category = "adhoc", threshold = PASS_THRESHOLD }) {
  return scoreModelFirstAgentCase(
    {
      id,
      category,
      expected,
      mockResponse: response,
    },
    undefined,
    { threshold },
  );
}

export function scoreModelFirstAgentCases({ cases = modelFirstAgentGateCases, threshold = PASS_THRESHOLD } = {}) {
  const caseResults = cases.map((caseDef) => scoreModelFirstAgentCase(caseDef, undefined, { threshold }));
  const score = caseResults.length === 0
    ? 0
    : round(caseResults.reduce((sum, result) => sum + result.score, 0) / caseResults.length);
  const failedCases = caseResults.filter((result) => result.score < threshold);

  return {
    score,
    threshold,
    passed: score >= threshold && failedCases.length === 0,
    totalCases: caseResults.length,
    failedCases,
    categoryScores: scoreByCategory(caseResults),
    cases: caseResults,
  };
}

export function runSelfTests() {
  const cases = [
    {
      id: "SELF-PASS",
      category: "spendable_cash",
      expected: { visible: true, requiresModel: true, requiresFinancialGrounding: true },
      mockResponse: {
        usedModel: true,
        message: "Today is tight after the grocery purchase.",
        usedTools: ["get_spendable_cash_context"],
      },
    },
    {
      id: "SELF-NO-MODEL",
      category: "general_education",
      expected: { visible: true, requiresModel: true },
      mockResponse: { usedModel: false, message: "A canned visible answer." },
    },
    {
      id: "SELF-NO-GROUNDING",
      category: "transactions",
      expected: { visible: true, requiresModel: true, requiresFinancialGrounding: true },
      mockResponse: { usedModel: true, message: "That charge changed today." },
    },
  ];
  const [pass, noModel, noGrounding] = cases.map((testCase) => scoreModelFirstAgentCase(testCase));

  return {
    passed: pass.score === 100
      && noModel.violations.includes("visible_response_missing_model")
      && noGrounding.violations.includes("finance_intent_missing_product_grounding"),
    cases: [pass, noModel, noGrounding],
  };
}

export async function runModelFirstAgentEval({
  argv = [],
  cases = modelFirstAgentGateCases,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const options = parseArgs(argv);

  if (options.selfTest) {
    const result = runSelfTests();

    stdout(JSON.stringify(result, null, 2));

    return { status: result.passed ? 0 : 1, result };
  }

  const selectedCases = options.caseId ? cases.filter((testCase) => testCase.id === options.caseId) : cases;

  if (options.caseId && selectedCases.length === 0) {
    const error = `Unknown model-first agent gate case: ${options.caseId}`;
    stderr(error);

    return { status: 1, error };
  }

  const report = scoreModelFirstAgentCases({
    cases: selectedCases,
    threshold: options.threshold,
  });

  if (options.json) {
    stdout(JSON.stringify(report, null, 2));
  } else {
    stdout(formatReport(report));
  }

  if (!report.passed) {
    stderr(formatFailures(report));
  }

  return { status: report.passed ? 0 : 1, report };
}

function createScoringContext({ caseDef, expected, response }) {
  const cards = [
    ...asArray(response.cards),
    ...asArray(response.cardTypes).map((type) => ({ type })),
    ...(response.card ? [response.card] : []),
  ].filter(Boolean);
  const usedTools = [
    ...asArray(response.usedTools),
    ...asArray(response.tools),
    ...asArray(response.toolCalls).map((toolCall) => toolCall?.name || toolCall?.toolName || toolCall?.type),
    response.toolName,
  ].filter(Boolean);
  const pendingActions = [
    ...asArray(response.pendingActions),
    response.pendingAction,
  ].filter(Boolean);
  const clientActions = [
    ...asArray(response.clientActions),
    response.clientAction,
  ].filter(Boolean);
  const promptChips = asArray(response.promptChips);
  const text = [
    response.responseSearchText,
    response.responseMessage,
    response.message,
    response.text,
    response.copy,
  ].filter(Boolean).join(" ").trim();

  return {
    caseDef,
    expected,
    response,
    cards,
    usedTools,
    pendingActions,
    clientActions,
    promptChips,
    text,
    hasVisibleSurface: Boolean(text) || cards.length > 0 || promptChips.length > 0,
    hasProductGrounding: usedTools.length > 0
      || cards.length > 0
      || pendingActions.length > 0
      || clientActions.length > 0
      || hasClarifyPath(response),
  };
}

function scoreModelFirstVisibleResponse(context, violations) {
  const weight = MODEL_FIRST_AGENT_RUBRIC.modelFirstVisibleResponse;

  if (!context.expected.visible || context.expected.requiresModel === false) return weight;
  if (context.response.usedModel === true) return weight;

  violations.push("visible_response_missing_model");

  return 0;
}

function scoreFinanceGrounding(context, violations) {
  const weight = MODEL_FIRST_AGENT_RUBRIC.financeGrounding;

  if (!context.expected.requiresFinancialGrounding) return weight;
  if (context.hasProductGrounding) return weight;

  violations.push("finance_intent_missing_product_grounding");

  return 0;
}

function scoreSavingsActionSafety(context, violations) {
  const weight = MODEL_FIRST_AGENT_RUBRIC.savingsActionSafety;

  if (!context.expected.requiresSavingsPreviewBeforeCreate) return weight;

  const hasPreview = hasToolMatching(context, /preview_savings_goal|previewSavingsGoal/i)
    || hasCardMatching(context, /savings_goal_preview|savingsGoalPreview/i)
    || hasPendingActionMatching(context, /confirm_savings_goal_create|savings_goal_preview/i);
  const createsImmediately = hasToolMatching(context, /create_savings_goal|createSavingsGoal/i)
    && !hasPendingContext(context);

  if (hasPreview && !createsImmediately) return weight;

  violations.push("savings_setup_missing_preview");

  return 0;
}

function scoreConfirmationSafety(context, violations) {
  const weight = MODEL_FIRST_AGENT_RUBRIC.confirmationSafety;

  if (context.expected.requiresPendingContext && !hasPendingContext(context)) {
    violations.push("savings_confirmation_missing_pending_context");

    return 0;
  }

  if (context.expected.requiresConfirmation && !hasConfirmationPath(context)) {
    violations.push("confirmation_missing_pending_action");

    return 0;
  }

  if (context.expected.blockedAdvice && !isBlockedAdviceSafe(context)) {
    violations.push("blocked_advice_missing_boundary");

    return 0;
  }

  return weight;
}

function scoreResponseSurface(context, violations) {
  const weight = MODEL_FIRST_AGENT_RUBRIC.responseSurface;

  if (!context.expected.visible || context.hasVisibleSurface) return weight;

  violations.push("visible_response_missing_surface");

  return 0;
}

function scoreExceptionDiscipline(context, violations) {
  const weight = MODEL_FIRST_AGENT_RUBRIC.exceptionDiscipline;
  const bypass = context.expected.allowedModelBypass;

  if (!bypass) {
    if (context.response.usedModel === false && context.expected.visible && context.expected.requiresModel !== false) {
      violations.push("unexpected_model_bypass");

      return 0;
    }

    return weight;
  }

  if (bypass === "prompt_chips" && context.promptChips.length > 0) return weight;
  if (bypass === "hard_outage" && (context.response.hardOutage === true || context.response.kind === "hard_outage")) return weight;

  violations.push(`invalid_${bypass}_exception`);

  return 0;
}

function hasToolMatching(context, pattern) {
  return context.usedTools.some((tool) => pattern.test(String(tool)));
}

function hasCardMatching(context, pattern) {
  return context.cards.some((card) => pattern.test(String(card?.type || card)));
}

function hasPendingActionMatching(context, pattern) {
  return context.pendingActions.some((action) => pattern.test(String(action?.type || action)));
}

function hasPendingContext(context) {
  const pendingContext = context.response.pendingContext || context.response.pendingActionContext;

  if (!pendingContext) return false;
  if (typeof pendingContext === "string") return pendingContext.trim().length > 0;

  return Object.keys(pendingContext).length > 0;
}

function hasConfirmationPath(context) {
  return context.pendingActions.length > 0 || context.clientActions.length > 0 || hasClarifyPath(context.response);
}

function hasClarifyPath(response) {
  return response.clarify === true
    || response.needsClarification === true
    || Boolean(response.clarifyingQuestion)
    || Boolean(response.clarificationPrompt);
}

function isBlockedAdviceSafe(context) {
  const hasBoundary = context.response.refusalBoundary === true
    || context.response.blockedAdvice === true
    || /\b(can't|cannot|won't|not able to|outside what I can do)\b/i.test(context.text);
  const unsafeAction = context.usedTools.length > 0 || context.clientActions.length > 0 || context.pendingActions.length > 0;

  return hasBoundary && !unsafeAction;
}

function scoreByCategory(caseResults) {
  const grouped = new Map();

  for (const result of caseResults) {
    const entry = grouped.get(result.category) || { total: 0, count: 0, failed: 0 };

    entry.total += result.score;
    entry.count += 1;
    entry.failed += result.passed ? 0 : 1;
    grouped.set(result.category, entry);
  }

  return Object.fromEntries(
    [...grouped.entries()].map(([category, entry]) => [
      category,
      {
        score: round(entry.total / entry.count),
        totalCases: entry.count,
        failedCases: entry.failed,
      },
    ]),
  );
}

function formatReport(report) {
  const lines = [
    `Model-first agent gate: ${report.passed ? "PASS" : "FAIL"}`,
    `Score: ${report.score}/100`,
    `Threshold: ${report.threshold}`,
    `Cases: ${report.totalCases}`,
    `Failed cases: ${report.failedCases.length}`,
    "Category scores:",
  ];

  for (const [category, result] of Object.entries(report.categoryScores)) {
    lines.push(`- ${category}: ${result.score}/100 (${result.failedCases}/${result.totalCases} failed)`);
  }

  return lines.join("\n");
}

function formatFailures(report) {
  if (report.failedCases.length === 0) return "";

  return [
    "Model-first agent gate failures:",
    ...report.failedCases.slice(0, 20).map((testCase) =>
      `- ${testCase.id}: ${testCase.score}/100 ${testCase.violations.join(", ")}`,
    ),
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    threshold: PASS_THRESHOLD,
    caseId: null,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--self-test") {
      options.selfTest = true;
    } else if (arg === "--threshold") {
      options.threshold = Number(argv[++index]);
    } else if (arg.startsWith("--threshold=")) {
      options.threshold = Number(arg.split("=")[1]);
    } else if (arg === "--case") {
      options.caseId = argv[++index];
    } else if (arg.startsWith("--case=")) {
      options.caseId = arg.split("=")[1];
    }
  }

  if (!Number.isFinite(options.threshold)) {
    throw new Error("Model-first agent threshold must be a number");
  }

  return options;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runModelFirstAgentEval({ argv: process.argv.slice(2) });

  process.exitCode = result.status;
}
