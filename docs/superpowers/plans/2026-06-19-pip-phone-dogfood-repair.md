# Pip Phone Dogfood Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the phone-tested Pip failures around Savings Goals, multi-turn context, stale data refresh, and crowded Spendable Cash Today UI.

**Architecture:** Keep the top Spendable Cash Today calculation deterministic, and make the assistant deterministic around app actions. Add a small typed pending-action contract for follow-up replies like "yes", hydrate recent chat context from stored `agent_chat_turns`, make Savings Goals either truly enabled or cleanly hidden, move trust-receipt metadata out of the hero, and make app-open refresh run on every meaningful app open/foreground unless a sync is already running.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Supabase Postgres/RLS, Vitest, existing Playwright E2E, Codex in-app Browser for manual QA.

---

## Current Failure Evidence

Use this as the acceptance target. The recent phone transcript showed:

- "I want to save for a trip to Bali" returned "I'm not sure what you mean yet."
- "I want to save money for a big purchase" routed to `get_pip_cash_snapshot`.
- "I want to save for a trip that costs $5000" reached `create_savings_goal`, but production answered that Savings Goals are unavailable.
- "I need you to keep my savings goal out of Spendable Cash Today" reached `set_savings_goal_protection`, but production answered that Savings Goals are unavailable.
- "Why does Pip need a savings cushion?" reused "Savings cushion" in visible copy.
- "Yes" after a savings-goal offer routed to `forecast_spendable_cash`.
- "Show my bank accounts" produced placeholder-like wording instead of forcing a real account/balance tool.
- The Spendable Cash Today hero showed long receipt text: "Connected data refreshed ...; known limits."
- The phone opened after midnight but still showed data refreshed June 18 around 4:00 p.m. MDT; no new `sync_runs` row was created for that open.

## Scope

This is one integrated release because all failures show up in the same phone flow. Still, the tasks are separable and should be committed independently:

1. Protect the worktree.
2. Add typed pending actions.
3. Hydrate server-side conversation history.
4. Fix Savings Goals availability and routing.
5. Stop visible "cushion" language.
6. Force account/balance tools for account questions.
7. Move receipt text out of the metric hero.
8. Refresh connected data on every app open/foreground.
9. Add transcript-level regression tests and phone QA checklist.

## Plan Optimizer Pass

**Final optimized score:** 94/100.

The optimization pass tightened the plan around execution risk:

- Separate response-contract work from app-action execution so pending actions can be validated before they are used.
- Make the API request schema accept the same `pendingAction` shape the client sends.
- Treat Savings Goals as a production dogfood flag rollout, not a code-only change.
- Verify Supabase table, grants, RLS, and deletion coverage before enabling production flags.
- Extend the eval harness before adding transcript cases that require new assertion fields.
- Keep `.env.example` safe for local/default builds while documenting the production values that must be enabled.
- Use existing agent helpers such as `recordTool` and `applyActionResult`; do not introduce imaginary helper names.

Execute in this dependency order:

1. Worktree isolation and baseline tests.
2. Shared pending-action types, schema, request parsing, and client state pass-through.
3. Server-side history hydration.
4. Savings Goals feature-flag and database readiness gates.
5. Savings routing and pending-action execution.
6. Copy/UI cleanup.
7. App-open refresh policy.
8. Eval and E2E transcript coverage.
9. Production flag rollout, deploy verification, and phone QA.

## File Structure

- Modify `src/lib/agent/card-types.ts`
  - Adds `AgentPendingAction` and `pendingAction?: AgentPendingAction` to `AgentResponse`.
- Modify `src/lib/agent/response-schema.ts`
  - Adds a Zod schema for `pendingAction` so model/repair output can be validated.
- Modify `src/components/PipHome.tsx`
  - Sends the most recent `pendingAction` in `conversationState`.
  - Removes the long trust receipt line under Spendable Cash Today.
  - Shows compact refresh state only when useful.
  - Calls app-open refresh with a phone-appropriate foreground policy.
- Modify `src/app/api/agent/route.ts`
  - Accepts `conversationState.pendingAction`.
  - Loads recent stored turns for the same `conversationId`.
  - Passes merged history and feature flags into `runAIAgent`.
- Modify `src/lib/data/agent-chat-turns.ts`
  - Adds a user-scoped conversation-history loader for recent chat context.
- Modify `src/lib/agent/ai-agent.ts`
  - Handles pending-action confirmations before generic routing.
  - Widens Savings Goals intent recognition.
  - Suppresses Savings Goals tools when disabled.
  - Forces account/balance tool use for account questions.
  - Prevents visible "cushion" language.
- Modify `src/lib/agent/conversation-state.ts`
  - Adds Savings Goals as a first-class conversation job/card/tool family.
- Modify `src/lib/agent/intent-router.ts`
  - Adds Savings Goals follow-up and account-intent coverage for the newer router path.
- Modify `src/lib/agent/answer-composer.ts`
  - Normalizes legacy cushion phrasing to Monthly Savings in deterministic fallback answers.
- Modify `src/lib/data/app-open-sync.ts`
  - Changes app-open sync decision from "fresh enough today / 10-minute app-open cooldown" to "run on app open unless already pending/running or just started inside a short duplicate guard."
- Modify `src/components/data-controls-helpers.ts`
  - Aligns client-side app-open refresh decision with the server.
- Modify tests:
  - `src/lib/agent/ai-agent.test.ts`
  - `src/lib/agent/conversation-state.test.ts`
  - `src/lib/agent/intent-router.test.ts`
  - `src/lib/agent/answer-composer.test.ts`
  - `src/app/api/agent/route.test.ts`
  - `src/app/api/sync/app-open/route.test.ts`
  - `src/components/PipHome.test.tsx`
  - `tests/helpers/mock-agent-runtime.ts`
  - `tests/e2e/ai-agent.spec.ts`
- Modify deployment/config docs:
  - `.env.example`
  - `docs/savings-implementation-guide.md`

## Pre-Implementation Guardrails

- The current worktree was dirty when this plan was written. Do not implement directly on top of unrelated dirty changes.
- At execution time, create a fresh branch or worktree from the intended base commit.
- Do not rewrite or revert unrelated user changes.
- Do not change calculation math except where protected Savings Goals already intentionally affect Spendable Cash Today.
- Do not let model text alone perform state changes. Tool calls or typed pending actions must drive state changes.
- Browser QA must use the Codex in-app Browser plugin with the `iab` backend.

---

### Task 1: Create an Isolated Implementation Branch

**Files:**
- No source files changed in this task.

- [ ] **Step 1: Confirm current branch and dirty state**

Run:

```bash
git branch --show-current
git status --short
```

Expected:

```text
main
```

If `git status --short` prints unrelated changes, do not stage or revert them.

- [ ] **Step 2: Create an isolated worktree or branch**

If using a worktree:

```bash
git worktree add ../FreeCash-pip-phone-dogfood-repair main
cd ../FreeCash-pip-phone-dogfood-repair
```

If using a branch in the current checkout:

```bash
git switch -c pip-phone-dogfood-repair
```

Expected:

```text
Switched to a new branch 'pip-phone-dogfood-repair'
```

- [ ] **Step 3: Verify the plan file is present**

Run:

```bash
test -f docs/superpowers/plans/2026-06-19-pip-phone-dogfood-repair.md
```

Expected: command exits with code `0`.

- [ ] **Step 4: Commit nothing**

Run:

```bash
git status --short
```

Expected: no source changes from this task.

---

### Task 2: Add Typed Pending Actions To Agent Responses

**Files:**
- Modify: `src/lib/agent/card-types.ts:258`
- Modify: `src/lib/agent/response-schema.ts:1-80`
- Modify: `src/app/api/agent/route.ts:90-130`
- Modify: `src/components/PipHome.tsx:2028-2075`
- Test: `src/lib/agent/response-schema.test.ts` if it exists; otherwise extend `src/lib/agent/ai-agent.test.ts`
- Test: `src/app/api/agent/route.test.ts`

