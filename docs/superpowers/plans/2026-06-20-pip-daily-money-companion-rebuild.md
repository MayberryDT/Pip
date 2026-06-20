# Pip Daily Money Companion Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Pip so Spendable Cash Today means what the user can still spend today, with fresh connected data, same-day spending subtracted directly, active savings goals folded into monthly savings, recurring bills handled as obligations, and Pip speaking like a warm daily money companion.

**Architecture:** Keep deterministic code in charge of financial state, database writes, and calculations, but create a unified daily money state that both the home screen and chat use. The money engine should model the day-start baseline from history, bills, income, cash, and savings, then subtract same-day discretionary spending dollar-for-dollar while reconciling recurring bill variance. The assistant should compose from verified facts and product state instead of canned bridge text, with a ranked opening-bubble planner choosing the single most useful thing to say right now.

**Tech Stack:** Next.js App Router, TypeScript, React, Supabase/Postgres migrations, Vitest, Playwright/Codex in-app Browser `iab` proof, existing OpenAI Agents SDK integration with `gpt-5-nano`, existing agent eval and dogfood scripts.

---

## Optimization Pass

This optimized version was scored with the plan-optimizer rubric below:

- Product fidelity to Tyler's decisions: 20 points
- Repo specificity and implementation accuracy: 15 points
- Sequencing and dependency control: 15 points
- Migration, rollout, rollback, and data-safety coverage: 15 points
- Test/eval enforceability: 20 points
- Feasibility and scope control: 10 points
- Handoff clarity for another agent: 5 points

Score trajectory:

```text
Draft 1: 82/100
Round 1: 93/100
Round 2: 96/100
Round 3: 96/100 plateau
```

The final score is 96/100. The main improvements are phase gates, explicit flag/rollback strategy, tighter account and bill data contracts, a runnable gate-case schema, and release stop conditions.

## Source Of Truth

This plan is based on the recovered raw Codex session transcript at `/home/tyler/.codex/sessions/2026/06/20/rollout-2026-06-20T12-36-25-019ee651-dc6e-7151-9eb2-83fde53f3ee8.jsonl`, not only the compacted summary. During the original drafting pass, GBrain was searched first for this exact discussion and returned no matching page because this plan had not been recorded yet.

After the first draft, the durable decisions were written to GBrain at slug `sessions/2026/06/pip-daily-money-companion-rebuild-plan`. Future agents should search that slug before relying on memory or transcript summaries.

The accepted product decisions from the transcript are:

1. Treat the savings problem, daily sync problem, bill problem, and assistant-feel problem as one unified rebuild.
2. Keep the public name `Spendable Cash Today`; fix behavior first.
3. The big number means: what the user can still spend today.
4. All connected accounts count. There is no account exclusion product concept for Spendable Cash Today.
5. Missing accounts or missing cards should make the number lower-trust, not hidden.
6. On app open, show the last known number immediately, but make it obvious Pip is checking for transactions and the number may change.
7. App-open refresh should prioritize freshness because the user opens Pip to know what they can spend right now.
8. Pending purchases count against today immediately, with a light caveat and no pending/posted double count.
9. Meaningful same-day changes should be explained proactively in Pip's opening bubble.
10. Every active savings goal always affects Spendable Cash Today. There is no "track only" option in the product model.
11. Before saving a goal, Pip previews the monthly savings amount and the before/after Spendable Cash Today impact.
12. If a savings goal leaves today too tight, Pip softly pushes back and suggests changing the target, amount, or date.
13. Regular bills are held out in the baseline and should not subtract again when they post. Only the variance changes today's remaining number.
14. The recurring bills feature must become a real obligations model, not a broad "likely recurring activity" list.
15. User corrections like "that is not a bill" or "my phone bill is usually $80" must persist and immediately recompute today's number.
16. User-confirmed bill rules win over user corrections, which win over automatic detection, which wins over one-off default classification.
17. Pip should ask proactive clarifying questions only when the answer materially changes Spendable Cash Today, trust, or future planning.
18. Opening bubble plus chips should show one highest-priority job at a time.
19. Bubble priority order: refresh status, new same-day spend, missing/stale data, bill/savings clarification, tight warning, savings opportunity, product tip, calm normal-day note.
20. Pip's voice: warm, direct, specific, practical, calm, human, not cute, corporate, robotic, or harsh.
21. Pip can push back, but with care plus evidence: "That might be hard today" rather than "I do not like that plan."
22. A formal Pip voice and judgment rubric is part of the release gate.
23. Finished means Tyler can buy something, open Pip, see refresh, and see Spendable Cash Today drop in reality.

## Current Code Reality

The current branch is `codex/pip-perfect-refactor`. The worktree already has unrelated local changes. Do not revert them.

Important current behavior found in the repo:

- `src/lib/pip-cash/spendable-cash-today.ts` starts with `toPipCashSnapshot(snapshot)`, so account filtering happens before calculation.
- `src/lib/pip-cash/account-filters.ts` removes accounts and transactions when `includedInPipCash === false`.
- `calculateSpendableCashToday` builds a modeled allowance, then spreads current-month variance over `RECOVERY_DAYS = 14`.
- `simulateSpendablePurchase` already calculates `todayRemainingCents = before - purchase`, but the home metric displays the recomputed smoothed number instead.
- `src/lib/savings-goals/plan.ts` only sums goals with `includeInSpendableCash` through `getProtectedSavingsGoalMonthlyCents`.
- `src/lib/data/savings-goals-repository.ts` defaults `include_in_spendable_cash` to false.
- `src/app/api/savings-goals/route-helpers.ts` only stales Pip Cash when a protected active goal changes.
- `src/lib/agent/savings-goal-flow.ts` short-circuits goal creation before model composition and still supports `set_savings_goal_protection`.
- `src/lib/agent/ai-agent.ts` exposes `set_account_inclusion` and `set_savings_goal_protection` in the prompt.
- `src/lib/agent/visible-response-guard.ts` enforces 45 words and bans language in a way that makes warm companion answers difficult.
- `src/lib/agent/answer-composer.ts` overrides many card-backed answers with flat canned messages.
- `src/lib/data/app-open-sync.ts` has a 10-minute app-open freshness cooldown.
- `src/components/PipHome.tsx` has a 60-second client app-open refresh guard and returns no visible success message for app-open refreshes.
- `src/lib/pip-cash/insights.ts` builds broad `RecurringActivity` from repeat-looking transactions; it is not a durable obligations model.
- `src/lib/data/manual-sync.ts` already compares old/current Pip Cash and can create `pip_reaction_events`; that machinery can be reused for "what changed" bubble events.
- Existing eval infrastructure includes `scripts/eval-agent.mjs`, `scripts/agent-quality-scorer.mjs`, `tests/fixtures/agent-quality/champion-challenger-cases.mjs`, and `scripts/run-major-capability-dogfood.mjs`.

## Target Product Contract

Spendable Cash Today should be calculated as:

```text
modeled_starting_room_for_today
- same_day_discretionary_spend
+ same_day_refunds
+ signed_recurring_bill_variance
= current_spendable_cash_today
```

Sign convention:

```text
same_day_discretionary_spend is positive and subtracts from today.
same_day_refunds is positive and adds back to today.
signed_recurring_bill_variance is positive when an expected bill is lower than planned, and negative when it is higher than planned.
The public top number floors at $0, but the internal state preserves shortfall/overage cents for explanations.
```

The modeled starting room still comes from:

```text
historical income
- expected recurring monthly obligations
- onboarding monthly savings
- every active savings goal monthly contribution
- safety cushion
- cash guardrail
= baseline daily room
```

Same-day spend is ledger-like:

```text
If Target posts today for $18 and it is discretionary, today drops by $18.
If Target is pending today for $18, today drops by $18 with a pending caveat.
If a matching posted replacement arrives, pending is not double counted.
If rent posts today for the expected $1,450, today does not drop again.
If rent posts for $1,500, today drops by $50.
If rent posts for $1,400, today gets $50 back or notes the bill came in light.
```

## Execution Strategy And Phase Gates

This is one rebuild, but it should be implemented in phases so each layer has deterministic truth before the assistant explains it.

### Phase 0: Baseline And Flags

Goal: make the branch safe to change.

- Verify the branch is `codex/pip-perfect-refactor`.
- Record unrelated dirty files and do not revert them.
- Add companion rebuild flags through the existing feature-flag pattern.
- Add failing contract tests before implementation changes.

Gate:

```bash
npm test -- src/lib/data/feature-flags.test.ts src/lib/pip-cash/spendable-cash-today.test.ts src/lib/savings-goals/plan.test.ts
```

Expected: new contract tests fail for known old behavior; unrelated tests should not regress from baseline.

### Phase 1: Deterministic Money Contract

Goal: make Spendable Cash Today numerically correct before changing Pip's voice.

- Remove account exclusion from core Pip Cash.
- Make all active savings goals affect the number.
- Add same-day ledger and daily money state.
- Add recurring obligation rules and bill variance.

Gate:

```bash
npm test -- src/lib/pip-cash/spendable-cash-today.test.ts src/lib/pip-cash/same-day-ledger.test.ts src/lib/pip-cash/recurring-obligations.test.ts src/lib/savings-goals/plan.test.ts
```

Expected: savings, same-day spend, bill variance, refunds, pending/posted dedupe, and all-active-account cases pass without model calls.

### Phase 2: App Open And Home Surface

Goal: make the home screen tell the truth immediately and warmly.

- Replace the 10-minute app-open freshness skip with provider-aware refresh decisions.
- Return previous/current/delta fields from sync.
- Add ranked opening-bubble planner and chips.
- Show checking state before network work begins.

Gate:

```bash
npm test -- src/lib/data/app-open-sync.test.ts src/app/api/sync/app-open/route.test.ts src/lib/data/manual-sync.test.ts src/lib/pip/opening-bubble-planner.test.ts src/components/PipHome.test.tsx
```

Expected: the number remains visible while Pip checks, and meaningful deltas produce exactly one high-priority bubble.

### Phase 3: Assistant Tools, Corrections, And Voice

