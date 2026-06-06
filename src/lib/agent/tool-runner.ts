import { z } from "zod";
import type { AgentResponse } from "@/lib/agent/card-types";
import { getSuggestedPrompts } from "@/lib/agent/suggested-prompts";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { summarizeFreeCash } from "@/lib/free-cash/explanation";
import { fakeSnapshot } from "@/lib/fake-data";
import { formatMoney } from "@/lib/money";
import type { FinancialSnapshot } from "@/lib/types";

export const agentToolNames = [
  "explain_free_cash",
  "simulate_purchase",
  "show_true_balances",
  "show_recent_transactions",
  "detect_missing_card",
  "show_math",
  "answer_unrelated",
] as const;

export type AgentToolName = (typeof agentToolNames)[number];

const simulatePurchaseArgsSchema = z.object({
  amount_cents: z.number().int().positive().max(1000000),
});

const recentTransactionsArgsSchema = z.object({
  limit: z.number().int().min(1).max(12).default(6),
});

const emptyArgsSchema = z.object({}).passthrough();

export function runAgentTool(
  toolName: AgentToolName,
  rawArgs: unknown = {},
  snapshot: FinancialSnapshot = fakeSnapshot,
): AgentResponse {
  switch (toolName) {
    case "explain_free_cash":
      return explainFreeCash(snapshot);
    case "simulate_purchase": {
      const args = simulatePurchaseArgsSchema.parse(rawArgs ?? {});
      return simulatePurchase(args.amount_cents, snapshot);
    }
    case "show_true_balances":
      emptyArgsSchema.parse(rawArgs ?? {});
      return showTrueBalances(snapshot);
    case "show_recent_transactions": {
      const args = recentTransactionsArgsSchema.parse(rawArgs ?? {});
      return showRecentTransactions(args.limit, snapshot);
    }
    case "detect_missing_card":
      emptyArgsSchema.parse(rawArgs ?? {});
      return detectMissingCard(snapshot);
    case "show_math":
      emptyArgsSchema.parse(rawArgs ?? {});
      return showMath(snapshot);
    case "answer_unrelated":
      emptyArgsSchema.parse(rawArgs ?? {});
      return answerUnrelated(snapshot);
  }
}

export function isAgentToolName(value: string): value is AgentToolName {
  return agentToolNames.includes(value as AgentToolName);
}

function baseAudit(toolName: AgentToolName) {
  return {
    toolNames: [toolName],
    usedModel: false,
  };
}

function explainFreeCash(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const summary = summarizeFreeCash(result);

  return {
    message: summary,
    cards: [
      {
        type: "free_cash_explanation",
        title: "Why Free Cash changed",
        summary,
        drivers: result.drivers,
        warnings: result.warnings,
        dataStates: result.dataStates,
      },
    ],
    promptChips: getSuggestedPrompts(result),
    audit: baseAudit("explain_free_cash"),
  };
}

function simulatePurchase(amountCents: number, snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const afterTodayCents = result.freeCashTodayCents - amountCents;
  const monthlyAverageAfterCents = Math.round(
    (result.rollingNetCents - amountCents) / result.window.dayCount,
  );

  return {
    message: `That would move Free Cash from ${formatMoney(result.freeCashTodayCents)} to ${formatMoney(afterTodayCents)} today.`,
    cards: [
      {
        type: "purchase_simulation",
        title: "Purchase simulation",
        amountCents,
        beforeCents: result.freeCashTodayCents,
        afterTodayCents,
        monthlyAverageAfterCents,
      },
    ],
    promptChips: getSuggestedPrompts(result),
    audit: baseAudit("simulate_purchase"),
  };
}

function showTrueBalances(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);

  return {
    message: "Actual balance is not the same as Free Cash.",
    cards: [
      {
        type: "true_balances",
        title: "True balances",
        balances: result.trueBalances,
      },
    ],
    promptChips: getSuggestedPrompts(result),
    audit: baseAudit("show_true_balances"),
  };
}

function showRecentTransactions(limit: number, snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const recentTransactions = snapshot.transactions
    .filter((transaction) => transaction.date >= result.window.startDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);

  return {
    message: "Here are the recent transactions affecting the current window.",
    cards: [
      {
        type: "recent_transactions",
        title: "Recent transactions",
        transactions: recentTransactions,
      },
    ],
    promptChips: getSuggestedPrompts(result),
    audit: baseAudit("show_recent_transactions"),
  };
}

function detectMissingCard(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);
  const warning = result.warnings.find((item) => item.id === "missing-card");

  return {
    message: warning
      ? "If you spend on that card, connecting it will make Free Cash more accurate."
      : "Mock data is already connected for this prototype.",
    cards: [
      warning
        ? {
            type: "missing_card_nudge",
            title: warning.label,
            detail: warning.detail,
            issuerName: warning.issuerName,
          }
        : {
            type: "connect_account",
            title: "Connect or repair data",
            detail:
              "Use the data control to connect Plaid, repair a stale bank connection, or add the card that is missing from Free Cash.",
          },
    ],
    promptChips: getSuggestedPrompts(result),
    audit: baseAudit("detect_missing_card"),
  };
}

function showMath(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);

  return {
    message: "Here is the deterministic math behind Free Cash.",
    cards: [
      {
        type: "math_breakdown",
        title: "Math breakdown",
        incomeTotalCents: result.incomeTotalCents,
        spendingTotalCents: result.spendingTotalCents,
        protectedSavingsMonthlyCents: result.protectedSavingsMonthlyCents,
        rollingNetCents: result.rollingNetCents,
        dayCount: result.window.dayCount,
      },
    ],
    promptChips: getSuggestedPrompts(result),
    audit: baseAudit("show_math"),
  };
}

function answerUnrelated(snapshot: FinancialSnapshot): AgentResponse {
  const result = calculateFreeCash(snapshot);

  return {
    message:
      "I can help with Spendable questions about spending, balances, transactions, missing cards, or the current Free Cash number.",
    cards: [],
    promptChips: getSuggestedPrompts(result),
    audit: baseAudit("answer_unrelated"),
  };
}
