import type { AgentCard } from "@/lib/agent/card-types";
import { formatMoneyWithCents } from "@/lib/money";

const maxVisibleCards = 4;
const maxVisibleFacts = 10;
const maxVisibleValues = 12;

export type VisibleCardValue = {
  id: string;
  label: string;
  amountCents?: number;
  date?: string;
  confidence?: "high" | "medium" | "low";
};

export type VisibleCardFacts = {
  type: AgentCard["type"] | string;
  title?: string;
  facts: string[];
  values: VisibleCardValue[];
};

export function summarizeVisibleCardFacts(cards: AgentCard[]): VisibleCardFacts[] {
  const recentCards = cards.slice(-maxVisibleCards);
  const summaries: VisibleCardFacts[] = [];
  let remainingFacts = maxVisibleFacts;
  let remainingValues = maxVisibleValues;

  for (const card of recentCards) {
    if (remainingFacts <= 0 && remainingValues <= 0) {
      break;
    }

    const summary = summarizeCard(card);

    if (!summary || (summary.facts.length === 0 && summary.values.length === 0)) {
      continue;
    }

    const facts = summary.facts.slice(0, remainingFacts);
    const values = summary.values.slice(0, remainingValues);

    if (facts.length === 0 && values.length === 0) {
      continue;
    }

    summaries.push({
      ...summary,
      facts,
      values,
    });
    remainingFacts -= facts.length;
    remainingValues -= values.length;
  }

  return summaries;
}

export function formatVisibleCardFactsForModel(facts: VisibleCardFacts[]): string {
  if (facts.length === 0) {
    return "none";
  }

  return facts
    .map((card, index) => {
      const factLines = card.facts.map((fact) => `- ${fact}`);
      const valueLines = card.values.map((value) => {
        const amount = typeof value.amountCents === "number"
          ? ` ${formatMoneyWithCents(value.amountCents)}`
          : "";
        const date = value.date ? ` on ${value.date}` : "";
        const confidence = value.confidence ? ` (${value.confidence} confidence)` : "";

        return `- ${value.label}${amount}${date}${confidence}`;
      });

      return [
        `${index + 1}. ${card.title ?? card.type} [${card.type}]`,
        ...factLines,
        ...valueLines,
      ].join("\n");
    })
    .join("\n");
}

function summarizeCard(card: AgentCard): VisibleCardFacts | null {
  switch (card.type) {
    case "recurring_activity":
      return summarizeRecurringActivity(card);
    case "recent_transactions":
      return {
        type: card.type,
        title: card.title,
        facts: [`Visible recent transaction count: ${card.transactions.length}.`],
        values: card.transactions.slice(0, maxVisibleValues).map((transaction, index) => ({
          id: `recent-${index}`,
          label: transaction.merchantName ?? transaction.description,
          amountCents: transaction.amountCents,
          date: transaction.date,
        })),
      };
    case "spending_breakdown":
      return {
        type: card.type,
        title: card.title,
        facts: [
          `Visible spending total: ${formatMoneyWithCents(card.totals.spendingCents)}.`,
          `Visible income total: ${formatMoneyWithCents(card.totals.incomeCents)}.`,
        ],
        values: [
          ...card.topCategories.map((group) => ({
            id: `category-${group.id}`,
            label: group.label,
            amountCents: group.amountCents,
          })),
          ...card.topMerchants.map((group) => ({
            id: `merchant-${group.id}`,
            label: group.label,
            amountCents: group.amountCents,
          })),
        ],
      };
    case "spendable_cash_forecast":
      return {
        type: card.type,
        title: card.title,
        facts: [
          `Visible forecast starts at ${formatMoneyWithCents(card.currentSpendableCashCents)} and projects ${formatMoneyWithCents(card.projectedSpendableCashCents)} after ${card.horizonDays} days.`,
        ],
        values: card.points.slice(0, maxVisibleValues).map((point, index) => ({
          id: `forecast-${index}`,
          label: point.date,
          amountCents: point.projectedSpendableCashCents,
          date: point.date,
        })),
      };
    default:
      return null;
  }
}

function summarizeRecurringActivity(
  card: Extract<AgentCard, { type: "recurring_activity" }>,
): VisibleCardFacts {
  const expenseItems = card.items.filter((item) => item.amountCents < 0);
  const expenseTotalCents = expenseItems.reduce(
    (total, item) => total + Math.abs(item.amountCents),
    0,
  );
  const incomeItems = card.items.filter((item) => item.amountCents > 0);
  const facts = [
    `Visible recurring expense total: ${formatMoneyWithCents(expenseTotalCents)} across ${expenseItems.length} items.`,
  ];

  if (incomeItems.length > 0) {
    const incomeTotalCents = incomeItems.reduce((total, item) => total + item.amountCents, 0);

    facts.push(
      `Visible recurring income total: ${formatMoneyWithCents(incomeTotalCents)} across ${incomeItems.length} items.`,
    );
  }

  return {
    type: card.type,
    title: card.title,
    facts,
    values: card.items.slice(0, maxVisibleValues).map((item, index) => ({
      id: `recurring-${index}`,
      label: item.label,
      amountCents: item.amountCents,
      date: item.expectedDate,
      confidence: item.confidence,
    })),
  };
}
