# Pip Global Model-First Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Pip so every normal visible Pip response is written by the LLM, while deterministic code owns tools, cards, money facts, write safety, and validation.

**Architecture:** Replace the current mixed deterministic/chatbot flow with a model-first agent boundary. Deterministic routing remains as invisible safety rails for tool selection, state, confirmations, and validation, but it never writes normal visible Pip copy. The rebuild is global and all-at-once: savings, Spendable Cash, transactions, bills, refresh, account management, opening bubble, and prompt chips must all satisfy the same model-first contract before release.

**Tech Stack:** Next.js App Router, TypeScript, React, Supabase, OpenAI Agents SDK with `gpt-5-nano`, Zod schemas, Vitest, existing agent eval scripts, Codex in-app Browser `iab` for browser proof.

---

## Product Decisions

1. Every normal visible Pip chat bubble must be LLM-written.
2. The model owns voice, warmth, phrasing, clarifying questions, and follow-up guidance.
3. Deterministic code owns math, tools, cards, facts, state, write safety, and output validation.
4. Deterministic routing may force tools, block unsafe actions, attach state, require confirmations, and reject invalid model answers.
5. Deterministic routing must not write normal visible copy.
6. Savings goals always use preview-before-save.
7. Savings goal setup is usually multi-turn. Pip must handle that naturally.
8. Minimum savings preview inputs are goal name, target amount, and either target date or monthly contribution.
9. Savings previews must show current Spendable Cash Today impact and usual-plan impact when possible.
10. Pip should softly push back when a savings plan would leave the user too tight.
11. Structured pending action state is stored by the app; the LLM talks from that state.
12. Tools should be called early for context; write tools require confirmation.
13. Contextual confirmation is enough for ordinary writes only when a clear preview/action is pending.
14. Exact confirmation remains required for sensitive irreversible actions such as delete data and remove institution.
15. Known personal-finance intents may not return unsupported no-tool answers.
16. General education and emotional-support replies may be no-tool if they do not claim facts about the user's finances.
17. Cards are deterministic and tool-owned.
18. Opening bubble and prompt chips are part of the model-first surface.
19. Thinking latency is acceptable and desired for normal visible replies.
20. Normal complex replies may be 4-6 short sentences; no essays unless the user asks.

## Non-Conversation Exceptions

These may remain deterministic because they are UI/system text, not Pip's normal conversation:

- Loading/thinking UI.
- Silent internal `Ready.` messages that are never displayed.
- Hard API outage fallbacks.
- Validation errors before a request reaches the agent.
- Exact confirmation strings such as `DELETE DATA` and `REMOVE CHASE`.
- Legal/support/settings static screen labels.
- Button labels, field labels, report controls, and accessibility labels.

## Optimization Pass

This plan was optimized with the `plan-optimizer` skill after the initial draft.

Rubric:

- Product fidelity to Tyler's decisions: 20 points
  - High quality means the plan enforces global model-first behavior all at once, preview-before-save savings goals, warm LLM voice, and deterministic facts/cards.
- Repo-specific executability: 15 points
  - High quality means exact files, concrete tests, concrete commands, and no vague "wire this later" instructions.
- Safety and correctness boundaries: 15 points
  - High quality means the model has conversational freedom but cannot invent personal finances, bypass tools, or mutate data without confirmation.
- Atomic rollout and rollback: 10 points
  - High quality means no phased product delivery, but still has a release gate and a previous-deploy rollback path that does not preserve the robot brain in new code.
- Test and eval strength: 20 points
  - High quality means unit tests, route tests, model-first policy tests, browser proof, and a 120+ case 95/100 gate that actually scores required behaviors.
- Maintainability and blast-radius control: 10 points
  - High quality means the implementation removes robot-brain response paths without mixing unrelated money-engine changes into this plan.
- Handoff clarity: 10 points
  - High quality means subagents can take individual tasks without rediscovering decisions.

Score trajectory:

```text
Initial draft: 86/100
Round 1: 93/100
Round 2: 97/100
Round 3: 97/100 plateau
```

Substantive improvements made during optimization:

1. Added atomic rollout rules and a previous-deploy rollback path so "all at once" does not become an unsafe production bet.
2. Added missing gate-scoring checks for ordered tool sequences, pending action type, and deterministic-copy violations.
3. Tightened opening-bubble, pending-action, and evaluator instructions so they are executable instead of advisory.

## Atomic Rollout Rules

This is a global rebuild, not a phased product release. The implementation may be split into tasks and commits for engineering safety, but the product may not ship a savings-only or partial model-first experience.

Rules:

- Local tests and browser proof run against the model-first code path.
- Production release happens only after all acceptance criteria pass.
- There are no per-feature model-first flags for savings, prompt chips, opening bubble, transactions, or bills.
- Do not preserve the old deterministic visible response path behind a new runtime flag. That would keep the robot brain alive.
- Rollback is a deploy operation: revert the merge commit or restore the previous known-good Netlify deploy.
- Before release, record the previous production deploy ID and current `main` commit SHA in the final verification notes.
- If rollback is needed, restore the previous deploy first, then open a follow-up bugfix branch from the failed model-first commit with the failing eval/browser evidence attached.

## Current Failure Contract

These are the behaviors this plan must eliminate:

- A normal visible response with `audit.usedModel: false`.
- A known personal-finance prompt returning broad chat without a tool, card, or structured clarification.
- Savings goal creation before preview and confirmation.
- Savings goal creation with `monthlyContributionCents: 0` when a target date or monthly contribution was needed.
- Canned bridge text replacing model copy.
- Opening bubble copy generated by deterministic product strings when model config is available.
- Prompt chips generated primarily by deterministic fallback when model config is available.
- "Yes" confirming nothing, confirming stale context, or routing from arbitrary history instead of a pending action.

## File Structure

Create:

- `src/lib/agent/model-first-policy.ts`
  - Central model-first validation helpers.
  - Rejects normal visible responses with `usedModel: false`.
  - Rejects known personal-finance intents that produce no tool, no card, and no valid structured clarification.
  - Defines allowed deterministic exception modes.

- `src/lib/agent/model-first-policy.test.ts`
  - Unit tests for allowed exceptions and rejected old chatbot responses.

- `src/lib/agent/pending-actions.ts`
  - Structured pending action helpers for savings, ordinary writes, sensitive confirmations, and cancellation.
  - No visible copy.

- `src/lib/agent/pending-actions.test.ts`
  - Tests contextual confirmation, stale confirmation rejection, and exact confirmation requirements.

- `src/lib/savings-goals/preview.ts`
  - Pure deterministic savings preview math using current snapshot and goal draft.
  - Builds before/after Spendable Cash Today, usual daily room, monthly contribution, warning level, and soft-pushback facts.

- `src/lib/savings-goals/preview.test.ts`
  - Tests target-date, monthly-contribution, too-tight, missing-input, and no-invention cases.

- `tests/fixtures/model-first-agent-gate.mjs`
  - 100+ model-first dogfood cases across savings, Spendable Cash, bills, transactions, accounts, settings, refresh, opening bubble, and prompt chips.

- `scripts/eval-model-first-agent.mjs`
  - Sequential gate that runs the fixture, scores each case out of 100, and fails below 95.

- `scripts/eval-model-first-agent.test.ts`
  - Tests scoring, failure output, and state carry across multi-turn cases.

Modify:

- `src/lib/agent/ai-agent.ts`
  - Remove deterministic visible response shortcuts.
  - Always run the model for normal visible responses.
  - Keep forced tools as invisible guardrails.
  - Add `preview_savings_goal` tool.
  - Make create/update/delete/remove tools confirmation-aware.
  - Add retry/repair when known finance intent returns unsupported no-tool answer.

- `src/lib/agent/savings-goal-flow.ts`
  - Retire as a visible response writer.
  - Move reusable amount/date/name parsing into `pending-actions.ts`.
  - Delete or stop exporting any function that returns `AgentResponse` for normal savings turns.

- `src/lib/agent/answer-composer.ts`
  - Remove canned card-backed messages.
  - Keep only final sanitization, repetition checks that do not replace copy with fixed strings, and outage fallback helpers.

- `src/lib/agent/response-schema.ts`
  - Increase visible message budget.
  - Expand `requestKind` to include `opening_bubble`.
  - Expand pending action schema for preview-confirm flows.
  - Add savings preview card schema.

- `src/lib/agent/card-types.ts`
  - Add `savings_goal_preview` card.
  - Replace savings-only pending state with generic pending action types.

- `src/lib/agent/visible-response-guard.ts`
  - Keep safety/accuracy repairs.
  - Remove style constraints that force tiny robotic answers.
  - Enforce no unsupported financial claims without cards/tools.

- `src/lib/agent/prompt-chip-selection.ts`
  - Treat model-generated chips as primary.
  - Keep deterministic sanitizer/filter only.
  - Remove deterministic fallback from normal model-configured prompt-chip refresh except outage/setup cases.

- `src/lib/pip/opening-bubble-planner.ts`
  - Convert from visible-message planner to opening-bubble context planner.
  - It ranks facts but does not write final bubble copy.

- `src/components/pip-home/agent-session.ts`
  - Carry richer pending action state.
  - Support `requestKind: "opening_bubble"`.

- `src/components/PipHome.tsx`
  - Ask the agent for the opening bubble copy/chips.
  - Keep number visible while the agent/model works.

- `src/app/api/agent/route.ts`
  - Accept `opening_bubble`.
  - Pass structured opening context and pending action state to the agent.
  - Add `previewSavingsGoal` action.
  - Remove route/action result messages from normal visible copy.

- `src/lib/savings-goals/cards.ts`
  - Build deterministic preview cards and summary rows.

- `src/lib/agent/ai-agent.test.ts`
  - Rewrite old deterministic expectations to model-first expectations.

- `src/lib/agent/answer-composer.test.ts`
  - Remove expectations for canned visible text.

- `src/lib/pip/opening-bubble-planner.test.ts`
  - Verify ranked context output, not final visible message copy.

- `src/components/PipHome.test.tsx`
  - Verify opening bubble request, pending UI, and fallback behavior.

- `scripts/eval-agent.mjs`
  - Carry pending actions and support model-first invariant checks.

- `tests/fixtures/agent-major-capabilities.mjs`
  - Update expected behavior to reject deterministic visible messages for normal turns.

---

## Task 0: Baseline, Branch Hygiene, And Rollback Anchor

**Files:**
- Read: repository status and deploy metadata only.
- Modify: none.

- [ ] **Step 1: Record the current branch and dirty worktree**

Run:

```bash
git branch --show-current
git status --short
```

Expected:

```text
Branch is main or the user-approved implementation branch.
Dirty files are listed and classified as either pre-existing or part of this implementation.
```

If the branch is not the user-approved implementation branch, stop and switch only after confirming with the user.

- [ ] **Step 2: Record the rollback commit**

Run:

```bash
git rev-parse HEAD
git rev-parse origin/main
```

Expected:

```text
Two commit SHAs are printed and saved in the implementation notes.
```

- [ ] **Step 3: Record the current production deploy if Netlify is linked**

Run:

```bash
npx netlify status
npx netlify deploys:list --json
```

Expected:

```text
The linked site is visible and the latest production deploy ID is recorded.
```

If the deploy list command is unavailable in this Netlify CLI version, run:

```bash
npx netlify --help
```

Then use the current CLI's deploy-list command. Do not skip recording the production rollback target before a production release.

- [ ] **Step 4: Run baseline tests that should already pass**

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/answer-composer.test.ts src/app/api/agent/route.test.ts
```

Expected:

```text
Record pass/fail status. Pre-existing unrelated failures must be written down before implementation starts.
```

- [ ] **Step 5: Commit**

No commit is required for this read-only baseline task.

---

## Task 1: Add The Model-First Policy Gate

**Files:**
- Create: `src/lib/agent/model-first-policy.ts`
- Create: `src/lib/agent/model-first-policy.test.ts`
- Modify: `src/lib/agent/ai-agent.ts`

- [ ] **Step 1: Write failing tests for the policy**

Create `src/lib/agent/model-first-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertModelFirstResponse, isAllowedDeterministicVisibleException } from "@/lib/agent/model-first-policy";
import type { AgentResponse } from "@/lib/agent/card-types";

function response(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    message: "How much do you want to save for Computer?",
    cards: [],
    promptChips: [],
    usedTools: [],
    responseMode: "clarify",
    audit: {
      toolNames: [],
      usedModel: false,
    },
    ...overrides,
  };
}