- [ ] **Step 1: Write failing response-contract tests**

Add this test to `src/lib/agent/ai-agent.test.ts` near the schema/response contract tests:

```ts
it("accepts a typed pending savings goal action in agent responses", () => {
  const parsed = agentResponseSchema.parse({
    message: "How much do you want to save for Bali?",
    cards: [],
    promptChips: [],
    usedTools: [],
    responseMode: "clarify",
    pendingAction: {
      type: "create_savings_goal",
      name: "Bali",
      missing: ["targetAmountCents"],
    },
    audit: {
      toolNames: [],
      usedModel: false,
    },
  });

  expect(parsed.pendingAction).toEqual({
    type: "create_savings_goal",
    name: "Bali",
    missing: ["targetAmountCents"],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "typed pending savings goal action"
```

Expected: FAIL because `pendingAction` is not currently part of `agentResponseSchema`.

- [ ] **Step 3: Add pending-action types**

In `src/lib/agent/card-types.ts`, insert this before `export type AgentResponse`:

```ts
export type AgentPendingAction =
  | {
      type: "create_savings_goal";
      name?: string;
      targetAmountCents?: number;
      targetDate?: string;
      monthlyContributionCents?: number;
      includeInSpendableCash?: boolean;
      missing: Array<"name" | "targetAmountCents" | "monthlyContributionCents">;
    }
  | {
      type: "set_savings_goal_protection";
      goalId?: string;
      name?: string;
      includeInSpendableCash: boolean;
      monthlyContributionCents?: number;
      missing: Array<"goal" | "monthlyContributionCents">;
    };
```

Then add this property to `AgentResponse` after `clientAction?: AgentClientAction;`:

```ts
  pendingAction?: AgentPendingAction;
```

- [ ] **Step 4: Add pending-action schemas**

In `src/lib/agent/response-schema.ts`, add this after `clientActionSchema`:

```ts
export const pendingActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_savings_goal"),
    name: z.string().min(1).max(80).optional(),
    targetAmountCents: z.number().int().positive().optional(),
    targetDate: z.string().min(4).max(40).optional(),
    monthlyContributionCents: z.number().int().positive().optional(),
    includeInSpendableCash: z.boolean().optional(),
    missing: z.array(z.enum(["name", "targetAmountCents", "monthlyContributionCents"])).max(3),
  }),
  z.object({
    type: z.literal("set_savings_goal_protection"),
    goalId: z.string().min(1).max(120).optional(),
    name: z.string().min(1).max(80).optional(),
    includeInSpendableCash: z.boolean(),
    monthlyContributionCents: z.number().int().positive().optional(),
    missing: z.array(z.enum(["goal", "monthlyContributionCents"])).max(2),
  }),
]);
```

Find the exported `agentResponseSchema` object and add:

```ts
  pendingAction: pendingActionSchema.optional(),
```

- [ ] **Step 5: Accept pending actions in the agent API request schema**

In `src/app/api/agent/route.ts`, import `pendingActionSchema` from `src/lib/agent/response-schema.ts` and add it to `conversationState` inside `requestSchema`:

```ts
      pendingAction: pendingActionSchema.optional(),
```

Then add a route test proving a request with `conversationState.pendingAction` reaches `runAIAgent` unchanged.

- [ ] **Step 6: Pass pending actions from client to server**

In `src/components/PipHome.tsx`, update the conversation-state object sent by `fetchAgentResponse` to include a pending action from the latest completed assistant response. The call site should still call:

```ts
      conversationState: getConversationState(thread, visibleChips, chipHistory),
```

Then update `getConversationState` in the same file so it returns the last pending action. If the function currently returns only `shownCards`, `lastToolNames`, and `promptChips`, make it return this shape:

```ts
function getConversationState(
  thread: ThreadItem[],
  visibleChips: PromptChip[],
  chipHistory: PromptChip[],
) {
  const completedTurns = thread.filter((item) => item.response);
  const lastPendingAction = [...completedTurns]
    .reverse()
    .find((item) => item.response?.pendingAction)?.response?.pendingAction;

  return {
    shownCards: completedTurns
      .flatMap((item) => item.response?.cards ?? [])
      .map((card) => ({
        type: card.type,
        title: "title" in card ? card.title : undefined,
      }))
      .slice(-8),
    lastToolNames: completedTurns
      .flatMap((item) => item.response?.usedTools ?? [])
      .slice(-8),
    promptChips: mergePromptChipHistory(chipHistory, visibleChips).slice(-24),
    pendingAction: lastPendingAction,
  };
}
```

If the existing `getConversationState` has additional fields, keep them and add only `pendingAction`.

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/app/api/agent/route.test.ts src/components/PipHome.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/agent/card-types.ts src/lib/agent/response-schema.ts src/lib/agent/ai-agent.test.ts src/app/api/agent/route.ts src/app/api/agent/route.test.ts src/components/PipHome.tsx src/components/PipHome.test.tsx
git commit -m "feat: add typed agent pending actions"
```

---

### Task 3: Hydrate Server-Side Conversation Context

**Files:**
- Modify: `src/lib/data/agent-chat-turns.ts:86-160`
- Modify: `src/app/api/agent/route.ts:80-190`
- Test: `src/app/api/agent/route.test.ts`

- [ ] **Step 1: Write failing route test**

Add this test to `src/app/api/agent/route.test.ts`:

```ts
it("hydrates recent stored chat turns when client history is empty", async () => {
  enableSupabaseEnv();

  const supabase = createSupabaseClient({ id: "user-1" });
  routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
  routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
  routeMocks.loadRecentAgentChatHistoryForConversation.mockResolvedValue([
    {
      role: "user",
      content: "I want to save for a trip to Bali.",
    },
    {
      role: "assistant",
      content: "How much do you want to save for Bali?",
    },
  ]);
  routeMocks.runAIAgent.mockResolvedValue(createAgentResponse({
    message: "Got it. I can use Bali as the goal.",
    cards: [],
    usedTools: [],
    responseMode: "chat_only",
  }));

  const response = await POST(jsonRequest({
    message: "Yes",
    conversationId: "web-phone-test",
    history: [],
  }));

  expect(response.status).toBe(200);
  expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      history: [
        {
          role: "user",
          content: "I want to save for a trip to Bali.",
        },
        {
          role: "assistant",
          content: "How much do you want to save for Bali?",
        },
      ],
    }),
  );
});
```

Add `loadRecentAgentChatHistoryForConversation` to the hoisted mocks:

```ts
  loadRecentAgentChatHistoryForConversation: vi.fn(),
