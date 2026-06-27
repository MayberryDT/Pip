# Pip Agent Invalid Output Router Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Pip from surfacing `invalid-agent-output` / 502 failures for safe read-only finance prompts that should route to an existing tool, card, action, clarification, or visible-card follow-up answer.

**Architecture:** Keep the model-first guard strict, but move known safe prompts out of the ambiguous model-only path. Add transcript-pinned regressions from Supabase, patch deterministic routing for the missed phrases, make recurring aggregate follow-ups resilient when visible-card facts are missing, and improve chat telemetry so future failures identify the router/guard boundary directly.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase `agent_chat_turns`, OpenAI Agents SDK runtime, existing Pip agent router/tool/card stack.

---

## Optimizer Record

This plan was optimized with the `plan-optimizer` skill against this rubric:

- **Failure coverage and evidence fit (25 pts):** High quality means every fix traces to exact Supabase failure text and has a regression that would have failed before the change.
- **Routing correctness across modes (20 pts):** High quality means hybrid/catalog routing and legacy forced-tool fallback stay aligned, with negative tests for savings-goal and money-movement boundaries.
- **Model-first safety preservation (20 pts):** High quality means no broad prose bypasses are added, the guard remains strict, and deterministic exceptions are narrow and context-gated.
- **Implementation specificity (15 pts):** High quality means file names, helper names, placement, and test commands match the current repo shape.
- **Observability and live verification (10 pts):** High quality means future Supabase rows explain whether visible context reached the server and live replay has concrete SQL checks.
- **Rollback and sequencing discipline (10 pts):** High quality means the executor can stop after each green stage, revert behavior separately from telemetry, and avoid dirty-worktree surprises.

Score trajectory: `84 -> 91 -> 94 -> 94`.

Final score: **94/100**. The accepted improvements were: add a preflight/source refresh, keep `intent-router.ts` and `ai-agent.ts` predicate paths synchronized, replace guessed telemetry/fixture shapes with repo-confirmed ones, and add negative tests that prevent the fix from swallowing savings-goal or money-movement prompts.

---

## Source Evidence

Production Supabase project: `qevvmulexfoebjmlxbts`.

Recent `agent_chat_turns` failures showed these user-visible issues:

- `i want to save money` -> `invalid-agent-output`, detail: `unsupported_finance_answer: Known finance intents need a tool, card, client action, or structured clarification.`
- `How did you get the spendable cash today number?` -> `invalid-agent-output`, detail: `recurring activity promised without recurring card`.
- `What's the total of these monthly bills?` after `What bills are coming up?` -> `invalid-agent-output`, detail: `unsupported_finance_answer`.
- Older failures included `show me` after recent transactions and savings-goal setup after recurring-card context; current source already has targeted fixes for those, so this plan locks them with tests but does not redesign them.

Root cause:

- `src/lib/agent/model-first-policy.ts` correctly rejects unsupported finance prose.
- Some safe read-only phrases are not routed before model output validation.
- The recurring aggregate happy path depends on `visibleCardFacts`; Supabase telemetry only records `shownCardCount` and `lastToolCount`, so missing visible facts are hard to diagnose and can push the turn into a fragile model-only path.

## Non-Goals

- Do not weaken the model-first guard.
- Do not add new tools.
- Do not change Supabase schema or migrations.
- Do not broaden Pip into generic financial advice.
- Do not touch unrelated product copy, marketing pages, or mobile UI.

## Task 0: Preflight And Fresh Failure Snapshot

**Files:**
- No source edits.

- [ ] **Step 1: Confirm the active checkout and dirty state**

Run:

```bash
git status --short --branch
git rev-parse --show-toplevel
```

Expected:

```text
## <current-branch>
/home/tyler/Documents/Pip
```

Record any pre-existing untracked or modified files before implementation. Do not include unrelated local changes in commits.

- [ ] **Step 2: Refresh the production failure sample**

Use Supabase MCP `execute_sql` against project `qevvmulexfoebjmlxbts`:

```sql
select id,
       conversation_id,
       user_message,
       error_message,
       response_mode,
       used_tools,
       card_types,
       request_metadata,
       created_at
from public.agent_chat_turns
where created_at >= now() - interval '14 days'
  and error_message is not null
order by created_at desc
limit 50;
```

Expected:

- The same failure class is still present, or there are newer equivalent phrases.
- If newer phrases exist, add them to Task 1 and Task 3 before implementation.
- If the failures are gone in production, still implement the tests and telemetry, but treat behavior changes as regression hardening rather than incident repair.

