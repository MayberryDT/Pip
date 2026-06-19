# Pip Savings Context State Machine Optimized Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pip reliably handle multi-turn savings-goal conversations on phone, including the verified Japan transcript, without losing goal context or claiming a goal was created before persistence succeeds.

**Architecture:** Treat savings-goal setup as deterministic product state. Carry a typed `pendingAction` through the client, persist the latest pending action into `agent_chat_turns.request_metadata`, hydrate it server-side after reloads, and make savings follow-ups run before generic LLM/chat routing. The LLM may explain savings math, but the state machine owns routing, confirmation, persistence, and copy guards.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Playwright, Supabase-backed `agent_chat_turns`, existing savings-goal repository, cards, and planning utilities.

---

## Optimizer Result

**Rubric**

- Problem fit and transcript coverage: 20
- Deterministic state architecture: 20
- Execution sequencing and merge safety: 15
- Test and eval coverage: 20
- Deployment and live QA safety: 15
- Maintainability and scope control: 10

**Score trajectory:** `82 -> 91 -> 94 -> 94`

**Initial plan weaknesses fixed here:**

- Added persistence for pending savings drafts after app reload, not only client memory.
- Fixed snippet hazards from the first draft: duplicate TypeScript fragments, duplicate assertions, and nondeterministic date handling.
- Made Netlify flag verification robust; `netlify env:get` can print “No value set” while still producing output.
- Reordered work so branch merge, state contract, persistence, deterministic routing, evals, and production rollout are independent review points.

---

## Verified Failure To Fix

Live production `agent_chat_turns` conversation `web-ea0d3959-9f15-4011-9d89-1c7961a5be4c` failed like this:

1. `I need to save for a trip to Japan` -> Pip asks if the user wants a Japan goal.
2. `Yes` -> Pip incorrectly runs `get_recurring_activity`.
3. `Set the savings goal` -> Pip asks target/date.
4. `$3000 by December 1st` -> Pip claims the Japan goal is set, but no `create_savings_goal` action ran.
5. `How much do I need to hit that goal?` -> Pip loses the draft and gives generic fallback.

Hard requirements:

- A savings prompt creates or updates a typed pending draft.
- A short follow-up like `Yes` only acts on an explicit pending action.
- Pip never says a goal is created/saved/set unless the backend action succeeded and returned a savings goal card.
- The draft survives app reload by server hydration from `agent_chat_turns.request_metadata`.
- Disabled savings-goal flags hide creation claims; Pip may calculate a plan but not promise tracking.

---

## Execution Rules

- Work from `main` in an isolated branch named `codex/pip-savings-context-state-machine`.
- Keep the existing local commit `491c462` as the starting point, but do not assume it is already on `main`.
- Do not add a database migration for draft state. Use existing `agent_chat_turns.request_metadata` JSON.
- Use existing `src/lib/savings-goals/plan.ts` for monthly/daily math.
- Keep all visible copy in Monthly Savings / Savings Goals language. Do not reintroduce “cushion.”
- Commit after each task unless tests are red.

---

### Task 1: Port The Existing Phone Context Repair

**Files:**
- Modify: files touched by commit `491c462`
- Verify: `src/components/PipHome.tsx`, `src/app/api/agent/route.ts`, `src/lib/data/agent-chat-turns.ts`, `src/lib/agent/ai-agent.ts`

- [ ] **Step 1: Create branch from fresh main**

```bash
git checkout main
git pull
git checkout -b codex/pip-savings-context-state-machine
```

Expected: branch created from current `origin/main`.

- [ ] **Step 2: Cherry-pick the existing repair**

```bash
git cherry-pick 491c462
```

If `next-env.d.ts` changes to `.next/dev/types/routes.d.ts`, restore:

```ts
import "./.next/types/routes.d.ts";
```

- [ ] **Step 3: Verify core repair exists**

```bash
rg -n "pendingAction|loadRecentAgentChatHistory|createDeterministicSavingsGoalResponse" \
  src/components/PipHome.tsx \
  src/app/api/agent/route.ts \
  src/lib/data/agent-chat-turns.ts \
  src/lib/agent/ai-agent.ts
```

Expected: all three concepts are present.

- [ ] **Step 4: Run carried tests**

```bash
npm test -- \
  src/lib/agent/ai-agent.test.ts \
  src/app/api/agent/route.test.ts \
  src/lib/data/agent-chat-turns.test.ts \
  src/components/PipHome.test.tsx \
  scripts/eval-agent.test.ts
```

