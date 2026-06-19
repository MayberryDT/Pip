# Pip Savings Context State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pip reliably handle multi-turn savings-goal conversations on phone, especially the verified Japan transcript, without losing context or claiming a goal was created before persistence succeeds.

**Architecture:** Treat savings-goal setup as deterministic app state, not generic chat. First merge the existing pending-action and server-history repair branch, then extend pending savings actions into a small state machine that captures goal name, target amount, target date, recommended monthly contribution, and whether the contribution should be kept out of Spendable Cash Today. The LLM can explain, but route selection, follow-up handling, and persistence confirmations must be deterministic.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Playwright, Supabase-backed `agent_chat_turns`, existing savings-goal repository/cards/planning utilities.

---

## Source Evidence

Live production `agent_chat_turns` for conversation `web-ea0d3959-9f15-4011-9d89-1c7961a5be4c` showed this failure sequence:

1. User: `I need to save for a trip to Japan`
   Pip: asks whether to set a Japan goal.
2. User: `Yes`
   Pip: incorrectly routes to `get_recurring_activity`.
3. User: `Set the savings goal`
   Pip: asks for target/date.
4. User: `$3000 by December 1st`
   Pip: claims it has a Japan goal set, but no `create_savings_goal` tool ran.
5. User: `How much do I need to hit that goal?`
   Pip: generic fallback, no memory of the goal draft.

Also confirmed:

- Production `main` at `ba10a29` does not contain local fix commit `491c462`.
- `main` currently sends `history` and basic `conversationState`, but no `pendingAction`.
- `main` does not hydrate recent chat history from server-side `agent_chat_turns`.
- `Yes` follow-up routing in `src/lib/agent/ai-agent.ts` scans recent text and can route to recurring bills because previous savings copy mentioned upcoming bills.
- `src/lib/savings-goals/plan.ts` already calculates recommended monthly and daily savings from target/date. Reuse it.

## Product Decisions

- Pip must never say `set`, `created`, `saved`, or `I’ve got a goal set` unless `createSavingsGoal` or `updateSavingsGoal` returns `ok: true`.
- Savings-goal setup has these states:
  - `draft_goal_name`: goal name known, target amount/date missing.
  - `draft_goal_amount`: target amount known, date missing.
  - `draft_goal_deadline`: amount/date known, recommended contribution calculated.
  - `confirm_create_goal`: ready to create with monthly contribution and protection choice.
  - `created`: backend action succeeded and a savings goal card is returned.
- When a user says “Yes,” Pip may only act if there is an explicit pending savings action. It must not infer from arbitrary previous text.
- For “save without thinking,” the recommended path should be: “Create this goal and keep `$X/month` out of Spendable Cash Today?” A plain “yes” to that confirmation creates the goal with `includeInSpendableCash: true`.
- If the user says “track only,” create or update with `includeInSpendableCash: false`.
- If savings-goal flags are disabled, the assistant must not offer goal creation. It can say: “I can plan the monthly amount, but goal tracking is not enabled yet.”

## File Structure

- Modify `src/lib/agent/card-types.ts`
  - Extend `AgentPendingAction` for richer savings-goal drafts.
- Modify `src/lib/agent/response-schema.ts`
  - Validate pending savings draft fields and request `conversationState.pendingAction`.
- Modify `src/components/PipHome.tsx`
  - Send latest authoritative pending action and clear stale pending actions after success/cancel.
- Modify `src/components/PipHome.test.tsx`
  - Cover pending-action carry, clear, and stale-action prevention.
- Modify `src/lib/data/agent-chat-turns.ts`
  - Add server-side recent history loader if not already present after cherry-pick.
- Modify `src/lib/data/agent-chat-turns.test.ts`
  - Verify user/conversation scoping and errored-turn exclusion.
- Modify `src/app/api/agent/route.ts`
  - Accept `conversationState.pendingAction`, hydrate server chat history, pass feature flags, and ensure savings actions are available when enabled.
- Modify `src/app/api/agent/route.test.ts`
  - Cover hydrated history and feature flag routing.
- Modify `src/lib/agent/ai-agent.ts`
  - Add deterministic savings state machine, no-false-persistence language guard, and affirmative follow-up priority.
- Modify `src/lib/agent/ai-agent.test.ts`
  - Add exact Japan transcript regression and disabled-flag behavior.
- Modify `src/lib/agent/conversation-state.ts`
  - Classify savings goal prompts/tools/cards before recurring/forecast/duplicate follow-ups.
- Modify `src/lib/agent/conversation-state.test.ts`
  - Cover “yes” after savings setup and “how much do I need to hit that goal.”
- Modify `scripts/eval-agent.mjs`
  - Preserve `pendingAction` between eval turns and support forbidden copy checks.
- Modify `scripts/eval-agent.test.ts`
  - Add transcript-level pending action tests.
- Modify `tests/e2e/ai-agent.spec.ts`
  - Add phone dogfood savings transcript test.
- Modify `tests/helpers/mock-agent-runtime.ts`
  - Support savings pending actions and goal cards in E2E mocks.
- Modify `.env.example`
  - Document exact feature flag names.
- Modify `docs/savings-implementation-guide.md`
  - Update manual phone QA for savings goals and context.

---

### Task 1: Port Existing Pending-Action And Hydration Fix

**Files:**
- Modify: all files in commit `491c462`
- Verify: `git diff --stat main...HEAD`

- [ ] **Step 1: Create an isolated branch**

Run:

```bash
git checkout main
git pull
git checkout -b codex/pip-savings-context-state-machine
```

Expected:

```text
Switched to a new branch 'codex/pip-savings-context-state-machine'
```

- [ ] **Step 2: Cherry-pick the prior fix commit**

Run:

```bash
git cherry-pick 491c462
```

Expected:

```text
[codex/pip-savings-context-state-machine <new-sha>] fix: repair Pip phone savings flow
```

If there is a conflict in `next-env.d.ts`, keep the current `main` route type reference and do not include generated `.next/dev` churn:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