describe("model-first policy", () => {
  it("rejects deterministic normal visible Pip copy", () => {
    expect(() =>
      assertModelFirstResponse({
        requestKind: "chat",
        message: "I want to save for a computer",
        response: response(),
      }),
    ).toThrow(/normal visible Pip responses must be model-written/i);
  });

  it("allows deterministic hard outage fallbacks", () => {
    expect(isAllowedDeterministicVisibleException({
      requestKind: "chat",
      responseMode: "chat_only",
      exception: "hard_outage",
    })).toBe(true);
  });

  it("allows silent prompt-chip refresh messages only when not displayed", () => {
    expect(isAllowedDeterministicVisibleException({
      requestKind: "prompt_chips",
      responseMode: "chat_only",
      exception: "silent_internal",
    })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- src/lib/agent/model-first-policy.test.ts
```

Expected:

```text
FAIL src/lib/agent/model-first-policy.test.ts
Cannot find module '@/lib/agent/model-first-policy'
```

- [ ] **Step 3: Implement the policy helper**

Create `src/lib/agent/model-first-policy.ts`:

```ts
import type { AgentResponse } from "@/lib/agent/card-types";

export type ModelFirstRequestKind = "chat" | "prompt_chips" | "opening_bubble";

export type DeterministicVisibleException =
  | "hard_outage"
  | "request_validation"
  | "silent_internal"
  | "exact_confirmation_string"
  | "static_ui";

export function isAllowedDeterministicVisibleException(input: {
  requestKind: ModelFirstRequestKind;
  responseMode: AgentResponse["responseMode"];
  exception?: DeterministicVisibleException;
}): boolean {
  if (input.exception === "hard_outage" || input.exception === "request_validation") {
    return true;
  }

  if (input.exception === "exact_confirmation_string" || input.exception === "static_ui") {
    return true;
  }

  return input.exception === "silent_internal" && input.requestKind === "prompt_chips";
}

export function assertModelFirstResponse(input: {
  requestKind: ModelFirstRequestKind;
  message: string;
  response: AgentResponse;
  exception?: DeterministicVisibleException;
}) {
  if (input.response.audit.usedModel) {
    return;
  }

  if (isAllowedDeterministicVisibleException({
    requestKind: input.requestKind,
    responseMode: input.response.responseMode,
    exception: input.exception,
  })) {
    return;
  }

  throw new Error(
    `Model-first violation: normal visible Pip responses must be model-written. message="${input.message.slice(0, 80)}"`,
  );
}
```

- [ ] **Step 4: Run the policy test**

Run:

```bash
npm test -- src/lib/agent/model-first-policy.test.ts
```

Expected:

```text
PASS src/lib/agent/model-first-policy.test.ts
```

- [ ] **Step 5: Add the production wrapper but leave it inactive until deterministic branches are removed**

In `src/lib/agent/ai-agent.ts`, import:

```ts
import { assertModelFirstResponse } from "@/lib/agent/model-first-policy";
```

Add a local wrapper near `runAIAgent`:

```ts
function returnModelFirstResponse(input: RunAiAgentInput, response: AgentResponse): AgentResponse {
  assertModelFirstResponse({
    requestKind: input.requestKind ?? "chat",
    message: input.message,
    response,
  });

  return response;
}
```

Do not call this wrapper from `runAIAgent` yet. Task 6 activates it after deterministic visible response branches are removed. This avoids a half-migrated state where the guard fails before the model-first path exists.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/model-first-policy.ts src/lib/agent/model-first-policy.test.ts src/lib/agent/ai-agent.ts
git commit -m "test: add model-first agent policy gate"
```

---

## Task 2: Expand Request Kinds And Message Budget

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/lib/agent/response-schema.ts`
- Modify: `src/app/api/agent/route.ts`
- Modify: `src/components/pip-home/agent-session.ts`
- Test: `src/lib/agent/ai-agent.test.ts`
- Test: `src/app/api/agent/route.test.ts`

- [ ] **Step 1: Add failing schema tests**

Add to `src/lib/agent/ai-agent.test.ts` near schema tests:

```ts
it("allows warm multi-sentence model replies without forcing tiny bridge copy", () => {
  const message = [
    "I can help with that.",
    "A $5,000 computer goal needs a timeline before I can show the monthly amount.",
    "Once I have that, I can show how it changes Spendable Cash Today and whether it looks comfortable.",
    "When would you like to have it saved?",
  ].join(" ");

  expect(() =>
    agentResponseSchema.parse({
      message,
      cards: [],
      promptChips: [],
      usedTools: [],
      responseMode: "clarify",
      audit: {
        toolNames: [],
        usedModel: true,
        model: "gpt-5-nano",
      },
    }),
  ).not.toThrow();
});
```

Add to `src/app/api/agent/route.test.ts`:

```ts
it("accepts opening bubble agent requests", async () => {
  vi.stubEnv("PIP_SUPABASE_MODE", "off");
  routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
  routeMocks.runAIAgent.mockResolvedValue(createAgentResponse({
    message: "I checked your latest activity and today still looks usable.",
    responseMode: "chat_only",
  }));

  const response = await POST(jsonRequest({
    message: "Create the opening bubble for this Pip screen.",
    requestKind: "opening_bubble",
  }));

  expect(response.status).toBe(200);
  expect(routeMocks.runAIAgent).toHaveBeenCalledWith(expect.objectContaining({
    requestKind: "opening_bubble",
  }));
});
```

- [ ] **Step 2: Run the failing tests**

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "allows warm multi-sentence"
npm test -- src/app/api/agent/route.test.ts -t "accepts opening bubble"
```

Expected:

```text
FAIL because message length and requestKind do not allow the target behavior
```

- [ ] **Step 3: Update request kind and visible message budget**

In `src/lib/agent/ai-agent.ts`, change:

```ts
requestKind?: "chat" | "prompt_chips";
```

to:

```ts
requestKind?: "chat" | "prompt_chips" | "opening_bubble";
```

In `src/lib/agent/response-schema.ts`, set:

```ts
export const agentMessageMaxChars = 900;
export const agentModelMessageMaxChars = 1400;
```

In `src/app/api/agent/route.ts`, change the request schema:

```ts
requestKind: z.enum(["chat", "prompt_chips", "opening_bubble"]).optional(),
```

In `src/components/pip-home/agent-session.ts`, change:

```ts
export type AgentRequestKind = "chat" | "prompt_chips" | "opening_bubble";
```

- [ ] **Step 4: Run the tests**

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "allows warm multi-sentence"
npm test -- src/app/api/agent/route.test.ts -t "accepts opening bubble"
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/response-schema.ts src/app/api/agent/route.ts src/components/pip-home/agent-session.ts src/lib/agent/ai-agent.test.ts src/app/api/agent/route.test.ts
git commit -m "feat: allow model-first opening bubble responses"
```

---

## Task 3: Replace Savings Write-First Flow With Preview-First State

**Files:**
- Create: `src/lib/savings-goals/preview.ts`
- Create: `src/lib/savings-goals/preview.test.ts`
- Modify: `src/lib/agent/card-types.ts`
- Modify: `src/lib/agent/response-schema.ts`
- Modify: `src/lib/savings-goals/cards.ts`

- [ ] **Step 1: Write failing preview math tests**

Create `src/lib/savings-goals/preview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSavingsGoalPreview } from "@/lib/savings-goals/preview";
import { healthyPipSnapshot } from "@/lib/fake-data";

describe("savings goal preview", () => {
  it("calculates a target-date monthly plan and Spendable Cash Today impact", () => {
    const preview = buildSavingsGoalPreview({
      snapshot: healthyPipSnapshot,
      draft: {
        name: "Computer",
        targetAmountCents: 500000,
        targetDate: "2026-12-20",
        currentAmountCents: 0,
      },
      asOfDate: "2026-06-20",
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      throw new Error("Expected preview");
    }
    expect(preview.name).toBe("Computer");
    expect(preview.monthlyContributionCents).toBeGreaterThan(0);
    expect(preview.afterSpendableCashTodayCents).toBeLessThan(preview.beforeSpendableCashTodayCents);
    expect(preview.warningLevel).toMatch(/none|watch|tight|shortfall/);
  });

  it("requires either target date or monthly contribution", () => {
    const preview = buildSavingsGoalPreview({
      snapshot: healthyPipSnapshot,
      draft: {
        name: "Computer",
        targetAmountCents: 500000,
      },
      asOfDate: "2026-06-20",
    });

    expect(preview).toEqual({
      ok: false,
      missing: ["target_date_or_monthly_contribution"],
    });
  });
});
```

- [ ] **Step 2: Run failing preview tests**

```bash
npm test -- src/lib/savings-goals/preview.test.ts
```

Expected:

```text
FAIL Cannot find module '@/lib/savings-goals/preview'
```

- [ ] **Step 3: Implement preview types and math**

Create `src/lib/savings-goals/preview.ts`:

```ts
import { calculatePipCash } from "@/lib/pip-cash/engine";
import { getDisplayedSpendableCashTodayCents } from "@/lib/pip-cash/spendable-cash-today";
import { buildSavingsGoalPlan } from "@/lib/savings-goals/plan";
import type { FinancialSnapshot } from "@/lib/types";
import type { SavingsGoal } from "@/lib/savings-goals/types";

export type SavingsGoalPreviewDraft = {
  name: string;
  targetAmountCents?: number;
  targetDate?: string;
  currentAmountCents?: number;
  monthlyContributionCents?: number;
};

export type SavingsGoalPreviewResult =
  | {
      ok: true;
      name: string;
      targetAmountCents: number;
      currentAmountCents: number;
      remainingCents: number;
      targetDate?: string;
      monthlyContributionCents: number;
      recommendedMonthlyContributionCents?: number;
      beforeSpendableCashTodayCents: number;
      afterSpendableCashTodayCents: number;
      deltaSpendableCashTodayCents: number;
      usualDailyRoomBeforeCents?: number;
      usualDailyRoomAfterCents?: number;
      warningLevel: "none" | "watch" | "tight" | "shortfall";
      pushbackReason?: string;
    }
  | {
      ok: false;
      missing: Array<"goal_name" | "target_amount" | "target_date_or_monthly_contribution">;
    };

export function buildSavingsGoalPreview(input: {
  snapshot: FinancialSnapshot;
  draft: SavingsGoalPreviewDraft;
  asOfDate: string;
}): SavingsGoalPreviewResult {
  const missing: Array<"goal_name" | "target_amount" | "target_date_or_monthly_contribution"> = [];
  const name = input.draft.name.trim();

  if (!name) {
    missing.push("goal_name");
  }
  if (!input.draft.targetAmountCents) {
    missing.push("target_amount");
  }
  if (!input.draft.targetDate && !input.draft.monthlyContributionCents) {
    missing.push("target_date_or_monthly_contribution");
  }
  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const currentAmountCents = input.draft.currentAmountCents ?? 0;
  const baseResult = calculatePipCash(input.snapshot);
  const beforeSpendableCashTodayCents = getDisplayedSpendableCashTodayCents(baseResult);
  const goal: SavingsGoal = {
    id: "preview-goal",
    userId: "preview-user",
    name,
    targetAmountCents: input.draft.targetAmountCents,
    targetDate: input.draft.targetDate,
    startingAmountCents: currentAmountCents,
    currentAmountCents,
    monthlyContributionCents: input.draft.monthlyContributionCents ?? 0,
    includeInSpendableCash: true,
    status: "active",
    createdAt: `${input.asOfDate}T00:00:00.000Z`,
    updatedAt: `${input.asOfDate}T00:00:00.000Z`,
  };
  const plan = buildSavingsGoalPlan(goal, input.asOfDate);
  const monthlyContributionCents = goal.monthlyContributionCents || plan.recommendedMonthlyContributionCents || 0;
  const previewResult = calculatePipCash({
    ...input.snapshot,
    savingsGoals: [
      ...(input.snapshot.savingsGoals ?? []),
      {
        ...goal,
        monthlyContributionCents,
      },
    ],
  });
  const afterSpendableCashTodayCents = getDisplayedSpendableCashTodayCents(previewResult);
  const usualDailyRoomBeforeCents = baseResult.spendableCashToday?.baselineDailyAllowanceCents;
  const usualDailyRoomAfterCents = previewResult.spendableCashToday?.baselineDailyAllowanceCents;
  const warningLevel = getWarningLevel({
    afterSpendableCashTodayCents,
    usualDailyRoomAfterCents,
  });

  return {
    ok: true,
    name,
    targetAmountCents: goal.targetAmountCents,
    currentAmountCents,
    remainingCents: plan.remainingCents,
    ...(goal.targetDate ? { targetDate: goal.targetDate } : {}),
    monthlyContributionCents,
    ...(plan.recommendedMonthlyContributionCents === undefined ? {} : {
      recommendedMonthlyContributionCents: plan.recommendedMonthlyContributionCents,
    }),
    beforeSpendableCashTodayCents,
    afterSpendableCashTodayCents,
    deltaSpendableCashTodayCents: afterSpendableCashTodayCents - beforeSpendableCashTodayCents,
    ...(usualDailyRoomBeforeCents === undefined ? {} : { usualDailyRoomBeforeCents }),
    ...(usualDailyRoomAfterCents === undefined ? {} : { usualDailyRoomAfterCents }),
    warningLevel,
    ...(warningLevel === "none" ? {} : {
      pushbackReason: getPushbackReason(warningLevel),
    }),
  };
}

function getWarningLevel(input: {
  afterSpendableCashTodayCents: number;
  usualDailyRoomAfterCents?: number;
}): "none" | "watch" | "tight" | "shortfall" {
  if (input.afterSpendableCashTodayCents <= 0) {
    return "shortfall";
  }
  if (input.afterSpendableCashTodayCents <= 1000) {
    return "tight";
  }
  if (input.usualDailyRoomAfterCents !== undefined && input.usualDailyRoomAfterCents <= 2000) {
    return "watch";
  }
  return "none";
}

function getPushbackReason(level: "watch" | "tight" | "shortfall") {
  if (level === "shortfall") {
    return "This goal would push Spendable Cash Today to zero or below.";
  }
  if (level === "tight") {
    return "This goal would leave very little room today.";
  }
  return "This goal would make the usual daily room look tight.";
}
```

- [ ] **Step 4: Add preview card type**

In `src/lib/agent/card-types.ts`, add to `AgentCard`:

```ts
  | {
      type: "savings_goal_preview";
      title: string;
      name: string;
      targetAmountCents: number;
      currentAmountCents: number;
      remainingCents: number;
      targetDate?: string;
      monthlyContributionCents: number;
      recommendedMonthlyContributionCents?: number;
      beforeSpendableCashTodayCents: number;
      afterSpendableCashTodayCents: number;
      deltaSpendableCashTodayCents: number;
      usualDailyRoomBeforeCents?: number;
      usualDailyRoomAfterCents?: number;
      warningLevel: "none" | "watch" | "tight" | "shortfall";
      pushbackReason?: string;
      summary: string;
    }
```

Mirror this schema in `src/lib/agent/response-schema.ts`.

- [ ] **Step 5: Add card builder**

In `src/lib/savings-goals/cards.ts`, add:

```ts
import type { SavingsGoalPreviewResult } from "@/lib/savings-goals/preview";

export function buildSavingsGoalPreviewCard(preview: Extract<SavingsGoalPreviewResult, { ok: true }>): AgentCard {
  return {
    type: "savings_goal_preview",
    title: "Savings Goal Preview",
    name: preview.name,
    targetAmountCents: preview.targetAmountCents,
    currentAmountCents: preview.currentAmountCents,
    remainingCents: preview.remainingCents,
    ...(preview.targetDate ? { targetDate: preview.targetDate } : {}),
    monthlyContributionCents: preview.monthlyContributionCents,
    ...(preview.recommendedMonthlyContributionCents === undefined ? {} : {
      recommendedMonthlyContributionCents: preview.recommendedMonthlyContributionCents,
    }),
    beforeSpendableCashTodayCents: preview.beforeSpendableCashTodayCents,
    afterSpendableCashTodayCents: preview.afterSpendableCashTodayCents,
    deltaSpendableCashTodayCents: preview.deltaSpendableCashTodayCents,
    ...(preview.usualDailyRoomBeforeCents === undefined ? {} : {
      usualDailyRoomBeforeCents: preview.usualDailyRoomBeforeCents,
    }),
    ...(preview.usualDailyRoomAfterCents === undefined ? {} : {
      usualDailyRoomAfterCents: preview.usualDailyRoomAfterCents,
    }),
    warningLevel: preview.warningLevel,
    ...(preview.pushbackReason ? { pushbackReason: preview.pushbackReason } : {}),
    summary: `${formatMoney(preview.monthlyContributionCents)}/month for ${preview.name}.`,
  };
}
```

- [ ] **Step 6: Run preview tests**

```bash
npm test -- src/lib/savings-goals/preview.test.ts src/lib/savings-goals/cards.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/savings-goals/preview.ts src/lib/savings-goals/preview.test.ts src/lib/agent/card-types.ts src/lib/agent/response-schema.ts src/lib/savings-goals/cards.ts src/lib/savings-goals/cards.test.ts
git commit -m "feat: add savings goal preview facts"
```

---

## Task 4: Add Pending Action State Without Visible Copy

**Files:**
- Create: `src/lib/agent/pending-actions.ts`
- Create: `src/lib/agent/pending-actions.test.ts`
- Modify: `src/lib/agent/card-types.ts`
- Modify: `src/lib/agent/response-schema.ts`

- [ ] **Step 1: Write pending action tests**

Create `src/lib/agent/pending-actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getPendingActionConfirmation,
  isContextualConfirmation,
  mergeSavingsGoalDraft,
} from "@/lib/agent/pending-actions";

describe("pending actions", () => {
  it("merges savings goal details without writing visible copy", () => {
    expect(mergeSavingsGoalDraft({
      message: "$5,000 by December 20",
      previous: {
        type: "create_savings_goal",
        status: "collecting",
        name: "Computer",
        missing: ["target_amount", "target_date_or_monthly_contribution"],
      },
      asOfDate: "2026-06-20",
    })).toMatchObject({
      type: "create_savings_goal",
      status: "ready_to_preview",
      name: "Computer",
      targetAmountCents: 500000,
      targetDate: "2026-12-20",
      missing: [],
    });
  });

  it("accepts contextual confirmation only for a clear pending preview", () => {
    expect(isContextualConfirmation("yes", {
      type: "create_savings_goal",
      status: "awaiting_confirmation",
      name: "Computer",
      targetAmountCents: 500000,
      targetDate: "2026-12-20",
      monthlyContributionCents: 83334,
      confirmationToken: "create-savings-goal",
      missing: [],
    })).toBe(true);
  });

  it("requires exact confirmation for delete data", () => {
    expect(getPendingActionConfirmation({
      type: "delete_user_data",
      status: "awaiting_exact_confirmation",
      confirmationText: "DELETE DATA",
    })).toEqual({
      mode: "exact",
      text: "DELETE DATA",
    });
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm test -- src/lib/agent/pending-actions.test.ts
```

Expected:

```text
FAIL Cannot find module '@/lib/agent/pending-actions'
```

- [ ] **Step 3: Add generic pending action types**

In `src/lib/agent/card-types.ts`, replace the current savings-only `AgentPendingAction` union with:

```ts
export type AgentPendingAction =
  | {
      type: "create_savings_goal";
      status: "collecting" | "ready_to_preview" | "awaiting_confirmation";
      name: string;
      targetAmountCents?: number;
      targetDate?: string;
      startingAmountCents?: number;
      currentAmountCents?: number;
      monthlyContributionCents?: number;
      includeInSpendableCash: true;
      missing: Array<"goal_name" | "target_amount" | "target_date_or_monthly_contribution">;
      confirmationToken?: "create-savings-goal";
    }
  | {
      type: "update_savings_goal";
      status: "awaiting_confirmation";
      goalId?: string;
      name?: string;
      targetAmountCents?: number;
      targetDate?: string | null;
      currentAmountCents?: number;
      monthlyContributionCents?: number;
      includeInSpendableCash?: true;
      confirmationToken: "update-savings-goal";
    }
  | {
      type: "correct_recurring_obligation";
      status: "awaiting_confirmation";
      merchantName: string;
      treatment: "bill" | "not_bill";
      expectedAmountCents?: number;
      expectedDay?: number;
      confirmationToken: "correct-recurring-obligation";
    }
  | {
      type: "remove_institution";
      status: "awaiting_exact_confirmation";
      institutionId?: string;
      institutionName?: string;
      confirmationText: string;
    }
  | {
      type: "delete_user_data";
      status: "awaiting_exact_confirmation";
      confirmationText: "DELETE DATA";
    };
```

Update `pendingActionSchema` in `src/lib/agent/response-schema.ts` with the same union shape.

- [ ] **Step 4: Implement pending helpers**

Create `src/lib/agent/pending-actions.ts`:

```ts
import type { AgentPendingAction } from "@/lib/agent/card-types";

export function mergeSavingsGoalDraft(input: {
  message: string;
  previous?: Extract<AgentPendingAction, { type: "create_savings_goal" }>;
  asOfDate: string;
}): Extract<AgentPendingAction, { type: "create_savings_goal" }> {
  const targetAmountCents = extractAmountCents(input.message) ?? input.previous?.targetAmountCents;
  const targetDate = extractTargetDate(input.message, input.asOfDate) ?? input.previous?.targetDate;
  const name = input.previous?.name ?? extractGoalName(input.message) ?? "Savings goal";
  const missing: Array<"goal_name" | "target_amount" | "target_date_or_monthly_contribution"> = [];

  if (!name || name === "Savings goal") {
    missing.push("goal_name");
  }
  if (!targetAmountCents) {
    missing.push("target_amount");
  }
  if (!targetDate && !input.previous?.monthlyContributionCents) {
    missing.push("target_date_or_monthly_contribution");
  }

  return {
    type: "create_savings_goal",
    status: missing.length === 0 ? "ready_to_preview" : "collecting",
    name,
    ...(targetAmountCents ? { targetAmountCents } : {}),
    ...(targetDate ? { targetDate } : {}),
    ...(input.previous?.startingAmountCents === undefined ? {} : {
      startingAmountCents: input.previous.startingAmountCents,
    }),
    ...(input.previous?.currentAmountCents === undefined ? {} : {
      currentAmountCents: input.previous.currentAmountCents,
    }),
    ...(input.previous?.monthlyContributionCents === undefined ? {} : {
      monthlyContributionCents: input.previous.monthlyContributionCents,
    }),
    includeInSpendableCash: true,
    missing,
  };
}

export function isContextualConfirmation(message: string, pending?: AgentPendingAction): boolean {
  if (!pending || pending.status !== "awaiting_confirmation") {
    return false;
  }

  return /\b(yes|yep|yeah|do it|save it|create it|that works|use that plan|sounds good|go ahead)\b/i.test(message.trim());
}

export function getPendingActionConfirmation(pending: AgentPendingAction):
  | { mode: "contextual"; token: string }
  | { mode: "exact"; text: string } {
  if (pending.type === "delete_user_data" || pending.type === "remove_institution") {
    return {
      mode: "exact",
      text: pending.confirmationText,
    };
  }

  return {
    mode: "contextual",
    token: pending.confirmationToken ?? pending.type,
  };
}

function extractAmountCents(message: string): number | undefined {
  const match = /\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/.exec(message);

  if (!match) {
    return undefined;
  }

  const dollars = Number(match[1].replace(/,/g, ""));
  const cents = Number((match[2] ?? "0").padEnd(2, "0"));

  return dollars * 100 + cents;
}

function extractGoalName(message: string): string | undefined {
  const normalized = message.toLowerCase();

  if (normalized.includes("computer")) {
    return "Computer";
  }
  if (normalized.includes("emergency fund")) {
    return "Emergency fund";
  }
  if (normalized.includes("japan")) {
    return "Japan";
  }
  if (normalized.includes("trip")) {
    return "Trip";
  }

  return undefined;
}

function extractTargetDate(message: string, asOfDate: string): string | undefined {
  const decemberMatch = /\b(?:december|dec)\s+(\d{1,2})\b/i.exec(message);

  if (!decemberMatch) {
    return undefined;
  }

  const year = Number(asOfDate.slice(0, 4));
  const monthDay = `12-${String(Number(decemberMatch[1])).padStart(2, "0")}`;

  return `${year}-${monthDay}`;
}
```

Move the richer date parsing currently used by `savings-goal-flow.ts` into `pending-actions.ts` in the same task. The implementation must support these inputs because existing savings tests already cover them:

```text
in six months
in 365 days
by 12/20/2026
by December 20, 2026
by end of 2026
by December 2026
```

- [ ] **Step 5: Run pending tests**

```bash
npm test -- src/lib/agent/pending-actions.test.ts src/lib/agent/ai-agent.test.ts -t "savings"
```

Expected:

```text
PASS src/lib/agent/pending-actions.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/pending-actions.ts src/lib/agent/pending-actions.test.ts src/lib/agent/card-types.ts src/lib/agent/response-schema.ts
git commit -m "feat: add structured pending action state"
```

---

## Task 5: Make Savings Goal Tools Preview-First

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/app/api/agent/route.ts`
- Modify: `src/lib/agent/savings-goal-flow.ts`
- Modify: `src/lib/savings-goals/cards.ts`
- Modify: `tests/helpers/mock-agent-runtime.ts`
- Test: `src/lib/agent/ai-agent.test.ts`
- Test: `src/app/api/agent/route.test.ts`

- [ ] **Step 1: Add failing savings model-first tests**

In `src/lib/agent/ai-agent.test.ts`, replace the tests that expect `usedModel: false` for savings setup with:

```ts
it("uses the model to ask for a savings goal timeline instead of deterministic copy", async () => {
  const response = await runAIAgent(
    {
      message: "I want to save for a $5,000 computer",
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
      actions: createSavingsGoalActions(),
    },
    createMockModelClient(),
  );

  expect(response.audit.usedModel).toBe(true);
  expect(response.usedTools).toEqual([]);
  expect(response.responseMode).toBe("clarify");
  expect(response.pendingAction).toMatchObject({
    type: "create_savings_goal",
    name: "Computer",
    targetAmountCents: 500000,
    missing: ["target_date_or_monthly_contribution"],
  });
  expect(response.message).toMatch(/timeline|when|monthly|Spendable Cash Today/i);
});

it("previews a savings goal before creating it", async () => {
  const response = await runAIAgent(
    {
      message: "in six months",
      snapshot: fakeSnapshot,
      conversationState: {
        pendingAction: {
          type: "create_savings_goal",
          status: "collecting",
          name: "Computer",
          targetAmountCents: 500000,
          includeInSpendableCash: true,
          missing: ["target_date_or_monthly_contribution"],
        },
      },
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
      actions: createSavingsGoalActions(),
    },
    createMockModelClient(),
  );

  expect(response.audit.usedModel).toBe(true);
  expect(response.usedTools).toContain("preview_savings_goal");
  expect(response.usedTools).not.toContain("create_savings_goal");
  expect(response.cards).toEqual([
    expect.objectContaining({
      type: "savings_goal_preview",
      name: "Computer",
    }),
  ]);
  expect(response.pendingAction).toMatchObject({
    type: "create_savings_goal",
    status: "awaiting_confirmation",
    confirmationToken: "create-savings-goal",
  });
});
```

These tests use the existing `createMockModelClient()` helper from `tests/helpers/mock-agent-runtime.ts`. That helper must be updated in Step 3 to simulate the model-first savings contract; do not invent a separate `modelRuntime({ toolCalls })` helper because runtime injection bypasses the real OpenAI tool loop.

- [ ] **Step 2: Run failing savings tests**

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "savings goal"
```

Expected:

```text
FAIL because savings is still handled by deterministic flow or create_savings_goal directly
```

- [ ] **Step 3: Update the mock runtime to model the new savings contract**

In `tests/helpers/mock-agent-runtime.ts`, update the savings branch so it returns model-first preview behavior:

```ts
if (isSavingsGoalPrompt(normalized)) {
  if (!hasSavingsGoalTimeline(normalized) && amountCents !== null) {
    return baseResponse(input, {
      message: "I can help with that. I need a timeline before I can show the monthly amount and how it changes your Spendable Cash Today. When would you like to have it saved?",
      responseMode: "clarify",
      pendingAction: {
        type: "create_savings_goal",
        status: "collecting",
        name: inferMockSavingsGoalName(normalized),
        targetAmountCents: amountCents,
        includeInSpendableCash: true,
        missing: ["target_date_or_monthly_contribution"],
      },
    });
  }

  return savingsGoalPreviewResponse(input, amountCents ?? 500000);
}
```

Add helper:

```ts
function savingsGoalPreviewResponse(input: RunAiAgentInput, targetAmountCents: number): AgentResponse {
  return baseResponse(input, {
    message: "That plan would set aside money each month and lower your Spendable Cash Today. I would preview the tradeoff before saving it.",
    usedTools: ["preview_savings_goal"],
    responseMode: "show_card",
    pendingAction: {
      type: "create_savings_goal",
      status: "awaiting_confirmation",
      name: "Computer",
      targetAmountCents,
      targetDate: "2026-12-20",
      monthlyContributionCents: 83334,
      includeInSpendableCash: true,
      missing: [],
      confirmationToken: "create-savings-goal",
    },
    cards: [
      {
        type: "savings_goal_preview",
        title: "Savings Goal Preview",
        name: "Computer",
        targetAmountCents,
        currentAmountCents: 0,
        remainingCents: targetAmountCents,
        targetDate: "2026-12-20",
        monthlyContributionCents: 83334,
        beforeSpendableCashTodayCents: 4300,
        afterSpendableCashTodayCents: 1560,
        deltaSpendableCashTodayCents: -2740,
        usualDailyRoomBeforeCents: 7100,
        usualDailyRoomAfterCents: 4360,
        warningLevel: "watch",
        summary: "$833/month for Computer.",
      },
    ],
  });
}
```

The mock helper is only for unit contracts. The real OpenAI tool loop is verified by the model-first eval and browser proof in Task 14.

- [ ] **Step 4: Add `previewSavingsGoal` action to agent action types**

In `src/lib/agent/ai-agent.ts`, add to `PipAgentActions`:

```ts
previewSavingsGoal?: (input: {
  name: string;
  targetAmountCents: number;
  targetDate?: string;
  currentAmountCents?: number;
  monthlyContributionCents?: number;
}) => Promise<PipAgentActionResult>;
```

Add Zod parameters:

```ts
const previewSavingsGoalParameters = z.object({
  name: z.string().trim().min(1).max(80),
  target_amount_cents: z.number().int().positive().max(100_000_000),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  current_amount_cents: z.number().int().min(0).max(100_000_000).optional(),
  monthly_contribution_cents: z.number().int().min(0).max(100_000_000).optional(),
});
```

- [ ] **Step 5: Add `preview_savings_goal` tool before create/update tools**

In `createPipAgent`, add:

```ts
tool<typeof previewSavingsGoalParameters, PipAgentContext>({
  name: "preview_savings_goal",
  description:
    "Preview a savings goal before saving it. Use after the user gives a goal name, target amount, and either a target date or monthly contribution. This tool shows monthly amount and Spendable Cash Today impact. Never create a savings goal before this preview.",
  parameters: previewSavingsGoalParameters,
  strict: true,
  async execute(input, runContext) {
    const context = getToolContext(runContext);
    const toolInput = getToolInput(context, "preview_savings_goal", input, previewSavingsGoalParameters);
    recordTool(context, "preview_savings_goal");

    if (!context.actions?.previewSavingsGoal) {
      return {
        ok: false,
        status: "savings_goal_preview_unavailable",
        message: "Savings goal preview is not available in this environment.",
      };
    }

    return applyActionResult(context, await context.actions.previewSavingsGoal({
      name: toolInput.name,
      targetAmountCents: toolInput.target_amount_cents,
      targetDate: toolInput.target_date,
      currentAmountCents: toolInput.current_amount_cents,
      monthlyContributionCents: toolInput.monthly_contribution_cents,
    }));
  },
})
```

- [ ] **Step 6: Make create/update tools require confirmed pending state**

Before executing `create_savings_goal`, add:

```ts
if (!isConfirmedPendingCreateSavingsGoal(context, toolInput)) {
  return {
    ok: false,
    status: "savings_goal_confirmation_required",
    message: "Preview the savings goal and get confirmation before creating it.",
  };
}
```

Implement `isConfirmedPendingCreateSavingsGoal` near agent helpers:

```ts
function isConfirmedPendingCreateSavingsGoal(
  context: PipAgentContext,
  toolInput: z.infer<typeof createSavingsGoalParameters>,
): boolean {
  const pending = context.conversationState.pendingAction;

  return pending?.type === "create_savings_goal" &&
    pending.status === "awaiting_confirmation" &&
    pending.confirmationToken === "create-savings-goal" &&
    pending.name.toLowerCase() === toolInput.name.toLowerCase() &&
    pending.targetAmountCents === toolInput.target_amount_cents;
}
```

- [ ] **Step 7: Implement route action for preview**

In `src/app/api/agent/route.ts`, import:

```ts
import { buildSavingsGoalPreview } from "@/lib/savings-goals/preview";
import { buildSavingsGoalPreviewCard } from "@/lib/savings-goals/cards";
import { getCurrentAppDate } from "@/lib/date/app-date";
```

Add to `createAgentActions`:

```ts
async previewSavingsGoal(goalInput) {
  if (!input.snapshot) {
    return {
      ok: false,
      status: "missing_financial_snapshot",
      message: "I need connected financial data before previewing the Spendable Cash impact.",
    };
  }

  const preview = buildSavingsGoalPreview({
    snapshot: input.snapshot,
    draft: {
      name: goalInput.name,
      targetAmountCents: goalInput.targetAmountCents,
      targetDate: goalInput.targetDate,
      currentAmountCents: goalInput.currentAmountCents,
      monthlyContributionCents: goalInput.monthlyContributionCents,
    },
    asOfDate: getCurrentAppDate(),
  });

  if (!preview.ok) {
    return {
      ok: false,
      status: "savings_goal_preview_missing_fields",
      message: `Missing: ${preview.missing.join(", ")}`,
    };
  }

  return {
    ok: true,
    status: "savings_goal_preview_ready",
    cards: [buildSavingsGoalPreviewCard(preview)],
  };
},
```

- [ ] **Step 8: Retire deterministic savings visible flow**

In `src/lib/agent/ai-agent.ts`, remove this branch from `runAIAgent`:

```ts
const deterministicSavingsGoalResponse = ...
if (deterministicSavingsGoalResponse) {
  return deterministicSavingsGoalResponse;
}
```

Keep parser exports only if forced routing needs them. `src/lib/agent/savings-goal-flow.ts` must not return `AgentResponse` for normal visible turns after this task.

- [ ] **Step 9: Run savings tests**

```bash
npm test -- src/lib/savings-goals/preview.test.ts src/lib/agent/ai-agent.test.ts -t "savings goal" src/app/api/agent/route.test.ts -t "savings"
```

Expected:

```text
PASS for model-first savings tests
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/agent/ai-agent.ts src/app/api/agent/route.ts src/lib/agent/savings-goal-flow.ts src/lib/savings-goals/cards.ts tests/helpers/mock-agent-runtime.ts src/lib/agent/ai-agent.test.ts src/app/api/agent/route.test.ts
git commit -m "feat: make savings goals model-first and preview-first"
```

---

## Task 6: Remove Deterministic Visible Response Shortcuts Globally

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/lib/agent/answer-composer.ts`
- Modify: `src/lib/agent/answer-composer.test.ts`
- Modify: `src/lib/agent/tool-runner.ts`
- Test: `src/lib/agent/model-first-policy.test.ts`
- Test: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Add regression tests for old canned responses**

Add to `src/lib/agent/ai-agent.test.ts`:

```ts
it.each([
  "Why this number?",
  "Show recent transactions",
  "Show recurring bills",
  "Refresh my connected data",
  "Show connected accounts",
  "Can I spend $50?",
])("returns model-written copy for %s", async (message) => {
  const response = await runAIAgent(
    {
      message,
      snapshot: fakeSnapshot,
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
    },
    createMockModelClient(),
  );

  expect(response.audit.usedModel).toBe(true);
  expect(response.message).not.toMatch(/That same answer still applies|I pulled the math|I found recent charges|I mapped the next/i);
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "returns model-written copy"
```

Expected:

```text
FAIL while deterministic branches or composer overrides still write copy
```

- [ ] **Step 3: Remove deterministic no-tool/trust/connected-account visible returns**

In `src/lib/agent/ai-agent.ts`, remove or restrict these branches so they do not return normal visible responses:

```ts
createDeterministicNoToolResponse(input)
createDeterministicTrustResponse(input)
createDeterministicConnectedAccountsResponse(input)
createDeterministicBillCorrectionResponse(input)
createDeterministicUnavailableActionResponse(input)
```

Allowed replacements:

```ts
// Keep helpers that build forcedTool, context, or tool results.
// Do not return AgentResponse from these helpers for normal visible chat.
```

For trust/account/bill flows, rely on forced tools inside `createPipAgent`, then let the model write the final output.

- [ ] **Step 4: Remove canned answer-composer card bridges**

In `src/lib/agent/answer-composer.ts`, replace `composeCardBackedAnswer` with:

```ts
function composeCardBackedAnswer(): { message: string; answerPatternId: string } | null {
  return null;
}
```

Then simplify call sites so `modelMessage` remains the candidate. Do not keep deterministic purchase simulation copy; the model must write purchase replies from the card/tool result.

- [ ] **Step 5: Keep only outage fallback copy**

In `createFallbackFinalMessage`, keep fallback for model/tool failures, but tag the response as a hard outage exception where it is returned. Normal successful tool-backed flows must not call this function.

- [ ] **Step 6: Activate the model-first policy wrapper**

In `runAIAgent`, wrap every normal successful return:

```ts
return returnModelFirstResponse(input, response);
```

Allowed deterministic exceptions must pass an explicit exception:

```ts
return returnModelFirstResponse(input, response, "hard_outage");
```

Update the helper signature:

```ts
function returnModelFirstResponse(
  input: RunAiAgentInput,
  response: AgentResponse,
  exception?: DeterministicVisibleException,
): AgentResponse {
  assertModelFirstResponse({
    requestKind: input.requestKind ?? "chat",
    message: input.message,
    response,
    exception,
  });

  return response;
}
```

- [ ] **Step 7: Run global agent tests**

```bash
npm test -- src/lib/agent/model-first-policy.test.ts src/lib/agent/ai-agent.test.ts src/lib/agent/answer-composer.test.ts src/lib/agent/visible-response-guard.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/answer-composer.ts src/lib/agent/answer-composer.test.ts src/lib/agent/tool-runner.ts src/lib/agent/ai-agent.test.ts
git commit -m "refactor: remove deterministic visible agent copy"
```

---

## Task 7: Enforce Tool Use For Known Personal-Finance Intents

**Files:**
- Modify: `src/lib/agent/model-first-policy.ts`
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/lib/agent/intent-router.ts`
- Test: `src/lib/agent/model-first-policy.test.ts`
- Test: `src/lib/agent/intent-router.test.ts`
- Test: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Add failing no-tool rejection tests**

Add to `src/lib/agent/model-first-policy.test.ts`:

```ts
it("rejects no-tool answers for known personal finance intents", () => {
  expect(() =>
    assertModelFirstResponse({
      requestKind: "chat",
      message: "New computer at $5000",
      response: response({
        message: "I can set that up if you want.",
        audit: {
          toolNames: [],
          usedModel: true,
          model: "gpt-5-nano",
        },
      }),
    }),
  ).toThrow(/known finance intent needs a tool or structured clarification/i);
});
```

- [ ] **Step 2: Implement finance-intent rejection**

In `src/lib/agent/model-first-policy.ts`, add:

```ts
const knownFinanceIntentPattern =
  /\b(spend|buy|purchase|transaction|charge|bill|subscription|recurring|savings? goal|save for|account|bank|card|balance|refresh|sync|delete my data|remove .+ bank)\b/i;

const validClarificationPattern =
  /\b(how much|what amount|which account|which goal|when would|what date|by when|do you want me to|want me to save|confirm|type delete data|type remove)\b/i;

export function assertKnownFinanceIntentIsGrounded(input: {
  message: string;
  response: AgentResponse;
}) {
  if (!knownFinanceIntentPattern.test(input.message)) {
    return;
  }

  const hasGrounding = input.response.usedTools.length > 0 ||
    input.response.cards.length > 0 ||
    input.response.pendingAction !== undefined ||
    validClarificationPattern.test(input.response.message);

  if (!hasGrounding) {
    throw new Error("Model-first violation: known finance intent needs a tool or structured clarification.");
  }
}
```

Call it from `assertModelFirstResponse` after the `usedModel` check.

- [ ] **Step 3: Add model retry repair**

In `src/lib/agent/ai-agent.ts`, when `assertModelFirstResponse` throws this known-finance error, retry the model once with repair:

```ts
repair = {
  reason: "unsupported_promise",
  detail: "The previous answer did not use a required tool or structured clarification for a known personal-finance intent. Call the appropriate tool or ask one concrete missing-information question.",
};
```

Use the existing two-attempt repair loop rather than adding a new retry mechanism.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/agent/model-first-policy.test.ts src/lib/agent/ai-agent.test.ts -t "no-tool"
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/model-first-policy.ts src/lib/agent/model-first-policy.test.ts src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts
git commit -m "feat: reject ungrounded finance answers"
```

---

## Task 8: Make Opening Bubble Model-Written

**Files:**
- Modify: `src/lib/pip/opening-bubble-planner.ts`
- Modify: `src/lib/pip/opening-bubble-planner.test.ts`
- Modify: `src/components/PipHome.tsx`
- Modify: `src/components/PipHome.test.tsx`
- Modify: `src/components/pip-home/agent-session.ts`
- Test: `src/components/pip-home/agent-session.test.ts`

- [ ] **Step 1: Change opening planner tests from copy to context**

Replace visible-message assertions in `src/lib/pip/opening-bubble-planner.test.ts` with context assertions:

```ts
it("prioritizes refresh status without writing final copy", () => {
  expect(planOpeningBubbleContext({
    refresh: {
      status: "checking",
      message: "I am checking for new transactions now. This number may move.",
    },
    missingData: {
      message: "I am missing a card.",
    },
  })).toMatchObject({
    priority: "refresh",
    facts: [
      expect.objectContaining({
        id: "refresh-checking",
        tone: "info",
      }),
    ],
  });
});
```

- [ ] **Step 2: Refactor planner output**

In `src/lib/pip/opening-bubble-planner.ts`, rename the planner and return facts:

```ts
export type OpeningBubbleFact = {
  id: string;
  label: string;
  detail: string;
  tone: "info" | "positive" | "warning" | "urgent";
};

export type OpeningBubbleContextPlan = {
  priority: OpeningBubblePriority;
  facts: OpeningBubbleFact[];
  chips: PromptChip[];
  shouldMarkReactionSeen?: boolean;
};

export function planOpeningBubbleContext(input: OpeningBubbleInput): OpeningBubbleContextPlan {
  if (input.refresh?.status === "checking") {
    return {
      priority: "refresh",
      facts: [
        {
          id: "refresh-checking",
          label: "Refreshing transactions",
          detail: input.refresh.message ?? "Pip is checking for new transactions and the number may move.",
          tone: "info",
        },
      ],
      chips: [whyTodayChip()],
    };
  }

  if (input.refresh?.status === "failed") {
    return {
      priority: "refresh",
      facts: [
        {
          id: "refresh-failed",
          label: "Refresh needs attention",
          detail: input.refresh.message ?? "The latest transaction refresh did not fully finish.",
          tone: "warning",
        },
      ],
      chips: [chip("manage-accounts", "Accounts", "Manage connected accounts")],
    };
  }

  if (input.sameDaySpend && input.sameDaySpend.amountCents > 0) {
    return {
      priority: "same_day_spend",
      facts: [
        {
          id: "same-day-spend",
          label: "New spending today",
          detail: `${formatMoney(input.sameDaySpend.amountCents)}${input.sameDaySpend.merchantName ? ` at ${input.sameDaySpend.merchantName}` : ""} is counted against today.`,
          tone: input.sameDaySpend.pending ? "info" : "warning",
        },
      ],
      chips: [whyTodayChip()],
      shouldMarkReactionSeen: true,
    };
  }

  if (input.missingData) {
    return {
      priority: "missing_data",
      facts: [
        {
          id: "missing-data",
          label: "Missing data",
          detail: input.missingData.message,
          tone: "warning",
        },
      ],
      chips: [chip("manage-accounts", "Accounts", "Manage connected accounts")],
    };
  }

  if (input.clarification?.type === "bill") {
    const merchantName = input.clarification.merchantName ?? "this charge";

    return {
      priority: "clarification",
      facts: [
        {
          id: "bill-clarification",
          label: "Bill clarification",
          detail: input.clarification.message ?? `${merchantName} may be a monthly bill.`,
          tone: "info",
        },
      ],
      chips: [
        chip("treat-as-bill", "Treat as bill", `Treat ${merchantName} as a monthly bill`),
        chip("not-a-bill", "Not a bill", `${merchantName} is not a bill`),
      ],
    };
  }

  if (input.tight) {
    return {
      priority: "tight",
      facts: [
        {
          id: "tight-today",
          label: "Tight day",
          detail: input.tight.message ?? "Spendable Cash Today is tight.",
          tone: "warning",
        },
      ],
      chips: [whyTodayChip()],
    };
  }

  if (input.savingsOpportunity) {
    return {
      priority: "savings_opportunity",
      facts: [
        {
          id: "savings-opportunity",
          label: "Savings goal opportunity",
          detail: "No active savings goal is set yet.",
          tone: "positive",
        },
      ],
      chips: [chip("set-savings-goal", "Set a goal", "Help me set a savings goal")],
    };
  }

  if (input.refresh?.status === "ran" || input.refresh?.status === "skipped") {
    return {
      priority: "refresh",
      facts: [
        {
          id: "refresh-complete",
          label: "Transactions checked",
          detail: input.refresh.message ?? "The latest transaction check is reflected in the current number.",
          tone: "positive",
        },
      ],
      chips: [whyTodayChip()],
    };
  }

  if (input.productTip) {
    return {
      priority: "product_tip",
      facts: [
        {
          id: "product-tip",
          label: "Pip tip",
          detail: input.productTip.message,
          tone: "info",
        },
      ],
      chips: [chip("settings", "Settings", "Open settings")],
    };
  }

  return {
    priority: "normal",
    facts: [
      {
        id: "normal-day",
        label: "Current Spendable Cash Today",
        detail: `Current displayed amount is ${formatMoney(input.spendableCashTodayCents ?? 0)}.`,
        tone: "info",
      },
    ],
    chips: [whyTodayChip()],
  };
}
```

- [ ] **Step 3: Add opening-bubble fetch helper**

In `src/components/pip-home/agent-session.ts`, add:

```ts
export async function fetchOpeningBubbleResponse(input: {
  scenario: FakeDataScenario;
  thread: AgentThreadItem[];
  visibleChips: PromptChip[];
  chipHistory: PromptChip[];
  conversationId: string;
}): Promise<AgentResponse> {
  return fetchAgentResponse(
    "Create the opening bubble for this Pip screen.",
    input.scenario,
    input.thread,
    input.visibleChips,
    input.chipHistory,
    input.conversationId,
    undefined,
    "opening_bubble",
  );
}
```

- [ ] **Step 4: Update `PipHome` to request model copy**

In `src/components/PipHome.tsx`, use `planOpeningBubbleContext` to build state/chips, show a temporary checking bubble while the agent request is pending, then replace copy with the agent response message. Keep deterministic context only as a fallback when the agent request fails.

Use this shape:

```ts
const openingBubbleContext = planOpeningBubbleContext({ result, appOpenSyncMessage });
const [modelOpeningBubble, setModelOpeningBubble] = useState<AgentResponse | null>(null);
```

Visible title should prefer:

```ts
const openingBubbleMessage = modelOpeningBubble?.message ?? getOpeningBubbleFallback(openingBubbleContext);
```

The fallback is allowed only as a hard outage exception.

- [ ] **Step 5: Run opening tests**

```bash
npm test -- src/lib/pip/opening-bubble-planner.test.ts src/components/pip-home/agent-session.test.ts src/components/PipHome.test.tsx
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/pip/opening-bubble-planner.ts src/lib/pip/opening-bubble-planner.test.ts src/components/PipHome.tsx src/components/PipHome.test.tsx src/components/pip-home/agent-session.ts src/components/pip-home/agent-session.test.ts
git commit -m "feat: make opening bubble model-written"
```

---

## Task 9: Make Prompt Chips Model-Primary And Sanitized

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/lib/agent/prompt-chip-selection.ts`
- Modify: `src/lib/agent/prompt-chip-selection.test.ts`
- Modify: `src/lib/agent/prompt-chip-planner.ts`
- Test: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Add failing prompt-chip tests**

Add to `src/lib/agent/ai-agent.test.ts`:

```ts
it("uses the model for prompt chip refresh when model config is available", async () => {
  const response = await runAIAgent(
    {
      message: "Create prompt chips for the current Pip screen.",
      requestKind: "prompt_chips",
      snapshot: fakeSnapshot,
      onboardingState: {
        status: "ready",
        hasFinancialData: true,
      },
    },
    createMockModelClient(),
  );

  expect(response.audit.usedModel).toBe(true);
  expect(response.promptChips).toHaveLength(3);
});
```

- [ ] **Step 2: Remove deterministic prompt-chip refresh**

In `src/lib/agent/ai-agent.ts`, delete the early return:

```ts
const deterministicPromptChipRefreshResponse = createDeterministicPromptChipRefreshResponse(input);
if (deterministicPromptChipRefreshResponse) {
  return deterministicPromptChipRefreshResponse;
}
```

Keep prompt-chip-specific instructions in `createPipInstructions`, but let the model produce chips.

- [ ] **Step 3: Keep sanitizer and fallback only**

In `src/lib/agent/prompt-chip-selection.ts`, keep:

```ts
sanitizeGeneratedPromptChips(...)
sanitizePromptChipCapability(...)
```

Do not choose deterministic chips over good generated chips. Deterministic chips are only a fallback when generated chips are fewer than 3 or unsafe.

- [ ] **Step 4: Run prompt-chip tests**

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "prompt chip" src/lib/agent/prompt-chip-selection.test.ts src/lib/agent/prompt-chip-planner.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/prompt-chip-selection.ts src/lib/agent/prompt-chip-selection.test.ts src/lib/agent/prompt-chip-planner.ts src/lib/agent/ai-agent.test.ts
git commit -m "feat: make prompt chips model-primary"
```

---

## Task 10: Convert Write Actions To Confirmation-Aware Tools

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/app/api/agent/route.ts`
- Modify: `src/lib/agent/pending-actions.ts`
- Test: `src/lib/agent/ai-agent.test.ts`
- Test: `src/app/api/agent/route.test.ts`

- [ ] **Step 1: Add failing confirmation tests**

Add to `src/lib/agent/ai-agent.test.ts`:

```ts
it("does not create ordinary write actions without a pending confirmed preview", async () => {
  expect(__agentTestHooks.validateWriteConfirmationForTest(
    {
      toolName: "create_savings_goal",
      args: {
        name: "Computer",
        target_amount_cents: 500000,
      },
    },
  )).toMatchObject({
    ok: false,
    message: expect.stringMatching(/preview/i),
  });
});

it("allows ordinary write actions only after a matching pending preview", async () => {
  expect(__agentTestHooks.validateWriteConfirmationForTest(
    {
      pendingAction: {
        type: "create_savings_goal",
        status: "awaiting_confirmation",
        name: "Computer",
        targetAmountCents: 500000,
        targetDate: "2026-12-20",
        monthlyContributionCents: 83334,
        includeInSpendableCash: true,
        missing: [],
        confirmationToken: "create-savings-goal",
      },
      toolName: "create_savings_goal",
      args: {
        name: "Computer",
        target_amount_cents: 500000,
      },
    },
  )).toEqual({ ok: true });
});
```

- [ ] **Step 2: Enforce confirmations in tools**

In every write tool execute block in `src/lib/agent/ai-agent.ts`, require the matching pending action:

```ts
const confirmation = validateWriteConfirmation(context, {
  toolName: "create_savings_goal",
  args: toolInput,
});

if (!confirmation.ok) {
  return {
    ok: false,
    status: "confirmation_required",
    message: confirmation.message,
  };
}
```

Implement `validateWriteConfirmation`:

```ts
function validateWriteConfirmation(
  context: PipAgentContext,
  input: { toolName: string; args: Record<string, unknown> },
): { ok: true } | { ok: false; message: string } {
  return validateWriteConfirmationForPendingAction({
    pendingAction: context.conversationState.pendingAction,
    toolName: input.toolName,
    args: input.args,
  });
}

function validateWriteConfirmationForPendingAction(input: {
  pendingAction?: AgentPendingAction;
  toolName: string;
  args: Record<string, unknown>;
}): { ok: true } | { ok: false; message: string } {
  const pending = input.pendingAction;

  if (input.toolName === "create_savings_goal") {
    if (pending?.type === "create_savings_goal" && pending.status === "awaiting_confirmation") {
      return { ok: true };
    }

    return {
      ok: false,
      message: "Preview the savings goal and get confirmation before creating it.",
    };
  }

  if (input.toolName === "update_savings_goal") {
    if (pending?.type === "update_savings_goal" && pending.status === "awaiting_confirmation") {
      return { ok: true };
    }

    return {
      ok: false,
      message: "Preview the savings goal change and get confirmation before updating it.",
    };
  }

  if (input.toolName === "correct_recurring_obligation") {
    if (pending?.type === "correct_recurring_obligation" && pending.status === "awaiting_confirmation") {
      return { ok: true };
    }

    return {
      ok: false,
      message: "Confirm the bill treatment before saving the recurring bill correction.",
    };
  }

  if (input.toolName === "remove_institution") {
    if (pending?.type === "remove_institution" && pending.status === "awaiting_exact_confirmation") {
      return { ok: true };
    }

    return {
      ok: false,
      message: "Ask the user for the exact remove confirmation before removing an institution.",
    };
  }

  if (input.toolName === "delete_user_data") {
    if (pending?.type === "delete_user_data" && pending.status === "awaiting_exact_confirmation") {
      return { ok: true };
    }

    return {
      ok: false,
      message: "Ask the user to type DELETE DATA before deleting stored data.",
    };
  }

  return { ok: true };
}
```

Expose only the pure helper through the existing `__agentTestHooks` object by adding one property:

```ts
export const __agentTestHooks = {
  // keep the existing exported test hooks in this object
  validateWriteConfirmationForTest: validateWriteConfirmationForPendingAction,
};
```

- [ ] **Step 3: Run write-action tests**

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "write actions" src/app/api/agent/route.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/ai-agent.ts src/app/api/agent/route.ts src/lib/agent/pending-actions.ts src/lib/agent/ai-agent.test.ts src/app/api/agent/route.test.ts
git commit -m "feat: enforce model-first write confirmations"
```

---

## Task 11: Update Agent Instructions For Global Model-First Behavior

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Test: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Add instruction snapshot test**

Add to `src/lib/agent/ai-agent.test.ts`:

```ts
it("instructs Pip to own every visible reply while tools own facts", () => {
  const instructions = __agentTestHooks.createPipInstructionsForTest({
    message: "Can I spend $50?",
    snapshot: fakeSnapshot,
  });

  expect(instructions).toContain("Every normal visible Pip response must be written in your own words");
  expect(instructions).toContain("Tools and cards are the source of truth for money facts");
  expect(instructions).toContain("Do not create or update a savings goal before previewing it");
  expect(instructions).toContain("Known personal-finance questions need a tool or one concrete clarifying question");
});
```

- [ ] **Step 2: Update instruction block**

In `createPipInstructions`, add these exact constraints near the top:

```ts
"Every normal visible Pip response must be written in your own words. Do not rely on canned or template phrasing.",
"Tools and cards are the source of truth for money facts. You may interpret them warmly, but you must not invent balances, transactions, bills, dates, goals, or Spendable Cash Today numbers.",
"Known personal-finance questions need a tool or one concrete clarifying question. Do not answer vaguely when a money tool is available.",
"For savings goals, preview before saving. Do not create or update a savings goal before previewing the monthly amount and Spendable Cash Today impact, then getting confirmation.",
"When a savings plan is tight, use soft pushback. Say it may be difficult and explain why; do not sound harsh or scolding.",
"For ordinary pending writes, contextual confirmation like yes or save it is enough only when the pending action is clear. For delete data and institution removal, require the exact confirmation text.",
"Normal complex answers may be four to six short sentences. Stay concise, but do not collapse useful money guidance into a robotic bridge sentence.",
```

- [ ] **Step 3: Run instruction tests**

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "instructs Pip"
```

Expected:

```text
PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts
git commit -m "docs: teach Pip global model-first behavior"
```

---

## Task 12: Rewrite Existing Unit Tests Away From Robot-Brain Expectations

**Files:**
- Modify: `src/lib/agent/ai-agent.test.ts`
- Modify: `src/lib/agent/answer-composer.test.ts`
- Modify: `src/lib/agent/conversation-state.test.ts`
- Modify: `src/lib/agent/intent-router-dogfood.test.ts`
- Modify: `tests/helpers/mock-agent-runtime.ts`

- [ ] **Step 1: Find old deterministic expectations**

Run:

```bash
rg -n "usedModel\\)\\.toBe\\(false\\)|That same answer still applies|I pulled|I found recent charges|I saved the .* savings goal|keeps .* deterministic|immediate" src/lib/agent tests/helpers
```

Expected: output lists tests that still encode the old robot-brain behavior.

- [ ] **Step 2: Replace savings expectations**

For savings setup tests, change assertions from:

```ts
expect(response.audit.usedModel).toBe(false);
expect(response.message).toContain("How much");
```

to:

```ts
expect(response.audit.usedModel).toBe(true);
expect(response.message).toMatch(/how much|when|monthly|Spendable Cash Today|save/i);
expect(response.message).not.toMatch(/Savings goals are not available yet|That same answer still applies/i);
```

- [ ] **Step 3: Replace card bridge expectations**

For card-backed tests, assert model copy survives:

```ts
expect(response.audit.usedModel).toBe(true);
expect(response.message).toBe(modelMessage);
expect(response.message).not.toMatch(/I pulled the math|I found recent charges|I mapped the next/i);
```

- [ ] **Step 4: Update mock runtime copy**

In `tests/helpers/mock-agent-runtime.ts`, remove canned savings copy and return model-like copy:

```ts
message: "I checked the goal details and can walk through the tradeoff before saving anything.",
```

- [ ] **Step 5: Run rewritten tests**

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/answer-composer.test.ts src/lib/agent/conversation-state.test.ts src/lib/agent/intent-router-dogfood.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/ai-agent.test.ts src/lib/agent/answer-composer.test.ts src/lib/agent/conversation-state.test.ts src/lib/agent/intent-router-dogfood.test.ts tests/helpers/mock-agent-runtime.ts
git commit -m "test: update agent tests for model-first behavior"
```

---

## Task 13: Add The 100+ Case Model-First Gate

**Files:**
- Create: `tests/fixtures/model-first-agent-gate.mjs`
- Create: `scripts/eval-model-first-agent.mjs`
- Create: `scripts/eval-model-first-agent.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the fixture**

Create `tests/fixtures/model-first-agent-gate.mjs` with at least 120 cases:

```js
export const modelFirstAgentGateCases = [
  {
    id: "savings-name-only-asks-amount-and-time",
    turns: ["I want to save for a computer"],
    required: {
      usedModelEveryTurn: true,
      forbiddenMessage: ["Savings goals are not available yet", "That same answer still applies"],
      pendingActionType: "create_savings_goal",
      mustMentionOneOf: ["how much", "target", "when", "timeline"],
    },
  },
  {
    id: "savings-amount-no-time-asks-timeline",
    turns: ["New computer at $5000"],
    required: {
      usedModelEveryTurn: true,
      forbiddenTools: ["create_savings_goal"],
      pendingActionType: "create_savings_goal",
      mustMentionOneOf: ["when", "timeline", "monthly", "Spendable Cash Today"],
    },
  },
  {
    id: "savings-complete-previews-before-create",
    turns: ["Emergency fund $5000 in 6 months"],
    required: {
      usedModelEveryTurn: true,
      requiredTools: ["preview_savings_goal"],
      forbiddenTools: ["create_savings_goal"],
      requiredCards: ["savings_goal_preview"],
      mustMentionOneOf: ["month", "Spendable Cash Today", "want me to save"],
    },
  },
];
```

Define the full fixture with this distribution and real prompts:

```js
export const modelFirstGateGroups = {
  savings: 30,
  spendableCash: 20,
  purchaseSimulation: 10,
  transactions: 10,
  recurringBills: 12,
  accountManagement: 10,
  refreshAndSync: 8,
  openingBubble: 8,
  promptChips: 6,
  trustAndPrivacy: 6,
};
```

Use this helper so the fixture fails loudly if a group is underfilled:

```js
function group(name, expectedCount, cases) {
  if (cases.length !== expectedCount) {
    throw new Error(`${name} expected ${expectedCount} cases, got ${cases.length}`);
  }

  return cases.map((caseDef) => ({
    ...caseDef,
    group: name,
  }));
}

export const modelFirstAgentGateCases = [
  ...group("savings", 30, savingsCases),
  ...group("spendableCash", 20, spendableCashCases),
  ...group("purchaseSimulation", 10, purchaseSimulationCases),
  ...group("transactions", 10, transactionCases),
  ...group("recurringBills", 12, recurringBillCases),
  ...group("accountManagement", 10, accountManagementCases),
  ...group("refreshAndSync", 8, refreshAndSyncCases),
  ...group("openingBubble", 8, openingBubbleCases),
  ...group("promptChips", 6, promptChipCases),
  ...group("trustAndPrivacy", 6, trustAndPrivacyCases),
];
```

Create each case array with explicit case objects. The `savingsCases` array starts with these five required cases and then adds 25 additional distinct savings workflows:

```js
const savingsCases = [
  { id: "savings-name-only-asks-amount-and-time", turns: ["I want to save for a computer"], required: { usedModelEveryTurn: true, forbiddenTools: ["create_savings_goal"], pendingActionType: "create_savings_goal", mustMentionOneOf: ["how much", "target", "when", "timeline"] } },
  { id: "savings-amount-no-time-asks-timeline", turns: ["New computer at $5000"], required: { usedModelEveryTurn: true, forbiddenTools: ["create_savings_goal"], pendingActionType: "create_savings_goal", mustMentionOneOf: ["when", "timeline", "monthly", "Spendable Cash Today"] } },
  { id: "savings-complete-previews-before-create", turns: ["Emergency fund $5000 in 6 months"], required: { usedModelEveryTurn: true, requiredTools: ["preview_savings_goal"], forbiddenTools: ["create_savings_goal"], requiredCards: ["savings_goal_preview"], mustMentionOneOf: ["month", "Spendable Cash Today", "want me to save"] } },
  { id: "savings-preview-then-confirm-create", turns: ["Emergency fund $5000 in 6 months", "yes"], required: { usedModelEveryTurn: true, orderedTools: ["preview_savings_goal", "create_savings_goal"], requiredCards: ["savings_goal_preview", "savings_goal_plan"] } },
  { id: "savings-too-tight-soft-pushback", turns: ["I want to save $5000 by next month"], required: { usedModelEveryTurn: true, requiredTools: ["preview_savings_goal"], mustMentionOneOf: ["difficult", "tight", "push", "lower"] } },
];
```

Use the same explicit object shape for the other groups. The group helper above enforces exact counts, and review should reject repeated-prompt filler. Each case must represent a distinct user phrase or workflow.

The fixture must export exactly:

```js
export const requiredModelFirstGateCaseCount = 120;
```

- [ ] **Step 2: Create evaluator**

Create `scripts/eval-model-first-agent.mjs`:

```js
#!/usr/bin/env node
import { modelFirstAgentGateCases, requiredModelFirstGateCaseCount } from "../tests/fixtures/model-first-agent-gate.mjs";

function scoreCase(result, required) {
  let score = 100;
  const failures = [];

  if (required.usedModelEveryTurn && result.turns.some((turn) => turn.audit?.usedModel !== true)) {
    score -= 35;
    failures.push("A normal visible turn was not model-written.");
  }

  for (const tool of required.requiredTools ?? []) {
    if (!result.usedTools.includes(tool)) {
      score -= 20;
      failures.push(`Missing required tool ${tool}.`);
    }
  }

  for (const tool of required.forbiddenTools ?? []) {
    if (result.usedTools.includes(tool)) {
      score -= 30;
      failures.push(`Forbidden tool ${tool} was used.`);
    }
  }

  for (const ordered of required.orderedTools ? [required.orderedTools] : []) {
    let cursor = 0;
    for (const tool of result.usedTools) {
      if (tool === ordered[cursor]) {
        cursor += 1;
      }
    }
    if (cursor < ordered.length) {
      score -= 25;
      failures.push(`Required ordered tool sequence missing: ${ordered.join(" -> ")}.`);
    }
  }

  for (const card of required.requiredCards ?? []) {
    if (!result.cardTypes.includes(card)) {
      score -= 15;
      failures.push(`Missing required card ${card}.`);
    }
  }

  for (const forbidden of required.forbiddenMessage ?? []) {
    if (result.visibleText.toLowerCase().includes(forbidden.toLowerCase())) {
      score -= 30;
      failures.push(`Forbidden copy found: ${forbidden}`);
    }
  }

  if (required.mustMentionOneOf?.length) {
    const matched = required.mustMentionOneOf.some((text) =>
      result.visibleText.toLowerCase().includes(text.toLowerCase()),
    );
    if (!matched) {
      score -= 10;
      failures.push(`Did not mention any of: ${required.mustMentionOneOf.join(", ")}`);
    }
  }

  if (required.pendingActionType && result.pendingActionTypes?.at(-1) !== required.pendingActionType) {
    score -= 15;
    failures.push(`Expected pending action ${required.pendingActionType}.`);
  }

  return {
    score: Math.max(0, score),
    failures,
  };
}

export function validateFixture() {
  if (modelFirstAgentGateCases.length < requiredModelFirstGateCaseCount) {
    throw new Error(`Expected at least ${requiredModelFirstGateCaseCount} cases, got ${modelFirstAgentGateCases.length}.`);
  }
}

export { scoreCase };

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runGate({
    baseUrl: process.env.PIP_AGENT_EVAL_BASE_URL ?? "http://localhost:3000",
  });

  if (!report.ok) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(report, null, 2));
}
```

Add the runner implementation above the `if` block:

```js
export async function runGate(input = {}) {
  validateFixture();
  const baseUrl = input.baseUrl ?? "http://localhost:3000";
  const caseReports = [];

  for (const caseDef of modelFirstAgentGateCases) {
    const conversationId = `model-first-${caseDef.id}`;
    const history = [];
    let conversationState = {};
    const turns = [];
    const usedTools = [];
    const cardTypes = [];
    const pendingActionTypes = [];
    const visibleTextParts = [];

    for (const message of caseDef.turns) {
      const response = await fetch(`${baseUrl}/api/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId,
          history,
          conversationState,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${caseDef.id} failed HTTP ${response.status}: ${text}`);
      }

      const payload = await response.json();
      turns.push(payload);
      usedTools.push(...(payload.usedTools ?? []));
      cardTypes.push(...(payload.cards ?? []).map((card) => card.type));
      if (payload.pendingAction?.type) {
        pendingActionTypes.push(payload.pendingAction.type);
      }
      visibleTextParts.push(payload.message ?? "");
      history.push({ role: "user", content: message });
      history.push({ role: "assistant", content: payload.message ?? "" });
      conversationState = {
        shownCards: (payload.cards ?? []).map((card) => ({ type: card.type, title: card.title })),
        lastToolNames: payload.usedTools ?? [],
        promptChips: payload.promptChips ?? [],
        ...(payload.pendingAction ? { pendingAction: payload.pendingAction } : {}),
      };
    }

    const scored = scoreCase({
      turns,
      usedTools,
      cardTypes,
      pendingActionTypes,
      visibleText: visibleTextParts.join(" "),
    }, caseDef.required);
    caseReports.push({
      id: caseDef.id,
      group: caseDef.group,
      ...scored,
    });
  }

  return {
    ok: caseReports.every((item) => item.score >= 95),
    caseCount: caseReports.length,
    failing: caseReports.filter((item) => item.score < 95),
    cases: caseReports,
  };
}
```

- [ ] **Step 3: Test the scorer**

Create `scripts/eval-model-first-agent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { modelFirstAgentGateCases, requiredModelFirstGateCaseCount } from "../tests/fixtures/model-first-agent-gate.mjs";
import { scoreCase, validateFixture } from "./eval-model-first-agent.mjs";

describe("model-first agent gate", () => {
  it("has at least 120 cases", () => {
    expect(modelFirstAgentGateCases.length).toBeGreaterThanOrEqual(requiredModelFirstGateCaseCount);
    expect(() => validateFixture()).not.toThrow();
  });

  it("penalizes deterministic visible turns below the 95 threshold", () => {
    const result = scoreCase({
      turns: [{ audit: { usedModel: false } }],
      usedTools: [],
      cardTypes: [],
      visibleText: "How much do you want to save?",
    }, {
      usedModelEveryTurn: true,
    });

    expect(result.score).toBeLessThan(95);
    expect(result.failures[0]).toMatch(/not model-written/i);
  });

  it("penalizes missing ordered tool sequences", () => {
    const result = scoreCase({
      turns: [{ audit: { usedModel: true } }],
      usedTools: ["create_savings_goal", "preview_savings_goal"],
      cardTypes: ["savings_goal_plan"],
      pendingActionTypes: [],
      visibleText: "Saved.",
    }, {
      usedModelEveryTurn: true,
      orderedTools: ["preview_savings_goal", "create_savings_goal"],
    });

    expect(result.score).toBeLessThan(95);
    expect(result.failures[0]).toMatch(/ordered tool sequence/i);
  });
});
```

- [ ] **Step 4: Add package script**

In `package.json`, add:

```json
"eval:agent:model-first": "node scripts/eval-model-first-agent.mjs"
```

- [ ] **Step 5: Run evaluator tests**

```bash
npm test -- scripts/eval-model-first-agent.test.ts
npm run eval:agent:model-first
```

Expected:

```text
PASS scripts/eval-model-first-agent.test.ts
{
  "ok": true,
  "caseCount": 120
}
```

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/model-first-agent-gate.mjs scripts/eval-model-first-agent.mjs scripts/eval-model-first-agent.test.ts package.json
git commit -m "test: add global model-first agent gate"
```

---

## Task 14: Final Integration And Verification

**Files:**
- Planned files are all files already listed in Tasks 1-13.
- If a verification command fails, modify only the file named by the failing stack trace or assertion.
- Do not add new product behavior during this task.

- [ ] **Step 1: Run focused model-first tests**

```bash
npm test -- src/lib/agent/model-first-policy.test.ts src/lib/agent/pending-actions.test.ts src/lib/savings-goals/preview.test.ts src/lib/agent/ai-agent.test.ts src/lib/agent/answer-composer.test.ts src/lib/agent/prompt-chip-selection.test.ts src/lib/pip/opening-bubble-planner.test.ts
```

Expected:

```text
Test Files ... passed
```

- [ ] **Step 2: Run route and component tests**

```bash
npm test -- src/app/api/agent/route.test.ts src/components/pip-home/agent-session.test.ts src/components/PipHome.test.tsx src/components/AgentThread.test.tsx src/components/cards/CardRenderer.test.tsx
```

Expected:

```text
Test Files ... passed
```

- [ ] **Step 3: Run agent eval gates**

```bash
npm run eval:agent:major
npm run eval:agent:model-first
```

Expected:

```text
major capabilities: PASS
model-first gate: every case >= 95/100
```

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected:

```text
Compiled successfully
```

- [ ] **Step 5: Run browser proof with Codex in-app Browser**

Start the app:

```bash
npm run dev
```

Using the Codex in-app Browser `iab` backend, verify:

```text
1. App opens with the number visible.
2. Opening bubble is warm and model-written.
3. User sends "I want to save for a $5000 computer".
4. Thinking state appears.
5. Pip asks for timeline in model-written copy.
6. User sends "in six months".
7. Pip previews monthly amount and Spendable Cash Today impact.
8. Pip asks before saving.
9. User says "yes".
10. Pip creates the goal with model-written confirmation and deterministic card.
11. A known finance no-tool failure such as "New computer at $5000" does not return vague broad chat.
```

- [ ] **Step 6: Inspect logs**

Query recent local/production-equivalent chat logs and confirm:

```text
normal visible turns: model is non-null
normal visible turns: transport is non-null
normal visible turns: audit.usedModel true
savings setup: preview_savings_goal before create_savings_goal
no normal visible turn contains "That same answer still applies"
```

- [ ] **Step 7: Run full test suite if focused gates pass**

```bash
npm test
```

Expected:

```text
Test Files ... passed
```

- [ ] **Step 8: Commit final integration fixes**

```bash
git status --short
git add src tests scripts package.json
git commit -m "feat: rebuild Pip as a model-first money companion"
```

---

## Acceptance Criteria

The implementation is not complete unless all of these are true:

1. Normal visible Pip replies have `audit.usedModel: true`.
2. Savings setup never creates a goal before preview and confirmation.
3. `I want to save for a $5,000 computer` asks for timeline/monthly contribution in model-written language.
4. `Emergency fund $5000 in 6 months` previews first, shows monthly amount, shows Spendable Cash Today impact, and asks before save.
5. Known finance intents cannot return vague no-tool broad chat.
6. Opening bubble copy is model-written when model config is available.
7. Prompt chips are model-generated first, deterministic-sanitized second.
8. Cards and exact money facts remain deterministic.
9. Delete data and institution removal still require exact confirmation.
10. Ordinary writes accept contextual confirmation only when a clear pending preview/action exists.
11. Pip can use 4-6 short sentences for complex money answers.
12. No normal successful response uses fixed strings such as:
    - `That same answer still applies.`
    - `I pulled the math behind today's number.`
    - `I found recent charges in the current window.`
    - `I saved the X savings goal.`
    - `Savings goals are not available yet.` when savings actions exist.
13. The model-first gate has at least 120 cases.
14. Every model-first gate case scores at least 95/100.
15. `npm run build` passes.
16. In-app Browser proof confirms thinking state and model-written savings flow.

## Self-Review

- Spec coverage: The plan covers global visible replies, routing as guardrails, savings preview, structured pending state, contextual and exact confirmations, opening bubble, prompt chips, longer replies, cards as deterministic facts, known-finance no-tool rejection, and 100+ scored tests.
- Placeholder scan: No task uses `TBD`, `TODO`, or open-ended "add tests" language without concrete test content.
- Type consistency: New request kind is consistently `opening_bubble`; new preview tool is consistently `preview_savings_goal`; new preview card is consistently `savings_goal_preview`; pending action status names are consistent across tasks.