Expected: all listed files pass.

- [ ] **Step 5: Commit conflict resolutions if needed**

```bash
git status --short
git add -A
git commit -m "fix: port Pip phone context repair"
```

Skip the commit if `git cherry-pick` already created a clean commit and `git status --short` is empty.

---

### Task 2: Define The Savings Draft Contract

**Files:**
- Modify: `src/lib/agent/card-types.ts`
- Modify: `src/lib/agent/response-schema.ts`
- Test: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Add failing state-contract test**

Add near the savings-goal tests in `src/lib/agent/ai-agent.test.ts`:

```ts
it("starts a savings goal draft with typed missing fields", async () => {
  const response = await runAIAgent({
    message: "I need to save for a trip to Japan",
    onboardingState: readyOnboardingState(),
    features: { savingsGoals: true },
    actions: createSavingsActions(),
  });

  expect(response.usedTools).toEqual([]);
  expect(response.responseMode).toBe("clarify");
  expect(response.pendingAction).toMatchObject({
    type: "create_savings_goal",
    name: "Japan trip",
    missing: ["target_amount"],
  });
});
```

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "starts a savings goal draft"
```

Expected before implementation: fail.

- [ ] **Step 2: Update pending action TypeScript types**

In `src/lib/agent/card-types.ts`, define:

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

- [ ] **Step 3: Update Zod schema**

In `src/lib/agent/response-schema.ts`, define:

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

- [ ] **Step 4: Verify schema users**

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/components/PipHome.test.tsx src/app/api/agent/route.test.ts
```

Expected: pass after implementation.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/card-types.ts src/lib/agent/response-schema.ts src/lib/agent/ai-agent.test.ts
git commit -m "feat: define savings goal pending draft state"
```

---

### Task 3: Persist Pending Drafts In Agent Chat Metadata

**Files:**
- Modify: `src/lib/data/agent-chat-turns.ts`
- Modify: `src/app/api/agent/route.ts`
- Test: `src/lib/data/agent-chat-turns.test.ts`
- Test: `src/app/api/agent/route.test.ts`

- [ ] **Step 1: Add failing metadata persistence test**

In `src/lib/data/agent-chat-turns.test.ts`, add:

```ts
it("records response pending action in request metadata", async () => {
  await recordAgentChatTurn(createSupabaseInsertMock(), {
    userId: "user-1",
    conversationId: "web-test",
    userMessage: "I need to save for Japan",
    response: {
      message: "How much is the target amount?",
      cards: [],
      promptChips: [],
      usedTools: [],
      responseMode: "clarify",
      pendingAction: {
        type: "create_savings_goal",
        name: "Japan trip",
        missing: ["target_amount"],
      },
      audit: {
        toolNames: [],
        usedModel: false,
      },
    },
  });

  expect(lastInsertedRow().request_metadata).toMatchObject({
    responsePendingAction: {
      type: "create_savings_goal",
      name: "Japan trip",
      missing: ["target_amount"],
    },
  });
});
```

Use the existing Supabase insert mock helpers in that test file. If helper names differ, adapt only the helper references, not the expected metadata shape.

- [ ] **Step 2: Persist pending action or explicit null**

In `src/lib/data/agent-chat-turns.ts`, update `buildRequestMetadata(input)` so every response turn writes:

```ts
responsePendingAction: input.response && "pendingAction" in input.response
  ? (input.response.pendingAction ?? null)
  : null,
