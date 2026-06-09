#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT_CHAT_LOG_PATH = "/tmp/spendable-agent-chat-turns.jsonl";
const DEFAULT_REPORT_PATH = "/tmp/spendable-agent-conversation-analysis.json";
const DEFAULT_SIMILARITY_THRESHOLD = 0.82;

export function analyzeAgentConversationTurns({
  turns,
  similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
} = {}) {
  const grouped = groupByConversation(turns ?? []);
  const conversations = [];
  let repeatedAssistantMessageCount = 0;
  let repeatedChipSetCount = 0;
  let adjacentSameToolCount = 0;

  for (const [conversationId, conversationTurns] of grouped.entries()) {
    const sortedTurns = conversationTurns
      .slice()
      .sort((left, right) => String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")));
    const findings = [];

    for (let index = 1; index < sortedTurns.length; index += 1) {
      const previous = sortedTurns[index - 1];
      const current = sortedTurns[index];
      const previousAssistant = getAssistantMessage(previous);
      const currentAssistant = getAssistantMessage(current);

      if (previousAssistant && currentAssistant) {
        const overlap = similarity(previousAssistant, currentAssistant);

        if (normalizeText(previousAssistant) === normalizeText(currentAssistant) || overlap >= similarityThreshold) {
          repeatedAssistantMessageCount += 1;
          findings.push({
            type: "repeated-assistant-message",
            turnId: current.id ?? null,
            previousTurnId: previous.id ?? null,
            similarity: Number(overlap.toFixed(3)),
          });
        }
      }

      const previousChipKey = chipSetKey(previous.promptChips);
      const currentChipKey = chipSetKey(current.promptChips);

      if (previousChipKey && previousChipKey === currentChipKey) {
        repeatedChipSetCount += 1;
        findings.push({
          type: "repeated-chip-set",
          turnId: current.id ?? null,
          previousTurnId: previous.id ?? null,
        });
      }

      const previousTool = asArray(previous.usedTools).at(-1);
      const currentTool = asArray(current.usedTools).at(-1);

      if (previousTool && previousTool === currentTool) {
        adjacentSameToolCount += 1;
        findings.push({
          type: "adjacent-same-tool",
          toolName: currentTool,
          turnId: current.id ?? null,
          previousTurnId: previous.id ?? null,
        });
      }
    }

    conversations.push({
      conversationId,
      turnCount: sortedTurns.length,
      findingCount: findings.length,
      findings,
    });
  }

  return {
    status:
      repeatedAssistantMessageCount === 0 &&
      repeatedChipSetCount === 0 &&
      adjacentSameToolCount === 0
        ? "clean"
        : "needs-review",
    conversationCount: grouped.size,
    turnCount: turns?.length ?? 0,
    repeatedAssistantMessageCount,
    repeatedChipSetCount,
    adjacentSameToolCount,
    conversations,
  };
}

export function loadAgentConversationTurnsFromJsonl(path = DEFAULT_CHAT_LOG_PATH) {
  const file = readFileSync(path, "utf8");

  return file
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function runAgentConversationAnalysis({
  logPath = process.env.SPENDABLE_AGENT_CHAT_LOG || DEFAULT_CHAT_LOG_PATH,
  reportPath = process.env.SPENDABLE_AGENT_ANALYSIS_REPORT || DEFAULT_REPORT_PATH,
  log = console.log,
} = {}) {
  const turns = loadAgentConversationTurnsFromJsonl(logPath);
  const report = analyzeAgentConversationTurns({ turns });

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  log(`Wrote Pip conversation analysis report to ${reportPath}`);

  return report;
}

function groupByConversation(turns) {
  const grouped = new Map();

  for (const turn of turns) {
    const conversationId = String(turn.conversationId ?? turn.conversation_id ?? "unknown");
    const existing = grouped.get(conversationId) ?? [];

    existing.push(normalizeTurn(turn));
    grouped.set(conversationId, existing);
  }

  return grouped;
}

function normalizeTurn(turn) {
  return {
    id: turn.id,
    conversationId: turn.conversationId ?? turn.conversation_id,
    assistantMessage: turn.assistantMessage ?? turn.assistant_message,
    usedTools: turn.usedTools ?? turn.used_tools,
    promptChips: turn.promptChips ?? turn.prompt_chips,
    createdAt: turn.createdAt ?? turn.created_at,
  };
}

function getAssistantMessage(turn) {
  return typeof turn.assistantMessage === "string" ? turn.assistantMessage : "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function chipSetKey(chips) {
  return asArray(chips)
    .map((chip) => normalizeText(`${chip?.label ?? ""}|${chip?.prompt ?? ""}`))
    .filter(Boolean)
    .sort()
    .join("||");
}

function normalizeText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/[^a-z0-9$.\s-]/g, " ")
    .replace(/\$?\d+(?:\.\d+)?/g, "$amount")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(left, right) {
  const stopWords = new Set(["a", "an", "and", "are", "as", "at", "for", "i", "is", "it", "me", "my", "of", "on", "or", "that", "the", "this", "to", "with", "you", "your"]);
  const leftTokens = normalizeText(left).split(/\s+/).filter((token) => token.length > 2 && !stopWords.has(token));
  const rightTokens = normalizeText(right).split(/\s+/).filter((token) => token.length > 2 && !stopWords.has(token));

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return intersection / union;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAgentConversationAnalysis();
}