---

## File Structure

- Modify `src/lib/agent/intent-router.ts`
  - Owns catalog/hybrid routing decisions.
  - Add deterministic routing for plain save-money/cutback prompts, math/explanation prompts, and recurring aggregate phrasing.

- Modify `src/lib/agent/ai-agent.ts`
  - Owns forced-tool fallback, model-first boundary, and deterministic safe follow-up handling.
  - Keep legacy forced-tool predicates aligned with catalog/hybrid router predicates.
  - Make recurring aggregate follow-ups robust when visible facts are absent but recent recurring context exists.
  - Keep savings-goal setup path unchanged except for regression tests.

- Modify `src/lib/agent/route-telemetry.ts`
  - Owns request metadata written to `agent_chat_turns`.
  - Add visible-card fact count and deterministic context counts.

- Modify `src/lib/data/agent-chat-turns.ts`
  - Owns metadata allowlist persisted into `agent_chat_turns`.
  - Allow new telemetry keys.

- Modify `src/lib/agent/route-telemetry.test.ts`
  - Confirm visible-card context counts are produced before persistence.

- Modify `src/lib/agent/intent-router.test.ts`
  - Pin deterministic router behavior for exact production failure phrases.

- Modify `src/lib/agent/ai-agent.test.ts`
  - Pin end-to-end agent behavior for exact production failure phrases.

- Modify `src/lib/data/agent-chat-turns.test.ts`.
  - Confirm new metadata keys are preserved and sanitized.

- Modify `tests/fixtures/agent-major-capabilities.mjs`
  - Add durable dogfood cases for these failures.

---

## Task 1: Add Router Regressions For Supabase Failure Phrases

**Files:**
- Modify: `src/lib/agent/intent-router.test.ts`

- [ ] **Step 1: Add failing router tests**

Add these tests near the existing `routes natural card request` block:

```ts
  it.each([
    ["i want to save money", "spending.cutback_opportunity", "get_spending_opportunity"],
    ["help me save money", "spending.cutback_opportunity", "get_spending_opportunity"],
    ["how can I save money", "spending.cutback_opportunity", "get_spending_opportunity"],
    ["How did you get the spendable cash today number?", "math.breakdown", "get_pip_cash_math"],
    ["how did you come up with today's number?", "math.breakdown", "get_pip_cash_math"],
    ["what went into this number?", "math.breakdown", "get_pip_cash_math"],
    ["whats the total of these monthly bills?", "recurring.activity", "get_recurring_activity"],
    ["what do these monthly bills add up to?", "recurring.activity", "get_recurring_activity"],
  ])("routes production failure phrase %s", (message, intentId, toolName) => {
    expect(route(message)).toMatchObject({
      kind: "route",
      intentId,
      toolName,
    });
  });

  it.each([
    ["i want to save money for a big purchase"],
    ["help me save for a vacation"],
    ["move $200 to savings"],
    ["transfer money to savings"],
  ])("does not misroute savings or money movement phrase %s", (message) => {
    const decision = route(message);

    if (decision.kind === "route") {
      expect(decision.toolName).not.toBe("get_spending_opportunity");
    }
  });
```

- [ ] **Step 2: Run router tests and verify they fail**

Run:

```bash
npm test -- src/lib/agent/intent-router.test.ts
```

Expected now:

```text
FAIL src/lib/agent/intent-router.test.ts
```

At least these phrases should fail before implementation:

- `i want to save money`
- `How did you get the spendable cash today number?`
- `whats the total of these monthly bills?`

- [ ] **Step 3: Commit only if tests are red for expected reasons**

Do not commit yet. Continue to Task 2 once the red tests prove the missing router coverage.

---

## Task 2: Patch Deterministic Router Phrase Coverage

**Files:**
- Modify: `src/lib/agent/intent-router.ts`
- Modify: `src/lib/agent/ai-agent.ts`

- [ ] **Step 1: Route plain save-money prompts to cutback opportunity**

Update `isCutbackOpportunityPrompt` from:

```ts
function isCutbackOpportunityPrompt(normalized: string): boolean {
  return /\b(money leaking|where .* leaking)\b/.test(normalized);
}
```

to:

```ts
function isCutbackOpportunityPrompt(normalized: string): boolean {
  if (isSavingsGoalSetupPrompt(normalized)) {
    return false;
  }

  return (
    /\b(money leaking|where .* leaking)\b/.test(normalized) ||
    /\b(i want to|help me|how can i|how do i|where can i|ways? to)\b.{0,24}\bsave money\b/.test(normalized) ||
    /\bsave money\b.{0,24}\b(this week|from spending|on spending|recent spending|where|how|help)\b/.test(normalized)
  );
}

function isSavingsGoalSetupPrompt(normalized: string): boolean {
  return (
    /\bsavings? goals?\b/.test(normalized) ||
    /\bsave\b.{0,32}\b(for|toward|towards)\b/.test(normalized) ||
    /\b(trip|vacation|travel|car|house|home|wedding|emergency fund|big purchase)\b/.test(normalized)
  );
}
```

This keeps `I want to save money for a big purchase` out of cutback routing.

- [ ] **Step 2: Mirror save-money classification in the legacy forced-tool path**

In `src/lib/agent/ai-agent.ts`, update the helper that feeds `get_spending_opportunity` so plain save-money prompts are covered in legacy mode too. Keep the same exclusions as `intent-router.ts`:

```ts
function isSpendingOpportunityPrompt(normalized: string): boolean {
  if (isSavingsGoalSetupPrompt(normalized)) {
    return false;
  }

  return (
    // existing cutback / leakage checks stay here
    /\b(i want to|help me|how can i|how do i|where can i|ways? to)\b.{0,24}\bsave money\b/.test(normalized) ||
    /\bsave money\b.{0,24}\b(this week|from spending|on spending|recent spending|where|how|help)\b/.test(normalized)
  );
}
```

If `ai-agent.ts` already has a savings-goal classifier with a different name, reuse it instead of creating a duplicate. The behavior contract is:

- `i want to save money` -> `get_spending_opportunity`
- `i want to save money for a big purchase` -> savings-goal setup path, not cutback
- `move $200 to savings` -> money-movement/open-set boundary, not cutback

- [ ] **Step 3: Route calculation/explanation prompts to math**

Add this helper near `isSpendableExplanationPrompt`:

```ts
function isMathBreakdownPrompt(normalized: string): boolean {
  return (
    /\bhow did you\b.{0,32}\b(get|calculate|come up with)\b.{0,32}\b(number|spendable cash|spendable cash today)\b/.test(normalized) ||
    /\bwhat\b.{0,32}\b(went into|numbers went into|calculation|formula)\b.{0,32}\b(number|spendable cash|spendable cash today|this)\b/.test(normalized) ||
    /\bshow\b.{0,24}\b(math|formula|calculation)\b/.test(normalized)
  );
}
```

Then update `getDeterministicIntentId` so math routing happens before broader spendable explanation:

```ts
  if (isMathBreakdownPrompt(normalized)) {
    return "math.breakdown";
  }

  if (isSpendableExplanationPrompt(normalized)) {
    return "spendable.explanation";
  }
```

- [ ] **Step 4: Mirror math classification in the legacy forced-tool path**

In `src/lib/agent/ai-agent.ts`, broaden `isExplicitMathPrompt` so it accepts exact production wording:

```ts
function isExplicitMathPrompt(normalized: string): boolean {
  return (
    /^(show( me)? )?(the )?(math|math breakdown|formula|calculation|calculation details)$/.test(normalized) ||
    /\bhow did you\b.{0,32}\b(get|calculate|come up with)\b.{0,32}\b(number|spendable cash|spendable cash today)\b/.test(normalized) ||
    /\bwhat\b.{0,32}\b(went into|numbers went into|calculation|formula)\b.{0,32}\b(number|spendable cash|spendable cash today|this)\b/.test(normalized)
  );
}
```

This is required because `getForcedAgentTool()` still falls back to `getLegacyForcedAgentTool()` in legacy mode and after catalog abstains.

- [ ] **Step 5: Route recurring aggregate phrases deterministically**

Update `isRecurringActivityPrompt` from:

```ts
function isRecurringActivityPrompt(normalized: string): boolean {
  return (
    /\b(subscriptions?|bills?|monthly charges?)\b.{0,36}\b(coming up|upcoming|repeat|recurring|every month)\b/.test(normalized) ||
    /\bwhat repeats every month\b/.test(normalized) ||
    /\b(show|list)\b.{0,24}\b(recurring|repeat|upcoming bills?|monthly charges?)\b/.test(normalized) ||
    /\byoutube premium\b.{0,24}\bcoming up\b/.test(normalized)
  );
}
```