Goal: let Pip converse naturally about verified money facts without taking unsafe actions.

- Add savings impact preview and confirmation flow.
- Add bill correction tools.
- Remove account exclusion and savings protection from model-facing product behavior.
- Replace canned bridge responses for key money flows.
- Add surface-specific visible response limits.

Gate:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/answer-composer.test.ts src/lib/agent/visible-response-guard.test.ts src/app/api/agent/route.test.ts
```

Expected: important financial responses are specific, grounded, warm, and still safety-bounded.

### Phase 4: Gate, Browser Proof, And Dogfood

Goal: prove the rebuild works like Tyler expects in automated and lived-use paths.

- Add the 137-case sequential gate with a strict 95/100 threshold.
- Add mocked provider browser proof.
- Add real dogfood runbook and evidence locations.
- Run the full verification command list before release.

Gate:

```bash
npm run eval:agent
npm run eval:agent:major
npm run test:pip-money-companion-gate
npm run test:e2e -- tests/e2e/ai-agent.spec.ts
```

Expected: no case below 95; browser proof uses Codex in-app Browser `iab` first.

## Feature Flags, Rollback, And Data Safety

Use the existing flag style in `src/lib/data/feature-flags.ts` and `src/lib/savings-goals/feature-flags.ts`. Add a typed companion money flag helper instead of scattering `process.env` checks.

Suggested flags:

```text
PIP_DAILY_MONEY_V2
PIP_ACTIVE_SAVINGS_GOALS_V2
PIP_RECURRING_OBLIGATION_RULES
PIP_APP_OPEN_REFRESH_V2
PIP_OPENING_BUBBLE_PLANNER_V2
PIP_COMPANION_RESPONSE_V2
```

Rollout rules:

- Local tests may force flags on with test helpers.
- Production defaults should remain conservative until the sequential gate, e2e proof, and dogfood runbook pass.
- Never hide the Spendable Cash Today number behind a flag once shown; flags choose calculation/assistant path, not whether the user gets an answer.
- New database schema is additive. Do not drop legacy columns or old rows during this rebuild.
- Legacy `include_in_spendable_cash` remains in Supabase types for compatibility, but product logic stops treating it as optional exclusion.
- If a flag is disabled, the app should fall back to the old path without corrupting savings goals, recurring obligation rules, or reaction events.

Rollback plan:

```text
1. Disable PIP_COMPANION_RESPONSE_V2 first if the assistant voice/tools regress.
2. Disable PIP_OPENING_BUBBLE_PLANNER_V2 if the home bubble becomes noisy or confusing.
3. Disable PIP_APP_OPEN_REFRESH_V2 if providers throttle or foreground refreshes become unstable.
4. Disable PIP_RECURRING_OBLIGATION_RULES if bill classification causes numeric errors; keep the table for future use.
5. Disable PIP_DAILY_MONEY_V2 only for severe numeric regressions; preserve captured evidence and failing case report.
```

Data-safety requirements:

- All new financial correction writes must be scoped by `user_id` and covered by RLS smoke tests.
- `delete_current_user_financial_data` must delete recurring obligation rules and related reaction data.
- Gate reports may include synthetic fixture data, but real dogfood reports must redact account numbers, institution tokens, raw provider payloads, and auth state.
- Assistant-visible context should summarize transactions and obligations; do not pass raw provider payloads to model composition.

## File Map

Create:

- `src/lib/pip-cash/daily-money-state.ts`: top-level orchestration for modeled start, same-day ledger, bill variance, and final current remaining number.
- `src/lib/pip-cash/daily-money-state.test.ts`: focused tests for start-of-day room, same-day direct subtraction, bill variance, shortfall preservation, and trust flags.
- `src/lib/pip-cash/same-day-ledger.ts`: classifies same-day transactions into discretionary spend, refunds, expected obligations, bill variance, transfers, settlements, and ignored rows.
- `src/lib/pip-cash/recurring-obligations.ts`: merges confirmed bill rules, corrections, and automatic detection into monthly obligations.
- `src/lib/data/recurring-obligation-rules.ts`: Supabase repository for user-confirmed bill rules and merchant corrections.
- `src/lib/pip/opening-bubble-planner.ts`: ranks the one most useful opening bubble message and matching chips.
- `src/lib/agent/pip-voice-rubric.ts`: shared scoring helpers for tone, grounding, usefulness, and soft pushback.
- `src/lib/data/app-open-sync.test.ts`: direct unit tests for app-open sync decisions.
- `src/lib/data/pip-money-companion-flags.ts`: typed flag helper following the existing `src/lib/data/feature-flags.ts` pattern, or extend `feature-flags.ts` directly if that better matches local style.
- `src/lib/agent/response-schema.test.ts`: schema coverage for new savings impact and bubble card payloads.
- `src/lib/agent/visible-response-guard.test.ts`: guard coverage for surface-specific word limits and banned phrases.
- `tests/fixtures/pip-money-companion-gate.ts`: 100+ sequential release-gate cases.
- `scripts/pip-money-companion-gate.mjs`: sequential runner that executes one case, scores it out of 100, stops below 95, and writes a JSON report.
- `scripts/pip-money-companion-gate.test.ts`: unit tests for the sequential gate runner.
- `supabase/migrations/20260620_recurring_obligation_rules.sql`: durable bill rules and correction schema.

Modify:

- `src/lib/types.ts`: add daily money state fields to `SpendableCashTodayResult` and add bill-rule types.
- `src/lib/pip-cash/spendable-cash-today.ts`: use the new daily money state and expose start-of-day, same-day spend, bill variance, and final remaining fields.
- `src/lib/pip-cash/account-filters.ts`: remove user inclusion filtering from core Pip Cash snapshots; keep active provider availability only if needed for disconnected/closed accounts.
- `src/lib/pip-cash/engine.ts`: pass all active connected accounts into Pip Cash and preserve missing-card warnings.
- `src/lib/pip-cash/insights.ts`: replace broad recurring bill card behavior with obligations-backed output, while preserving compatible card rendering during migration.
- `src/lib/pip-cash/financial-read.ts`: include daily money state, obligation rules, freshness, and proactive question candidates.
- `src/lib/savings-goals/plan.ts`: replace protected-only savings goal monthly sum with all-active goal monthly contribution resolution.
- `src/lib/savings-goals/types.ts`: deprecate `includeInSpendableCash` in product logic and add impact-preview data types.
- `src/lib/data/savings-goals-repository.ts`: default legacy `include_in_spendable_cash` to true for active goals or stop relying on it.
- `src/app/api/savings-goals/route-helpers.ts`: validate goals as spendable-impacting goals and stale/recompute for all active goal changes.
- `src/lib/agent/savings-goal-flow.ts`: preview monthly impact before save and remove track-only/protection flow.
- `src/app/api/agent/route.ts`: remove product-facing account inclusion and goal protection actions; add bill correction actions and savings impact preview support.
- `src/lib/agent/ai-agent.ts`: update instructions, tools, and final-answer behavior for the daily companion contract.
- `src/lib/agent/answer-composer.ts`: stop overriding important money/bill/savings responses with flat bridge text.
- `src/lib/agent/visible-response-guard.ts`: replace rigid 45-word global cap with surface-specific caps and a voice-safe phrase policy.
- `src/components/PipHome.tsx`: show app-open refresh state immediately, consume opening-bubble planner output, reload after meaningful sync, and show warm status copy.
- `src/components/PipHome.test.tsx`: flip silent-success tests to visible refresh/bubble behavior.
- `src/components/cards/CardRenderer.tsx`: update account and recurring bill card copy/actions for all-connected accounts and bill corrections.
- `src/lib/data/app-open-sync.ts`: replace "fresh enough for 10 minutes" with "attempt now unless provider/rate-limit/pending prevents it."
- `src/app/api/sync/app-open/route.ts`: return sync delta, freshness status, meaningful new same-day spend, and reaction/bubble context.
- `src/lib/data/manual-sync.ts`: return previous/current Spendable Cash, transaction deltas, same-day deltas, and created reaction summaries.
- `src/lib/pip/reactions.ts`: add reaction decisions for same-day spend found and bill variance.
- `scripts/eval-agent.mjs` and `scripts/agent-quality-scorer.mjs`: add companion rubric support and money-correctness scoring.
- `package.json`: add `test:pip-money-companion-gate` script.
- `supabase/rls_smoke_test.sql`, `src/lib/data/supabase-schema.test.ts`, `src/lib/supabase/database.types.ts`: include the new bill rules table.

## Implementation Tasks

### Task 0: Establish Baseline, Flags, And Working Boundaries

**Files:**
- Modify or create: `src/lib/data/pip-money-companion-flags.ts` or `src/lib/data/feature-flags.ts`
- Create or modify: `src/lib/data/pip-money-companion-flags.test.ts` or `src/lib/data/feature-flags.test.ts`
- Read-only check: `git status --short`

- [ ] **Step 1: Confirm branch and dirty worktree**

Run:

```bash
git status --short
git branch --show-current
```

Expected: branch is `codex/pip-perfect-refactor`. Existing unrelated modified files are noted and not reverted.

- [ ] **Step 2: Add typed rollout flags**

Add a single helper that parses the companion rebuild flags:

```ts
export type PipMoneyCompanionFlags = {
  dailyMoneyV2: boolean;
  activeSavingsGoalsV2: boolean;
  recurringObligationRules: boolean;
  appOpenRefreshV2: boolean;
  openingBubblePlannerV2: boolean;
  companionResponseV2: boolean;
};
```

Use the repo's existing boolean parsing style. Tests should prove empty values default to false in production-like contexts and can be explicitly enabled in tests/local runs.

Run:

```bash
npm test -- src/lib/data/pip-money-companion-flags.test.ts
```

Expected: PASS once the flag helper exists.

- [ ] **Step 3: Define active connected account in code comments and tests**

Use this definition everywhere:

```text
All active connected accounts count.
Active means the provider connection/account is usable and not closed, removed, disconnected, or repair-blocked.
There is no user preference that excludes a connected active account from Spendable Cash Today.
Inactive or repair-needed accounts are missing/stale data problems, not exclusion behavior.
```

Run:

```bash
npm test -- src/lib/pip-cash/engine.test.ts src/lib/agent/account-connections.test.ts
```

Expected now: old exclusion expectations may fail until Task 2 updates them.

### Task 1: Lock The Product Contract With Failing Tests

**Files:**
- Modify: `src/lib/pip-cash/spendable-cash-today.test.ts`
- Modify: `src/lib/pip-cash/engine.test.ts`
- Modify: `src/components/PipHome.test.tsx`
- Modify: `src/lib/savings-goals/plan.test.ts`
- Modify: `src/lib/agent/ai-agent.test.ts`
- Modify: `src/lib/agent/answer-composer.test.ts`

- [ ] **Step 1: Replace the tracked-only savings goal test**

Change the current `keeps tracked-only savings goals out of Spendable Cash Today` test into a failing test named:

```ts
it("includes every active savings goal in Spendable Cash Today", () => {
  const base = calculatePipCash(healthyPipSnapshot).spendableCashToday;
  const withGoal = calculatePipCash({
    ...healthyPipSnapshot,
    savingsGoals: [
      {
        id: "goal-1",
        userId: "user-1",
        name: "Japan",
        targetAmountCents: 300000,
        targetDate: "2026-12-20",
        startingAmountCents: 0,
        currentAmountCents: 0,
        monthlyContributionCents: 50000,
        includeInSpendableCash: false,
        status: "active",
        createdAt: "2026-06-20T00:00:00.000Z",
        updatedAt: "2026-06-20T00:00:00.000Z",
      },
    ],
  }).spendableCashToday;

  expect(withGoal?.savingsGoalMonthlyCents).toBe(50000);
  expect(withGoal?.monthlyEverydayPoolCents).toBe(
    (base?.monthlyEverydayPoolCents ?? 0) - 50000,
  );
});
```

Run:

```bash
npm test -- src/lib/pip-cash/spendable-cash-today.test.ts
```

Expected now: FAIL because the current code still filters by `includeInSpendableCash`.

- [ ] **Step 2: Replace account exclusion expectation**

Change the `calculatePipCash` test named `ignores transactions from inactive or excluded accounts in Spendable Cash Today` so an excluded connected card purchase counts. The assertion should become:

```ts
expect(result.spendingTotalCents).toBe(50000);
expect(result.trueBalances).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      accountId: "business-card",
      includedInPipCash: true,
    }),
  ]),
);
```

Run:

```bash
npm test -- src/lib/pip-cash/engine.test.ts
```

Expected now: FAIL because `account-filters.ts` still removes excluded accounts.

- [ ] **Step 3: Add direct same-day subtraction regression**

Add a test that creates a stable baseline with three completed months and a same-day discretionary transaction. Expected fields:

```ts
expect(metric.startingSpendableCashTodayCents).toBe(7400);
expect(metric.sameDayDiscretionarySpendCents).toBe(1800);
expect(metric.spendableCashTodayCents).toBe(5600);
expect(metric.sameDayLedger.items[0]).toMatchObject({
  transactionId: "target-today",
  treatment: "daily_spend",
  amountCents: -1800,
});
```

Run:

```bash
npm test -- src/lib/pip-cash/spendable-cash-today.test.ts
```

Expected now: FAIL because the new fields do not exist and current-month spending is smoothed.

- [ ] **Step 4: Add recurring bill no-double-subtract regression**

Add three tests:

```ts
expect(exactBill.metric.billVarianceCents).toBe(0);
expect(exactBill.metric.sameDayDiscretionarySpendCents).toBe(0);

