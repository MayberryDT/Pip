# Pip Savings Goals Product Deploy Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pip's savings-goal chat experience good enough for product deploy by ensuring goal setup, follow-up, and release gates work through the real agent/API path, not only mocked UI tests.

**Architecture:** Move savings-goal setup out of best-effort model behavior and into deterministic product state. The model may explain and phrase responses, but typed pending actions, goal writes, progress reads, false-claim prevention, and deploy gates are owned by code and tests.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Playwright, Supabase repositories, existing `/api/agent` actions, existing savings-goal API/card helpers, `scripts/eval-agent.mjs`, and Codex in-app Browser for phone UI verification.

---

## Optimizer Result

This plan is optimized against the direct conversation testing record in GBrain slug `sessions/2026/06/pip-direct-conversation-testing-execution` and the local report `/tmp/pip-direct-conversation-test-report.md`.

### Rubric

- Deploy-blocker correctness: 25 points
  - Low: fixes the happy-path copy only.
  - Medium: creates goals in some cases, but leaves model-dependent branches.
  - High: every supported savings setup path either saves through the tool or clearly says it did not save.
- Deterministic state and tool safety: 20 points
  - Low: relies on prompt wording.
  - Medium: uses pending state but does not protect reloads, short follow-ups, or false success claims.
  - High: typed pending actions, deterministic execution, durable context, and response repair all agree.
- Test, eval, and authenticated proof: 20 points
  - Low: unit tests only.
  - Medium: mocked E2E plus some evals.
  - High: unit tests, focused E2E, real-agent evals, phone transcript, and authenticated Supabase CRUD all pass.
- Product trust and UX clarity: 10 points
  - Low: savings copy is inconsistent or overclaims.
  - Medium: mostly clear, but still uses legacy "cushion" or hides important state.
  - High: users understand savings tracking, money is not moved, and screen space is used well.
- Rollout and operational safety: 15 points
  - Low: merge and deploy directly.
  - Medium: preview deploy with manual testing.
  - High: feature flags, preview verification, rollback path, production env checks, and documented release evidence.
- Maintainability and scope control: 10 points
  - Low: more branching inside the already large agent file.
  - Medium: contained edits but weak boundaries.
  - High: helpers are testable, interfaces are typed, and unrelated behavior is not refactored.

### Score Trajectory

`78 -> 88 -> 94 -> 94`

### Substantive Optimizations

- Added a false-success guard: Pip must never say a goal was created, saved, set, or tracked unless `create_savings_goal` succeeded and returned a savings card.
- Added authenticated CRUD and reload proof as a deploy gate, because the current evidence only proves mock UI and unauthenticated local behavior.
- Split primary savings blockers from secondary routing regressions so the core savings fix can be reviewed independently while still requiring all eval failures to clear before deploy.
- Added explicit rollback and flag strategy for preview and production.

---

## Current Release Verdict

Do not product-deploy savings goals yet.

The current real path fails the deploy-critical transcript:

```text
User: I need to save for a trip to Japan
Pip: How much do you want to save for Japan trip?

User: Yes
Pip: How much do you want to save for Japan trip?

User: Set the savings goal
Pip: How much do you want to save for Japan trip?

User: $3000 by December 1st
Pip: I can set up a savings goal for Japan now...

User: How much do I need to hit that goal?
Pip: Savings goals are not available yet.
```

The key corrected finding: `pendingAction.type === "create_savings_goal"` is preserved through the first three Japan turns in the flagged eval. The blocker is the amount/date turn: `$3000 by December 1st` does not call `create_savings_goal`, does not return a `savings_goal_plan`, and the next progress question does not return the Japan goal.

---

## Deploy Definition Of Done