- [ ] **Step 3: Verify the existing fix landed**

Run:

```bash
rg -n "pendingAction|loadRecentAgentChatHistory|createDeterministicSavingsGoalResponse" src/components/PipHome.tsx src/app/api/agent/route.ts src/lib/data/agent-chat-turns.ts src/lib/agent/ai-agent.ts
```

Expected:

```text
src/components/PipHome.tsx: contains pendingAction in conversationState
src/app/api/agent/route.ts: imports loadRecentAgentChatHistory
src/lib/data/agent-chat-turns.ts: exports loadRecentAgentChatHistory
src/lib/agent/ai-agent.ts: defines createDeterministicSavingsGoalResponse
```

- [ ] **Step 4: Run the carried tests**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/app/api/agent/route.test.ts src/lib/data/agent-chat-turns.test.ts src/components/PipHome.test.tsx scripts/eval-agent.test.ts
```

Expected:

```text
Test Files ... passed
```

- [ ] **Step 5: Commit the port if cherry-pick was not already committed**

Run:

```bash
git status --short
```

If files are staged but not committed, run:

```bash
git commit -m "fix: port Pip phone context repair"
```

Expected:

```text
[codex/pip-savings-context-state-machine <sha>] fix: port Pip phone context repair
```

---

### Task 2: Extend Pending Savings Actions Into A Draft State

**Files:**
- Modify: `src/lib/agent/card-types.ts`
- Modify: `src/lib/agent/response-schema.ts`
- Test: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Write failing type/schema tests through agent behavior**

Add this test to `src/lib/agent/ai-agent.test.ts` near the existing savings-goal tests:

```ts
it("keeps a savings goal draft pending until amount, date, and confirmation are complete", async () => {
  const first = await runAIAgent({
    message: "I need to save for a trip to Japan",
    onboardingState: readyOnboardingState(),
    features: {
      savingsGoals: true,
    },
    actions: createSavingsActions(),
  });

  expect(first.responseMode).toBe("clarify");
  expect(first.pendingAction).toMatchObject({
    type: "create_savings_goal",
    name: "Japan trip",
    missing: ["target_amount"],
  });
  expect(first.message).toMatch(/how much/i);
  expect(first.usedTools).toEqual([]);
});
```

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "keeps a savings goal draft pending"
```

Expected before implementation:

```text
FAIL
```

- [ ] **Step 2: Extend the pending action type**

In `src/lib/agent/card-types.ts`, update `AgentPendingAction` to this complete shape:

```ts
export type SavingsGoalPendingField =
  | "target_amount"
  | "target_date"
  | "monthly_contribution"
  | "protection_choice"
  | "confirmation";

export type AgentPendingAction =
  | {
      type: "create_savings_goal";
      name: string;
      targetAmountCents?: number;
      targetDate?: string;
      startingAmountCents?: number;
      currentAmountCents?: number;
      monthlyContributionCents?: number;
      includeInSpendableCash?: boolean;
      missing?: SavingsGoalPendingField[];
    }
  | {
      type: "set_savings_goal_protection";
      goalId?: string;
      name?: string;
      includeInSpendableCash: boolean;
      monthlyContributionCents?: number;
      missing?: Array<"goal" | "confirmation">;
    };
```

- [ ] **Step 3: Extend the Zod schema**

In `src/lib/agent/response-schema.ts`, replace the `pendingActionSchema` with:

```ts
const savingsGoalPendingFieldSchema = z.enum([
  "target_amount",
  "target_date",
  "monthly_contribution",
  "protection_choice",
  "confirmation",
]);

export const pendingActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_savings_goal"),
    name: z.string().trim().min(1).max(80),
    targetAmountCents: z.number().int().positive().max(100_000_000).optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startingAmountCents: z.number().int().min(0).max(100_000_000).optional(),
    currentAmountCents: z.number().int().min(0).max(100_000_000).optional(),
    monthlyContributionCents: z.number().int().min(0).max(100_000_000).optional(),
    includeInSpendableCash: z.boolean().optional(),
    missing: z.array(savingsGoalPendingFieldSchema).max(5).optional(),
  }),
  z.object({
    type: z.literal("set_savings_goal_protection"),
    goalId: z.string().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    includeInSpendableCash: z.boolean(),
    monthlyContributionCents: z.number().int().min(0).max(100_000_000).optional(),
    missing: z.array(z.enum(["goal", "confirmation"])).max(2).optional(),
  }),
]);
```

- [ ] **Step 4: Run schema-adjacent tests**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/components/PipHome.test.tsx src/app/api/agent/route.test.ts
```

Expected:

```text
Test Files ... passed
```

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/agent/card-types.ts src/lib/agent/response-schema.ts src/lib/agent/ai-agent.test.ts
git commit -m "test: define richer savings pending state"
```

Expected:

```text
[codex/pip-savings-context-state-machine <sha>] test: define richer savings pending state
```

---

### Task 3: Add Deterministic Savings Draft Helpers

**Files:**
- Create: `src/lib/savings-goals/draft.ts`
- Test: `src/lib/savings-goals/draft.test.ts`

- [ ] **Step 1: Add failing draft helper tests**