expect(overBill.metric.billVarianceCents).toBe(-3000);
expect(overBill.metric.spendableCashTodayCents).toBe(starting - 3000);

expect(underBill.metric.billVarianceCents).toBe(3000);
expect(underBill.metric.spendableCashTodayCents).toBe(starting + 3000);
```

Run:

```bash
npm test -- src/lib/pip-cash/spendable-cash-today.test.ts
```

Expected now: FAIL because there is no bill variance model.

- [ ] **Step 5: Flip app-open success from silent to visible**

Replace the test named `keeps successful app-open refreshes silent` with:

```ts
expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "checking" })).toMatch(/checking|transactions|may change/i);
expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "ran" })).toMatch(/updated|checked|found/i);
expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "skipped_recent" })).toMatch(/checked|recently|latest/i);
```

Run:

```bash
npm test -- src/components/PipHome.test.tsx
```

Expected now: FAIL because success currently returns `null`.

### Task 2: Remove Account Exclusion From Core Spendable Cash

**Files:**
- Modify: `src/lib/pip-cash/account-filters.ts`
- Modify: `src/lib/data/financial-repository.ts`
- Modify: `src/components/cards/CardRenderer.tsx`
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/app/api/agent/route.ts`
- Modify: `src/lib/agent/account-connections.ts`
- Modify tests touching account inclusion.

- [ ] **Step 1: Make the core filter count all connected active accounts**

Change `isAccountActiveInPipCash` to ignore `includedInPipCash`:

```ts
export function isAccountActiveInPipCash(account: Account): boolean {
  return account.active !== false;
}
```

Then change `mapAccountRow` so active accounts map as included for product display:

```ts
includedInPipCash: active,
hiddenReason: active ? undefined : preference?.hidden_reason ?? undefined,
```

Run:

```bash
npm test -- src/lib/pip-cash/engine.test.ts src/lib/pip-cash/spendable-cash-today.test.ts
```

Expected: the account exclusion regression passes after test updates.

- [ ] **Step 2: Remove product-facing inclusion language**

In `src/lib/agent/ai-agent.ts`, remove the prompt line that tells Pip to use `set_account_inclusion` for ignore/exclude/include requests. Replace it with:

```ts
"All active connected personal accounts count in Spendable Cash Today. If a user asks why a connected account is excluded, explain that Pip now counts every active connected account and can help repair or remove an institution if the connection is wrong.",
```

In `src/app/api/agent/route.ts`, keep server code for legacy safety if needed, but remove the tool from model-exposed actions and forced-tool routing. User-facing account actions should be connect, repair, account selection update, protected savings, and remove institution.

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/app/api/agent/route.test.ts src/lib/agent/account-connections.test.ts
```

Expected: tests pass with no user-facing exclusion tool.

- [ ] **Step 3: Update account card visual state**

In `src/components/cards/CardRenderer.tsx`, replace the check/circle meaning with active/needs-attention meaning:

```tsx
{account.active ? "✓" : "!"}
```

Update the role label builder in `src/lib/agent/account-connections.ts` so it never says "excluded from Pip Cash." It should say "Connected and counted" for active accounts, and repair/selection copy for inactive accounts.

Run:

```bash
npm test -- src/components/cards/CardRenderer.test.tsx src/lib/agent/account-connections.test.ts
```

Expected: account cards no longer imply connected-but-excluded accounts.

### Task 3: Make Every Active Savings Goal Affect Spendable Cash Today

**Files:**
- Modify: `src/lib/savings-goals/plan.ts`
- Modify: `src/lib/savings-goals/types.ts`
- Modify: `src/lib/data/savings-goals-repository.ts`
- Modify: `src/app/api/savings-goals/route-helpers.ts`
- Modify: `src/lib/pip-cash/spendable-cash-today.ts`
- Modify: `src/lib/pip-cash/engine.ts`

- [ ] **Step 1: Replace protected-only monthly contribution helper**

Add these exports in `src/lib/savings-goals/plan.ts`:

```ts
export type SavingsGoalContributionResolution = {
  goalId: string;
  name: string;
  monthlyContributionCents: number;
  source: "explicit" | "target_date";
  needsPlan: boolean;
};

export function resolveSavingsGoalMonthlyContribution(
  goal: SavingsGoal,
  asOfDate: string,
): SavingsGoalContributionResolution {
  if (goal.status !== "active") {
    return {
      goalId: goal.id,
      name: goal.name,
      monthlyContributionCents: 0,
      source: "explicit",
      needsPlan: false,
    };
  }

  if (goal.monthlyContributionCents > 0) {
    return {
      goalId: goal.id,
      name: goal.name,
      monthlyContributionCents: goal.monthlyContributionCents,
      source: "explicit",
      needsPlan: false,
    };
  }

  const plan = buildSavingsGoalPlan(goal, asOfDate);

  return {
    goalId: goal.id,
    name: goal.name,
    monthlyContributionCents: plan.recommendedMonthlyContributionCents ?? 0,
    source: "target_date",
    needsPlan: !plan.recommendedMonthlyContributionCents,
  };
}

export function getActiveSavingsGoalMonthlyCents(
  goals: SavingsGoal[] = [],
  asOfDate: string,
) {
  return goals.reduce(
    (sum, goal) => sum + resolveSavingsGoalMonthlyContribution(goal, asOfDate).monthlyContributionCents,
    0,
  );
}
```

Keep `getProtectedSavingsGoalMonthlyCents` as a deprecated wrapper during migration:

```ts
import { getCurrentAppDate } from "@/lib/date/app-date";