to:

```ts
function isRecurringActivityPrompt(normalized: string): boolean {
  return (
    /\b(subscriptions?|bills?|monthly charges?)\b.{0,36}\b(coming up|upcoming|repeat|recurring|every month)\b/.test(normalized) ||
    /\b(total|sum|add(?:ed)? up|altogether|how much|how many dollars|spending|spend)\b.{0,48}\b(these|my|monthly|recurring|subscription|subscriptions|bills?|charges?)\b/.test(normalized) ||
    /\b(these|my|monthly|recurring|subscription|subscriptions|bills?|charges?)\b.{0,48}\b(total|sum|add(?:ed)? up|altogether|how much|how many dollars|spending|spend)\b/.test(normalized) ||
    /\bwhat repeats every month\b/.test(normalized) ||
    /\b(show|list)\b.{0,24}\b(recurring|repeat|upcoming bills?|monthly charges?)\b/.test(normalized) ||
    /\byoutube premium\b.{0,24}\bcoming up\b/.test(normalized)
  );
}
```

- [ ] **Step 6: Run router and forced-tool hook tests**

Run:

```bash
npm test -- src/lib/agent/intent-router.test.ts
```

Expected:

```text
PASS src/lib/agent/intent-router.test.ts
```

Then run the focused forced-tool subset:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -- -t "forced"
```

Expected:

- Plain save-money prompts force `get_spending_opportunity`.
- Math explanation prompts force `get_pip_cash_math`.
- Savings-goal and money-movement phrases do not force `get_spending_opportunity`.

- [ ] **Step 7: Commit router coverage**

Run:

```bash
git add src/lib/agent/intent-router.ts src/lib/agent/intent-router.test.ts src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts
git commit -m "fix: route production agent failure phrases"
```

---

## Task 3: Add Agent-Level Regressions For No-502 Behavior

**Files:**
- Modify: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Add forced-tool hook tests for the exact live failures**

Add these near existing `__agentTestHooks.getForcedAgentTool` tests:

```ts
  it.each([
    ["i want to save money", "get_spending_opportunity"],
    ["help me save money", "get_spending_opportunity"],
    ["How did you get the spendable cash today number?", "get_pip_cash_math"],
    ["how did you come up with today's number?", "get_pip_cash_math"],
    ["whats the total of these monthly bills?", "get_recurring_activity"],
  ])("forces the correct tool for production phrase %s", (message, toolName) => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message,
        snapshot: getFakeSnapshot("healthy"),
      }),
    ).toMatchObject({ toolName });
  });

  it.each([
    "i want to save money for a big purchase",
    "help me save for a vacation",
    "move $200 to savings",
    "transfer money to savings",
  ])("does not force cutback for savings setup or money movement phrase %s", (message) => {
    expect(
      __agentTestHooks.getForcedAgentTool({
        message,
        snapshot: getFakeSnapshot("healthy"),
      }),
    ).not.toMatchObject({ toolName: "get_spending_opportunity" });
  });