- [ ] `I need to save for a trip to Japan` starts a typed pending savings-goal draft.
- [ ] `Yes` and `Set the savings goal` preserve the draft and ask only for the missing amount/date.
- [ ] `$3000 by December 1st` calls `create_savings_goal` and returns a `savings_goal_plan`.
- [ ] Pip only claims a goal was created after the action result is `ok: true`.
- [ ] `How much do I need to hit that goal?` calls `list_savings_goals` or uses the just-created card and returns the Japan goal summary.
- [ ] `I want to save money for a big purchase` enters savings-goal clarification.
- [ ] `Show my bank accounts` returns `account_connections`.
- [ ] `What does Android cost?` returns stable pricing/support copy.
- [ ] Focused Vitest suites pass.
- [ ] Focused mocked phone E2E passes.
- [ ] Real-agent eval with savings flags passes `37/37`.
- [ ] Authenticated phone-style test proves real Supabase create/list/progress/reload/cleanup.
- [ ] Preview deploy is verified with flags before production flags are enabled.

---

## Execution Rules

- Start from a fresh branch or isolated worktree. The main checkout is currently dirty, so do not mix this work into unrelated local changes.
- Do not add a new database table for transient chat drafts. Use typed `pendingAction` in the agent response/request state and persist only the latest pending action in existing `agent_chat_turns.request_metadata` if reload durability is required.
- Keep copy in "Monthly Savings" and "Savings Goals" language. Do not reintroduce "cushion" in product-facing text.
- Do not rely on prompt-only fixes for savings creation. Tool execution must be deterministic.
- Use Codex in-app Browser with the `iab` backend for browser verification.
- Commit after each task when tests are green.

Recommended branch:

```bash
git checkout main
git pull
git checkout -b codex/pip-savings-goals-product-deploy-readiness
```

---

## File Map

- `src/lib/agent/card-types.ts`
  - Add or verify `AgentPendingAction` and `pendingAction?: AgentPendingAction` on `AgentResponse`.
- `src/lib/agent/response-schema.ts`
  - Add or verify `pendingActionSchema`; validate final agent output and route request state.
- `src/components/PipHome.tsx`
  - Send latest `response.pendingAction` back in `conversationState`.
- `src/app/api/agent/route.ts`
  - Accept `conversationState.pendingAction`, hydrate recent pending action for authenticated reloads, and expose savings actions only when enabled.
- `src/lib/data/agent-chat-turns.ts`
  - Persist response pending action into `request_metadata.responsePendingAction`; add loader for recent conversation turns if needed.
- `src/lib/agent/ai-agent.ts`
  - Add deterministic savings-goal draft execution before LLM fallback.
  - Add false-success response repair after LLM output.
  - Fix account/pricing routing regressions.
- `src/lib/agent/ai-agent.test.ts`
  - Unit tests for draft creation, amount/date execution, false-success repair, progress follow-up, account card routing, and Android pricing.
- `src/app/api/agent/route.test.ts`
  - Route schema and action tests for pending action passthrough and authenticated savings actions.
- `src/lib/data/agent-chat-turns.test.ts`
  - Pending-action persistence/hydration tests.
- `tests/e2e/ai-agent.spec.ts`
  - Phone dogfood test for the Japan savings flow through amount/date and progress.
- `scripts/eval-agent.mjs`
  - Ensure eval state carries `pendingAction`; add explicit no-false-create checks and failed-case fixtures.
- `scripts/eval-agent.test.ts`
  - Eval runner tests for pending action carry-forward and false-create detection.
- `src/components/AgentThread.tsx` and `src/components/cards/CardRenderer.tsx`
  - Minor copy/screen-space polish only if the verified UI still wastes first-viewport space.

---

### Task 1: Capture The Failing Product Behavior As Tests

**Files:**
- Modify: `src/lib/agent/ai-agent.test.ts`
- Modify: `scripts/eval-agent.mjs`
- Modify: `scripts/eval-agent.test.ts`
- Modify: `tests/e2e/ai-agent.spec.ts`

- [ ] **Step 1: Add the deterministic Japan transcript unit test**

Add a test that runs:

```ts
[
  "I need to save for a trip to Japan",
  "Yes",
  "Set the savings goal",
  "$3000 by December 1st",
  "How much do I need to hit that goal?",
]
```

Expected assertions:

```ts
expect(first.pendingAction).toMatchObject({
  type: "create_savings_goal",
  name: expect.stringMatching(/japan/i),
});
expect(second.pendingAction?.type).toBe("create_savings_goal");
expect(third.pendingAction?.type).toBe("create_savings_goal");
expect(fourth.usedTools).toEqual(["create_savings_goal"]);
expect(fourth.cards.map((card) => card.type)).toContain("savings_goal_plan");
expect(fourth.message).not.toMatch(/\b(can|could|would) set\b/i);
expect(fifth.usedTools).toEqual(["list_savings_goals"]);
expect(fifth.cards.map((card) => card.type)).toContain("savings_goals_summary");
expect(JSON.stringify(fifth.cards)).toMatch(/japan/i);
```

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "Japan"
```

Expected before implementation: fail at the amount/date and progress assertions.

- [ ] **Step 2: Add false-success eval detection**

In `scripts/eval-agent.mjs`, add a failure when a response contains success language but lacks a successful savings tool/card:

```js
const falseSavingsCreatePattern =
  /\b(created|saved|set up|set|tracking|tracked)\b.{0,60}\b(goal|savings goal|trip|japan|purchase)\b/i;

if (
  caseDef.forbidFalseSavingsCreate &&
  falseSavingsCreatePattern.test(message) &&
  !toolNames.includes("create_savings_goal")
) {
  failures.push("claimed savings goal creation without create_savings_goal.");
}
```

Add test coverage in `scripts/eval-agent.test.ts` with a mock response message like:

```text
I set up your Japan savings goal.
```

Expected: eval fails unless `create_savings_goal` and `savings_goal_plan` are present.

- [ ] **Step 3: Add eval fixtures for the current failures**

Ensure `scripts/eval-agent.mjs` includes explicit cases:

```js
{
  id: "phone-save-big-purchase",
  message: "I want to save money for a big purchase",
  expectedPendingActionType: "create_savings_goal",
  expectedCards: [],
}
{
  id: "phone-show-bank-accounts",
  message: "Show my bank accounts",
  expectedTools: ["get_connected_accounts"],
  expectedCards: ["account_connections"],
}
{
  id: "phone-android-cost",
  message: "What does Android cost?",
  forbiddenCards: ["savings_goal_plan", "savings_goals_summary"],
  expectedTextPattern: /android|app|cost|price|subscription|support/i,
}
```

- [ ] **Step 4: Extend the mocked phone E2E**

In `tests/e2e/ai-agent.spec.ts`, extend the existing phone dogfood test so it does not stop at the amount question. It must verify:

```ts
await expect(page.getByText(/Savings goal/i)).toBeVisible();
await expect(page.getByText(/\$3,000/i)).toBeVisible();
await expect(page.getByText(/Japan/i)).toBeVisible();
await expect(page.getByText(/remaining|month|daily/i)).toBeVisible();
```

- [ ] **Step 5: Run the failing baseline**

```bash
npm test -- \
  src/lib/agent/ai-agent.test.ts \
  scripts/eval-agent.test.ts