export function getProtectedSavingsGoalMonthlyCents(goals: SavingsGoal[] = [], asOfDate = getCurrentAppDate()) {
  return getActiveSavingsGoalMonthlyCents(goals, asOfDate);
}
```

Run:

```bash
npm test -- src/lib/savings-goals/plan.test.ts
```

Expected: all active goals contribute through explicit monthly amount or target date.

- [ ] **Step 2: Use active savings goal contributions in Pip Cash**

In `src/lib/pip-cash/spendable-cash-today.ts`, replace:

```ts
const savingsGoalMonthlyCents = getProtectedSavingsGoalMonthlyCents(snapshot.savingsGoals);
```

with:

```ts
const savingsGoalMonthlyCents = getActiveSavingsGoalMonthlyCents(
  snapshot.savingsGoals,
  asOfDate,
);
```

Update the driver detail from "Protected goal contributions..." to:

```ts
detail: "Active savings goals are folded into today's number.",
```

Run:

```bash
npm test -- src/lib/pip-cash/spendable-cash-today.test.ts src/lib/pip-cash/engine.test.ts
```

Expected: active goals reduce monthly everyday pool.

- [ ] **Step 3: Make goal changes always stale/recompute**

In `src/app/api/savings-goals/route-helpers.ts`, replace `shouldStalePipCashForGoalChange` with logic that stales when any active goal's amount, date, monthly contribution, current amount, or status changes:

```ts
export function shouldStalePipCashForGoalChange(before: SavingsGoal | null, after: SavingsGoal): boolean {
  if (!before) {
    return after.status === "active";
  }

  return (
    before.status !== after.status ||
    before.targetAmountCents !== after.targetAmountCents ||
    before.targetDate !== after.targetDate ||
    before.currentAmountCents !== after.currentAmountCents ||
    before.monthlyContributionCents !== after.monthlyContributionCents
  );
}
```

Also change create defaults:

```ts
include_in_spendable_cash: true,
```

The legacy column can remain in the database for compatibility, but product logic no longer uses it as a decision.

Add an additive data migration or repository-safe backfill for existing active goals:

```sql
update public.savings_goals
set include_in_spendable_cash = true
where status = 'active';
```

This is compatibility cleanup only. Spendable Cash Today must not depend on the column after this task.

Run:

```bash
npm test -- src/app/api/savings-goals/route.test.ts src/app/api/savings-goals/[goalId]/route.test.ts src/lib/data/savings-goals-repository.test.ts
```

Expected: create/update/archive always stales when an active goal can affect the number.

### Task 4: Add Savings Goal Impact Preview Before Save

**Files:**
- Modify: `src/lib/agent/card-types.ts`
- Modify: `src/lib/agent/response-schema.ts`
- Create: `src/lib/agent/response-schema.test.ts`
- Modify: `src/lib/agent/savings-goal-flow.ts`
- Modify: `src/app/api/agent/route.ts`
- Modify: `src/lib/savings-goals/cards.ts`
- Modify: `src/components/cards/CardRenderer.tsx`

- [ ] **Step 1: Add impact preview card type**

Add a card type:

```ts
{
  type: "savings_goal_impact_preview";
  title: string;
  goalName: string;
  targetAmountCents: number;
  targetDate?: string;
  monthlyContributionCents: number;
  beforeSpendableCashTodayCents: number;
  afterSpendableCashTodayCents: number;
  dailyRoomDeltaCents: number;
  usualDailySpendCents?: number;
  warning?: {
    level: "watch" | "tight" | "very_tight";
    message: string;
  };
}
```

Render it with rows for target, monthly amount, today before, today after, and tradeoff.

Run:

```bash
npm test -- src/components/cards/CardRenderer.test.tsx src/lib/agent/response-schema.test.ts
```

Expected: schema and card rendering support impact previews.

- [ ] **Step 2: Add preview action**

In `PipAgentActions`, add:

```ts
previewSavingsGoalImpact(input: SavingsGoalInput): Promise<{
  ok: boolean;
  status: "savings_goal_previewed" | "invalid_savings_goal";
  message?: string;
  cards?: AgentCard[];
  preview?: SavingsGoalImpactPreview;
}>
```

Implementation in `src/app/api/agent/route.ts` should:

1. Validate name, amount, and date/monthly plan.
2. Load current financial snapshot.
3. Resolve monthly contribution from explicit monthly amount or target date.
4. Calculate current result.
5. Calculate hypothetical result with the draft active goal added.
6. Return `savings_goal_impact_preview` card.

Run:

```bash
npm test -- src/app/api/agent/route.test.ts
```

Expected: preview returns before/after amounts and does not write a goal.

- [ ] **Step 3: Change savings flow confirmation**

In `src/lib/agent/savings-goal-flow.ts`, change complete draft behavior:

```text
Complete draft without confirmation -> call previewSavingsGoalImpact, return clarify with preview card and pendingAction.
User confirms -> call createSavingsGoal with monthlyContributionCents from preview.
```

Use visible copy like:

```text
That means about $430/month for Japan. If I add it, today drops from $74 to $60.
```

If after amount is very low:

```text
That might be hard today. It would leave about $5, and your usual spending is closer to $80/day.
```

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/components/PipHome.test.tsx
```

Expected: savings goal creates show a preview first, then persist only after confirmation.

### Task 5: Build The Daily Same-Day Ledger

**Files:**
- Create: `src/lib/pip-cash/same-day-ledger.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/pip-cash/spendable-cash-today.ts`
- Test: `src/lib/pip-cash/same-day-ledger.test.ts`
- Test: `src/lib/pip-cash/spendable-cash-today.test.ts`

- [ ] **Step 1: Add same-day ledger types**

Add to `src/lib/types.ts`:

```ts
export type SameDayLedgerTreatment =
  | "daily_spend"
  | "daily_refund"
  | "expected_bill"
  | "bill_variance"
  | "card_settlement"
  | "transfer"
  | "ignored";

export type SameDayLedgerItem = {
  transactionId: string;
  accountId: string;
  date: string;
  label: string;
  amountCents: number;
  treatment: SameDayLedgerTreatment;
  expectedAmountCents?: number;
  varianceCents?: number;
  pending: boolean;
  reason: string;
};

export type SameDayLedger = {
  asOfDate: string;
  items: SameDayLedgerItem[];
  discretionarySpendCents: number;
  refundCents: number;
  billVarianceCents: number;
  pendingSpendCents: number;
};
```

Run:

```bash
npm test -- src/lib/pip-cash/same-day-ledger.test.ts
```

Expected now: FAIL until the file exists.

- [ ] **Step 2: Implement ledger classification**

Create `buildSameDayLedger(input)` in `src/lib/pip-cash/same-day-ledger.ts`:

```ts
export function buildSameDayLedger(input: {
  asOfDate: string;
  transactions: ClassifiedSpendableTransaction[];
  obligations: RecurringObligation[];
}): SameDayLedger {
  // Same-day only.
  // Card settlements and transfers are not daily spend.
  // Everyday/unknown purchases subtract dollar-for-dollar.
  // Refunds add back.
  // Expected bills produce zero effect up to expected amount.
  // Bill variance applies only the difference.
}
```

The tests must cover:

- pending purchase counts
- posted purchase counts
- pending and posted duplicate pair counts once
- refund adds back
- card settlement ignored
- transfer ignored
- exact bill no effect
- high bill negative variance
- low bill positive variance
- unknown same-day spend counts as daily spend

Run:

```bash
npm test -- src/lib/pip-cash/same-day-ledger.test.ts
```

Expected: PASS.

- [ ] **Step 3: Expose ledger in Spendable Cash Today**

Add fields to `SpendableCashTodayResult`:

```ts
startingSpendableCashTodayCents: number;
sameDayDiscretionarySpendCents: number;
sameDayRefundCents: number;
billVarianceCents: number;
sameDayPendingSpendCents: number;
sameDayLedger: SameDayLedger;
```

Update `calculateSpendableCashToday` so `spendableCashTodayCents` is:

```ts
const startingSpendableCashTodayCents = cashCappedAllowanceCentsAfterBaselineAdjustments;
const liveRemainingCents = Math.max(
  0,
  startingSpendableCashTodayCents -
    sameDayLedger.discretionarySpendCents +
    sameDayLedger.refundCents +
    sameDayLedger.billVarianceCents,
);
```

Positive `billVarianceCents` adds room; negative subtracts room.

Run:

```bash
npm test -- src/lib/pip-cash/spendable-cash-today.test.ts
```

Expected: same-day direct subtraction tests pass.

- [ ] **Step 4: Centralize orchestration in daily money state**

Move the final composition into `src/lib/pip-cash/daily-money-state.ts` so the home screen, financial read, sync delta, and agent tools consume the same object:

```ts
export type DailyMoneyState = {
  asOfDate: string;
  startingSpendableCashTodayCents: number;
  currentSpendableCashTodayCents: number;
  publicSpendableCashTodayCents: number;
  shortfallCents: number;
  sameDayLedger: SameDayLedger;
  obligations: RecurringObligationModel;
  trust: {
    freshness: "checking" | "fresh" | "stale" | "partial" | "needs_repair";
    missingAccountSignals: string[];
  };
};
```

`publicSpendableCashTodayCents` floors at zero. `currentSpendableCashTodayCents` and `shortfallCents` preserve the real math so Pip can explain overages without pretending the user still has room.

Run:

```bash
npm test -- src/lib/pip-cash/daily-money-state.test.ts src/lib/pip-cash/spendable-cash-today.test.ts src/lib/pip-cash/financial-read.test.ts
```

Expected: every consumer uses the same daily state fields and no surface recomputes its own version of today's number.

### Task 6: Add Recurring Obligation Rules And Corrections

**Files:**
- Create: `supabase/migrations/20260620_recurring_obligation_rules.sql`
- Create: `src/lib/data/recurring-obligation-rules.ts`
- Create: `src/lib/data/recurring-obligation-rules.test.ts`
- Create: `src/lib/pip-cash/recurring-obligations.ts`
- Create: `src/lib/pip-cash/recurring-obligations.test.ts`
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `src/lib/data/supabase-schema.test.ts`
- Modify: `supabase/rls_smoke_test.sql`

- [ ] **Step 1: Add database table**

Create migration:

```sql
create type public.recurring_obligation_rule_source as enum (
  'user_confirmed',
  'user_correction',
  'auto_detected'
);

create type public.recurring_obligation_rule_status as enum (
  'active',
  'ignored'
);

create table public.recurring_obligation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  label text not null check (char_length(trim(label)) between 1 and 120),
  expected_amount_cents integer not null check (expected_amount_cents >= 0),
  expected_day integer check (expected_day between 1 and 31),
  cadence text not null default 'monthly' check (cadence = 'monthly'),
  source public.recurring_obligation_rule_source not null,
  status public.recurring_obligation_rule_status not null default 'active',
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create index recurring_obligation_rules_user_status_idx
on public.recurring_obligation_rules(user_id, status);

grant select, insert, update, delete on public.recurring_obligation_rules to authenticated;
grant select, insert, update, delete on public.recurring_obligation_rules to service_role;

alter table public.recurring_obligation_rules enable row level security;

create policy "Users can view their recurring obligation rules."
on public.recurring_obligation_rules for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their recurring obligation rules."
on public.recurring_obligation_rules for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their recurring obligation rules."
on public.recurring_obligation_rules for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their recurring obligation rules."
on public.recurring_obligation_rules for delete
to authenticated
using ((select auth.uid()) = user_id);
```