```

- [ ] **Step 2: Add runAIAgent tests for the exact live failures**

Add these tests near the existing cutback, recurring, and math tests:

```ts
  it("routes plain save-money prompts to a grounded cutback opportunity", async () => {
    const response = await runAIAgent(
      {
        message: "i want to save money",
        snapshot: getFakeSnapshot("cutback-dining"),
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_spending_opportunity"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "insight_card",
      title: "Cutback opportunity",
    });
  });

  it("routes how-did-you-get-the-number prompts to the math tool", async () => {
    const response = await runAIAgent(
      {
        message: "How did you get the spendable cash today number?",
        snapshot: getFakeSnapshot("healthy"),
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_pip_cash_math"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "math_breakdown",
    });
  });

  it("answers recurring bill totals without surfacing unsupported finance output", async () => {
    const response = await runAIAgent(
      {
        message: "What's the total of these monthly bills?",
        snapshot: getFakeSnapshot("production-scale"),
        history: [
          { role: "user", content: "What bills are coming up?" },
          { role: "assistant", content: "Here are your upcoming bills." },
        ],
        conversationState: {
          shownCards: [{ type: "recurring_activity", title: "Likely recurring activity" }],
          lastToolNames: ["get_recurring_activity"],
          promptChips: [],
        },
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_recurring_activity"]);
    expect(response.responseMode).toBe("chat_only");
    expect(response.cards).toEqual([]);
    expect(response.message.toLowerCase()).toMatch(/repeat|monthly|bill|total/);
  });
```

Do not assert `response.error`; `AgentResponse` does not need an error field. A successful promise plus expected `usedTools`, `responseMode`, and cards is the no-502 contract.

- [ ] **Step 3: Add a narrow negative test for cardless recurring totals**

Add one negative test to prevent the deterministic recurring-total helper from becoming a generic cardless finance answer:

```ts
  it("does not answer recurring totals cardlessly without recurring context", async () => {
    const response = await runAIAgent(
      {
        message: "What's the total of these monthly bills?",
        snapshot: getFakeSnapshot("production-scale"),
      },
      createMockModelClient(),
    );

    expect(response.usedTools).toEqual(["get_recurring_activity"]);
    expect(response.responseMode).toBe("show_card");
    expect(response.cards[0]).toMatchObject({
      type: "recurring_activity",
    });
  });
```

This preserves the model-first boundary: a standalone aggregate prompt fetches the recurring card, while a follow-up after recurring context can answer the aggregate in chat.

- [ ] **Step 4: Run focused agent tests and verify failures before Task 4**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts
```

Expected before Task 4:

- The save-money and math tests may pass if Task 2 already fixed them through `getForcedAgentTool`.
- The recurring total test may still fail if the real agent chooses a card or model path.

Record the failing assertion in the implementation notes before changing production code.

---

## Task 4: Make Recurring Aggregate Follow-Ups Robust Without Visible Facts

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`

- [ ] **Step 1: Add a recent recurring context helper**

Add this near `hasVisibleRecurringAggregateContext`:

```ts
function hasRecentRecurringActivityContext(input: RunAiAgentInput): boolean {
  return Boolean(
    input.conversationState?.lastToolNames?.includes("get_recurring_activity") ||
      input.conversationState?.shownCards?.some((card) => card.type === "recurring_activity") ||
      input.history?.slice(-6).some((item) =>
        item.role === "assistant" &&
        /\b(recurring|repeat(?:ing)? items?|subscriptions?|upcoming bills?|bills? coming up|monthly bills?)\b/i.test(item.content)
      ),
  );
}
```

- [ ] **Step 2: Add a deterministic aggregate response helper**

Add this after `createDeterministicRecentTransactionsFollowUpResponse`:

```ts
function createDeterministicRecurringAggregateResponse(input: RunAiAgentInput): AgentResponse | null {
  if ((input.requestKind ?? "chat") !== "chat") {
    return null;
  }

  const normalized = normalizePrompt(input.message);

  if (!isRecurringAggregatePrompt(normalized) || !hasRecentRecurringActivityContext(input)) {
    return null;
  }

  if (!input.snapshot) {
    return null;
  }

  const response = runAgentTool("show_recurring_activity", {}, input.snapshot);
  const recurringCard = response.cards.find(
    (card): card is Extract<AgentCard, { type: "recurring_activity" }> =>
      card.type === "recurring_activity",
  );

  if (!recurringCard) {
    return null;
  }

  const expenseItems = recurringCard.items.filter((item) => item.amountCents < 0);
  const expenseTotalCents = expenseItems.reduce(
    (total, item) => total + Math.abs(item.amountCents),
    0,
  );

  return agentResponseSchema.parse({
    message: `Those monthly bills add up to ${formatMoneyWithCents(expenseTotalCents)} across ${expenseItems.length} items.`,
    cards: [],
    promptChips: response.promptChips,
    usedTools: ["get_recurring_activity"],
    responseMode: "chat_only",
    audit: {
      toolNames: ["get_recurring_activity"],
      usedModel: false,
    },
  });
}
```

Use `formatMoneyWithCents` if it is already imported in `ai-agent.ts`; otherwise add it to the existing money import:

```ts
import { formatMoney, formatMoneyWithCents } from "@/lib/money";
```

- [ ] **Step 3: Call the deterministic recurring aggregate helper before model execution**

In `runAIAgent`, after the recent-transactions deterministic response block:

```ts
  const deterministicRecurringAggregateResponse = createDeterministicRecurringAggregateResponse(input);

  if (deterministicRecurringAggregateResponse) {
    return deterministicRecurringAggregateResponse;
  }
```

The order should be:

```ts
  const deterministicRecentTransactionsResponse = createDeterministicRecentTransactionsFollowUpResponse(input);

  if (deterministicRecentTransactionsResponse) {
    return deterministicRecentTransactionsResponse;
  }

  const deterministicRecurringAggregateResponse = createDeterministicRecurringAggregateResponse(input);

  if (deterministicRecurringAggregateResponse) {
    return deterministicRecurringAggregateResponse;
  }

  const preModelSavingsGoalResponse = await createPreModelSavingsGoalResponse(input);
```

- [ ] **Step 4: Run focused agent tests**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts
```

Expected:

```text
PASS src/lib/agent/ai-agent.test.ts
```

- [ ] **Step 5: Commit agent routing fix**

Run:

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts
git commit -m "fix: harden agent follow-up routing"
```

---

## Task 5: Improve Chat-Turn Telemetry For Future Root Cause Analysis

**Files:**
- Modify: `src/lib/agent/route-telemetry.ts`
- Modify: `src/lib/agent/route-telemetry.test.ts`
- Modify: `src/lib/data/agent-chat-turns.ts`
- Modify: `src/lib/data/agent-chat-turns.test.ts`

- [ ] **Step 1: Add telemetry fields to the route metadata type**

In `src/lib/agent/route-telemetry.ts`, update `AgentRouteTelemetryRequest.conversationState`:

```ts
  conversationState?: {
    shownCards?: Array<{ type: string; title?: string }>;
    visibleCardFacts?: Array<{ type: string; facts?: unknown[]; values?: unknown[] }>;
    lastToolNames?: string[];
    promptChips?: PromptChip[];
  };
```

- [ ] **Step 2: Add visible context counts to metadata**

In `createChatTurnRequestMetadata`, add these fields:

```ts
    visibleCardFactCount: input.conversationState?.visibleCardFacts?.length ?? 0,
    visibleCardValueCount: input.conversationState?.visibleCardFacts?.reduce(
      (total, card) => total + (Array.isArray(card.values) ? card.values.length : 0),
      0,
    ) ?? 0,
```

Place them next to `shownCardCount` and `lastToolCount`.

- [ ] **Step 3: Allow the new keys through chat-turn metadata sanitization**

In `src/lib/data/agent-chat-turns.ts`, add these to `allowedMetadataKeys`:

```ts
  "visibleCardFactCount",
  "visibleCardValueCount",
```

- [ ] **Step 4: Add a telemetry unit test**

In `src/lib/agent/route-telemetry.test.ts`, extend the existing `builds stable chat-turn request metadata` case by adding visible-card facts to `conversationState`:

```ts
        visibleCardFacts: [
          {
            type: "recurring_activity",
            facts: [{ label: "Netflix" }],
            values: [
              { label: "Netflix", amountCents: -2199 },
              { label: "YouTube Premium", amountCents: -1399 },
              { label: "Spotify", amountCents: -1099 },
            ],
          },
        ],
```

Then add these expectations:

```ts
      visibleCardFactCount: 1,
      visibleCardValueCount: 3,
```

- [ ] **Step 5: Add a persistence allowlist test**

In `src/lib/data/agent-chat-turns.test.ts`, add this near the existing `stores guidance source in request metadata for operator review` test:

```ts
it("keeps visible-card context counts in agent chat metadata", async () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const supabase = {
    from: vi.fn(() => ({ insert })),
  } as unknown as SupabaseClient<Database>;

  await recordAgentChatTurn(supabase, {
    conversationId: "web-test",
    userMessage: "What do these bills add up to?",
    requestMetadata: {
      requestKind: "chat",
      shownCardCount: 1,
      lastToolCount: 1,
      visibleCardFactCount: 1,
      visibleCardValueCount: 3,
      unsupportedKey: "drop me",
    },
  });

  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({
      request_metadata: expect.objectContaining({
        requestKind: "chat",
        shownCardCount: 1,
        lastToolCount: 1,
        visibleCardFactCount: 1,
        visibleCardValueCount: 3,
      }),
    }),
  );
  expect(insert.mock.calls[0][0].request_metadata).not.toHaveProperty("unsupportedKey");
});
```

This uses the existing mock style in `agent-chat-turns.test.ts`; do not introduce a separate `createMockSupabase()` helper.

- [ ] **Step 6: Run telemetry and data tests**

Run:

```bash
npm test -- src/lib/agent/route-telemetry.test.ts src/lib/data/agent-chat-turns.test.ts
```

Expected:

```text
PASS src/lib/data/agent-chat-turns.test.ts
PASS src/lib/agent/route-telemetry.test.ts
```

- [ ] **Step 7: Commit telemetry improvement**

Run:

```bash
git add src/lib/agent/route-telemetry.ts src/lib/agent/route-telemetry.test.ts src/lib/data/agent-chat-turns.ts src/lib/data/agent-chat-turns.test.ts
git commit -m "chore: record agent visible context metadata"
```

---

## Task 6: Add Dogfood Fixtures For The Production Failure Class

**Files:**
- Modify: `tests/fixtures/agent-major-capabilities.mjs`
- Modify: `scripts/eval-agent.test.ts` only if fixture validation tests require expected fields.

- [ ] **Step 1: Add major capability cases**

Add capability entries near the related cutback, math, and recurring capabilities. Use the existing `majorCapabilities` shape: `id`, `label`, `safetyClass`, `tiers`, `primaryCase`, `paraphrases`, `stateCases`, `multiTurnJourneys`, `uiProof`, `productionPolicy`, and `androidReview`.

```js
  {
    id: "production_save_money_cutback",
    label: "Production save-money cutback wording",
    safetyClass: "local_private",
    tiers: ["api"],
    primaryCase: {
      id: "major-production-save-money-cutback",
      description: "Plain save-money wording routes to grounded cutback analysis instead of unsupported prose.",
      message: "i want to save money",
      scenario: "cutback-dining",
      expectedTools: ["get_spending_opportunity"],
      expectedCards: ["insight_card"],
      expectedResponseMode: "show_card",
      forbidGenericCutbackAdvice: true,
    },
    paraphrases: ["help me save money", "how can I save money"],
    stateCases: ["cutback-dining"],
    multiTurnJourneys: [],
    uiProof: { desktop: false, mobile: false },
    productionPolicy: "local_only",
    androidReview: false,
  },
  {
    id: "production_how_number_math",
    label: "Production how-number math wording",
    safetyClass: "redacted_read_only",
    tiers: ["api", "production_safe"],
    primaryCase: {
      id: "major-production-how-number-math",
      description: "How-did-you-get-the-number wording routes to math rather than unsupported recurring-card prose.",
      message: "How did you get the spendable cash today number?",
      expectedTools: ["get_pip_cash_math"],
      expectedCards: ["math_breakdown"],
      expectedResponseMode: "show_card",
      forbiddenTools: ["get_recurring_activity"],
    },
    paraphrases: ["how did you come up with today's number?", "what went into this number?"],
    stateCases: [],
    multiTurnJourneys: [],
    uiProof: { desktop: false, mobile: false },
    productionPolicy: "redacted_read_only",
    androidReview: false,
  },
  {
    id: "production_recurring_total_followup",
    label: "Production recurring total follow-up",
    safetyClass: "local_private",
    tiers: ["api", "multi_turn"],
    primaryCase: {
      id: "major-production-recurring-total-followup-no-visible-facts",
      description: "Recurring total follow-up remains safe when shown-card and last-tool context are present but visibleCardFacts are absent.",
      message: "What's the total of these monthly bills?",
      history: [
        { role: "user", content: "What bills are coming up?" },
        { role: "assistant", content: "Here are your upcoming bills." },
      ],
      conversationState: {
        shownCards: [{ type: "recurring_activity", title: "Likely recurring activity" }],
        lastToolNames: ["get_recurring_activity"],
        promptChips: [],
      },
      expectedTools: ["get_recurring_activity"],
      expectedResponseMode: "chat_only",
      expectNoCards: true,
    },
    paraphrases: [],
    stateCases: ["production-scale"],
    multiTurnJourneys: [],
    uiProof: { desktop: false, mobile: false },
    productionPolicy: "local_only",
    androidReview: false,
  },