npm run eval:agent
npm run test:e2e -- tests/e2e/ai-agent.spec.ts
```

Expected before implementation: the new savings assertions fail. Preserve the failure output in the PR description or execution notes.

- [ ] **Step 6: Commit tests**

```bash
git add src/lib/agent/ai-agent.test.ts scripts/eval-agent.mjs scripts/eval-agent.test.ts tests/e2e/ai-agent.spec.ts
git commit -m "test: capture savings goals deploy blockers"
```

---

### Task 2: Make Pending Savings Actions A Typed State Contract

**Files:**
- Modify: `src/lib/agent/card-types.ts`
- Modify: `src/lib/agent/response-schema.ts`
- Modify: `src/app/api/agent/route.ts`
- Modify: `src/components/PipHome.tsx`
- Modify: `src/lib/data/agent-chat-turns.ts`
- Modify: `src/lib/data/agent-chat-turns.test.ts`

- [ ] **Step 1: Add the shared pending action type**

In `src/lib/agent/card-types.ts`, add:

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

Then add this to `AgentResponse`:

```ts
pendingAction?: AgentPendingAction;
```

- [ ] **Step 2: Add schema validation**

In `src/lib/agent/response-schema.ts`, export `pendingActionSchema` and include it in `agentResponseSchema`:

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
    missing: z.array(savingsGoalPendingFieldSchema).optional(),
  }),
  z.object({
    type: z.literal("set_savings_goal_protection"),
    goalId: z.string().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    includeInSpendableCash: z.boolean(),
    monthlyContributionCents: z.number().int().min(0).max(100_000_000).optional(),
    missing: z.array(z.enum(["goal", "confirmation"])).optional(),
  }),
]);
```

- [ ] **Step 3: Accept pending action in the API request**

In `src/app/api/agent/route.ts`, import `pendingActionSchema` and add:

```ts
pendingAction: pendingActionSchema.optional(),
```

inside `conversationState`.

- [ ] **Step 4: Send latest pending action from the phone UI**

In `src/components/PipHome.tsx`, update `getConversationState`:

```ts
const pendingAction = [...thread]
  .reverse()
  .find((item) => item.response?.pendingAction)
  ?.response?.pendingAction;

return {
  shownCards,
  lastToolNames,
  promptChips,
  ...(pendingAction ? { pendingAction } : {}),
};
```

- [ ] **Step 5: Persist pending action for reload durability**

In `src/lib/data/agent-chat-turns.ts`, add `responsePendingAction` into `request_metadata`:

```ts
responsePendingAction:
  input.response && "pendingAction" in input.response
    ? input.response.pendingAction ?? null
    : null,
```

Add a small helper:

```ts
export async function loadRecentAgentChatHistory(
  supabase: SupabaseClient<Database>,
  input: { userId: string; conversationId: string; limit?: number },
) {
  const { data, error } = await supabase
    .from("agent_chat_turns")
    .select("user_message, assistant_message, request_metadata, created_at")
    .eq("user_id", input.userId)
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 8);

  if (error) {
    throw error;
  }

  return data ?? [];
}
```

Use `pendingActionSchema.safeParse` when hydrating metadata; never trust raw JSON.

- [ ] **Step 6: Run contract tests**

```bash
npm test -- \
  src/lib/agent/ai-agent.test.ts \
  src/app/api/agent/route.test.ts \
  src/lib/data/agent-chat-turns.test.ts \
  src/components/PipHome.test.tsx
```

Expected: pending action schema, route passthrough, UI carry-forward, and metadata persistence pass.

- [ ] **Step 7: Commit state contract**

```bash
git add src/lib/agent/card-types.ts src/lib/agent/response-schema.ts src/app/api/agent/route.ts src/components/PipHome.tsx src/lib/data/agent-chat-turns.ts src/lib/data/agent-chat-turns.test.ts
git commit -m "feat: carry savings goal pending actions"
```

---

### Task 3: Deterministically Execute Savings Goal Drafts

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Add deterministic savings preflight before model execution**

In `runAIAgent`, before generic forced-tool/model handling, call a helper shaped like:

```ts
const savingsDraftResponse = await createDeterministicSavingsGoalResponse(input);

if (savingsDraftResponse) {
  return savingsDraftResponse;
}
```

- [ ] **Step 2: Implement draft merge logic**

Add helpers in `src/lib/agent/ai-agent.ts` or a small local module if the file becomes hard to review:

```ts
function mergeSavingsGoalDraft(
  pending: Extract<AgentPendingAction, { type: "create_savings_goal" }> | undefined,
  message: string,
): Extract<AgentPendingAction, { type: "create_savings_goal" }> {
  const normalized = normalizeText(message);
  const amount = extractSavingsGoalAmountCents(message);
  const targetDate = parseSavingsGoalTargetDate(message, getAgentAsOfDate());
  const name = inferSavingsGoalName(message, normalized);

  return {
    type: "create_savings_goal",
    name: pending?.name && pending.name !== "Savings goal" ? pending.name : name,
    targetAmountCents: amount ?? pending?.targetAmountCents,
    targetDate: targetDate ?? pending?.targetDate,
    startingAmountCents: pending?.startingAmountCents,
    currentAmountCents: pending?.currentAmountCents,
    monthlyContributionCents: extractMonthlyContributionCents(message) ?? pending?.monthlyContributionCents,
    includeInSpendableCash: pending?.includeInSpendableCash,
  };
}
```

Then compute:

```ts
function getMissingSavingsGoalFields(draft: Extract<AgentPendingAction, { type: "create_savings_goal" }>) {
  const missing: SavingsGoalPendingField[] = [];

  if (!draft.targetAmountCents) {
    missing.push("target_amount");
  }

  return missing;
}
```

Do not require target date for creation. A date improves recommended monthly math, but "save for a big purchase" can still become a tracked goal after an amount.

- [ ] **Step 3: Ask for missing fields without the model**

If the draft lacks `targetAmountCents`, return:

```ts
return agentResponseSchema.parse({
  message: `How much do you want to save for ${draft.name}?`,
  cards: [],
  promptChips: getOnboardingPromptChips(input.onboardingState ?? defaultReadyState),
  usedTools: [],
  responseMode: "clarify",
  pendingAction: {
    ...draft,
    missing: ["target_amount"],
  },
  audit: {
    toolNames: [],
    usedModel: false,
  },
});
```

- [ ] **Step 4: Execute create action when amount is present**

If the draft has `targetAmountCents`, call the existing action directly:

```ts
const result = await input.actions?.createSavingsGoal?.({
  name: draft.name,
  targetAmountCents: draft.targetAmountCents,
  targetDate: draft.targetDate,
  startingAmountCents: draft.startingAmountCents,
  currentAmountCents: draft.currentAmountCents,
  monthlyContributionCents: draft.monthlyContributionCents,
  includeInSpendableCash: draft.includeInSpendableCash,
});
```

Expected responses:

```ts
if (!result?.ok) {
  return agentResponseSchema.parse({
    message: result?.message ?? "I could not save that goal yet. I kept the details so we can try again.",
    cards: result?.cards ?? [],
    promptChips: getOnboardingPromptChips(input.onboardingState ?? defaultReadyState),
    usedTools: ["create_savings_goal"],
    responseMode: result?.cards?.length ? "show_card" : "chat_only",
    pendingAction: { ...draft, missing: [] },
    audit: { toolNames: ["create_savings_goal"], usedModel: false },
  });
}

return agentResponseSchema.parse({
  message: getSavingsGoalCreatedMessage(result.cards, draft),
  cards: result.cards ?? [],
  promptChips: getOnboardingPromptChips(input.onboardingState ?? defaultReadyState),
  usedTools: ["create_savings_goal"],
  responseMode: "show_card",
  audit: { toolNames: ["create_savings_goal"], usedModel: false },
  clientAction: result.clientAction,
});
```

Do not include `pendingAction` after successful creation.

- [ ] **Step 5: Parse simple dates**

Add `parseSavingsGoalTargetDate(message, asOfDate)` cases:

```ts
"December 1st" -> "2026-12-01" when current date is before 2026-12-01
"Dec 1" -> same
"12/1" -> same
"by next June" -> first day or end of June, but document the choice in test
```

Keep this conservative. If parsing is uncertain, create the goal without a target date rather than hallucinating one.