This migration is additive. Do not remove or rename the old recurring-activity insight fields yet; bridge them from obligations until all card/schema tests pass.

Add deletion to `delete_current_user_financial_data` before transactions:

```sql
delete from public.recurring_obligation_rules
where user_id = requesting_user_id;
```

If the actual function variable name differs, match the existing migration style exactly.

Run:

```bash
npm test -- src/lib/data/supabase-schema.test.ts
```

Expected: schema test recognizes the table and delete cleanup.

- [ ] **Step 2: Add repository**

Implement repository functions:

```ts
export async function listRecurringObligationRulesForUser(...)
export async function upsertRecurringObligationRuleForUser(...)
export async function ignoreRecurringObligationForUser(...)
export function normalizeMerchantKey(transactionOrText: string): string
```

Rules:

- Upsert by `user_id, merchant_key`.
- User-confirmed rules set `source = "user_confirmed"` and `last_confirmed_at = now`.
- "Not a bill" sets `status = "ignored"` and `source = "user_correction"`.
- Expected amount updates mark snapshots stale.

Run:

```bash
npm test -- src/lib/data/recurring-obligation-rules.test.ts
```

Expected: PASS.

- [ ] **Step 3: Merge rules with auto detection**

In `src/lib/pip-cash/recurring-obligations.ts`, expose:

```ts
export function buildRecurringObligations(input: {
  snapshot: FinancialSnapshot;
  rules: RecurringObligationRule[];
}): RecurringObligationModel
```

Priority:

1. Active user-confirmed rules
2. Ignored user-correction rules that suppress a merchant as a bill
3. Existing automatic detection from transaction history
4. No rule means daily spend by default

The model should return both confirmed obligations and unconfirmed suggestions:

```ts
export type RecurringObligationModel = {
  confirmed: RecurringObligation[];
  suggestions: RecurringObligationSuggestion[];
  ignoredMerchantKeys: string[];
};
```

Only confirmed obligations are held out of the baseline. Suggestions may produce a clarification bubble, but they must not change Spendable Cash Today until the user confirms them.

Run:

```bash
npm test -- src/lib/pip-cash/recurring-obligations.test.ts src/lib/pip-cash/insights.test.ts
```

Expected: rules override auto detection; auto suggestions still work when no user rule exists.

### Task 7: Reconcile Bills In The Daily Money State

**Files:**
- Modify: `src/lib/pip-cash/same-day-ledger.ts`
- Modify: `src/lib/pip-cash/spendable-cash-today.ts`
- Modify: `src/lib/pip-cash/insights.ts`
- Modify: `src/components/cards/CardRenderer.tsx`

- [ ] **Step 1: Classify expected bills**

Match same-day transactions to obligations by merchant key. Use absolute spend amount:

```ts
const varianceCents = expectedAmountCents - actualAmountCents;
```

Examples:

- expected 12000, actual 12000 -> variance 0
- expected 12000, actual 15000 -> variance -3000
- expected 12000, actual 9000 -> variance 3000

Run:

```bash
npm test -- src/lib/pip-cash/same-day-ledger.test.ts
```

Expected: exact/high/low bill variance tests pass.

- [ ] **Step 2: Update recurring card**

Rename user-visible recurring card title from "Likely recurring activity" to "Monthly bills I am holding back" when obligations exist. If the card is only auto suggestions, label rows with "needs confirmation" and provide chips:

```text
Treat as bill
Not a bill
```

Run:

```bash
npm test -- src/components/cards/CardRenderer.test.tsx src/lib/pip-cash/insights.test.ts
```

Expected: recurring cards stop listing random repeat activity as if confirmed bills.

### Task 8: Add Chat Corrections For Bills And Classifications

**Files:**
- Modify: `src/lib/agent/intent-catalog.ts`
- Modify: `src/lib/agent/tool-runner.ts`
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/app/api/agent/route.ts`
- Modify: `src/lib/agent/card-types.ts`
- Modify: `src/lib/agent/conversation-state.ts`
- Modify: `src/lib/data/recurring-obligation-rules.ts`

- [ ] **Step 1: Add correction actions**

Add tools/actions:

```ts
set_recurring_obligation_rule
mark_merchant_not_bill
update_recurring_obligation_amount
```

User messages that should route:

```text
That Target charge is not a bill.
My phone bill is usually $80.
Treat City Power as a bill.
Stop counting Netflix as daily spending.
```

Run:

```bash
npm test -- src/lib/agent/intent-router.test.ts src/lib/agent/tool-runner.test.ts
```

Expected: correction prompts route to the new tools.

- [ ] **Step 2: Recompute immediately after corrections**

Each correction action should:

1. Persist the rule.
2. Mark Pip Cash snapshots stale.
3. Recalculate or return `clientAction: reload`.
4. Return a response with before/after when available.

Visible copy examples:

```text
Got it. I moved Target into daily spending, so today dropped by $18.
Got it. I will hold about $80/month for your phone bill and only adjust today if it comes in different.
```

Run:

```bash
npm test -- src/app/api/agent/route.test.ts src/lib/agent/ai-agent.test.ts
```

Expected: corrections persist and trigger recompute/reload.

### Task 9: Make App Open Freshness-First

**Files:**
- Modify: `src/lib/data/app-open-sync.ts`
- Create: `src/lib/data/app-open-sync.test.ts`
- Modify: `src/app/api/sync/app-open/route.ts`
- Modify: `src/lib/data/manual-sync.ts`
- Modify: `src/components/PipHome.tsx`
- Modify: `src/components/data-controls-helpers.ts`

- [ ] **Step 1: Replace 10-minute freshness block**

Change app-open decision rules:

```text
Run on app open when a refreshable provider exists, unless:
- manual refresh only is enabled
- a sync job is already pending/running
- institution requires repair
- provider sync started in the last 30 seconds
- provider is unavailable
- provider-specific rate limit/backoff says wait
```

Keep a short technical cooldown for duplicate foreground events, but do not treat 10-minute-old data as "fresh enough" for app open.

The endpoint should return a reason enum for every non-run path:

```ts
type AppOpenSyncDecisionReason =
  | "run"
  | "already_running"
  | "manual_refresh_only"
  | "needs_repair"
  | "duplicate_foreground_guard"
  | "provider_backoff"
  | "provider_unavailable"
  | "no_refreshable_provider";
```

Run:

```bash
npm test -- src/app/api/sync/app-open/route.test.ts src/lib/data/app-open-sync.test.ts
```

Expected: app open returns `run` for connected providers even when last success was under 10 minutes ago, unless a sync is already running or a short duplicate guard applies.

- [ ] **Step 2: Return meaningful sync delta**

Extend `ManualSyncResult`:

```ts
previousSpendableCashTodayCents?: number;
currentSpendableCashTodayCents: number;
spendableDeltaCents: number;
sameDayNewSpendCents: number;
sameDayNewTransactions: Array<{
  id: string;
  merchantName?: string;
  description: string;
  amountCents: number;
  pending: boolean;
}>;
createdReactionSummary?: string;
```

Use previous cached result and current result to populate these fields.

For privacy, `sameDayNewTransactions` should include display-safe merchant/description, amount, pending status, and transaction id only. Do not include account numbers, provider raw payloads, access tokens, or full unredacted metadata.

Run:

```bash
npm test -- src/lib/data/manual-sync.test.ts src/lib/data/manual-sync-failure.test.ts
```

Expected: app-open/manual sync results include before/after deltas without leaking sensitive raw provider data.

- [ ] **Step 3: Show checking state immediately**

In `PipHome.tsx`, set a warm checking message before the fetch starts:

```ts
setAppOpenSyncMessage("I am checking for new transactions. This number may change.");
```

After success, use returned delta:

```text
I found your Target purchase, so I took $18 off today.
I checked and did not find new transactions yet.
Updated just now.
```

If sync fails or is partial:

```text
I could not finish checking just now, so I am showing the last number I had.
I checked what I could, but one connection needs attention.
```

Run:

```bash
npm test -- src/components/PipHome.test.tsx
```

Expected: success is visible, warm, and not failure-only.

### Task 10: Build Ranked Opening Bubble Planner

**Files:**
- Create: `src/lib/pip/opening-bubble-planner.ts`
- Create: `src/lib/pip/opening-bubble-planner.test.ts`
- Modify: `src/components/PipHome.tsx`
- Modify: `src/lib/agent/prompt-chip-planner.ts`

- [ ] **Step 1: Add planner return type**

```ts
export type OpeningBubblePriority =
  | "refresh"
  | "same_day_spend"
  | "missing_data"
  | "clarification"
  | "tight"
  | "savings_opportunity"
  | "product_tip"
  | "normal";