```

Add the mock module export:

```ts
vi.mock("@/lib/data/agent-chat-turns", () => ({
  recordAgentChatTurnSafely: routeMocks.recordAgentChatTurnSafely,
  loadRecentAgentChatHistoryForConversation: routeMocks.loadRecentAgentChatHistoryForConversation,
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/app/api/agent/route.test.ts -t "hydrates recent stored chat turns"
```

Expected: FAIL because the loader does not exist or is not called.

- [ ] **Step 3: Add the chat-history loader**

In `src/lib/data/agent-chat-turns.ts`, add:

```ts
export type AgentChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export async function loadRecentAgentChatHistoryForConversation(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    conversationId: string;
    limit?: number;
  },
): Promise<AgentChatHistoryItem[]> {
  const { data, error } = await supabase
    .from("agent_chat_turns")
    .select("user_message, assistant_message, created_at")
    .eq("user_id", input.userId)
    .eq("conversation_id", input.conversationId)
    .is("error_message", null)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 4);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .reverse()
    .flatMap((turn): AgentChatHistoryItem[] => {
      const items: AgentChatHistoryItem[] = [
        {
          role: "user",
          content: turn.user_message.slice(0, 500),
        },
      ];

      if (turn.assistant_message) {
        items.push({
          role: "assistant",
          content: turn.assistant_message.slice(0, 500),
        });
      }

      return items;
    })
    .slice(-8);
}
```

- [ ] **Step 4: Merge server history in the agent route**

In `src/app/api/agent/route.ts`, import:

```ts
import {
  loadRecentAgentChatHistoryForConversation,
  recordAgentChatTurnSafely,
} from "@/lib/data/agent-chat-turns";
```

Add this helper near `createChatTurnRequestMetadata`:

```ts
async function getHydratedHistory(input: {
  routeContext: RouteAgentContext;
  conversationId: string;
  clientHistory: AgentRouteRequest["history"];
  requestKind?: AgentRouteRequest["requestKind"];
}) {
  const clientHistory = input.clientHistory ?? [];

  if (
    input.requestKind === "prompt_chips" ||
    clientHistory.length >= 4 ||
    !input.routeContext.eventContext
  ) {
    return clientHistory;
  }

  const storedHistory = await loadRecentAgentChatHistoryForConversation(
    input.routeContext.eventContext.supabase,
    {
      userId: input.routeContext.eventContext.userId,
      conversationId: input.conversationId,
      limit: 4,
    },
  ).catch(() => []);

  if (storedHistory.length === 0) {
    return clientHistory;
  }

  return [...storedHistory, ...clientHistory].slice(-8);
}
```

Then before `runAIAgent`, add:

```ts
    const hydratedHistory = await getHydratedHistory({
      routeContext,
      conversationId,
      clientHistory: parsed.data.history,
      requestKind: parsed.data.requestKind,
    });
```

Replace:

```ts
        history: parsed.data.history,
```

with:

```ts
        history: hydratedHistory,
```

In `recordAgentEvents` metadata, continue recording the client-sent history length and add hydrated history length:

```ts
    hydratedHistoryLength: hydratedHistory.length,
```

- [ ] **Step 5: Run route tests**

Run:

```bash
npm test -- src/app/api/agent/route.test.ts src/lib/data/agent-chat-turns.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/agent-chat-turns.ts src/app/api/agent/route.ts src/app/api/agent/route.test.ts src/lib/data/agent-chat-turns.test.ts
git commit -m "feat: hydrate agent context from stored chat turns"
```

---

### Task 4: Make Savings Goals Either Enabled Or Cleanly Hidden

**Files:**
- Modify: `.env.example`
- Modify: `src/app/api/agent/route.ts:640-785`
- Modify: `src/lib/agent/ai-agent.ts:159-220,540-610,1130-1225,2038-2045`
- Modify: `src/lib/agent/conversation-state.ts`
- Test: `src/lib/agent/ai-agent.test.ts`
- Test: `src/app/api/agent/route.test.ts`

- [ ] **Step 1: Write failing tests for disabled Savings Goals**

Add this to `src/lib/agent/ai-agent.test.ts`:

```ts
it("does not route savings goal actions when Savings Goals are disabled", () => {
  expect(
    __agentTestHooks.getForcedAgentTool({
      message: "I want to save for a trip that costs $5,000",
      features: {
        savingsGoalsEnabled: false,
      },
    }),
  ).toBeUndefined();
});
```

Add this enabled case beside it:

```ts
it("routes savings goal actions when Savings Goals are enabled", () => {
  expect(
    __agentTestHooks.getForcedAgentTool({
      message: "I want to save for a trip that costs $5,000",
      features: {
        savingsGoalsEnabled: true,
      },
    }),
  ).toMatchObject({
    toolName: "create_savings_goal",
    args: {
      name: "Trip",
      target_amount_cents: 500000,
    },
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "Savings Goals are"
```

Expected: FAIL because `features` is not supported by the classifier.

- [ ] **Step 3: Add feature awareness to agent input**

In `src/lib/agent/ai-agent.ts`, extend `RunAiAgentInput`:

```ts
  features?: {
    savingsGoalsEnabled?: boolean;
  };
```

Extend `PipAgentContext`:

```ts
  features: {
    savingsGoalsEnabled: boolean;
  };
```

In `createPipContext`, add:

```ts
    features: {
      savingsGoalsEnabled: input.features?.savingsGoalsEnabled ?? false,
    },
```

- [ ] **Step 4: Pass the feature flag from the route**

In `src/app/api/agent/route.ts`, add to the `runAIAgent` input:

```ts
        features: {
          savingsGoalsEnabled: isSavingsGoalsEnabled(),
        },
```

- [ ] **Step 5: Gate forced savings tools**

In `src/lib/agent/ai-agent.ts`, update the forced-tool code so savings tools are returned only when the feature is enabled:

```ts
  if (isSavingsGoalPrompt(normalized)) {
    if (input.features?.savingsGoalsEnabled === false) {
      return undefined;
    }

    return getSavingsGoalForcedTool(message, normalized);
  }
```

If `getForcedAgentTool` currently receives only `{ message }`, update its input type to include:

```ts
  features?: {
    savingsGoalsEnabled?: boolean;
  };
```

- [ ] **Step 6: Stop the model from offering disabled Savings Goals**

In the system prompt builder in `src/lib/agent/ai-agent.ts`, replace the unconditional Savings Goals instructions:

```ts
"Use savings goal tools when the user wants to save for a trip, big purchase, emergency fund, or named goal.",
```

with:

```ts
context.features.savingsGoalsEnabled
  ? "Use savings goal tools when the user wants to save for a trip, big purchase, emergency fund, or named goal."
  : "Savings Goals are disabled in this build. If the user wants a goal, help them think through the amount conversationally, but do not say you can save, track, create, or update a goal.",
```

Also wrap the tool-specific Savings Goals instructions with the same feature condition.

- [ ] **Step 7: Verify database readiness before enabling production flags**

Before enabling Savings Goals in production, verify the shipped schema supports it:

```bash
npm test -- src/lib/data/supabase-schema.test.ts src/lib/data/savings-goals-repository.test.ts
```

Expected: PASS, including `savings_goals` table coverage, RLS/grant coverage, and deletion coverage.

Also check the production Supabase migration history or database table list before flipping the flags. Do not rely on local migrations alone.

- [ ] **Step 8: Document the production dogfood flags without changing safe sample defaults**

Keep `.env.example` safe for local/default builds. If it currently says:

```env
PIP_SAVINGS_GOALS_ENABLED=false
NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=false
```

leave those defaults as `false` and add nearby comments:

```env
# Production dogfood override:
# PIP_SAVINGS_GOALS_ENABLED=true
# NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true
```

Do not commit production secrets. The production Netlify environment needs these two values set for phone dogfood:

```text
PIP_SAVINGS_GOALS_ENABLED=true
NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true
```

- [ ] **Step 9: Run tests**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/app/api/agent/route.test.ts src/lib/data/supabase-schema.test.ts src/lib/data/savings-goals-repository.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add .env.example src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts src/app/api/agent/route.ts src/app/api/agent/route.test.ts
git commit -m "fix: align savings goal feature availability"
```

---

### Task 5: Make Savings Goal Routing Forgiving

**Files:**
- Modify: `src/lib/agent/ai-agent.ts:540-650,4100-4250`
- Modify: `src/lib/agent/conversation-state.ts`
- Modify: `src/lib/agent/intent-router.ts`
- Test: `src/lib/agent/ai-agent.test.ts`
- Test: `src/lib/agent/intent-router.test.ts`
- Test: `tests/helpers/mock-agent-runtime.ts`

- [ ] **Step 1: Write failing savings-routing tests**

Add these cases to `src/lib/agent/ai-agent.test.ts`:

```ts
it.each([
  ["Now I want to save for a trip to Bali.", "Bali"],
  ["I want to save money for a big purchase.", "Big purchase"],
  ["Help me save for a car.", "Car"],
  ["Can you track money for vacation?", "Vacation"],
])("recognizes savings goal intent without an amount: %s", async (message, name) => {
  const response = await runAIAgent(
    {
      message,
      features: {
        savingsGoalsEnabled: true,
      },
    },
    createMockModelClient(),
  );

  expect(response.responseMode).toBe("clarify");
  expect(response.pendingAction).toMatchObject({
    type: "create_savings_goal",
    name,
    missing: ["targetAmountCents"],
  });
  expect(response.message.toLowerCase()).toContain("how much");
});
```

Add this amount case:

```ts
it("creates a savings goal immediately when name and amount are present", async () => {
  const response = await runAIAgent(
    {
      message: "I want to save for a trip to Bali that costs $5,000",
      features: {
        savingsGoalsEnabled: true,
      },
      actions: {
        async createSavingsGoal(input) {
          expect(input).toMatchObject({
            name: "Bali",
            targetAmountCents: 500000,
          });

          return {
            ok: true,
            status: "savings_goal_created",
            cards: [
              {
                type: "savings_goal_plan",
                title: "Bali",
                goalId: "goal-1",
                name: "Bali",
                targetAmountCents: 500000,
                currentAmountCents: 0,
                remainingCents: 500000,
                monthlyContributionCents: 0,
                includeInSpendableCash: false,
                summary: "Bali has $5,000 left.",
              },
            ],
          };
        },
      },
    },
    createMockModelClient(),
  );

  expect(response.usedTools).toEqual(["create_savings_goal"]);
  expect(response.cards[0]).toMatchObject({
    type: "savings_goal_plan",
    name: "Bali",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "savings goal"
```

Expected: FAIL for the amountless prompts that currently route to broad chat or snapshot.

- [ ] **Step 3: Add savings intent extraction helpers**

In `src/lib/agent/ai-agent.ts`, add:

```ts
function getSavingsGoalDraft(message: string): {
  name?: string;
  targetAmountCents?: number;
} | null {
  const normalized = normalizePrompt(message);

  if (
    !/\b(save|saving|track|goal|fund)\b/.test(normalized) ||
    !/\b(trip|vacation|bali|car|vehicle|home|house|emergency|big purchase|purchase|wedding|school|tuition|move|moving)\b/.test(normalized)
  ) {
    return null;
  }

  const amountCents = extractExplicitPurchaseAmountCents(message) ?? undefined;
  const name = extractSavingsGoalName(normalized);

  return {
    name,
    targetAmountCents: amountCents,
  };
}

function extractSavingsGoalName(normalized: string): string {
  if (/\bbali\b/.test(normalized)) {
    return "Bali";
  }

  if (/\b(car|vehicle)\b/.test(normalized)) {
    return "Car";
  }

  if (/\b(emergency)\b/.test(normalized)) {
    return "Emergency fund";
  }

  if (/\b(vacation|trip)\b/.test(normalized)) {
    return "Trip";
  }

  if (/\bbig purchase|purchase\b/.test(normalized)) {
    return "Big purchase";
  }

  return "Savings goal";
}
```

- [ ] **Step 4: Use pending action for missing amount**

In `runAIAgent`, before model fallback and after no-tool greetings, add a deterministic branch:

```ts
  const savingsGoalDraft = input.features?.savingsGoalsEnabled
    ? getSavingsGoalDraft(input.message)
    : null;

  if (savingsGoalDraft && !savingsGoalDraft.targetAmountCents) {
    return agentResponseSchema.parse({
      message: `How much do you want to save for ${savingsGoalDraft.name ?? "that goal"}?`,
      cards: [],
      promptChips: [],
      usedTools: [],
      responseMode: "clarify",
      pendingAction: {
        type: "create_savings_goal",
        name: savingsGoalDraft.name,
        missing: ["targetAmountCents"],
      },
      audit: {
        toolNames: [],
        usedModel: false,
      },
    });
  }
```

This uses the same direct `agentResponseSchema.parse` pattern already used by existing deterministic trust responses.

- [ ] **Step 5: Keep newer intent-router path aligned**

In `src/lib/agent/intent-catalog.ts`, add `"savings_goal"` to `IntentSurface`:

```ts
export type IntentSurface =
  | "read_card"
  | "guidance"
  | "policy_answer"
  | "setup_action"
  | "account_action"
  | "savings_goal";
```

In `src/lib/agent/conversation-state.ts`, add `"savings_goal"` to `ConversationJob`:

```ts
  | "savings_goal"
```

Then add these entries to `intentCatalog` in `src/lib/agent/intent-catalog.ts`, near the other write-action entries:

```ts
{
  id: "savings.goal_create",
  family: "savings_goal",
  surface: "savings_goal",
  risk: "write_action",
  priority: 96,
  toolName: "create_savings_goal",
  cardTypes: ["savings_goal_plan"],
  responseMode: "show_card",
  requiresSnapshot: false,
  requiresConfirmation: false,
  destructive: false,
  supportedInPromptChips: false,
  conversationJob: "savings_goal",
  description: "Create or start a named savings goal for a trip, purchase, emergency fund, or similar target.",
  positiveExamples: [
    "I want to save for a trip",
    "I want to save for Bali",
    "I want to save money for a big purchase",
    "Help me save for a car",
    "Can you track money for vacation?",
    "I want to save for a trip that costs $5,000",
  ],
  negativeExamples: [
    "How can I save money this week?",
    "What can I cut back on?",
    "Where am I overspending?",
  ],
  lexicalBoosts: [
    "save for",
    "savings goal",
    "track money for",
    "big purchase",
    "vacation",
    "trip",
    "bali",
  ],
  lexicalHardNegatives: [
    "save money this week",
    "cut back",
    "spending opportunity",
    "where am i overspending",
  ],
  requiredSlots: [],
  followUpParents: [],
  followUpChildren: ["savings.goal_protection"],
},
{
  id: "savings.goal_protection",
  family: "savings_goal",
  surface: "savings_goal",
  risk: "write_action",
  priority: 94,
  toolName: "set_savings_goal_protection",
  cardTypes: ["savings_goal_plan"],
  responseMode: "show_card",
  requiresSnapshot: false,
  requiresConfirmation: false,
  destructive: false,
  supportedInPromptChips: false,
  conversationJob: "savings_goal",
  description: "Keep a savings goal monthly contribution out of Spendable Cash Today or stop doing so.",
  positiveExamples: [
    "Keep my trip goal out of Spendable Cash at $300/month",
    "Do not count my vacation savings in Spendable Cash Today",
    "Protect $200 per month for my car goal",
  ],
  negativeExamples: [
    "Set my monthly savings",
    "Mark this account as protected savings",
  ],
  lexicalBoosts: [
    "keep my",
    "out of spendable cash",
    "protect",
    "per month",
    "monthly contribution",
  ],
  lexicalHardNegatives: [
    "account",
    "monthly savings",
    "savings cushion",
  ],
  requiredSlots: [],
  followUpParents: ["savings.goal_create"],
  followUpChildren: [],
},
```

- [ ] **Step 6: Update mock runtime**

In `tests/helpers/mock-agent-runtime.ts`, add savings branches before generic snapshot/cutback branches:

```ts
if (/\b(save|saving|track|goal|fund)\b/.test(normalized) && /\b(trip|vacation|bali|car|big purchase|purchase)\b/.test(normalized)) {
  if (!/\$|\d+\s*(dollars?|bucks?)/.test(normalized)) {
    return createMockAgentResponse({
      message: "How much do you want to save for that goal?",
      responseMode: "clarify",
      pendingAction: {
        type: "create_savings_goal",
        name: normalized.includes("bali") ? "Bali" : "Savings goal",
        missing: ["targetAmountCents"],
      },
    });
  }

  return createSavingsGoalPlanResponse();
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/intent-router.test.ts tests/e2e/ai-agent.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts src/lib/agent/intent-router.ts src/lib/agent/intent-router.test.ts tests/helpers/mock-agent-runtime.ts tests/e2e/ai-agent.spec.ts
git commit -m "fix: recognize natural savings goal requests"
```

---

### Task 6: Execute Pending Savings Actions On "Yes"

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/lib/agent/conversation-state.ts`
- Modify: `src/lib/agent/intent-router.ts`
- Test: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Write failing affirmative follow-up tests**

Add:

```ts
it("uses pending action when the user says yes after a savings goal offer", async () => {
  const response = await runAIAgent(
    {
      message: "yes",
      features: {
        savingsGoalsEnabled: true,
      },
      conversationState: {
        shownCards: [],
        lastToolNames: [],
        promptChips: [],
        pendingAction: {
          type: "create_savings_goal",
          name: "Bali",
          targetAmountCents: 500000,
          missing: [],
        },
      },
      actions: {
        async createSavingsGoal(input) {
          expect(input).toMatchObject({
            name: "Bali",
            targetAmountCents: 500000,
          });

          return {
            ok: true,
            status: "savings_goal_created",
            cards: [
              {
                type: "savings_goal_plan",
                title: "Bali",
                goalId: "goal-1",
                name: "Bali",
                targetAmountCents: 500000,
                currentAmountCents: 0,
                remainingCents: 500000,
                monthlyContributionCents: 0,
                includeInSpendableCash: false,
                summary: "Bali has $5,000 left.",
              },
            ],
          };
        },
      },
    },
    createMockModelClient(),
  );

  expect(response.usedTools).toEqual(["create_savings_goal"]);
  expect(response.responseMode).toBe("show_card");
  expect(response.cards[0]).toMatchObject({
    type: "savings_goal_plan",
    name: "Bali",
  });
});
```

Add:

```ts
it("asks for the missing amount when the pending savings action is incomplete", async () => {
  const response = await runAIAgent(
    {
      message: "yes",
      features: {
        savingsGoalsEnabled: true,
      },
      conversationState: {
        shownCards: [],
        lastToolNames: [],
        promptChips: [],
        pendingAction: {
          type: "create_savings_goal",
          name: "Bali",
          missing: ["targetAmountCents"],
        },
      },
    },
    createMockModelClient(),
  );

  expect(response.usedTools).toEqual([]);
  expect(response.responseMode).toBe("clarify");
  expect(response.message.toLowerCase()).toContain("how much");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "pending savings"
```

Expected: FAIL because `pendingAction` is not used yet.

- [ ] **Step 3: Add pending-action execution helper**

In `src/lib/agent/ai-agent.ts`, add one small deterministic-response helper near the other deterministic response helpers:

If `AgentPendingAction` is not already imported from `src/lib/agent/card-types.ts`, add it to the existing type import beside `AgentResponse`, `AgentCard`, and `PromptChip`.

```ts
function createPendingActionAgentResponse(input: {
  message: string;
  responseMode: AgentResponse["responseMode"];
  cards?: AgentCard[];
  promptChips?: PromptChip[];
  usedTools?: string[];
  pendingAction?: AgentPendingAction;
}): AgentResponse {
  const usedTools = input.usedTools ?? [];

  return agentResponseSchema.parse({
    message: input.message,
    cards: input.cards ?? [],
    promptChips: input.promptChips ?? [],
    usedTools,
    responseMode: input.responseMode,
    ...(input.pendingAction ? { pendingAction: input.pendingAction } : {}),
    audit: {
      toolNames: usedTools,
      usedModel: false,
    },
  });
}
```

Then add the pending-action runner:

```ts
function isAffirmative(normalized: string): boolean {
  return /^(yes|yeah|yep|ok|okay|sure|do that|yes do that|please do|that)$/.test(normalized);
}

async function runPendingActionIfConfirmed(
  input: RunAiAgentInput,
  context: PipAgentContext,
): Promise<AgentResponse | null> {
  const pendingAction = input.conversationState?.pendingAction;
  const normalized = normalizePrompt(input.message);

  if (!pendingAction || !isAffirmative(normalized)) {
    return null;
  }

  if (pendingAction.type === "create_savings_goal") {
    if (!pendingAction.targetAmountCents) {
      return createPendingActionAgentResponse({
        message: `How much do you want to save for ${pendingAction.name ?? "that goal"}?`,
        responseMode: "clarify",
        pendingAction,
      });
    }

    recordTool(context, "create_savings_goal");

    if (!context.actions?.createSavingsGoal) {
      return createPendingActionAgentResponse({
        message: "Savings goals are not available in this build yet.",
        responseMode: "clarify",
        usedTools: ["create_savings_goal"],
      });
    }

    const beforeCardCount = context.availableCards.length;
    const actionResult = await context.actions.createSavingsGoal({
      name: pendingAction.name ?? "Savings goal",
      targetAmountCents: pendingAction.targetAmountCents,
      targetDate: pendingAction.targetDate,
      monthlyContributionCents: pendingAction.monthlyContributionCents,
      includeInSpendableCash: pendingAction.includeInSpendableCash,
    });
    const safeResult = applyActionResult(context, actionResult);
    const cards = context.availableCards.slice(beforeCardCount);

    return createPendingActionAgentResponse({
      message: typeof safeResult.message === "string" ? safeResult.message : "I set up the savings goal plan.",
      responseMode: cards.length > 0 ? "show_card" : "update_context",
      cards,
      usedTools: ["create_savings_goal"],
    });
  }

  if (pendingAction.type === "set_savings_goal_protection") {
    if (pendingAction.missing.includes("goal")) {
      return createPendingActionAgentResponse({
        message: "Which savings goal do you want me to keep out of Spendable Cash Today?",
        responseMode: "clarify",
        pendingAction,
      });
    }

    recordTool(context, "set_savings_goal_protection");

    if (!context.actions?.setSavingsGoalProtection) {
      return createPendingActionAgentResponse({
        message: "Savings goals are not available in this build yet.",
        responseMode: "clarify",
        usedTools: ["set_savings_goal_protection"],
      });
    }

    const beforeCardCount = context.availableCards.length;
    const actionResult = await context.actions.setSavingsGoalProtection({
      goalId: pendingAction.goalId,
      name: pendingAction.name,
      includeInSpendableCash: pendingAction.includeInSpendableCash,
      monthlyContributionCents: pendingAction.monthlyContributionCents,
    });
    const safeResult = applyActionResult(context, actionResult);
    const cards = context.availableCards.slice(beforeCardCount);

    return createPendingActionAgentResponse({
      message: typeof safeResult.message === "string" ? safeResult.message : "I updated how that savings goal affects Spendable Cash Today.",
      responseMode: cards.length > 0 ? "show_card" : "update_context",
      cards,
      usedTools: ["set_savings_goal_protection"],
    });
  }

  return null;
}
```

This deliberately uses the repo's existing `recordTool` and `applyActionResult(context, result)` helpers. The returned `AgentResponse` must preserve this visible contract:

```ts
usedTools: ["create_savings_goal"]
```

or:

```ts
usedTools: ["set_savings_goal_protection"]
```

- [ ] **Step 4: Call pending-action helper before generic routing**

In `runAIAgent`, after `const context = createPipContext(...)` and before forced tool routing/model fallback, add:

```ts
  const pendingActionResponse = await runPendingActionIfConfirmed(input, context);

  if (pendingActionResponse) {
    return pendingActionResponse;
  }
```

- [ ] **Step 5: Teach the older affirmative-follow-up classifier about savings offers**

In `src/lib/agent/intent-router.ts`, update `getOfferedFollowUpIntentId`:

```ts
  if (/\b(savings goal|save for|track.*goal|keep.*out of spendable cash|monthly contribution)\b/.test(normalizedAssistantMessage)) {
    return "savings.goal_create";
  }
```

Use the `savings.goal_create` ID introduced in Task 5.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/intent-router.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts src/lib/agent/intent-router.ts src/lib/agent/intent-router.test.ts
git commit -m "fix: execute confirmed pending savings actions"
```

---

### Task 7: Remove Visible Cushion Language

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/lib/agent/answer-composer.ts`
- Modify: `src/lib/agent/conversation-state.ts`
- Modify: `src/lib/pip-cash/guidance-context.ts` only if visible labels leak
- Test: `src/lib/agent/ai-agent.test.ts`
- Test: `src/lib/agent/answer-composer.test.ts`

- [ ] **Step 1: Write failing copy test**

Add to `src/lib/agent/ai-agent.test.ts`:

```ts
it("answers old cushion wording with Monthly Savings language", async () => {
  const response = await runAIAgent(
    {
      message: "Why does Pip need a savings cushion?",
      features: {
        savingsGoalsEnabled: true,
      },
    },
    createMockModelClient(),
  );

  expect(response.message.toLowerCase()).toContain("monthly savings");
  expect(response.message.toLowerCase()).not.toContain("savings cushion");
  expect(response.message.toLowerCase()).not.toContain("cushion");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "old cushion"
```

Expected: FAIL while visible answers still reuse "cushion."

- [ ] **Step 3: Add deterministic legacy copy handler**

In `src/lib/agent/ai-agent.ts`, before model fallback, add:

```ts
if (/\b(savings cushion|cushion)\b/.test(normalizedMessage)) {
  return agentResponseSchema.parse({
    message:
      "Monthly Savings is the amount I keep out of Spendable Cash Today so saving feels automatic. I do not move money.",
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
```

Use the existing normalized variable name in the file. If it is `normalized`, use `normalized`.

- [ ] **Step 4: Sanitize fallback text**

In `src/lib/agent/answer-composer.ts`, add:

```ts
function normalizeSavingsLanguage(message: string): string {
  return message
    .replace(/\bsavings cushion\b/gi, "Monthly Savings")
    .replace(/\bprotected savings\b/gi, "Monthly Savings")
    .replace(/\bcushion\b/gi, "Monthly Savings");
}
```

Before returning a deterministic message, wrap it:

```ts
message: normalizeSavingsLanguage(message),
```

Do not apply this to internal IDs like `hidden-cushion`; only apply it to visible message strings.

- [ ] **Step 5: Run copy search**

Run:

```bash
rg -n "savings cushion|Savings cushion|\\bcushion\\b|\\bCushion\\b" src docs public tests
```

Expected remaining hits only in:

```text
hiddenCushionCents
hidden-cushion
legacy input tests
docs/savings-implementation-guide.md
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/answer-composer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts src/lib/agent/answer-composer.ts src/lib/agent/answer-composer.test.ts
git commit -m "fix: remove visible cushion language"
```

---

### Task 8: Force Real Account And Balance Tools

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/lib/agent/intent-router.ts`
- Modify: `src/lib/agent/conversation-state.ts`
- Test: `src/lib/agent/ai-agent.test.ts`
- Test: `src/lib/agent/intent-router.test.ts`

- [ ] **Step 1: Write failing tests for account questions**

Add to `src/lib/agent/ai-agent.test.ts`:

```ts
it.each([
  ["Show my bank accounts", "get_connected_accounts"],
  ["Where are they?", "get_connected_accounts"],
  ["I want to see my actual bank balances", "get_true_balances"],
])("forces account tools for account question: %s", (message, toolName) => {
  expect(
    __agentTestHooks.getForcedAgentTool({
      message,
      history:
        message === "Where are they?"
          ? [
              {
                role: "user",
                content: "Show my bank accounts",
              },
              {
                role: "assistant",
                content: "I can show connected accounts.",
              },
            ]
          : [],
    }),
  ).toMatchObject({
    toolName,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "account question"
```

Expected: FAIL for at least "Show my bank accounts" or "Where are they?"

- [ ] **Step 3: Add account forced-tool rules**

In `src/lib/agent/ai-agent.ts`, add:

```ts
function getAccountQuestionForcedTool(
  normalized: string,
  history: AgentHistoryItem[] | undefined,
): ForcedAgentTool | undefined {
  if (/\b(actual|real|dollar)\b.{0,24}\b(balance|balances)\b/.test(normalized)) {
    return {
      toolName: "get_true_balances",
      args: {},
      requireCard: true,
    };
  }

  if (/\b(bank accounts?|connected accounts?|accounts connected|show my accounts)\b/.test(normalized)) {
    return {
      toolName: "get_connected_accounts",
      args: {},
      requireCard: true,
    };
  }

  const recentAskedAccounts = (history ?? [])
    .slice(-4)
    .some((item) => item.role === "user" && /\b(bank accounts?|connected accounts?|accounts)\b/.test(normalizePrompt(item.content)));

  if (recentAskedAccounts && /^(where are they|where|show them|what are they|which ones)$/i.test(normalized)) {
    return {
      toolName: "get_connected_accounts",
      args: {},
      requireCard: true,
    };
  }

  return undefined;
}
```

Call it before model fallback and before broad-chat handling:

```ts
const accountQuestionTool = getAccountQuestionForcedTool(normalized, input.history);

if (accountQuestionTool) {
  return accountQuestionTool;
}
```

- [ ] **Step 4: Strengthen system instruction**

In the prompt instructions, add:

```ts
"Never answer connected account or bank balance questions from memory or placeholder labels. Use get_connected_accounts or get_true_balances, or say I cannot see that data.",
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/intent-router.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts src/lib/agent/intent-router.ts src/lib/agent/intent-router.test.ts
git commit -m "fix: force account tools for account questions"
```

---

### Task 9: Move Receipt Metadata Out Of The Spendable Cash Hero

**Files:**
- Modify: `src/components/PipHome.tsx:920-950`
- Modify: `src/components/PipHome.test.tsx`
- Test: `src/components/PipHome.test.tsx`

- [ ] **Step 1: Write failing UI test**

Add to `src/components/PipHome.test.tsx`:

```tsx
it("does not render the full trust receipt under the Spendable Cash Today number", () => {
  render(<PipHome initialScenario="default" />);

  expect(screen.getByTestId("pip-cash-number")).toBeInTheDocument();
  expect(screen.queryByTestId("pip-trust-receipt")).not.toBeInTheDocument();
  expect(screen.queryByText(/Connected data refreshed/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/known limits/i)).not.toBeInTheDocument();
});
```

Use the same `render(<PipHome initialScenario="default" />)` pattern already used in `src/components/PipHome.test.tsx`; keep the assertions exactly as above.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/PipHome.test.tsx -t "full trust receipt"
```

Expected: FAIL because `pip-trust-receipt` currently renders under the metric.

- [ ] **Step 3: Remove the full receipt line from the hero**

In `src/components/PipHome.tsx`, delete:

```tsx
                {trustReceipt ? (
                  <p className="pip-metric-receipt" data-testid="pip-trust-receipt">
                    {formatTrustReceiptInline(trustReceipt)}
                  </p>
                ) : null}
```

Keep the trust receipt available through Ask Pip / Settings. Do not delete `buildSpendableTrustReceipt`; cards still need it.

- [ ] **Step 4: Add compact freshness only when sync is active or failed**

Add this helper near other UI helpers:

```ts
function getCompactFreshnessLabel(syncStatus: SyncStatusResponse | null): string | null {
  const latest = syncStatus?.latestSyncRun;

  if (!latest) {
    return null;
  }

  if (latest.status === "failed") {
    return "Refresh failed";
  }

  if (latest.status === "partial") {
    return "Refresh needs attention";
  }

  return null;
}
```

In the hero, after the number, render only:

```tsx
                {getCompactFreshnessLabel(syncStatus) ? (
                  <p className="pip-metric-receipt" data-testid="pip-refresh-status">
                    {getCompactFreshnessLabel(syncStatus)}
                  </p>
                ) : null}
```

Do not render normal successful refresh timestamps under the number.

- [ ] **Step 5: Run test**

Run:

```bash
npm test -- src/components/PipHome.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/PipHome.tsx src/components/PipHome.test.tsx
git commit -m "fix: simplify spendable cash hero metadata"
```

---

### Task 10: Refresh Connected Data On Every App Open

**Files:**
- Modify: `src/lib/data/app-open-sync.ts`
- Modify: `src/app/api/sync/app-open/route.test.ts`
- Modify: `src/components/data-controls-helpers.ts`
- Modify: `src/components/PipHome.tsx:300-330,1267-1298`
- Modify: `src/components/PipHome.test.tsx`

- [ ] **Step 1: Write failing server decision tests**

In `src/app/api/sync/app-open/route.test.ts`, replace or add:

```ts
it("runs app-open refresh even when connected data synced earlier today", () => {
  const decision = getAppOpenSyncDecision({
    syncStatus: createSyncStatus({
      institutions: [
        {
          provider: "plaid",
          lastSuccessfulSyncAt: "2026-06-19T12:00:00.000Z",
          staleAfter: "2026-06-20T12:00:00.000Z",
          isStale: false,
        },
      ],
      latestSyncRun: {
        provider: "plaid",
        status: "succeeded",
        startedAt: "2026-06-19T12:00:00.000Z",
        completedAt: "2026-06-19T12:00:02.000Z",
        accountCount: 5,
        transactionCount: 0,
        balanceCount: 5,
        errorMessage: null,
      },
    }),
    hasPendingSyncJob: false,
    now: new Date("2026-06-19T18:00:00.000Z"),
  });

  expect(decision).toEqual({
    status: "run",
    provider: "plaid",
  });
});
```

Add duplicate guard test:

```ts
it("skips app-open refresh only when a sync started in the last minute", () => {
  const decision = getAppOpenSyncDecision({
    syncStatus: createSyncStatus({
      institutions: [
        {
          provider: "plaid",
          lastSuccessfulSyncAt: "2026-06-19T12:00:00.000Z",
          staleAfter: "2026-06-20T12:00:00.000Z",
          isStale: false,
        },
      ],
      latestSyncRun: {
        provider: "plaid",
        status: "succeeded",
        startedAt: "2026-06-19T18:00:20.000Z",
        completedAt: "2026-06-19T18:00:21.000Z",
        accountCount: 5,
        transactionCount: 0,
        balanceCount: 5,
        errorMessage: null,
      },
    }),
    hasPendingSyncJob: false,
    now: new Date("2026-06-19T18:01:00.000Z"),
  });

  expect(decision.status).toBe("skipped_recent");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/app/api/sync/app-open/route.test.ts -t "app-open refresh"
```

Expected: FAIL because the current app-open policy treats fresh data as skippable.

- [ ] **Step 3: Change server app-open decision policy**

In `src/lib/data/app-open-sync.ts`, replace:

```ts
const APP_OPEN_SYNC_COOLDOWN_MS = 10 * 60 * 1000;
```

with:

```ts
const APP_OPEN_DUPLICATE_GUARD_MS = 60 * 1000;
```

Replace all `APP_OPEN_SYNC_COOLDOWN_MS` references with `APP_OPEN_DUPLICATE_GUARD_MS`.

In `getAppOpenSyncDecision`, remove the `dueInstitution` dependency. The core should become:

```ts
  const refreshableInstitutions = getRefreshableInstitutions(input.syncStatus);
  const provider = refreshableInstitutions[0]?.provider ?? null;
```

After the duplicate guard:

```ts
  if (retryAfterSeconds > 0) {
    return {
      status: "skipped_recent",
      message: "A refresh just ran.",
      retryAfterSeconds,
      ...(lastSuccessfulSyncAt ? { lastSuccessfulSyncAt } : {}),
    };
  }

  return {
    status: "run",
    provider,
  };
```

Keep `needs_repair`, `no_provider`, and `skipped_pending` unchanged.

- [ ] **Step 4: Align client helper**

In `src/components/data-controls-helpers.ts`, change `shouldRefreshConnectedDataForToday` to:

```ts
export function shouldRefreshConnectedDataForToday(
  syncStatus: SyncStatusResponse,
): boolean {
  if (syncStatus.hasStaleInstitution) {
    return true;
  }

  return Boolean(getRefreshProvider(syncStatus));
}
```

Remove unused `getCalendarDate` import if no longer needed.

- [ ] **Step 5: Make foreground refresh visibly reload data**

In `src/components/PipHome.tsx`, keep the 60-second client duplicate guard, but make sure every successful app-open attempt reloads both `/api/pip-cash` and `/api/sync/status`.

Replace the payload status block:

```ts
      if (
        response.ok &&
        payload &&
        typeof payload === "object" &&
        "status" in payload &&
        (payload.status === "ran" ||
          payload.status === "needs_repair" ||
          payload.status === "failed")
      ) {
        setBackendReloadKey((current) => current + 1);
      }
```

with:

```ts
      if (
        response.ok &&
        payload &&
        typeof payload === "object" &&
        "status" in payload &&
        payload.status !== "skipped_recent"
      ) {
        setBackendReloadKey((current) => current + 1);
      }
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/app/api/sync/app-open/route.test.ts src/components/PipHome.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/app-open-sync.ts src/app/api/sync/app-open/route.test.ts src/components/data-controls-helpers.ts src/components/PipHome.tsx src/components/PipHome.test.tsx
git commit -m "fix: refresh connected data on app open"
```

---

### Task 11: Add Phone Transcript Regression Coverage

**Files:**
- Modify: `tests/e2e/ai-agent.spec.ts`
- Modify: `scripts/eval-agent.mjs`
- Modify: `scripts/eval-agent.test.ts`
- Modify: `tests/helpers/mock-agent-runtime.ts`

- [ ] **Step 1: Extend eval assertions for pending actions and forbidden text**

In `scripts/eval-agent.mjs`, update `evaluateAgentResponse` support before adding the new cases:

```js
const pendingActionType = typeof response?.pendingAction?.type === "string" ? response.pendingAction.type : "";
```

Add:

```js
if (caseDef.expectedPendingActionType && pendingActionType !== caseDef.expectedPendingActionType) {
  failures.push(`expected pendingAction ${caseDef.expectedPendingActionType} but got ${pendingActionType || "none"}.`);
}

for (const patternSource of asArray(caseDef.forbiddenTextPatterns)) {
  const pattern = new RegExp(String(patternSource), "i");

  if (pattern.test(getResponseSearchText(response, message))) {
    failures.push(`forbidden response text pattern found: ${patternSource}`);
  }
}
```

Also update `buildRequestBody` so eval cases can pass a pending action when needed:

```js
      pendingAction: providedState.pendingAction,
```

Add `scripts/eval-agent.test.ts` coverage for:

- `expectedPendingActionType` passes when the response includes that pending action.
- `expectedPendingActionType` fails when missing.
- `forbiddenTextPatterns` fails when matching assistant text or card text.
- `conversationState.pendingAction` is included in the request body.

- [ ] **Step 2: Add transcript cases to eval script**

In `scripts/eval-agent.mjs`, add cases:

```js
{
  id: "phone-save-trip-bali-no-amount",
  description: "Phone dogfood: a named trip without an amount should create a pending savings goal slot fill.",
  message: "Now I want to save for a trip to Bali.",
  expectedResponseMode: "clarify",
  expectedPendingActionType: "create_savings_goal",
  forbiddenTextPatterns: ["\\bcushion\\b", "I'm not sure what you mean"],
},
{
  id: "phone-save-big-purchase-no-amount",
  description: "Phone dogfood: big-purchase savings should not route to Spendable Cash snapshot.",
  message: "I want to save money for a big purchase",
  expectedResponseMode: "clarify",
  expectedPendingActionType: "create_savings_goal",
  forbiddenTools: ["get_pip_cash_snapshot"],
},
{
  id: "phone-cushion-legacy-wording",
  description: "Phone dogfood: legacy cushion wording should be reframed as Monthly Savings.",
  message: "Why does Pip need a savings cushion?",
  expectedTextPatterns: ["Monthly Savings"],
  forbiddenTextPatterns: ["savings cushion", "\\bcushion\\b"],
},
{
  id: "phone-show-bank-accounts",
  description: "Phone dogfood: account-list requests should use real connected-account tools.",
  message: "Show my bank accounts",
  expectedTools: ["get_connected_accounts"],
  expectedCards: ["account_connections"],
  forbiddenTextPatterns: ["Bank A", "Bank B"],
},
```

Add those cases to the `agentEvalCases` array using top-level fields. Do not nest expectations under an `expected` property; the current eval runner does not read that shape.

- [ ] **Step 3: Add E2E flow**

In `tests/e2e/ai-agent.spec.ts`, add:

```ts
test("phone dogfood savings flow stays coherent", async ({ page }) => {
  await openPipReadyState(page, {
    savingsGoalsEnabled: true,
  });

  await askPip(page, "Now I want to save for a trip to Bali.");
  await expect(page.getByText(/How much do you want to save/i)).toBeVisible();
  await expect(page.getByText(/I'm not sure what you mean/i)).toHaveCount(0);

  await askPip(page, "$5,000");
  await expect(page.getByText(/Bali/i)).toBeVisible();
  await expect(page.getByText(/savings goal/i)).toBeVisible();

  await askPip(page, "Why does Pip need a savings cushion?");
  await expect(page.getByText(/Monthly Savings/i)).toBeVisible();
  await expect(page.getByText(/savings cushion/i)).toHaveCount(0);

  await askPip(page, "Show my bank accounts");
  await expect(page.getByText(/Account connections/i)).toBeVisible();
  await expect(page.getByText(/Bank A|Bank B/i)).toHaveCount(0);
});
```

Use the existing page helpers in `tests/e2e/ai-agent.spec.ts`: `routeAgentThroughMockModel(page)`, `waitForAgentResponse(page)`, `page.getByLabel("Ask Pip")`, and `page.getByRole("button", { name: "Send" }).click()`.

- [ ] **Step 4: Run eval tests**

Run:

```bash
npm test -- scripts/eval-agent.test.ts tests/e2e/ai-agent.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval-agent.mjs scripts/eval-agent.test.ts tests/e2e/ai-agent.spec.ts tests/helpers/mock-agent-runtime.ts
git commit -m "test: cover phone dogfood conversation failures"
```

---

### Task 12: Production Flag And Phone QA Handoff

**Files:**
- Modify: `docs/savings-implementation-guide.md`
- Optional Modify: deployment environment outside repo

- [ ] **Step 1: Document required production flags**

In `docs/savings-implementation-guide.md`, add a section:

```md
## Production Dogfood Flags

Savings Goals must not be half-enabled.

Required for full dogfood:

- `PIP_SAVINGS_GOALS_ENABLED=true`
- `NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true`

If either flag is off:

- Ask Pip must not offer to create, track, update, or protect savings goals.
- Ask Pip may still help the user think through a goal conversationally.
- The app must not show Savings Goals UI affordances.
```

- [ ] **Step 2: Run full local verification before deploy**

Run:

```bash
npm test
npm run build
npm run test:e2e -- tests/e2e/ai-agent.spec.ts
```

Expected:

```text
Test Files ... passed
✓ Compiled successfully
tests/e2e/ai-agent.spec.ts ... passed
```

- [ ] **Step 3: Roll production dogfood flags deliberately**

Only after local verification passes:

1. Confirm production has the `savings_goals` schema, RLS, grants, and deletion coverage.
2. Set both production Netlify environment variables:

```text
PIP_SAVINGS_GOALS_ENABLED=true
NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true
```

3. Trigger a production rebuild/redeploy because `NEXT_PUBLIC_SAVINGS_GOALS_ENABLED` is build-time client config.
4. Confirm the deployed app response includes enabled Savings Goals behavior before phone QA.

Rollback path if QA fails:

```text
PIP_SAVINGS_GOALS_ENABLED=false
NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=false
```

Then trigger another production rebuild/redeploy. Do not drop `savings_goals` data as part of rollback unless there is a separate retention decision.

- [ ] **Step 4: Manual phone QA after deploy**

On the phone, run this exact script:

```text
Open Pip fresh.
Confirm the main number appears quickly.
Confirm no long "Connected data refreshed..." sentence appears under the number.
Confirm a refresh happens or a clear refresh status appears.
Ask: Now I want to save for a trip to Bali.
Expected: Pip asks how much, not "I'm not sure."
Reply: $5,000.
Expected: Pip creates or shows a Bali savings goal.
Ask: Yes.
Expected: If there is a pending action, Pip completes that action. It must not show a forecast unless the prior assistant message offered a forecast.
Ask: I need you to keep my savings goal out of Spendable Cash Today at $300/month.
Expected: Pip updates goal protection and the top number refreshes or reloads.
Ask: Why does Pip need a savings cushion?
Expected: answer says Monthly Savings and does not say cushion.
Ask: Show my bank accounts.
Expected: real connected accounts card, no Bank A or Bank B placeholder wording.
Ask: I want to see my actual bank balances.
Expected: true balances card.
```

- [ ] **Step 5: Commit docs**

```bash
git add docs/savings-implementation-guide.md
git commit -m "docs: add savings goals production dogfood checklist"
```

- [ ] **Step 6: Push**

```bash
git push origin pip-phone-dogfood-repair
```

Expected:

```text
pip-phone-dogfood-repair -> pip-phone-dogfood-repair
```

---

## Final Acceptance Criteria

- Savings Goals are not half-enabled: the app either fully supports them or does not offer them.
- "Now I want to save for a trip to Bali" asks for the missing amount.
- "$5,000" after the Bali prompt creates or prepares the Bali goal.
- "Yes" after a pending Savings Goal action completes that action or asks for the missing slot.
- "Yes" never routes to forecast unless the previous assistant turn clearly offered a forecast.
- "I want to save money for a big purchase" does not route to Spendable Cash snapshot.
- "Why does Pip need a savings cushion?" answers with Monthly Savings wording and no visible "cushion."
- Account questions call account/balance tools and never invent placeholder banks.
- The Spendable Cash Today hero does not show the full trust receipt line.
- App open or foreground triggers connected-data refresh unless a sync is already pending/running or was started in the last 60 seconds.
- The phone QA script passes on the deployed app.

## Self-Review

**Spec coverage:** The plan covers Savings Goals availability, multi-turn context, affirmative follow-ups, savings intent routing, cushion wording, account/balance hallucinations, hero receipt clutter, and app-open refresh.

**Placeholder scan:** No task contains "TBD", "TODO", "add appropriate", "handle edge cases", or "write tests for the above." Every implementation task includes concrete tests, snippets, commands, and expected results.

**Type consistency:** The plan introduces `AgentPendingAction` once in `card-types.ts`, validates it in `response-schema.ts`, passes it through `PipHome` conversation state, accepts it in `/api/agent`, and consumes it in `runAIAgent`.