Create `src/lib/savings-goals/draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  inferSavingsGoalName,
  parseSavingsGoalAmountCents,
  parseSavingsGoalTargetDate,
  buildSavingsGoalDraftPlan,
} from "@/lib/savings-goals/draft";

describe("savings goal draft helpers", () => {
  it("infers named trip goals without generic filler", () => {
    expect(inferSavingsGoalName("I need to save for a trip to Japan")).toBe("Japan trip");
    expect(inferSavingsGoalName("I want to save for a $3000 computer")).toBe("Computer");
    expect(inferSavingsGoalName("I want to save money for a big purchase")).toBe("Big purchase");
  });

  it("parses dollar target amounts", () => {
    expect(parseSavingsGoalAmountCents("I want to save for a $3000 computer")).toBe(300000);
    expect(parseSavingsGoalAmountCents("$3,000 by December 1st")).toBe(300000);
    expect(parseSavingsGoalAmountCents("yes")).toBeNull();
  });

  it("parses natural target dates against the current app year", () => {
    expect(parseSavingsGoalTargetDate("$3000 by December 1st", "2026-06-19")).toBe("2026-12-01");
    expect(parseSavingsGoalTargetDate("$3000 by January 5", "2026-12-20")).toBe("2027-01-05");
    expect(parseSavingsGoalTargetDate("by 2027-04-10", "2026-06-19")).toBe("2027-04-10");
  });

  it("builds recommended monthly and daily savings for a draft", () => {
    const plan = buildSavingsGoalDraftPlan({
      name: "Japan trip",
      targetAmountCents: 300000,
      targetDate: "2026-12-01",
      asOfDate: "2026-06-19",
    });

    expect(plan.remainingCents).toBe(300000);
    expect(plan.recommendedMonthlyContributionCents).toBeGreaterThan(0);
    expect(plan.recommendedDailyContributionCents).toBeGreaterThan(0);
  });
});
```

Run:

```bash
npm test -- src/lib/savings-goals/draft.test.ts
```

Expected:

```text
FAIL src/lib/savings-goals/draft.test.ts
```

- [ ] **Step 2: Implement draft helpers**

Create `src/lib/savings-goals/draft.ts`:

```ts
import { buildSavingsGoalPlan } from "@/lib/savings-goals/plan";
import type { SavingsGoal, SavingsGoalPlan } from "@/lib/savings-goals/types";

const monthNames = new Map([
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["may", 5],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["october", 10],
  ["november", 11],
  ["december", 12],
]);

export function inferSavingsGoalName(message: string): string {
  const normalized = message.trim();
  const tripMatch = normalized.match(/\b(?:trip|vacation)\s+(?:to|for)\s+([a-z][a-z\s'-]{1,40})/i);

  if (tripMatch) {
    return `${titleCase(cleanGoalName(tripMatch[1]))} trip`;
  }

  const saveForMatch = normalized.match(/\bsave(?: money)? for (?:a |an |the )?(?:\$[\d,]+(?:\.\d{1,2})?\s*)?([a-z][a-z\s'-]{1,40})/i);

  if (saveForMatch) {
    return titleCase(cleanGoalName(saveForMatch[1]));
  }

  return "Savings goal";
}

export function parseSavingsGoalAmountCents(message: string): number | null {
  const match = message.match(/\$?\s*(\d[\d,]*)(?:\.(\d{1,2}))?/);

  if (!match) {
    return null;
  }

  const dollars = Number.parseInt(match[1].replace(/,/g, ""), 10);
  const cents = Number.parseInt((match[2] ?? "0").padEnd(2, "0"), 10);

  if (!Number.isFinite(dollars) || dollars <= 0) {
    return null;
  }

  return dollars * 100 + cents;
}

export function parseSavingsGoalTargetDate(message: string, asOfDate: string): string | null {
  const isoMatch = message.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const naturalMatch = message.match(
    /\b(?:by|before|on)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
  );

  if (!naturalMatch) {
    return null;
  }

  const asOf = parseUtcDate(asOfDate);
  const month = monthNames.get(naturalMatch[1].toLowerCase());
  const day = Number.parseInt(naturalMatch[2], 10);

  if (!month || !Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  let year = asOf.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (candidate.getTime() <= asOf.getTime()) {
    year += 1;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function buildSavingsGoalDraftPlan(input: {
  name: string;
  targetAmountCents: number;
  targetDate?: string;
  currentAmountCents?: number;
  monthlyContributionCents?: number;
  includeInSpendableCash?: boolean;
  asOfDate: string;
}): SavingsGoalPlan {
  return buildSavingsGoalPlan(
    {
      id: "draft",
      userId: "draft-user",
      name: input.name,
      targetAmountCents: input.targetAmountCents,
      targetDate: input.targetDate,
      startingAmountCents: input.currentAmountCents ?? 0,
      currentAmountCents: input.currentAmountCents ?? 0,
      monthlyContributionCents: input.monthlyContributionCents ?? 0,
      includeInSpendableCash: input.includeInSpendableCash ?? false,
      status: "active",
      createdAt: `${input.asOfDate}T00:00:00.000Z`,
      updatedAt: `${input.asOfDate}T00:00:00.000Z`,
    } satisfies SavingsGoal,
    input.asOfDate,
  );
}

function cleanGoalName(value: string): string {
  return value
    .replace(/\b(that costs?|by|before|on|goal|purchase|i want|i need|please)\b.*$/i, "")
    .replace(/\$[\d,]+(?:\.\d{1,2})?/g, "")
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function parseUtcDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
```

- [ ] **Step 3: Run helper tests**

Run:

```bash
npm test -- src/lib/savings-goals/draft.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 4: Commit**

Run:

```bash
git add src/lib/savings-goals/draft.ts src/lib/savings-goals/draft.test.ts
git commit -m "feat: add savings goal draft helpers"
```

Expected:

```text
[codex/pip-savings-context-state-machine <sha>] feat: add savings goal draft helpers
```

---

### Task 4: Make Savings Follow-Ups Deterministic Before Generic Routing

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Test: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Add the exact Japan transcript regression**

Add this test to `src/lib/agent/ai-agent.test.ts`:

```ts
it("handles the Japan savings goal transcript without losing context", async () => {
  const actions = createSavingsActions();
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let pendingAction: AgentResponse["pendingAction"] | undefined;

  const first = await runAIAgent({
    message: "I need to save for a trip to Japan",
    onboardingState: readyOnboardingState(),
    history,
    conversationState: pendingAction ? { pendingAction } : undefined,
    features: { savingsGoals: true },
    actions,
  });

  expect(first.usedTools).toEqual([]);
  expect(first.pendingAction).toMatchObject({
    type: "create_savings_goal",
    name: "Japan trip",
    missing: ["target_amount"],
  });
  expect(first.message).toMatch(/how much/i);
  pendingAction = first.pendingAction;
  history.push(
    { role: "user", content: "I need to save for a trip to Japan" },
    { role: "assistant", content: first.message },
  );

  const second = await runAIAgent({
    message: "Yes",
    onboardingState: readyOnboardingState(),
    history,
    conversationState: { pendingAction },
    features: { savingsGoals: true },
    actions,
  });

  expect(second.usedTools).toEqual([]);
  expect(second.pendingAction).toMatchObject({
    type: "create_savings_goal",
    name: "Japan trip",
    missing: ["target_amount"],
  });
  expect(second.message).toMatch(/target amount/i);
  expect(second.message).not.toMatch(/repeat|recurring|bills/i);
  pendingAction = second.pendingAction;
  history.push({ role: "user", content: "Yes" }, { role: "assistant", content: second.message });

  const third = await runAIAgent({
    message: "$3000 by December 1st",
    onboardingState: readyOnboardingState(),
    history,
    conversationState: { pendingAction },
    features: { savingsGoals: true },
    actions,
  });

  expect(third.usedTools).toEqual([]);
  expect(third.pendingAction).toMatchObject({
    type: "create_savings_goal",
    name: "Japan trip",
    targetAmountCents: 300000,
    targetDate: "2026-12-01",
    missing: ["confirmation"],
  });
  expect(third.message).toMatch(/\$3,000/);
  expect(third.message).toMatch(/month|monthly/i);
  expect(third.message).not.toMatch(/\b(set|created|saved)\b/i);
  pendingAction = third.pendingAction;
  history.push(
    { role: "user", content: "$3000 by December 1st" },
    { role: "assistant", content: third.message },
  );

  const fourth = await runAIAgent({
    message: "How much do I need to hit that goal?",
    onboardingState: readyOnboardingState(),
    history,
    conversationState: { pendingAction },
    features: { savingsGoals: true },
    actions,
  });

  expect(fourth.usedTools).toEqual([]);
  expect(fourth.pendingAction).toMatchObject({
    type: "create_savings_goal",
    name: "Japan trip",
    targetAmountCents: 300000,
    targetDate: "2026-12-01",
    missing: ["confirmation"],
  });
  expect(fourth.message).toMatch(/Japan/i);
  expect(fourth.message).toMatch(/month|monthly/i);
  expect(fourth.message).not.toMatch(/not sure|specific purchase|recurring/i);
});
```

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "Japan savings goal transcript"
```

Expected:

```text
FAIL
```

- [ ] **Step 2: Import draft helpers**

In `src/lib/agent/ai-agent.ts`, add:

```ts
import {
  buildSavingsGoalDraftPlan,
  inferSavingsGoalName,
  parseSavingsGoalAmountCents,
  parseSavingsGoalTargetDate,
} from "@/lib/savings-goals/draft";
```

- [ ] **Step 3: Add app-date helper**

In `src/lib/agent/ai-agent.ts`, add near other small helpers:

```ts
function getAgentAsOfDate(): string {
  return new Date().toISOString().slice(0, 10);
}
```

If the repo already has an app-date helper, replace this with that imported helper and keep tests deterministic by mocking the date where existing tests do so.

- [ ] **Step 4: Replace pending savings handler with a draft state machine**

In `src/lib/agent/ai-agent.ts`, replace `createPendingSavingsActionResponse` with:

```ts
async function createPendingSavingsActionResponse(
  input: RunAiAgentInput,
): Promise<AgentResponse | null> {
  const pendingAction = input.conversationState?.pendingAction;

  if (!pendingAction) {
    return null;
  }

  const normalized = normalizePrompt(input.message);

  if (isNegativeFollowUp(normalized)) {
    return agentResponseSchema.parse({
      message: "Okay, I will not change that savings goal.",
      cards: [],
      promptChips: [],
      usedTools: [],
      responseMode: "chat_only",
      audit: {
        toolNames: [],
        usedModel: false,
      },
    });
  }

  if (pendingAction.type === "create_savings_goal") {
    return createSavingsGoalDraftResponse(input, pendingAction, normalized);
  }

  if (pendingAction.type === "set_savings_goal_protection") {
    if (!isAffirmativeFollowUp(normalized)) {
      return null;
    }

    return executeSetSavingsGoalProtection(input, {
      goal_id: pendingAction.goalId,
      name: pendingAction.name,
      include_in_spendable_cash: pendingAction.includeInSpendableCash,
      monthly_contribution_cents: pendingAction.monthlyContributionCents,
    });
  }

  return null;
}
```

Then add this helper below it:

```ts
async function createSavingsGoalDraftResponse(
  input: RunAiAgentInput,
  pendingAction: Extract<AgentPendingAction, { type: "create_savings_goal" }>,
  normalized: string,
): Promise<AgentResponse | null> {
  const message = input.message;
  const amountCents = pendingAction.targetAmountCents ?? parseSavingsGoalAmountCents(message) ?? undefined;
  const targetDate = pendingAction.targetDate ?? parseSavingsGoalTargetDate(message, getAgentAsOfDate()) ?? undefined;
  const name = pendingAction.name || inferSavingsGoalName(message);

  if (!amountCents) {
    return createSavingsGoalClarificationResponse({
      ...pendingAction,
      name,
      missing: ["target_amount"],
    }, "How much is the target amount?");
  }

  if (!targetDate) {
    return createSavingsGoalClarificationResponse({
      ...pendingAction,
      name,
      targetAmountCents: amountCents,
      missing: ["target_date"],
    }, `Got it: ${formatMoney(amountCents)} for ${name}. What date do you want to hit it by?`);
  }

  const draftPlan = buildSavingsGoalDraftPlan({
    name,
    targetAmountCents: amountCents,
    targetDate,
    asOfDate: getAgentAsOfDate(),
  });
  const monthlyContributionCents = draftPlan.recommendedMonthlyContributionCents ?? 0;
  const readyPendingAction: AgentPendingAction = {
    type: "create_savings_goal",
    name,
    targetAmountCents: amountCents,
    targetDate,
    monthlyContributionCents,
    includeInSpendableCash: true,
    missing: ["confirmation"],
  };

  if (isAffirmativeFollowUp(normalized) && pendingAction.missing?.includes("confirmation")) {
    return executeCreateSavingsGoal(input, {
      name,
      target_amount_cents: amountCents,
      target_date: targetDate,
      monthly_contribution_cents: monthlyContributionCents,
      include_in_spendable_cash: true,
    });
  }

  if (/\b(track only|do not keep|don't keep|not out of spendable|without affecting spendable)\b/.test(normalized)) {
    return executeCreateSavingsGoal(input, {
      name,
      target_amount_cents: amountCents,
      target_date: targetDate,
      monthly_contribution_cents: monthlyContributionCents,
      include_in_spendable_cash: false,
    });
  }

  return agentResponseSchema.parse({
    message: `To hit ${formatMoney(amountCents)} for ${name} by ${targetDate}, save about ${formatMoney(monthlyContributionCents)} per month. Want me to create that goal and keep ${formatMoney(monthlyContributionCents)}/month out of Spendable Cash Today?`,
    cards: [],
    promptChips: [],
    usedTools: [],
    responseMode: "clarify",
    pendingAction: readyPendingAction,
    audit: {
      toolNames: [],
      usedModel: false,
    },
  });
}
```

- [ ] **Step 5: Update clarification helper signature**

In `src/lib/agent/ai-agent.ts`, replace `createSavingsGoalClarificationResponse` with:

```ts
function createSavingsGoalClarificationResponse(
  action: Partial<Extract<AgentPendingAction, { type: "create_savings_goal" }>>,
  message?: string,
): AgentResponse {
  const pendingAction: AgentPendingAction = {
    ...action,
    type: "create_savings_goal",
    name: action.name ?? "Savings goal",
    missing: action.missing ?? ["target_amount"],
  };
  const name = pendingAction.name === "Savings goal" ? "this goal" : pendingAction.name;

  return agentResponseSchema.parse({
    message: message ?? `How much do you want to save for ${name}?`,
    cards: [],
    promptChips: [],
    usedTools: [],
    responseMode: "clarify",
    pendingAction,
    audit: {
      toolNames: [],
      usedModel: false,
    },
  });
}
```

- [ ] **Step 6: Ensure new savings prompts create drafts before the model**

In `createDeterministicSavingsGoalResponse`, keep the pending-action check first, then ensure amountless savings prompts produce a draft instead of falling through:

```ts
if (
  !forcedTool &&
  isSavingsGoalCreatePrompt(normalized) &&
  parseSavingsGoalAmountCents(input.message) === null
) {
  return createSavingsGoalClarificationResponse({
    name: inferSavingsGoalName(input.message),
    missing: ["target_amount"],
  });
}
```

- [ ] **Step 7: Run the transcript test**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "Japan savings goal transcript"
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 8: Commit**

Run:

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts
git commit -m "fix: make savings goal follow-ups deterministic"
```

Expected:

```text
[codex/pip-savings-context-state-machine <sha>] fix: make savings goal follow-ups deterministic
```

---

### Task 5: Block False Persistence Claims

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Test: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Add failing no-false-persistence tests**

Add to `src/lib/agent/ai-agent.test.ts`:

```ts
it("does not claim a savings goal was created unless the tool succeeds", async () => {
  const response = await runAIAgent({
    message: "$3000 by December 1st",
    onboardingState: readyOnboardingState(),
    conversationState: {
      pendingAction: {
        type: "create_savings_goal",
        name: "Japan trip",
        missing: ["target_amount"],
      },
    },
    features: { savingsGoals: true },
    actions: {
      ...createSavingsActions(),
      createSavingsGoal: undefined,
    },
  });

  expect(response.usedTools).toEqual([]);
  expect(response.message).toMatch(/want me to create/i);
  expect(response.message).not.toMatch(/\b(created|saved|set up|set)\b/i);
});
```

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "does not claim a savings goal was created"
```

Expected before implementation:

```text
FAIL
```

- [ ] **Step 2: Add a visible copy repair guard**

In `src/lib/agent/ai-agent.ts`, find the visible answer repair function that already handles disallowed language. Add this guard before returning a model message:

```ts
function repairSavingsGoalPersistenceClaim(
  message: string,
  usedTools: string[],
  cards: AgentCard[],
): string {
  const createdSavingsGoal =
    usedTools.includes("create_savings_goal") &&
    cards.some((card) => card.type === "savings_goal_plan");

  if (createdSavingsGoal) {
    return message;
  }

  if (!/\b(goal|savings)\b/i.test(message)) {
    return message;
  }

  return message
    .replace(/\bI(?:'ve| have)?\s+(?:got|set|created|saved|set up)\b/gi, "I can help create")
    .replace(/\bYour goal (?:is|has been) (?:set|created|saved)\b/gi, "Your goal is ready to create");
}
```

Call it inside final response building after tool/card data is known:

```ts
const visibleMessage = repairSavingsGoalPersistenceClaim(
  repairedMessage,
  usedTools,
  cards,
);
```

Use `visibleMessage` in the final `agentResponseSchema.parse` object.

- [ ] **Step 3: Run no-false-persistence tests**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "savings goal"
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 4: Commit**