- [ ] **Step 6: Run savings unit tests**

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "savings"
```

Expected: Japan draft, amount/date creation, unavailable-action, and no-false-success tests pass.

- [ ] **Step 7: Commit deterministic savings execution**

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts
git commit -m "fix: deterministically create savings goals from drafts"
```

---

### Task 4: Fix Savings Goal Progress Follow-Up

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/lib/agent/ai-agent.test.ts`
- Modify: `src/app/api/agent/route.ts`

- [ ] **Step 1: Detect goal progress questions**

Add deterministic routing for:

```text
How much do I need to hit that goal?
How much do I need for Japan?
Am I on track for my trip?
Show my savings goal progress.
```

Expected tool:

```ts
"list_savings_goals"
```

- [ ] **Step 2: Prefer the named or most recent goal**

When the user says "that goal", use the most recent successful `savings_goal_plan` shown card if present. Otherwise call `listSavingsGoals` and let the summary card show all active goals.

Do not respond with `Savings goals are not available yet` when:

- savings goals are enabled,
- `listSavingsGoals` exists,
- or the current conversation just created a goal.

- [ ] **Step 3: Improve unavailable copy**

Only use:

```text
Savings goals are not available yet.
```

when the feature flag or action is actually unavailable.

When no goal exists, say:

```text
I do not see a saved savings goal yet. Tell me what you want to save for and the target amount.
```

- [ ] **Step 4: Run progress tests**

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "goal progress"
```

Expected: "that goal" returns a `savings_goals_summary` or named plan card, not generic unavailable copy.

- [ ] **Step 5: Commit progress fix**

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts src/app/api/agent/route.ts
git commit -m "fix: keep savings goal progress in context"
```

---

### Task 5: Fix The Non-Savings Routing Regressions

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/lib/agent/intent-catalog.ts`
- Modify: `src/lib/agent/intent-router.test.ts`
- Modify: `src/lib/agent/ai-agent.test.ts`
- Modify: `scripts/eval-agent.mjs`

- [ ] **Step 1: Route big-purchase savings intent to savings goals**

Make this route to savings-goal draft setup:

```text
I want to save money for a big purchase
```

Expected:

```ts
expect(response.pendingAction).toMatchObject({
  type: "create_savings_goal",
  name: expect.stringMatching(/big purchase/i),
});
```

Guard against misrouting to spending-opportunity/cutback logic.

- [ ] **Step 2: Route bank-account management wording to account connections**

Distinguish:

```text
Show my bank balance -> get_true_balances / true_balances
Show my bank accounts -> get_connected_accounts / account_connections
```

Add tests for both so the balance/account distinction does not regress.

- [ ] **Step 3: Stabilize Android pricing/support answer**

For:

```text
What does Android cost?
```

return a trust/support/pricing answer. Acceptable copy:

```text
Android access uses the same Pip subscription pricing as the web app. If you are in a test build, checkout may not be available inside Android yet.
```

Do not route this to savings goals or generic fallback.

- [ ] **Step 4: Run routing tests**

```bash
npm test -- \
  src/lib/agent/intent-router.test.ts \
  src/lib/agent/ai-agent.test.ts \
  scripts/eval-agent.test.ts
npm run eval:agent
```

Expected: the previous failing cases pass.