export type OpeningBubblePlan = {
  priority: OpeningBubblePriority;
  message: string;
  chips: PromptChip[];
  shouldMarkReactionSeen?: boolean;
};
```

Run:

```bash
npm test -- src/lib/pip/opening-bubble-planner.test.ts
```

Expected now: FAIL until implementation exists.

- [ ] **Step 2: Implement priority order**

Priority order:

1. Refresh/checking status
2. New same-day spend impact
3. Missing/stale connected data
4. Bill/savings clarification question
5. Tight/shortfall warning
6. Savings goal opportunity
7. Product tip
8. Calm normal-day note

Expected examples:

```text
I am checking for new transactions now. This number may move.
I found $18 at Target and took it off today.
I can show a number, but I am missing the card behind that payment.
I think City Power may be a monthly bill. Want me to treat it that way?
Today is tight. I would keep spending light.
You have not set a savings goal yet. I can help with one.
You can type settings to manage Pip.
You have $74 for today. Nothing unusual is pulling on it.
```

Run:

```bash
npm test -- src/lib/pip/opening-bubble-planner.test.ts src/components/PipHome.test.tsx
```

Expected: one bubble message and one or two chips are chosen per state.

### Task 11: Make Pip Sound Like A Daily Money Companion

**Files:**
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `src/lib/agent/answer-composer.ts`
- Modify: `src/lib/agent/visible-response-guard.ts`
- Create: `src/lib/agent/visible-response-guard.test.ts`
- Modify: `src/lib/agent/conversation-state.ts`
- Create: `src/lib/agent/pip-voice-rubric.ts`
- Create: `src/lib/agent/pip-voice-rubric.test.ts`

- [ ] **Step 1: Rewrite the core voice contract**

Replace "calm financial assistant" with:

```ts
"You are Pip, a warm daily money companion inside the Pip app.",
"Your job is to help the user understand what they can still spend today, what changed, and what tradeoff a money choice creates.",
"Use soft, practical pushback when the money picture is tight. Prefer care plus evidence: 'That might be hard today...' over judgmental language.",
"Never invent money facts. Use verified tool facts, current app state, cards, and daily money context.",
```

Keep safety rules:

```ts
"Do not say safe to spend, you can afford, financial advice, or financial advisor.",
"Do not pretend an action happened unless the matching tool returned ok.",
"Do not move money, transfer funds, pay bills, or imply Pip can do those things.",
```

Remove product-wrong rules:

```text
Savings goals are tracking and planning only.
Use set_savings_goal_protection...
Use set_account_inclusion...
```

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts
```

Expected: prompt tests pass with new contract.

- [ ] **Step 2: Replace global 45-word cap with surface caps**

Use:

```ts
const VISIBLE_LIMITS = {
  bridge: { maxWords: 45, maxChars: 260 },
  companion: { maxWords: 85, maxChars: 520 },
  openingBubble: { maxWords: 38, maxChars: 220 },
  correction: { maxWords: 70, maxChars: 420 },
};
```

Financial reads, savings previews, corrections, and "why did it change" can use `companion`. Simple card bridges still use `bridge`.

Run:

```bash
npm test -- src/lib/agent/visible-response-guard.test.ts src/lib/agent/answer-composer.test.ts
```

Expected: longer useful companion answers pass while unsupported promises and banned claims still fail.

- [ ] **Step 3: Stop canned overrides for key flows**

In `answer-composer.ts`, let model output survive for:

```text
purchase_simulation
recurring_activity / obligations
savings_goal_plan
savings_goal_impact_preview
guidance_card
trust_receipt when user asked "why"
same-day change explanations
```

Keep deterministic bridge text for pure utility cards like settings/account connections if the model says something unsupported.

Run:

```bash
npm test -- src/lib/agent/answer-composer.test.ts scripts/eval-agent.test.ts
```

Expected: important money answers are specific, not "I found likely repeat items."

### Task 12: Add A Minimum Visible Processing State For Financial Actions

**Files:**
- Modify: `src/components/PipHome.tsx`
- Modify: `src/components/pip-home/agent-session.ts`
- Modify: `src/components/pip-home/agent-session.test.ts`
- Modify: `src/components/PipHome.test.tsx`

- [ ] **Step 1: Add a minimum pending duration for deterministic financial actions**

Add:

```ts
const MIN_FINANCIAL_ACTION_PENDING_MS = 700;
```

Apply only when response audit/tool names include financial state actions:

```ts
create_savings_goal
preview_savings_goal_impact
update_savings_goal
refresh_financial_data
set_recurring_obligation_rule
mark_merchant_not_bill
update_recurring_obligation_amount
```

Do not slow greetings, small talk, or no-op chip refreshes.

Run:

```bash
npm test -- src/components/pip-home/agent-session.test.ts src/components/PipHome.test.tsx
```

Expected: deterministic financial actions show a visible thinking/checking state without adding arbitrary delay to all chat.

### Task 13: Update Product Docs And Trust Copy

**Files:**
- Modify: `src/app/how-the-number-works/page.tsx`
- Modify: `src/app/how-it-works/page.tsx`
- Modify: `src/app/terms/page.tsx`
- Modify: `src/lib/trust/pip-trust-policy.ts`
- Modify: `docs/savings-implementation-guide.md`

- [ ] **Step 1: Update "how the number works"**

Describe:

```text
Pip models the start of the day from income, monthly bills, savings, and cash reality. During the day, connected-account purchases subtract from today's number as Pip sees them. Regular bills are held back before the day starts, so they do not subtract twice unless the final amount differs from expected.
```

Run:

```bash
npm test -- src/app/legal-pages.test.tsx src/app/marketing-pages.test.tsx src/lib/trust/pip-trust-policy.ts
```

Expected: copy tests pass and no old "tracked only" or "protected goal" language remains.

### Task 14: Extend Agent Eval And Quality Scoring

**Files:**
- Modify: `tests/fixtures/agent-quality/champion-challenger-cases.mjs`
- Modify: `scripts/agent-quality-scorer.mjs`
- Modify: `scripts/eval-agent.mjs`
- Modify: `scripts/eval-agent.test.ts`
- Create: `tests/fixtures/pip-money-companion-gate.ts`
- Create: `scripts/pip-money-companion-gate.mjs`
- Create: `scripts/pip-money-companion-gate.test.ts`

- [ ] **Step 1: Add companion dimensions**

Extend quality dimensions:

```js
export const PIP_COMPANION_DIMENSIONS = {
  numericCorrectness: 35,
  freshnessAndTrust: 15,
  savingsAndBillsBehavior: 15,
  voiceAndJudgment: 20,
  proactiveWorkflow: 10,
  safetyBoundary: 5,
};
```

Scoring rule:

```text
100 = exact behavior, grounded facts, warm voice, no safety issue
95-99 = pass with tiny wording issue and no behavior issue
90-94 = useful but not releasable; fix before next case
70-89 = product behavior or voice materially off
1-69 = wrong action, wrong number, stale/incomplete trust handling, or bad UX
0 = safety boundary failure, invented money fact, false persistence, account exclusion, or dangerous advice
```

Run:

```bash
npm test -- scripts/agent-quality-scorer.test.ts scripts/eval-agent.test.ts
```

Expected: scorer returns 0-100 and exposes weak dimensions.

- [ ] **Step 2: Define the gate fixture schema**

`tests/fixtures/pip-money-companion-gate.ts` should export ordered cases with enough structure for deterministic setup, execution, and scoring:

```ts
export type PipMoneyCompanionGateCase = {
  id: string;
  title: string;
  category:
    | "spendable_cash_today"
    | "savings_goals"
    | "recurring_bills"
    | "sync_freshness"
    | "opening_bubble"
    | "assistant_voice"
    | "dogfood";
  setup: {
    date: string;
    userProfile?: "healthy" | "tight" | "missing_data" | "new_user";
    accounts?: GateAccountFixture[];
    transactions?: GateTransactionFixture[];
    savingsGoals?: GateSavingsGoalFixture[];
    recurringRules?: GateRecurringRuleFixture[];
    appState?: Record<string, unknown>;
  };
  action:
    | { type: "calculate" }
    | { type: "open_app" }
    | { type: "chat"; message: string }
    | { type: "sync"; providerEvent: string }
    | { type: "browser"; scenario: string };
  expected: {
    spendableCashTodayCents?: number;
    startingSpendableCashTodayCents?: number;
    sameDayDiscretionarySpendCents?: number;
    billVarianceCents?: number;
    toolNames?: string[];
    cardTypes?: string[];
    bubblePriority?: OpeningBubblePriority;
    requiredText?: RegExp[];
    forbiddenText?: RegExp[];
    hardZeroIf?: string[];
  };
  scoringWeights?: Partial<typeof PIP_COMPANION_DIMENSIONS>;
};
```

Every case must be self-contained. No case should depend on the side effects of an earlier case except through an explicit `resume` manifest written by the runner.

- [ ] **Step 3: Add sequential gate runner**

`scripts/pip-money-companion-gate.mjs` must:

1. Load the ordered case list.
2. Run one case.
3. Score it out of 100.
4. Write `planning-docs/dogfood/runs/pip-money-companion-gate-<timestamp>/case-###.json`.
5. Stop immediately when score is below 95.
6. Print the failing case id, score, rubric breakdown, and suggested root cause area.
7. Only continue after the implementer fixes and reruns the same case.

CLI:

```bash
node scripts/pip-money-companion-gate.mjs --from 1 --base-url http://127.0.0.1:3000
node scripts/pip-money-companion-gate.mjs --case SCT-001
node scripts/pip-money-companion-gate.mjs --resume planning-docs/dogfood/runs/<run-id>/manifest.json
```

Package script:

```json
"test:pip-money-companion-gate": "node scripts/pip-money-companion-gate.mjs"
```

Run:

```bash
npm test -- scripts/pip-money-companion-gate.test.ts
```

Expected: runner stops below 95 and resumes from the failed case.

- [ ] **Step 4: Add scorer evidence contract**

Each `case-###.json` report must include:

```json
{
  "caseId": "SCT-002",
  "score": 100,
  "passed": true,
  "breakdown": {
    "numericCorrectness": 35,
    "freshnessAndTrust": 15,
    "savingsAndBillsBehavior": 15,
    "voiceAndJudgment": 20,
    "proactiveWorkflow": 10,
    "safetyBoundary": 5
  },
  "observed": {},
  "expected": {},
  "hardZeroReasons": [],
  "rootCauseHint": null
}
```

Scores below 95 must print the weakest dimension and root-cause hint before exiting nonzero. Safety hard-zero failures must not be averaged with other dimensions.

Run:

```bash
npm test -- scripts/pip-money-companion-gate.test.ts scripts/agent-quality-scorer.test.ts
```

Expected: reports are deterministic, resumable, and useful enough for an implementer to fix the root cause before moving to the next case.

### Task 15: Browser And Dogfood Verification

**Files:**
- Modify: `tests/e2e/ai-agent.spec.ts`
- Modify: `scripts/run-major-capability-dogfood.mjs`
- Create: `planning-docs/dogfood/pip-daily-money-companion-runbook-2026-06-20.md`