Run:

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts
git commit -m "fix: prevent false savings goal persistence claims"
```

Expected:

```text
[codex/pip-savings-context-state-machine <sha>] fix: prevent false savings goal persistence claims
```

---

### Task 6: Put Savings Classification Ahead Of Recurring And Duplicate Follow-Ups

**Files:**
- Modify: `src/lib/agent/conversation-state.ts`
- Test: `src/lib/agent/conversation-state.test.ts`

- [ ] **Step 1: Add failing classification tests**

Add to `src/lib/agent/conversation-state.test.ts`:

```ts
it("classifies savings goal follow-ups before recurring activity", () => {
  expect(inferConversationJob("I need to save for a trip to Japan")).toBe("savings_goal");
  expect(inferConversationJob("Set the savings goal")).toBe("savings_goal");
  expect(inferConversationJob("$3000 by December 1st")).toBe("savings_goal");
  expect(inferConversationJob("How much do I need to hit that goal?")).toBe("savings_goal");
});

it("does not classify yes as recurring when the prior job was savings goal", () => {
  expect(inferConversationJob("Yes", [{ role: "assistant", content: "Want me to set a Japan savings goal?" }])).toBe("savings_goal");
});
```

Run:

```bash
npm test -- src/lib/agent/conversation-state.test.ts
```

Expected before implementation:

```text
FAIL
```

- [ ] **Step 2: Add savings prompt detection before recurring**

In `src/lib/agent/conversation-state.ts`, ensure `inferConversationJob` checks savings before recurring/forecast/duplicate:

```ts
if (isSavingsGoalPrompt(normalized, history)) {
  return "savings_goal";
}
```

Add this helper:

```ts
function isSavingsGoalPrompt(
  normalized: string,
  history: AgentHistoryItem[] | undefined,
): boolean {
  if (
    /\b(save|savings|goal|trip|vacation|computer|big purchase|emergency fund)\b/.test(normalized) &&
    !/\b(spendable cash today|why this number|recent spending|transactions?)\b/.test(normalized)
  ) {
    return true;
  }

  if (/\b(hit that goal|that goal|set the goal|create it|track only)\b/.test(normalized)) {
    return true;
  }

  if (/^(yes|yeah|yep|sure|ok|okay)$/.test(normalized)) {
    return (history ?? []).slice(-4).some((item) =>
      /\b(savings goal|save for|goal)\b/i.test(item.content),
    );
  }

  return false;
}
```

- [ ] **Step 3: Run classification tests**

Run:

```bash
npm test -- src/lib/agent/conversation-state.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 4: Commit**

Run:

```bash
git add src/lib/agent/conversation-state.ts src/lib/agent/conversation-state.test.ts
git commit -m "fix: prioritize savings goal conversation state"
```

Expected:

```text
[codex/pip-savings-context-state-machine <sha>] fix: prioritize savings goal conversation state
```

---

### Task 7: Make Route Hydration And Pending State Production-Safe

**Files:**
- Modify: `src/app/api/agent/route.ts`
- Modify: `src/lib/data/agent-chat-turns.ts`
- Test: `src/app/api/agent/route.test.ts`
- Test: `src/lib/data/agent-chat-turns.test.ts`

- [ ] **Step 1: Add route regression for short client history plus server history**

Add to `src/app/api/agent/route.test.ts`:

```ts
it("hydrates recent authenticated chat history for short phone requests", async () => {
  routeMocks.loadRecentAgentChatHistory.mockResolvedValue([
    { role: "user", content: "I need to save for a trip to Japan" },
    { role: "assistant", content: "How much is the target amount?" },
  ]);

  await POST(createAgentRequest({
    message: "$3000 by December 1st",
    conversationId: "web-test",
    history: [],
    conversationState: {
      pendingAction: {
        type: "create_savings_goal",
        name: "Japan trip",
        missing: ["target_amount"],
      },
    },
  }));

  expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      history: [
        { role: "user", content: "I need to save for a trip to Japan" },
        { role: "assistant", content: "How much is the target amount?" },
      ],
      conversationState: expect.objectContaining({
        pendingAction: expect.objectContaining({
          type: "create_savings_goal",
          name: "Japan trip",
        }),
      }),
      features: {
        savingsGoals: true,
      },
    }),
  );
});
```

Run:

```bash
npm test -- src/app/api/agent/route.test.ts -t "hydrates recent authenticated chat history"
```

Expected before implementation if Task 1 was not ported correctly:

```text
FAIL
```

- [ ] **Step 2: Confirm request schema accepts pending action**

In `src/app/api/agent/route.ts`, ensure request schema contains:

```ts
pendingAction: pendingActionSchema.optional(),
```

inside `conversationState`.

- [ ] **Step 3: Confirm route passes feature flags**

In `src/app/api/agent/route.ts`, ensure `runAIAgent` input contains:

```ts
features: {
  savingsGoals: isSavingsGoalsEnabled(),
},
```

- [ ] **Step 4: Confirm hydrated history does not override full client history**

Ensure `prepareAgentHistory` has this behavior:

```ts
if (
  input.requestKind === "prompt_chips" ||
  !routeContext.eventContext ||
  (clientHistory?.length ?? 0) >= 8
) {
  return { history: clientHistory };
}
```

- [ ] **Step 5: Run route and data tests**

Run:

```bash
npm test -- src/app/api/agent/route.test.ts src/lib/data/agent-chat-turns.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 6: Commit**

Run:

```bash
git add src/app/api/agent/route.ts src/app/api/agent/route.test.ts src/lib/data/agent-chat-turns.ts src/lib/data/agent-chat-turns.test.ts
git commit -m "fix: hydrate savings chat context on agent route"
```

Expected:

```text
[codex/pip-savings-context-state-machine <sha>] fix: hydrate savings chat context on agent route
```

---

### Task 8: Update Eval And Phone E2E Transcript Coverage

**Files:**
- Modify: `scripts/eval-agent.mjs`
- Modify: `scripts/eval-agent.test.ts`
- Modify: `tests/e2e/ai-agent.spec.ts`
- Modify: `tests/helpers/mock-agent-runtime.ts`

- [ ] **Step 1: Add eval case for Japan transcript**

In `scripts/eval-agent.mjs`, add this case to the eval case list:

```js
{
  id: "phone-savings-japan-context",
  transcript: [
    {
      user: "I need to save for a trip to Japan",
      expectedPendingActionType: "create_savings_goal",
      forbiddenTextPatterns: ["recurring", "repeat item", "bills coming up"],
    },
    {
      user: "Yes",
      expectedPendingActionType: "create_savings_goal",
      forbiddenTextPatterns: ["recurring", "repeat item", "bills coming up", "same answer still applies"],
    },
    {
      user: "$3000 by December 1st",
      expectedPendingActionType: "create_savings_goal",
      forbiddenTextPatterns: ["I've got", "goal set", "created", "saved"],
    },
    {
      user: "How much do I need to hit that goal?",
      expectedPendingActionType: "create_savings_goal",
      forbiddenTextPatterns: ["not sure", "specific purchase", "recurring"],
    },
  ],
}
```

- [ ] **Step 2: Ensure eval carries pending action between turns**

In `scripts/eval-agent.mjs`, keep a local variable:

```js
let pendingAction;
```

When sending each request body:

```js
conversationState: pendingAction
  ? {
      pendingAction,
    }
  : undefined,