- [ ] **Step 5: Commit routing fixes**

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/intent-catalog.ts src/lib/agent/intent-router.test.ts src/lib/agent/ai-agent.test.ts scripts/eval-agent.mjs scripts/eval-agent.test.ts
git commit -m "fix: stabilize Pip agent deploy routing"
```

---

### Task 6: Product Copy And Phone Screen-Space Polish

**Files:**
- Modify: `src/components/AgentThread.tsx`
- Modify: `src/components/PipHome.tsx`
- Modify: `src/components/cards/CardRenderer.tsx`
- Modify: `content/articles/what-is-a-savings-cushion.md` only if product copy still links to legacy wording
- Modify: relevant component tests

- [ ] **Step 1: Audit user-facing "cushion" copy**

Run:

```bash
rg -n "cushion|protected savings|Monthly Savings|Savings Goals|Savings goal|save without thinking" src content docs
```

Expected:

- Product UI uses `Monthly Savings` and `Savings Goals`.
- Legacy article slugs can remain if they are intentional SEO/history pages, but app flows should not call the feature a cushion.

- [ ] **Step 2: Add no-money-movement copy to savings goal cards**

On `savings_goal_plan` and `savings_goals_summary`, ensure users can tell the goal is tracked/planned and Pip is not moving funds.

Acceptable short copy:

```text
Tracked in Pip. No money is moved.
```

- [ ] **Step 3: Reduce first-viewport assistant copy if still oversized**

The verified stale refresh timestamp is gone, but the helper bubble can still waste vertical space. Keep cards and thread readable on a 390 x 844 viewport.

Do not hide important data freshness entirely. If freshness copy is needed, put it in a compact trust/details affordance rather than a large paragraph under the main number.

- [ ] **Step 4: Run UI tests**

```bash
npm test -- \
  src/components/AgentThread.test.tsx \
  src/components/PipHome.test.tsx \
  src/components/cards/CardRenderer.test.tsx \
  src/app/pip-language-boundary.test.tsx \
  src/app/no-money-movement-boundary.test.tsx
```

- [ ] **Step 5: Commit UX polish**

```bash
git add src/components/AgentThread.tsx src/components/PipHome.tsx src/components/cards/CardRenderer.tsx content/articles src
git commit -m "fix: clarify savings goal product copy"
```

---

### Task 7: Authenticated Data Proof

**Files:**
- Modify: `scripts/capture-live-auth-state.mjs` only if it cannot produce the needed state
- Modify: `tests/e2e/live-authenticated-onboarding.spec.ts` or create a focused authenticated spec
- Modify: `docs/play-store/tester-checklist.md` if reviewer testing steps change

- [ ] **Step 1: Prepare an authenticated test account**

Use an account that can safely create/delete savings goals. Capture local auth:

```bash
npm run capture:live-auth
```

Expected:

```text
/tmp/pip-live-auth.json
```

exists and belongs to the test/reviewer account.

- [ ] **Step 2: Run real Supabase CRUD through the app path**

With savings flags enabled:

```bash
PIP_SAVINGS_GOALS_ENABLED=true NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true npm run dev
```

Use the app on `http://localhost:3000/app` or the available dev port and verify:

```text
I need to save for a trip to Japan
Yes
Set the savings goal
$3000 by December 1st
How much do I need to hit that goal?
```

Expected:

- one savings goal row is created for the test user,
- the card shows Japan and `$3,000`,
- the progress follow-up shows remaining/monthly/daily math,
- reload does not lose the conversation state,
- cleanup removes the test goal.

- [ ] **Step 3: Automate cleanup**

If the authenticated test creates real rows, add cleanup to the test or runbook using existing savings-goals API/repository paths. Do not leave test goals attached to reviewer accounts.

- [ ] **Step 4: Commit authenticated test/runbook updates**

```bash
git add tests/e2e docs/play-store scripts
git commit -m "test: add authenticated savings goal deploy proof"
```

---

### Task 8: Full Verification Gate

**Files:**
- No implementation files unless a verification failure requires a fix.

- [ ] **Step 1: Run focused unit suites**