```

Keep existing metadata fields.

- [ ] **Step 3: Add loader for latest pending action**

In `src/lib/data/agent-chat-turns.ts`, export:

```ts
export async function loadLatestAgentPendingAction(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    conversationId: string;
  },
): Promise<AgentPendingAction | undefined> {
  const { data, error } = await supabase
    .from("agent_chat_turns")
    .select("request_metadata, error_message, created_at")
    .eq("user_id", input.userId)
    .eq("conversation_id", input.conversationId)
    .is("error_message", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const value = (data?.[0]?.request_metadata as Record<string, unknown> | null | undefined)
    ?.responsePendingAction;

  if (!value) {
    return undefined;
  }

  return pendingActionSchema.parse(value);
}
```

Add imports:

```ts
import type { AgentPendingAction } from "@/lib/agent/card-types";
import { pendingActionSchema } from "@/lib/agent/response-schema";
```

- [ ] **Step 4: Hydrate pending action in the route**

In `src/app/api/agent/route.ts`, import `loadLatestAgentPendingAction`.

In `prepareAgentHistory`, return both `history` and `pendingAction`:

```ts
async function prepareAgentHistory(...): Promise<{
  history: AgentRouteRequest["history"];
  pendingAction?: AgentPendingAction;
}> {
  ...
}
```

When there is authenticated event context and client did not send a pending action, load the latest pending action:

```ts
const pendingAction = input.conversationState?.pendingAction
  ? input.conversationState.pendingAction
  : await loadLatestAgentPendingAction(routeContext.eventContext.supabase, {
      userId: routeContext.eventContext.userId,
      conversationId,
    }).catch(() => undefined);
```

Pass to `runAIAgent`:

```ts
conversationState: {
  ...(parsed.data.conversationState ?? {}),
  ...(historyPreparation.pendingAction
    ? { pendingAction: historyPreparation.pendingAction }
    : {}),
},
```

- [ ] **Step 5: Add route hydration test**

In `src/app/api/agent/route.test.ts`, add:

```ts
it("hydrates the latest server pending action when the phone client lost state", async () => {
  routeMocks.loadLatestAgentPendingAction.mockResolvedValue({
    type: "create_savings_goal",
    name: "Japan trip",
    targetAmountCents: 300000,
    targetDate: "2026-12-01",
    missing: ["confirmation"],
  });

  await POST(createAgentRequest({
    conversationId: "web-test",
    message: "How much do I need to hit that goal?",
    history: [],
  }));

  expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      conversationState: expect.objectContaining({
        pendingAction: expect.objectContaining({
          type: "create_savings_goal",
          name: "Japan trip",
        }),
      }),
    }),
  );
});
```

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- src/lib/data/agent-chat-turns.test.ts src/app/api/agent/route.test.ts
git add src/lib/data/agent-chat-turns.ts src/lib/data/agent-chat-turns.test.ts src/app/api/agent/route.ts src/app/api/agent/route.test.ts
git commit -m "fix: persist savings draft context in chat turns"
```

---

### Task 4: Add Deterministic Draft Parsing Helpers

**Files:**
- Create: `src/lib/savings-goals/draft.ts`
- Create: `src/lib/savings-goals/draft.test.ts`

- [ ] **Step 1: Add tests**