```

After each response:

```js
pendingAction = response.pendingAction;
```

- [ ] **Step 3: Add eval test assertion**

In `scripts/eval-agent.test.ts`, add:

```ts
it("carries savings pending actions through transcript evals", async () => {
  const result = await runEvalCase({
    id: "phone-savings-japan-context",
    transcript: [
      { user: "I need to save for a trip to Japan", expectedPendingActionType: "create_savings_goal" },
      { user: "Yes", expectedPendingActionType: "create_savings_goal" },
      { user: "$3000 by December 1st", expectedPendingActionType: "create_savings_goal" },
      { user: "How much do I need to hit that goal?", expectedPendingActionType: "create_savings_goal" },
    ],
  });

  expect(result.status).toBe("passed");
});
```

- [ ] **Step 4: Add E2E phone transcript**

In `tests/e2e/ai-agent.spec.ts`, add:

```ts
test("phone dogfood Japan savings goal flow keeps context through amount question", async ({ page }) => {
  await page.goto("/app?scenario=default");
  await sendAgentMessage(page, "I need to save for a trip to Japan");
  await expect(page.getByText(/how much/i)).toBeVisible();

  await sendAgentMessage(page, "Yes");
  await expect(page.getByText(/target amount/i)).toBeVisible();
  await expect(page.getByText(/recurring|repeat item|bills coming up/i)).toHaveCount(0);

  await sendAgentMessage(page, "$3000 by December 1st");
  await expect(page.getByText(/\$3,000/i)).toBeVisible();
  await expect(page.getByText(/month|monthly/i)).toBeVisible();
  await expect(page.getByText(/created|goal set|saved/i)).toHaveCount(0);

  await sendAgentMessage(page, "How much do I need to hit that goal?");
  await expect(page.getByText(/Japan/i)).toBeVisible();
  await expect(page.getByText(/month|monthly/i)).toBeVisible();
  await expect(page.getByText(/not sure|specific purchase|recurring/i)).toHaveCount(0);
});
```

- [ ] **Step 5: Run eval and E2E tests**

Run:

```bash
npm test -- scripts/eval-agent.test.ts
npx playwright test tests/e2e/ai-agent.spec.ts -g "Japan savings goal"
```

Expected:

```text
scripts/eval-agent.test.ts ... passed
1 passed
```

- [ ] **Step 6: Commit**

Run:

```bash
git add scripts/eval-agent.mjs scripts/eval-agent.test.ts tests/e2e/ai-agent.spec.ts tests/helpers/mock-agent-runtime.ts
git commit -m "test: cover phone savings goal transcript"
```

Expected:

```text
[codex/pip-savings-context-state-machine <sha>] test: cover phone savings goal transcript
```

---

### Task 9: Fix Production Feature Flag Names And Documentation

**Files:**
- Modify: `.env.example`
- Modify: `docs/savings-implementation-guide.md`

- [ ] **Step 1: Update `.env.example`**

Ensure `.env.example` contains exactly these public/server flag names:

```bash
PIP_SAVINGS_GOALS_ENABLED=false
NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=false
PIP_MONTHLY_SAVINGS_LABEL=Monthly Savings
```

Do not use `NEXT_PUBLIC_PIP_SAVINGS_GOALS_ENABLED`; the client reads `NEXT_PUBLIC_SAVINGS_GOALS_ENABLED`.

- [ ] **Step 2: Add production flag runbook**

In `docs/savings-implementation-guide.md`, add:

```md
## Production Savings Flags

Savings goal creation requires both server and client flags:

```bash
netlify env:set PIP_SAVINGS_GOALS_ENABLED true --context production --scope functions
netlify env:set NEXT_PUBLIC_SAVINGS_GOALS_ENABLED true --context production --scope builds
netlify env:set PIP_MONTHLY_SAVINGS_LABEL "Monthly Savings" --context production --scope functions
```

After changing build-scoped `NEXT_PUBLIC_*` flags, redeploy production. Runtime-only function flags still need a redeploy when the value is read during a Next build or bundled server initialization.

Verify:

```bash
netlify env:get PIP_SAVINGS_GOALS_ENABLED --context production --scope functions
netlify env:get NEXT_PUBLIC_SAVINGS_GOALS_ENABLED --context production --scope builds
```

Expected:

```text
true
true
```
```

- [ ] **Step 3: Add phone QA transcript**

In `docs/savings-implementation-guide.md`, add:

```md
## Phone QA: Savings Goal Context

Run this exact transcript on a signed-in phone build:

1. `I need to save for a trip to Japan`
   - Expected: Pip asks for target amount.
   - Not allowed: recurring bills, repeat items, purchase test fallback.
2. `Yes`
   - Expected: Pip stays in the Japan savings goal draft and asks for the missing target amount.
   - Not allowed: `That same answer still applies`, recurring bills.
3. `$3000 by December 1st`
   - Expected: Pip says the needed monthly amount and asks whether to create the goal.
   - Not allowed: claiming the goal is already created.