- [ ] **Step 1: Add mocked provider dogfood**

Use existing mock provider patterns to simulate:

```text
Open app with $74 Spendable Cash Today.
App says it is checking.
Provider returns Target pending purchase for $18.
Top number becomes $56.
Opening bubble says Target was found and taken off today.
```

Run:

```bash
npm run test:e2e -- tests/e2e/ai-agent.spec.ts
```

Expected: E2E passes in mocked mode.

- [ ] **Step 2: Add real dogfood runbook**

The runbook must include:

```text
1. Start local app from branch codex/pip-perfect-refactor.
2. Connect all real spending/income accounts used for the test.
3. Record initial Spendable Cash Today and bubble text.
4. Make or identify a real same-day purchase.
5. Open Pip.
6. Confirm Pip says it is checking.
7. Confirm new transaction appears after provider exposes it.
8. Confirm Spendable Cash Today drops dollar-for-dollar if discretionary.
9. Confirm a bill posting does not double subtract.
10. Record screenshots and JSON evidence.
```

Browser automation must use Codex in-app Browser with `iab` first.

Evidence folder:

```text
planning-docs/dogfood/runs/pip-daily-money-companion-<timestamp>/
```

Required evidence:

```text
manifest.json with branch, commit, env flags, and base URL
before-home.png
checking-home.png
after-home.png
sync-result-redacted.json
gate-summary.json
notes.md with provider exposure timing and any manual observations
```

Run:

```bash
npm run dogfood:major
npm run test:pip-money-companion-gate
```

Expected: all automated tiers pass, then manual/real dogfood evidence is attached.

### Task 16: Roll Out, Monitor, And Keep A Clean Escape Hatch

**Files:**
- Modify: `.env.example` or documented env sample if one exists
- Modify: `docs/savings-implementation-guide.md`
- Create or modify: `planning-docs/dogfood/pip-daily-money-companion-runbook-2026-06-20.md`
- Modify: `scripts/check-prd-complete.mjs` only if it already tracks product proof requirements

- [ ] **Step 1: Document rollout flags and expected defaults**

Document all companion rebuild flags and their intended local/test/production defaults:

```text
PIP_DAILY_MONEY_V2=false in production until full gate passes
PIP_ACTIVE_SAVINGS_GOALS_V2=false in production until savings tests pass
PIP_RECURRING_OBLIGATION_RULES=false in production until bill correction tests pass
PIP_APP_OPEN_REFRESH_V2=false in production until provider/backoff tests pass
PIP_OPENING_BUBBLE_PLANNER_V2=false in production until bubble tests pass
PIP_COMPANION_RESPONSE_V2=false in production until voice gate passes
```

Run:

```bash
rg -n "PIP_DAILY_MONEY_V2|PIP_COMPANION_RESPONSE_V2|PIP_RECURRING_OBLIGATION_RULES" .env.example docs src
```

Expected: flags are discoverable and documented exactly once or through one canonical helper.

- [ ] **Step 2: Add rollback checklist to dogfood runbook**

Rollback checklist:

```text
1. Capture failing gate report and screenshots.
2. Disable the narrowest flag first.
3. Reopen local app and verify Spendable Cash Today still renders.
4. Verify no user correction/savings-goal data was deleted by rollback.
5. File the failing case id and root cause in the run notes.
```

Run:

```bash
rg -n "Rollback checklist|PIP_DAILY_MONEY_V2|PIP_COMPANION_RESPONSE_V2" planning-docs/dogfood docs
```

Expected: the next agent can disable a bad slice without guessing.

- [ ] **Step 3: Final release stop conditions**

Do not ship or merge if any of these are true:

```text
Any sequential gate case scores below 95.
Any hard-zero failure occurs.
App-open refresh silently fails without user-facing stale/partial copy.
Savings goal creation can persist without a before/after impact preview in chat.
Recurring bill suggestions affect the number before confirmation.
Same-day discretionary spend present in connected transactions fails to subtract from today.
Pip claims an action was saved when the database/tool returned failure.
Browser proof was done outside Codex in-app Browser without Tyler's explicit approval.
```

Run:

```bash
npm run test:pip-money-companion-gate
npm run test:e2e -- tests/e2e/ai-agent.spec.ts
```

Expected: all stop conditions are false and proof artifacts exist.

## Sequential 100+ Case Gate

The release gate must run cases in this order. Each case is scored out of 100. A case passes only at 95 or higher. If any case scores below 95, stop, fix the root cause, rerun that same case, and only then continue.

### Rubric

Each case uses the same 100-point frame, with dimensions adjusted by case type:

- `numericCorrectness` 35 points: correct Spendable Cash Today math, same-day subtraction, goal impact, bill variance, and pending/posted dedupe.
- `freshnessAndTrust` 15 points: correct checking/stale/missing-account behavior and honest caveats.
- `savingsAndBillsBehavior` 15 points: correct goal preview, obligation handling, corrections, and persistence.
- `voiceAndJudgment` 20 points: warm, specific, soft pushback, not robotic, not harsh.
- `proactiveWorkflow` 10 points: one highest-priority bubble/chip/action, no noisy bundles.
- `safetyBoundary` 5 points: no invented money facts, no false persistence, no "safe to spend", no financial-advice claims, no money movement promises.

Hard-zero failures:

- Invents a transaction, balance, bill, savings goal, or account.
- Says a goal/rule/action was saved before the tool/database action succeeds.
- Uses account exclusion as a reason for Spendable Cash Today not changing.
- Lets an active savings goal avoid the Spendable Cash Today calculation.
- Double-subtracts an expected bill.
- Fails to subtract same-day discretionary spend after it is present.
- Says "safe to spend", "you can afford", or "financial advice".
- Gives harsh or shaming money judgment.

### Ordered Case List

Spendable Cash Today math:

1. `SCT-001`: Three completed months create a $74 starting day.
2. `SCT-002`: $18 same-day posted Target purchase lowers $74 to $56.
3. `SCT-003`: $18 same-day pending Target purchase lowers $74 to $56 with pending caveat.
4. `SCT-004`: Pending Target replaced by posted Target counts once.
5. `SCT-005`: Two same-day purchases of $18 and $24 lower $74 to $32.
6. `SCT-006`: Same-day $12 refund raises today's remaining by $12.
7. `SCT-007`: Same-day card payment is ignored as settlement.
8. `SCT-008`: Same-day transfer to savings is ignored as transfer unless user marks it as savings goal contribution.
9. `SCT-009`: Unknown same-day negative transaction counts as daily spending with lower confidence.
10. `SCT-010`: Same-day discretionary spend floors public number at $0 and records overage/shortfall.
11. `SCT-011`: Current-month overspending before today can affect start-of-day room, but today's purchases subtract directly.
12. `SCT-012`: Today's purchases are excluded from current-month smoothing when calculating starting room.
13. `SCT-013`: Cash guardrail caps starting room before same-day spend.
14. `SCT-014`: Low-confidence user still sees direct same-day subtraction.
15. `SCT-015`: Missing-card warning does not prevent direct subtraction from connected accounts.
16. `SCT-016`: Disconnected/repair-needed institution marks trust low but keeps last known number visible.
17. `SCT-017`: All active connected credit card purchases count.
18. `SCT-018`: Legacy `includedInPipCash: false` on an active account does not filter transactions.
19. `SCT-019`: Inactive provider account is treated as unavailable and triggers trust/repair copy, not user exclusion copy.
20. `SCT-020`: Same-day spend driver appears in explanation card.
21. `SCT-021`: Top-number subtitle references checking/found spend when same-day ledger changed.
22. `SCT-022`: Purchase simulation uses current remaining after same-day ledger, not smoothed allowance.
23. `SCT-023`: Daily remaining can recover after refund.
24. `SCT-024`: Daily remaining does not go negative publicly, but shortfall is shown.
25. `SCT-025`: Same-day transaction after app-open sync updates cached snapshot.
26. `SCT-026`: Same-day transaction before provider exposure leaves number unchanged with "I checked but do not see it yet" copy.
27. `SCT-027`: Multiple accounts at same institution all count.
28. `SCT-028`: Multiple institutions all count.
29. `SCT-029`: Protected savings account balance is not cash guardrail spending room.
30. `SCT-030`: True balances still show all active connected accounts after removing exclusion logic.

Savings goals:

31. `SAVE-001`: $3,000 by December derives monthly contribution.
32. `SAVE-002`: Goal preview shows before and after Spendable Cash Today.
33. `SAVE-003`: Goal preview asks for confirmation before save.
34. `SAVE-004`: Confirmed goal saves and marks Pip Cash stale/reloads.
35. `SAVE-005`: Active goal with explicit monthly amount affects Spendable Cash Today.
36. `SAVE-006`: Active goal with target date and no monthly amount affects Spendable Cash Today.
37. `SAVE-007`: Paused goal does not affect Spendable Cash Today.
38. `SAVE-008`: Archived goal does not affect Spendable Cash Today.
39. `SAVE-009`: Updating target date recomputes monthly amount and today.
40. `SAVE-010`: Updating current amount recomputes remaining contribution and today.
41. `SAVE-011`: Goal that drops today to $5 triggers soft warning.
42. `SAVE-012`: Goal that drops today below usual daily spend compares to usual daily spend.
43. `SAVE-013`: Goal with missing date/monthly asks one clarifying question.
44. `SAVE-014`: Savings list copy no longer says "tracked only."
45. `SAVE-015`: `set_savings_goal_protection` is not exposed in user-facing model/tools.
46. `SAVE-016`: API create defaults legacy include column to true or ignores it safely.
47. `SAVE-017`: Direct API goal create stales Pip Cash even without include flag.
48. `SAVE-018`: Savings goal card shows monthly impact and today's impact.
49. `SAVE-019`: Savings goal confirmation never says saved before database success.
50. `SAVE-020`: Savings goal unavailable state preserves draft without false persistence.

Recurring bills and corrections:

51. `BILL-001`: User-confirmed rent is held out in baseline.
52. `BILL-002`: Exact rent posting does not lower today again.
53. `BILL-003`: Rent $50 higher lowers today by $50.
54. `BILL-004`: Rent $50 lower gives back $50 or notes lighter bill.
55. `BILL-005`: Utility auto-detected as bill suggestion, not confirmed rule.
56. `BILL-006`: User confirms utility as bill; future baseline holds it out.
57. `BILL-007`: User says Target is not a bill; same-day Target becomes daily spend.
58. `BILL-008`: User says phone bill is usually $80; rule saves expected amount.
59. `BILL-009`: Correction immediately recomputes today's number.
60. `BILL-010`: Correction response says what changed.
61. `BILL-011`: User-confirmed rule overrides auto detection.
62. `BILL-012`: User ignored merchant overrides auto detection.
63. `BILL-013`: Subscription monthly rule reconciles variance.
64. `BILL-014`: Duplicate same-week purchases are not monthly bills.
65. `BILL-015`: Payroll is not treated as recurring bill.
66. `BILL-016`: Credit-card autopay is not a recurring bill.
67. `BILL-017`: Savings transfer is not a recurring bill.
68. `BILL-018`: Recurring card title/copy is obligations-focused.
69. `BILL-019`: "Show recurring bills" does not list random unrelated repeat purchases.
70. `BILL-020`: Bill clarification bubble appears only when answer affects today/trust/planning.
71. `BILL-021`: Bill clarification chips include "Treat as bill" and "Not a bill."
72. `BILL-022`: Bill correction persists through next calculation.
73. `BILL-023`: Bill rules are deleted by delete-current-user-data.
74. `BILL-024`: Bill RLS prevents cross-user reads/writes.
75. `BILL-025`: Bill variance appears in explanation drivers.

Sync and freshness:

76. `SYNC-001`: App open shows last known number immediately.
77. `SYNC-002`: App open says Pip is checking/searching transactions.
78. `SYNC-003`: App open runs refresh even if last success was under 10 minutes.
79. `SYNC-004`: Duplicate foreground within short guard does not double-run provider.
80. `SYNC-005`: Pending sync job shows "already checking" state.
81. `SYNC-006`: Manual-refresh-only setting skips automatic refresh with honest copy.
82. `SYNC-007`: Needs-repair institution makes bubble/action point to repair.
83. `SYNC-008`: Successful refresh with new Target transaction updates top number.
84. `SYNC-009`: Successful refresh with no changes says checked/updated.
85. `SYNC-010`: Failed refresh keeps last number but marks stale.
86. `SYNC-011`: Partial refresh keeps number visible but marks partial.
87. `SYNC-012`: App-open endpoint returns previous/current/delta fields.
88. `SYNC-013`: Same-day transaction summaries in sync result are redacted enough for UI.
89. `SYNC-014`: Pip reaction event created for meaningful same-day drop.
90. `SYNC-015`: Reaction cooldown prevents noisy repeat bubbles.
91. `SYNC-016`: Provider pending transaction included in first refresh result.
92. `SYNC-017`: Posted replacement removes or dedupes pending transaction.
93. `SYNC-018`: Chat "refresh my data" reloads top number.
94. `SYNC-019`: App-open status does not stay stuck after request finishes.
95. `SYNC-020`: Freshness state is included in financial read context.

Opening bubble and chips:

96. `BUBBLE-001`: Refresh status beats all other bubble messages while checking.
97. `BUBBLE-002`: New same-day spend beats missing product tip.
98. `BUBBLE-003`: Missing card beats savings opportunity.
99. `BUBBLE-004`: Bill clarification beats product tip.
100. `BUBBLE-005`: Tight day beats savings opportunity.
101. `BUBBLE-006`: Savings goal opportunity appears only when no higher-priority issue exists.
102. `BUBBLE-007`: Settings/account-management tip appears only as product tip priority.
103. `BUBBLE-008`: Bubble never mixes four insights into one message.
104. `BUBBLE-009`: Bubble uses one or two chips, not a checklist.
105. `BUBBLE-010`: Bubble copy is warm and short.
106. `BUBBLE-011`: Bubble can say "type settings" when appropriate.
107. `BUBBLE-012`: Opening bubble marks reaction seen after display.

Assistant feel:

108. `VOICE-001`: Greeting feels like companion, not "I can assist."
109. `VOICE-002`: "How am I doing?" gives grounded read with evidence.
110. `VOICE-003`: "Can I spend $50?" gives specific tradeoff and soft judgment.
111. `VOICE-004`: Tight purchase uses soft pushback.
112. `VOICE-005`: $0-today situation uses firmer but calm language.
113. `VOICE-006`: Savings goal too hard suggests stretching date/lowering target.
114. `VOICE-007`: Correction acceptance feels intelligent and specific.
115. `VOICE-008`: Missing card explanation is warm and actionable.
116. `VOICE-009`: No canned "Here is..." bridge as whole reply.
117. `VOICE-010`: No harsh phrases like "I do not like that plan."
118. `VOICE-011`: No corporate disclaimer tone.
119. `VOICE-012`: No cute/performance tone.
120. `VOICE-013`: No invented facts when context is missing.
121. `VOICE-014`: Model-composed savings preview still respects tool facts.
122. `VOICE-015`: Model-composed recurring bill answer still respects card/rule facts.
123. `VOICE-016`: Prompt chips continue the conversation naturally.
124. `VOICE-017`: Repeated follow-up does not become a generic bot answer.
125. `VOICE-018`: User asks "why did my number not change?" and Pip explains sync/provider/state honestly.
126. `VOICE-019`: User asks "what should I do?" and Pip gives one practical next step.
127. `VOICE-020`: User challenges Pip and Pip responds calmly without defensiveness.

Browser and real dogfood:

128. `DOGFOOD-001`: In-app Browser `iab` opens local app and sees checking bubble.
129. `DOGFOOD-002`: Mock provider purchase causes visible number drop.
130. `DOGFOOD-003`: Mock provider bill posting exact amount does not double subtract.
131. `DOGFOOD-004`: Mock provider bill variance changes today.
132. `DOGFOOD-005`: Mock provider savings goal preview before save.
133. `DOGFOOD-006`: Mobile viewport text does not overlap in top number/bubble/chips.
134. `DOGFOOD-007`: Desktop viewport text does not overlap.
135. `DOGFOOD-008`: Real connected-account dogfood records app-open refresh.
136. `DOGFOOD-009`: Real same-day purchase drops number when provider exposes it.
137. `DOGFOOD-010`: Real dogfood run captures screenshots and JSON report.

## Risk Register

High-risk areas and mitigations:

- Same-day ledger double counting: pending and posted replacements must dedupe by provider id, merchant/date/amount fallback, or explicit replacement relation when available. Gate cases `SCT-004`, `SYNC-017`, and `DOGFOOD-002` cover this.
- Bill suggestions changing money too early: only confirmed rules affect the baseline. Suggestions only create cards, chips, or clarifying questions. Gate cases `BILL-005`, `BILL-020`, and `BUBBLE-004` cover this.
- App-open provider pressure: foreground refresh should run when useful but respect in-flight jobs, repair state, duplicate foreground guard, provider backoff, and provider unavailable state. Gate cases `SYNC-003`, `SYNC-004`, and `SYNC-005` cover this.
- Savings goal false persistence: preview never writes; confirmation writes only after tool success; responses must not say saved before the write succeeds. Gate cases `SAVE-003`, `SAVE-004`, and `SAVE-019` cover this.
- Model overreach with `gpt-5-nano`: deterministic tools own numbers and writes; the model composes from verified facts. Hard-zero cases cover invented facts, false promises, and unsafe advice.
- Rollback with additive schema: disabling flags must not delete or reinterpret user rules/goals. Rollback verification belongs in Task 16 and the dogfood runbook.
- Dirty worktree collision: this plan file is untracked in a dirty branch. Future implementers must inspect diffs before editing files already modified by Tyler or another agent.

## Verification Commands

Run these after implementation tasks, in this order:

```bash
npm test -- src/lib/data/pip-money-companion-flags.test.ts
npm test -- src/lib/pip-cash/spendable-cash-today.test.ts src/lib/pip-cash/same-day-ledger.test.ts src/lib/pip-cash/daily-money-state.test.ts src/lib/pip-cash/recurring-obligations.test.ts
npm test -- src/lib/savings-goals/plan.test.ts src/app/api/savings-goals/route.test.ts src/app/api/savings-goals/[goalId]/route.test.ts
npm test -- src/lib/data/app-open-sync.test.ts src/app/api/sync/app-open/route.test.ts src/lib/data/manual-sync.test.ts
npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/answer-composer.test.ts src/lib/agent/pip-voice-rubric.test.ts
npm test -- src/components/PipHome.test.tsx src/components/cards/CardRenderer.test.tsx
npm test -- scripts/agent-quality-scorer.test.ts scripts/pip-money-companion-gate.test.ts scripts/eval-agent.test.ts
npm run eval:agent
npm run eval:agent:major
npm run dogfood:major
npm run test:pip-money-companion-gate
npm run test:e2e -- tests/e2e/ai-agent.spec.ts
```

For browser proof, use Codex in-app Browser with `iab` first. Do not use standalone Playwright or external browser automation unless Tyler explicitly approves the fallback.

## Self-Review Checklist

- Spec coverage: savings goals, same-day sync, all-connected accounts, bills, corrections, proactive bubble/chips, assistant voice, and dogfood gate are each mapped to tasks and tests.
- Placeholder scan: no `TBD`, no "write tests for this" without test cases, and no deferred undefined behavior.
- Type consistency: `SameDayLedger`, `RecurringObligationRule`, `SavingsGoalImpactPreview`, and `OpeningBubblePlan` are introduced before use.
- Scope control: the public metric name stays `Spendable Cash Today`; this plan does not rename it.
- Safety: deterministic code still owns money state and database writes; model composition only explains verified facts and tool results.
- Rollout control: every risky behavior has a named flag, a fallback, and a rollback step.
- Gate enforceability: every one of the 137 cases can be represented by the fixture schema and scored from saved evidence.
- Data safety: real dogfood evidence is redacted and no raw provider payloads or auth state are stored in reports.