Create `src/lib/savings-goals/draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildSavingsGoalDraftPlan,
  inferSavingsGoalName,
  parseSavingsGoalAmountCents,
  parseSavingsGoalTargetDate,
} from "@/lib/savings-goals/draft";

describe("savings goal draft helpers", () => {
  it("infers useful savings goal names", () => {
    expect(inferSavingsGoalName("I need to save for a trip to Japan")).toBe("Japan trip");
    expect(inferSavingsGoalName("I want to save for a $3000 computer")).toBe("Computer");
    expect(inferSavingsGoalName("I want to save money for a big purchase")).toBe("Big purchase");
  });

  it("parses target amounts", () => {
    expect(parseSavingsGoalAmountCents("$3,000 by December 1st")).toBe(300000);
    expect(parseSavingsGoalAmountCents("I want to save for a $3000 computer")).toBe(300000);
    expect(parseSavingsGoalAmountCents("yes")).toBeNull();
  });

  it("parses natural target dates from an explicit as-of date", () => {
    expect(parseSavingsGoalTargetDate("$3000 by December 1st", "2026-06-19")).toBe("2026-12-01");
    expect(parseSavingsGoalTargetDate("$3000 by January 5", "2026-12-20")).toBe("2027-01-05");
    expect(parseSavingsGoalTargetDate("by 2027-04-10", "2026-06-19")).toBe("2027-04-10");
  });

  it("builds deterministic monthly and daily savings math", () => {
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

- [ ] **Step 2: Implement helpers**

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
  const trimmed = message.trim();
  const tripMatch = trimmed.match(/\b(?:trip|vacation)\s+(?:to|for)\s+([a-z][a-z\s'-]{1,40})/i);

  if (tripMatch) {
    return `${titleCase(cleanGoalName(tripMatch[1]))} trip`;
  }

  const saveForMatch = trimmed.match(/\bsave(?: money)? for (?:a |an |the )?(?:\$[\d,]+(?:\.\d{1,2})?\s*)?([a-z][a-z\s'-]{1,40})/i);

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

  return Number.isFinite(dollars) && dollars > 0 ? dollars * 100 + cents : null;
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

- [ ] **Step 3: Run tests and commit**

```bash
npm test -- src/lib/savings-goals/draft.test.ts
git add src/lib/savings-goals/draft.ts src/lib/savings-goals/draft.test.ts
git commit -m "feat: add savings goal draft helpers"
```

---

### Task 5: Implement Deterministic Savings Follow-Up State Machine

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Test: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Add exact transcript regression**

Add to `src/lib/agent/ai-agent.test.ts`:

```ts
it("handles the Japan savings goal transcript without losing context", async () => {
  vi.setSystemTime(new Date("2026-06-19T16:00:00.000Z"));
  const actions = createSavingsActions();
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let pendingAction: AgentResponse["pendingAction"] | undefined;

  const first = await runAIAgent({
    message: "I need to save for a trip to Japan",
    onboardingState: readyOnboardingState(),
    history,
    features: { savingsGoals: true },
    actions,
  });
  expect(first.usedTools).toEqual([]);
  expect(first.pendingAction).toMatchObject({
    type: "create_savings_goal",
    name: "Japan trip",
    missing: ["target_amount"],
  });
  pendingAction = first.pendingAction;
  history.push({ role: "user", content: "I need to save for a trip to Japan" }, { role: "assistant", content: first.message });

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
  expect(second.message).toMatch(/target amount|how much/i);
  expect(second.message).not.toMatch(/recurring|repeat|bills/i);
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
  expect(third.message).not.toMatch(/\b(created|saved|set up|set)\b/i);
  pendingAction = third.pendingAction;
  history.push({ role: "user", content: "$3000 by December 1st" }, { role: "assistant", content: third.message });

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

  const fifth = await runAIAgent({
    message: "Yes",
    onboardingState: readyOnboardingState(),
    history,
    conversationState: { pendingAction: fourth.pendingAction },
    features: { savingsGoals: true },
    actions,
  });
  expect(fifth.usedTools).toEqual(["create_savings_goal"]);
  expect(fifth.cards[0]?.type).toBe("savings_goal_plan");
});
```

- [ ] **Step 2: Implement state machine before model routing**

In `src/lib/agent/ai-agent.ts`:

- Import helpers from `src/lib/savings-goals/draft.ts`.
- Ensure `createDeterministicSavingsGoalResponse` runs before generic affirmative follow-up routing.
- Replace the pending savings action handler so:
  - negative follow-up clears the draft with no tool.
  - missing target amount asks for amount.
  - missing target date asks for date.
  - amount/date known calculates monthly contribution and asks for confirmation.
  - `How much do I need to hit that goal?` repeats the calculated amount and keeps `missing: ["confirmation"]`.
  - affirmative follow-up with `missing: ["confirmation"]` calls `executeCreateSavingsGoal`.
  - `track only` creates with `include_in_spendable_cash: false`.

Use this message shape for confirmation:

```ts
`To hit ${formatMoney(amountCents)} for ${name} by ${targetDate}, save about ${formatMoney(monthlyContributionCents)} per month. Want me to create that goal and keep ${formatMoney(monthlyContributionCents)}/month out of Spendable Cash Today?`
```

- [ ] **Step 3: Run focused tests and commit**

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "Japan savings goal transcript"
npm test -- src/lib/agent/ai-agent.test.ts -t "savings goal"
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts
git commit -m "fix: make savings goal follow-ups deterministic"
```

---

### Task 6: Prevent False Goal-Created Copy

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Test: `src/lib/agent/ai-agent.test.ts`

- [ ] **Step 1: Add test**