```

Do not use `forbiddenResponseModes`; the eval harness supports `expectedResponseMode`, `forbiddenTools`, `forbiddenCards`, `expectNoCards`, and `forbidGenericCutbackAdvice`. Keep the production messages exactly as shown.

- [ ] **Step 2: Run eval fixture tests**

Run:

```bash
npm test -- scripts/eval-agent.test.ts
```

Expected:

```text
PASS scripts/eval-agent.test.ts
```

- [ ] **Step 3: Run targeted major eval**

Run:

```bash
PIP_AGENT_EVAL_CASE_IDS=major-production-save-money-cutback,major-production-how-number-math,major-production-recurring-total-followup-no-visible-facts npm run eval:agent -- --suite major-capabilities
```

Expected:

```text
PASS major-production-save-money-cutback
PASS major-production-how-number-math
PASS major-production-recurring-total-followup-no-visible-facts
```

- [ ] **Step 4: Commit fixture coverage**

Run:

```bash
git add tests/fixtures/agent-major-capabilities.mjs scripts/eval-agent.test.ts
git commit -m "test: cover production agent invalid-output regressions"
```

---

## Task 7: Full Verification

**Files:**
- No source edits.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/lib/agent/intent-router.test.ts src/lib/agent/ai-agent.test.ts src/lib/agent/route-telemetry.test.ts src/lib/data/agent-chat-turns.test.ts scripts/eval-agent.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 2: Run dogfood router gate**

Run:

```bash
npm run dogfood:router
```

Expected:

```text
PASS
```

- [ ] **Step 3: Run major capability API gate**

Run:

```bash
npm run dogfood:major:api
```

Expected:

```text
PASS
```

- [ ] **Step 4: Run full tests**

Run:

```bash
npm test
```

Expected:

```text
PASS
```

- [ ] **Step 5: Run production build**

Run:

```bash
npm run build
```

Expected:

```text
Compiled successfully
```

- [ ] **Step 6: Check whitespace**

Run:

```bash
git diff --check
```

Expected:

```text
```

No output.

- [ ] **Step 7: Final commit if any verification-only fixture changes remain**

Run:

```bash
git status --short
```

Expected:

```text
```

No output, unless the executor intentionally delayed commits. If there are staged implementation changes, commit them with:

```bash
git add src/lib/agent src/lib/data tests/fixtures scripts
git commit -m "fix: prevent agent invalid-output regressions"
```

---

## Task 8: Live Read-Only Verification After Deploy

**Files:**
- No source edits.

- [ ] **Step 1: Replay the production failure prompts in the app**

Use the Codex in-app Browser with the `iab` backend against the deployed or local verification target. Replay:

```text
How did you get the spendable cash today number?
What bills are coming up?
What's the total of these monthly bills?
i want to save money
```

Expected visible behavior:

- No `I need another pass at that. Please ask again.`
- No answer-service error.
- No `null`, `{}`, or internal schema language.
- `How did you get...` shows a math breakdown.
- The bills total follow-up answers with a total in chat.
- `i want to save money` shows a grounded cutback/opportunity result.

- [ ] **Step 2: Query Supabase for new failed turns**

Use Supabase MCP `execute_sql` against project `qevvmulexfoebjmlxbts`:

```sql
select id, conversation_id, user_message, error_message, request_metadata, created_at
from public.agent_chat_turns
where created_at >= now() - interval '30 minutes'
  and error_message is not null