4. `How much do I need to hit that goal?`
   - Expected: Pip repeats the Japan monthly amount from the draft.
   - Not allowed: `I’m not sure`, purchase fallback, recurring bills.
5. `Yes`
   - Expected: Pip creates the goal, returns a savings goal card, and says the monthly amount is kept out of Spendable Cash Today.
```

- [ ] **Step 4: Commit**

Run:

```bash
git add .env.example docs/savings-implementation-guide.md
git commit -m "docs: document savings goal production flags"
```

Expected:

```text
[codex/pip-savings-context-state-machine <sha>] docs: document savings goal production flags
```

---

### Task 10: Full Verification And Deployment Readiness

**Files:**
- Verify all changed files

- [ ] **Step 1: Run focused suites**

Run:

```bash
npm test -- src/lib/savings-goals/draft.test.ts src/lib/agent/ai-agent.test.ts src/lib/agent/conversation-state.test.ts src/app/api/agent/route.test.ts src/lib/data/agent-chat-turns.test.ts src/components/PipHome.test.tsx scripts/eval-agent.test.ts
```

Expected:

```text
Test Files ... passed
```

- [ ] **Step 2: Run full unit suite**

Run:

```bash
npm test
```

Expected:

```text
Test Files  123 passed | 1 skipped
Tests       792+ passed | 1 skipped
```

The exact pass count may increase after adding tests.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
Finished TypeScript
Route (app)
```

If `next-env.d.ts` flips to `.next/dev/types/routes.d.ts`, restore it to:

```ts
import "./.next/types/routes.d.ts";
```

- [ ] **Step 4: Run phone E2E slice**

Run:

```bash
npx playwright test tests/e2e/ai-agent.spec.ts -g "Japan savings goal"
```

Expected:

```text
1 passed
```

- [ ] **Step 5: Run diff checks**

Run:

```bash
git diff --check
git status --short
```

Expected:

```text
git diff --check exits 0
git status --short shows only intentional changed files before final commit, or no output after commit
```

- [ ] **Step 6: Final commit**

Run:

```bash
git add -A
git commit -m "fix: stabilize Pip savings goal conversations"
```

Expected:

```text
[codex/pip-savings-context-state-machine <sha>] fix: stabilize Pip savings goal conversations
```

- [ ] **Step 7: Push branch and create PR**

Run:

```bash
git push -u origin codex/pip-savings-context-state-machine
```

Expected:

```text
branch 'codex/pip-savings-context-state-machine' set up to track 'origin/codex/pip-savings-context-state-machine'
```

Create a PR with this body:

```md
## Summary
- Ports the pending-action and chat-history hydration repair into the deployable branch.
- Adds deterministic savings-goal draft state for phone follow-ups like Japan trip -> yes -> target/date -> amount question.
- Blocks false "goal created" language unless the backend action succeeds.

## Test Plan
- [ ] npm test
- [ ] npm run build
- [ ] npx playwright test tests/e2e/ai-agent.spec.ts -g "Japan savings goal"

## Manual Phone QA
- [ ] Run the Japan savings transcript from docs/savings-implementation-guide.md.
- [ ] Confirm "Yes" does not route to recurring bills.
- [ ] Confirm Pip does not claim a goal exists before the savings goal card appears.
```

---

## Deployment Steps After Merge

Run only after the PR is merged into `main`.

- [ ] **Step 1: Set production feature flags**

Run:

```bash
netlify env:set PIP_SAVINGS_GOALS_ENABLED true --context production --scope functions
netlify env:set NEXT_PUBLIC_SAVINGS_GOALS_ENABLED true --context production --scope builds
netlify env:set PIP_MONTHLY_SAVINGS_LABEL "Monthly Savings" --context production --scope functions
```

Expected:

```text
Set environment variable
```

- [ ] **Step 2: Trigger production deploy**

Run:

```bash
git checkout main
git pull
git push origin main
```

Expected:

```text
Everything up-to-date
```

If Netlify does not auto-deploy from Git, trigger deploy through Netlify UI or CLI:

```bash
netlify deploy --build --prod
```

Expected:

```text
Deploy is live
```

- [ ] **Step 3: Query latest production chat after manual QA**

Run:

```bash
TOKEN="$(netlify env:get PIP_OPERATOR_TOKEN --context production --scope functions)"
curl -fsS -H "Authorization: Bearer $TOKEN" "https://spendwithpip.com/api/operator/agent-chats?limit=20" > /tmp/pip-prod-agent-chats-after-savings-fix.json
```

Expected:

```text
/tmp/pip-prod-agent-chats-after-savings-fix.json exists and contains source "supabase"
```

- [ ] **Step 4: Confirm no forbidden transcript failures**

Run:

```bash
node - <<'NODE'
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync("/tmp/pip-prod-agent-chats-after-savings-fix.json", "utf8"));
const text = JSON.stringify(payload.turns ?? []);
const forbidden = [/not sure what you mean/i, /same answer still applies/i, /clear repeat item/i, /Bank A|Bank B/i];
for (const pattern of forbidden) {
  if (pattern.test(text)) {
    throw new Error(`Forbidden production chat text found: ${pattern}`);
  }
}
console.log("Production savings chat transcript check passed.");
NODE
```

Expected:

```text
Production savings chat transcript check passed.
```

---

## Self-Review

**Spec coverage:** This plan covers the verified failures: missing branch deployment, lost multi-turn savings context, bad `Yes` routing, false goal-created copy, missing production flags, and missing transcript-level tests.

**Placeholder scan:** No `TBD`, `TODO`, “similar to,” or open-ended implementation steps are used. Code snippets define exact types, helper functions, test bodies, and commands.

**Type consistency:** `AgentPendingAction`, `pendingActionSchema`, route `conversationState.pendingAction`, client `pendingAction`, and tests all use camelCase pending-action fields. Tool execution still converts to snake_case tool args only at the `executeCreateSavingsGoal` boundary.