```bash
npm test -- \
  src/lib/agent/ai-agent.test.ts \
  src/lib/agent/intent-router.test.ts \
  src/lib/agent/response-schema.test.ts \
  src/app/api/agent/route.test.ts \
  src/lib/data/agent-chat-turns.test.ts \
  src/lib/data/savings-goals-repository.test.ts \
  src/components/PipHome.test.tsx \
  src/components/AgentThread.test.tsx \
  src/components/cards/CardRenderer.test.tsx \
  scripts/eval-agent.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run real-agent eval with flags**

```bash
PIP_SAVINGS_GOALS_ENABLED=true NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true npm run eval:agent
```

Expected:

```text
37/37 passed
```

If the suite grows, all cases must pass and the old failing IDs must be green:

```text
phone-save-big-purchase
phone-show-bank-accounts
phone-savings-japan-context
```

- [ ] **Step 3: Run E2E**

```bash
npm run test:e2e -- tests/e2e/ai-agent.spec.ts
```

Expected: focused phone dogfood savings flow passes through create and progress.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: production build passes.

- [ ] **Step 5: Run in-app Browser phone transcript**

Start dev:

```bash
PIP_SAVINGS_GOALS_ENABLED=true NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true npm run dev
```

Open the app in Codex in-app Browser at the actual local URL, preferably `http://localhost:<port>/app` rather than `127.0.0.1` because the prior test hit Next dev origin blocking on `127.0.0.1`.

Verify the transcript manually through the browser:

```text
I need to save for a trip to Japan
Yes
Set the savings goal
$3000 by December 1st
How much do I need to hit that goal?
Show my bank accounts
What does Android cost?
```

Expected:

- savings goal creation card appears,
- progress summary appears,
- account connections card appears,
- Android answer is relevant,
- no false "saved" claim appears before tool success.

Capture screenshots or transcript artifacts under `/tmp/pip-savings-goals-product-deploy-artifacts/`.

- [ ] **Step 6: Commit verification notes if docs changed**

```bash
git status --short
```

Commit only intentional docs/test artifacts that belong in the repo. Keep `/tmp` artifacts out of Git.

---

### Task 9: Preview Deploy And Rollout

**Files:**
- Modify: `docs/play-store/production-access-notes.md`
- Modify: `docs/play-store/tester-checklist.md`
- Modify: `docs/trust-readiness.md` if public trust copy changed

- [ ] **Step 1: Verify production env requirements**

```bash
npm run check:deployment
npm run check:live-smoke
```

Verify these are set in the deploy target before enabling broad access:

```text
PIP_SAVINGS_GOALS_ENABLED=true
NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true
OPENAI_API_KEY or configured gateway
Supabase URL/key/service-role vars
```

- [ ] **Step 2: Deploy preview**

```bash
npm run deploy:netlify -- --preview
```

Expected: preview URL is produced and build completes.

- [ ] **Step 3: Run preview smoke**

Against preview:

- sign in with reviewer/test account,
- connect/use seeded financial data as appropriate,
- run the Japan savings transcript,
- reload the app,
- ask progress again,
- remove test goal,
- confirm no unrelated routing regressions.

- [ ] **Step 4: Production rollout**

Only after preview passes:

- enable flags for a small beta/reviewer cohort,
- monitor `agent_chat_turns` for false-create language and `savings_goal_created` events,
- keep a rollback plan to disable both savings flags without redeploying code,
- expand to product deploy only after beta transcripts are clean.

- [ ] **Step 5: Document release evidence**

Add a short deploy note with:

```text
Branch:
Commit:
Preview URL:
Eval result:
Authenticated test account:
Known cleanup:
Rollback flag:
```

Commit:

```bash
git add docs/play-store/production-access-notes.md docs/play-store/tester-checklist.md docs/trust-readiness.md
git commit -m "docs: record savings goals deploy readiness"
```

---

## Final Release Checklist

- [ ] Unit tests pass.
- [ ] Real-agent eval passes all cases with savings flags.
- [ ] Mocked phone E2E passes.
- [ ] In-app Browser phone transcript passes.
- [ ] Authenticated Supabase create/list/progress/reload/cleanup passes.
- [ ] No false creation claims.
- [ ] `Show my bank accounts` renders `account_connections`.
- [ ] `What does Android cost?` answers pricing/support clearly.
- [ ] UI copy uses savings language, not cushion language.
- [ ] Preview deploy verified.
- [ ] Rollback is documented as disabling savings flags.

If any item fails, do not product-deploy. Keep savings goals behind flags until the failing item is green.