order by created_at desc;
```

Expected:

```text
[]
```

- [ ] **Step 3: Query Supabase for successful replay metadata**

Use Supabase MCP `execute_sql`:

```sql
select user_message,
       response_mode,
       used_tools,
       card_types,
       request_metadata->>'visibleCardFactCount' as visible_card_fact_count,
       request_metadata->>'visibleCardValueCount' as visible_card_value_count,
       created_at
from public.agent_chat_turns
where created_at >= now() - interval '30 minutes'
  and user_message in (
    'How did you get the spendable cash today number?',
    'What bills are coming up?',
    'What''s the total of these monthly bills?',
    'i want to save money'
  )
order by created_at desc;
```

Expected:

- The rows exist.
- `error_message` is absent because the query only returns successful rows.
- `used_tools` includes the expected tool for each prompt.
- Metadata includes visible-card counts for follow-up turns.

---

## Rollback Plan

If a new regression appears:

1. Revert only the latest failing commit with `git revert <commit>`.
2. Keep telemetry changes if they are not the cause; they improve diagnosis and do not change agent behavior.
3. Re-run:

```bash
npm test -- src/lib/agent/intent-router.test.ts src/lib/agent/ai-agent.test.ts
npm run dogfood:router
```

4. Query Supabase for the next failed row and add that exact phrase as a test before trying another behavior fix.

## Completion Criteria

- Exact production failure phrases are covered in tests.
- Safe read-only finance prompts route to existing deterministic tools.
- Model-first guard remains strict.
- Recurring bill total follow-ups work with visible facts and with only recent recurring context.
- `agent_chat_turns` metadata can show whether visible-card facts reached the server.
- Focused tests, router dogfood, major API dogfood, full test suite, build, and `git diff --check` pass.
- Live replay produces no new `invalid-agent-output` rows in Supabase.