```ts
it("does not claim a savings goal was created until create_savings_goal succeeds", async () => {
  vi.setSystemTime(new Date("2026-06-19T16:00:00.000Z"));
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

- [ ] **Step 2: Add visible-copy guard**

In the final response builder in `src/lib/agent/ai-agent.ts`, repair savings copy unless `usedTools` includes `create_savings_goal` and cards include `savings_goal_plan`:

```ts
function repairSavingsGoalPersistenceClaim(
  message: string,
  usedTools: string[],
  cards: AgentCard[],
): string {
  const createdSavingsGoal =
    usedTools.includes("create_savings_goal") &&
    cards.some((card) => card.type === "savings_goal_plan");

  if (createdSavingsGoal || !/\b(goal|savings)\b/i.test(message)) {
    return message;
  }

  return message
    .replace(/\bI(?:'ve| have)?\s+(?:got|set|created|saved|set up)\b/gi, "I can help create")
    .replace(/\bYour goal (?:is|has been) (?:set|created|saved)\b/gi, "Your goal is ready to create");
}
```

- [ ] **Step 3: Run tests and commit**

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "created until"
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts
git commit -m "fix: prevent false savings goal persistence claims"
```

---

### Task 7: Prioritize Savings Conversation State

**Files:**
- Modify: `src/lib/agent/conversation-state.ts`
- Test: `src/lib/agent/conversation-state.test.ts`

- [ ] **Step 1: Add tests**

```ts
it("classifies savings goal follow-ups before recurring activity", () => {
  expect(inferConversationJob("I need to save for a trip to Japan")).toBe("savings_goal");
  expect(inferConversationJob("Set the savings goal")).toBe("savings_goal");
  expect(inferConversationJob("$3000 by December 1st")).toBe("savings_goal");
  expect(inferConversationJob("How much do I need to hit that goal?")).toBe("savings_goal");
});

it("classifies yes as savings goal when prior assistant asked about a savings goal", () => {
  expect(inferConversationJob("Yes", [
    { role: "assistant", content: "Want me to set a Japan savings goal?" },
  ])).toBe("savings_goal");
});
```

- [ ] **Step 2: Add savings check before recurring/forecast/duplicate**

In `inferConversationJob`, before recurring detection:

```ts
if (isSavingsGoalPrompt(normalized, history)) {
  return "savings_goal";
}
```

Helper:

```ts
function isSavingsGoalPrompt(
  normalized: string,
  history: AgentHistoryItem[] | undefined,
): boolean {
  if (/\b(hit that goal|that goal|set the goal|create it|track only|save for|savings goal)\b/.test(normalized)) {
    return true;
  }

  if (
    /\b(save|savings|goal|trip|vacation|computer|big purchase|emergency fund)\b/.test(normalized) &&
    !/\b(spendable cash today|why this number|recent spending|transactions?)\b/.test(normalized)
  ) {
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

- [ ] **Step 3: Run tests and commit**

```bash
npm test -- src/lib/agent/conversation-state.test.ts
git add src/lib/agent/conversation-state.ts src/lib/agent/conversation-state.test.ts
git commit -m "fix: prioritize savings goal conversation state"
```

---

### Task 8: Add Eval And E2E Transcript Coverage

**Files:**
- Modify: `scripts/eval-agent.mjs`
- Modify: `scripts/eval-agent.test.ts`
- Modify: `tests/e2e/ai-agent.spec.ts`
- Modify: `tests/helpers/mock-agent-runtime.ts`

- [ ] **Step 1: Add transcript eval**

Add an eval case named `phone-savings-japan-context` with turns:

```js
[
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
]
```

Ensure the eval runner carries `response.pendingAction` into the next request body as `conversationState.pendingAction`.

- [ ] **Step 2: Add phone E2E**

In `tests/e2e/ai-agent.spec.ts`, add a test named:

```ts
test("phone dogfood Japan savings goal flow keeps context through amount question", async ({ page }) => {
  await page.goto("/app?scenario=default");
  await sendAgentMessage(page, "I need to save for a trip to Japan");
  await expect(page.getByText(/how much|target amount/i)).toBeVisible();

  await sendAgentMessage(page, "Yes");
  await expect(page.getByText(/how much|target amount/i)).toBeVisible();
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

- [ ] **Step 3: Run and commit**

```bash
npm test -- scripts/eval-agent.test.ts
npx playwright test tests/e2e/ai-agent.spec.ts -g "Japan savings goal"
git add scripts/eval-agent.mjs scripts/eval-agent.test.ts tests/e2e/ai-agent.spec.ts tests/helpers/mock-agent-runtime.ts
git commit -m "test: cover phone savings goal transcript"
```

---

### Task 9: Fix Production Flag Runbook

**Files:**
- Modify: `.env.example`
- Modify: `docs/savings-implementation-guide.md`
- Modify: `scripts/check-deployment-env.mjs`
- Test: `scripts/check-deployment-env.test.ts`

- [ ] **Step 1: Update env example**

`.env.example` must contain:

```bash
PIP_SAVINGS_GOALS_ENABLED=false
NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=false
PIP_MONTHLY_SAVINGS_LABEL=Monthly Savings
```

Do not use `NEXT_PUBLIC_PIP_SAVINGS_GOALS_ENABLED`.

- [ ] **Step 2: Add robust Netlify commands**

Add to `docs/savings-implementation-guide.md`:

````md
## Production Savings Flags

Set flags in production for both build and runtime scopes:

```bash
netlify env:set PIP_SAVINGS_GOALS_ENABLED true --context production --scope builds functions runtime
netlify env:set NEXT_PUBLIC_SAVINGS_GOALS_ENABLED true --context production --scope builds
netlify env:set PIP_MONTHLY_SAVINGS_LABEL "Monthly Savings" --context production --scope builds functions runtime
```

Verify with `netlify env:list --json`, not `env:get` alone:

```bash
netlify env:list --json > /tmp/spendwithpip-netlify-env.json
node scripts/check-deployment-env.mjs --require-savings-goals
```
````

If `scripts/check-deployment-env.mjs` does not yet support `--require-savings-goals`, add that flag in the same task and test it in `scripts/check-deployment-env.test.ts`.

- [ ] **Step 3: Commit**

```bash
npm test -- scripts/check-deployment-env.test.ts
git add .env.example docs/savings-implementation-guide.md scripts/check-deployment-env.mjs scripts/check-deployment-env.test.ts
git commit -m "docs: harden savings goal production flag runbook"
```

---

### Task 10: Final Verification, Push, And Live QA

**Files:**
- Verify entire branch

- [ ] **Step 1: Focused tests**

```bash
npm test -- \
  src/lib/savings-goals/draft.test.ts \
  src/lib/agent/ai-agent.test.ts \
  src/lib/agent/conversation-state.test.ts \
  src/app/api/agent/route.test.ts \
  src/lib/data/agent-chat-turns.test.ts \
  src/components/PipHome.test.tsx \
  scripts/eval-agent.test.ts \
  scripts/check-deployment-env.test.ts
```

- [ ] **Step 2: Full tests and build**

```bash
npm test
npm run build
```

Expected: full Vitest pass and successful Next production build.

- [ ] **Step 3: E2E**

```bash
npx playwright test tests/e2e/ai-agent.spec.ts -g "Japan savings goal"
```

Expected: pass.

- [ ] **Step 4: Clean generated churn**

```bash
git diff -- next-env.d.ts package-lock.json
git diff --check
```

Expected: no generated `next-env.d.ts` or lockfile noise unless intentionally changed.

- [ ] **Step 5: Push branch**

```bash
git status --short
git push -u origin codex/pip-savings-context-state-machine
```

- [ ] **Step 6: PR body**

```md
## Summary
- Adds deterministic savings-goal draft state for phone follow-ups.
- Persists pending savings context through agent chat metadata so app reloads do not lose the draft.
- Blocks false "goal created" copy until backend persistence succeeds.

## Test Plan
- [ ] npm test
- [ ] npm run build
- [ ] npx playwright test tests/e2e/ai-agent.spec.ts -g "Japan savings goal"

## Manual Phone QA
- [ ] Run Japan savings transcript.
- [ ] Confirm "Yes" does not route to recurring bills.
- [ ] Confirm Pip does not claim creation before a savings goal card appears.
```

- [ ] **Step 7: After merge, set flags and redeploy**

```bash
netlify env:set PIP_SAVINGS_GOALS_ENABLED true --context production --scope builds functions runtime
netlify env:set NEXT_PUBLIC_SAVINGS_GOALS_ENABLED true --context production --scope builds
netlify env:set PIP_MONTHLY_SAVINGS_LABEL "Monthly Savings" --context production --scope builds functions runtime
```

Then redeploy production from merged `main`.

- [ ] **Step 8: Verify live production transcript**

```bash
TOKEN="$(netlify env:get PIP_OPERATOR_TOKEN --context production --scope functions)"
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://spendwithpip.com/api/operator/agent-chats?limit=30" \
  > /tmp/pip-prod-agent-chats-after-savings-fix.json
node - <<'NODE'
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync("/tmp/pip-prod-agent-chats-after-savings-fix.json", "utf8"));
const text = JSON.stringify(payload.turns ?? []);
const forbidden = [/not sure what you mean/i, /same answer still applies/i, /clear repeat item/i, /Bank A|Bank B/i];
for (const pattern of forbidden) {
  if (pattern.test(text)) throw new Error(`Forbidden production chat text found: ${pattern}`);
}
console.log("Production savings chat transcript check passed.");
NODE
```

Expected:

```text
Production savings chat transcript check passed.
```

---

## Done Definition

- `main` contains the old `491c462` context repair plus the new state-machine work.
- Exact Japan transcript passes unit, eval, E2E, and live phone QA.
- `agent_chat_turns.request_metadata.responsePendingAction` stores draft state and explicit clears.
- Production flags are set with exact names and correct scopes.
- Pip does not route savings `Yes` to recurring activity.
- Pip does not claim a goal was created unless a savings goal card returns from a successful action.
