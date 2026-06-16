# Pip Depth And Reliability Implementation Plan

Date: 2026-06-16
Status: optimized plan only. Do not implement until Tyler explicitly switches from planning to implementation.
Canonical artifact: this file replaces the first draft.

## Optimizer Result

The plan was optimized with the `plan-optimizer` loop: rubric, score, critique, rewrite, repeat until plateau.

Score trajectory:

```text
78 -> 87 -> 93 -> 95 -> 95 -> 95
```

Stop reason:

- The best plan held at 95/100 for three rounds.
- A structural escape round was tried and did not beat the selected architecture.

Structural candidates tested:

1. New standalone `MoneyRead` subsystem: strong coverage, but too much parallel architecture. Score: 92.
2. Repo-native financial read pack extending existing `guidance-context`, `insights`, `freshness`, card schemas, and agent tools. Score: 95. Selected.
3. Prompt/eval-only hardening: fastest, but does not fix stale data, recurring accuracy, or card contracts. Score: 84.

The optimized plan deliberately avoids a giant new app surface. It makes Pip deeper by giving the existing agent better deterministic facts, stricter routing, stronger card guarantees, and harder verification gates.

## Optimization Rubric

| Criterion | Weight | High bar | Final |
| --- | ---: | --- | ---: |
| Product fit and scope control | 12 | Preserves "One number. Ask the agent.", avoids dashboard creep, keeps `Spendable Cash Today` as the anchor metric. | 12 |
| Repo-native architecture | 15 | Extends existing typed seams instead of inventing parallel systems. Names files, contracts, and code paths. | 14 |
| Data freshness and Plaid reliability | 15 | Treats stale/repair/sync state as first-class product truth. Includes live proof gates. | 14 |
| Agent and card contracts | 15 | Makes routing, answer composition, card schemas, and renderer coverage explicit. Prevents unsupported cards. | 14 |
| Tests, evals, and dogfood | 15 | Defines deterministic fixtures, eval assertions, browser proof, build checks, and live checks. | 15 |
| Sequencing and dependency control | 10 | Slices work into shippable phases with exit criteria and rollback. | 10 |
| Risks and rollback | 10 | Names real failure modes, tripwires, mitigation, and rollback path. | 9 |
| Privacy, observability, and production proof | 8 | Adds useful non-sensitive logs and deploy verification without exposing financial details. | 7 |
| Total | 100 |  | 95 |

Quality thresholds:

- Low quality: mostly prompt changes, no sync proof, no eval expansion, no typed card guarantees.
- Medium quality: improves agent routing and tests but leaves Plaid freshness or card rendering ambiguous.
- High quality: deterministic money facts, visible freshness, strict card contracts, eval coverage, browser dogfood, production proof, and rollback.

## What Changed From The Draft

The first draft had the right instinct but several weaknesses:

- It proposed a "money read" layer too broadly, which risked duplicating `guidance-context`, `insights`, and `freshness`.
- It did not clearly separate first ship scope from later sophistication.
- It did not use the existing `insight_card`, `guidance_card`, `recurring_activity`, and freshness contracts enough.
- It named many tests but did not define a fixture matrix or route/card assertions tightly.
- It did not define enough exit gates per implementation slice.

The optimized plan fixes that by:

- Creating a small repo-native `FinancialRead` pack that composes existing deterministic modules.
- Shipping cutback depth first with existing card types where possible.
- Hardening `buildRecurringActivity` before inventing a new recurring subsystem.
- Treating freshness as a prerequisite, not a later polish item.
- Adding explicit branch/PR slices, test files, eval cases, and live proof artifacts.

## Goal

Make Pip feel deeper, more useful, and more trustworthy without turning it into a dashboard.

The product target stays:

- Public brand: `Pip`.
- Public metric: `Spendable Cash Today`.
- User interface: one number, conversation, temporary cards, prompt chips.
- No dashboard, no transaction page, no tabbed analytics screen.
- Pip should answer from real account data when it has enough data.
- Pip should say exactly what is stale, missing, or uncertain when it does not.

The product complaint this plan addresses:

- `Spendable Cash Today` appears static or stale.
- Recurring bills can be wrong or overconfident.
- Spending advice is too generic.
- Cards sometimes do not appear, or the agent talks like a card exists when it does not.
- The conversation feels shallow because the model does not have enough deterministic facts to use.

The engineering thesis:

Depth should come from trusted facts, not longer prose. If Pip can compute the answer, compute it deterministically. If Pip cannot compute it, say what is missing and route the user to the repair/refresh path.

## Definition Of Done

This work is done only when all of these are true:

1. `Spendable Cash Today` visibly reflects the latest usable snapshot after app open, manual refresh, and successful Plaid repair.
2. The UI and agent agree on freshness: `fresh`, `syncing`, `stale`, `failed`, `needs_repair`, or `partial`.
3. The answer to "what can I cut back on?" names a real category or merchant from the user's data, includes a dollar amount, includes a date window, and gives a concrete next action.
4. The answer to "what recurring bills do I have?" distinguishes confirmed/likely/possible repeat items and does not treat transfers or card payments as bills by default.
5. The agent never emits or promises a card type that `CardRenderer` and `agentResponseSchema` cannot render and validate.
6. Prompt chips steer users into implemented deep capabilities, not dead ends.
7. Agent evals fail if broad finance prompts fall back to generic advice.
8. Unit tests cover the deterministic read, spending opportunities, recurring hardening, card validation, freshness state, and prompt chips.
9. Browser dogfood is completed with the Codex in-app Browser plugin using the `iab` backend.
10. Production proof checks verify Plaid config, sync status, app-open/manual refresh, agent answers, and non-sensitive logs before calling it shipped.

## Boundaries

Do not implement while this plan is still in planning status.

When implementation starts:

- Do not revert unrelated dirty files.
- Do not edit already-applied Supabase migrations. Use forward migrations only if truly needed.
- Do not add a dashboard, route, or tabbed analytics page.
- Do not add a second agent architecture.
- Do not let the LLM calculate financial facts from raw transactions.
- Do not broaden into investments, taxes, insurance, bankruptcy, loan shopping, or specific product recommendations.
- Do not use standalone browser automation for manual verification. Use the in-app Browser plugin with `iab` first.

## Current Repo Seams To Use

The plan should extend these existing paths:

- Agent orchestration: `src/lib/agent/ai-agent.ts`
- Deterministic tool bridge: `src/lib/agent/tool-runner.ts`
- Answer shaping: `src/lib/agent/answer-composer.ts`
- Response schema: `src/lib/agent/response-schema.ts`
- Card types: `src/lib/agent/card-types.ts`
- Prompt chips: `src/lib/agent/prompt-chip-planner.ts`
- Suggested prompts: `src/lib/agent/suggested-prompts.ts`
- Card renderer: `src/components/cards/CardRenderer.tsx`
- Pip cash engine: `src/lib/pip-cash/engine.ts`
- Spendable Cash Today: `src/lib/pip-cash/spendable-cash-today.ts`
- Existing insights: `src/lib/pip-cash/insights.ts`
- Existing guidance context: `src/lib/pip-cash/guidance-context.ts`
- Classification: `src/lib/pip-cash/classify.ts`
- Current snapshot: `src/lib/data/current-snapshot.ts`
- Freshness: `src/lib/data/freshness.ts`
- Sync status: `src/lib/data/sync-status.ts`
- Manual sync: `src/lib/data/manual-sync.ts`
- App-open sync: `src/lib/data/app-open-sync.ts`
- Sync routes: `src/app/api/sync/status/route.ts`, `src/app/api/sync/manual/route.ts`, `src/app/api/sync/app-open/route.ts`
- Plaid config/exchange: `src/lib/providers/plaid/config.ts`, `src/app/api/providers/plaid/exchange/route.ts`
- Fake scenarios: `src/lib/fake-data.ts`
- Agent evals: `scripts/eval-agent.mjs`
- Mock runtime: `tests/helpers/mock-agent-runtime.ts`
- E2E: `tests/e2e/ai-agent.spec.ts`

Existing useful contracts:

- `agentMessageMaxChars` is 260 and visible answers are intentionally compact.
- `agentModelMessageMaxChars` is 1000 for model draft output.
- Existing renderable cards include `insight_card`, `guidance_card`, `recurring_activity`, `spending_breakdown`, `missing_card_nudge`, and `connect_account`.
- `DataFreshnessState` already exists: `fresh`, `stale`, `syncing`, `failed`, `needs_repair`, `partial`.
- `PipCashFreshness` already exists on `PipCashApiState`.
- `get_data_quality` already returns warnings, data states, account count, transaction count, and formatted sync status.
- `buildRecurringActivity` already exists but is monthly-only and should be hardened before splitting out a new subsystem.

## Known Worktree Caution

Before implementation, run:

```bash
git status --short
git diff --stat
```

At the time this plan was written, the worktree already contained unrelated or in-progress Plaid/app-open/UI changes. Treat those as user-owned unless Tyler says otherwise.

The first implementation step is to classify each dirty file as:

- pre-existing user work
- required for this plan
- unrelated and ignored
- conflicting and needs a decision before coding

Do not "clean up" adjacent code or format unrelated files.

## Architecture

### Selected Architecture

Add a small "financial read pack" that composes existing deterministic pieces:

- `calculatePipCash`
- `buildFinancialGuidanceContext`
- `buildSpendingBreakdown`
- `buildRecurringActivity`
- `getDataFreshnessState`
- existing warnings/data states
- new spending-opportunity scoring

This read pack should not replace the engine or the guidance layer. It should be an adapter that gives the agent a compact, testable summary for broad money questions.

Recommended new file:

- `src/lib/pip-cash/financial-read.ts`

Recommended focused new file:

- `src/lib/pip-cash/spending-opportunities.ts`

Use existing `src/lib/pip-cash/insights.ts` for recurring hardening first. Split `recurring-activity.ts` later only if the file becomes too large or hard to test.

### FinancialRead Contract

Suggested internal type:

```ts
export type FinancialRead = {
  asOfDate: string;
  freshness?: PipCashFreshness;
  spendableCashToday: SpendableCashTodayResult | null;
  guidance: FinancialGuidanceContext;
  spendingBreakdown: SpendingBreakdown;
  recurringActivity: RecurringActivity;
  spendingOpportunities: SpendingOpportunity[];
  dataQuality: FinancialReadDataQuality;
  recommendedSurface: FinancialReadSurfaceRecommendation;
};
```

Contract rules:

- It accepts a `FinancialSnapshot` and optional freshness input.
- It never calls the model.
- It never fetches directly from Supabase.
- It never mutates data.
- It does not return raw full transaction lists unless the caller explicitly asks.
- It records enough IDs and reason codes for tests and cards.

### SpendingOpportunity Contract

Suggested type:

```ts
export type SpendingOpportunity = {
  id: string;
  title: string;
  category: string;
  merchantExamples: string[];
  windowDays: 14 | 30;
  currentSpendCents: number;
  previousSpendCents: number;
  deltaCents: number;
  transactionCount: number;
  estimatedSavingsCents: number;
  confidence: "high" | "medium" | "low";
  reasonCodes: Array<
    | "discretionary"
    | "recent_increase"
    | "high_frequency"
    | "subscription_like"
    | "above_baseline"
    | "duplicate_like"
  >;
  excludedReason?: string;
  suggestedAction: string;
};
```

Rules:

- Exclude transfers, refunds, payroll, and credit-card payments.
- Exclude rent/loan payments by default.
- Down-rank utilities unless the user specifically asks.
- Prefer categories with both material dollars and recent behavior change.
- Include exact windows.
- Return `[]` with an insufficient-data finding when transaction history is too thin.

### Card Strategy

Default first ship:

- Use existing `insight_card` for spending opportunity details.
- Add a new `compose_insight_card` topic such as `cutback_opportunity`.
- Add a dedicated `spending_opportunity` card only if `insight_card` cannot express the needed information after dogfood.

Why:

- `insight_card` already has schema, renderer, and tests.
- Adding a new card type increases risk.
- The user's complaint is depth and reliability, not a missing visual format.

Dedicated card is allowed only when all are added together:

- `AgentCard` union member
- `cardSchema` discriminated union member
- `CardRenderer` case
- `CardRenderer.test.tsx` fixture
- eval `ALL_CARD_TYPES`
- agent route tests

## Implementation Slices

Recommended branch sequence if implementing in separate PRs:

1. `codex/pip-depth-freshness-foundation`
2. `codex/pip-depth-financial-read`
3. `codex/pip-depth-cutbacks-recurring`
4. `codex/pip-depth-agent-cards-evals`
5. `codex/pip-depth-dogfood-release`

If Tyler asks for one pass, keep the same slice order inside one branch.

## Slice 0: Preflight And Baseline Proof

### Objective

Start from a known state and capture the current failure behavior before changing code.

### Actions

1. Run and save baseline command results in the implementation notes:
   - `git status --short`
   - `npm test`
   - `npm run eval:agent`
   - `npm run build`
2. If existing dirty files affect sync or Plaid, inspect them before editing:
   - `src/lib/data/app-open-sync.ts`
   - `src/app/api/sync/app-open/route.ts`
   - `src/components/PipHome.tsx`
   - `src/lib/providers/plaid/config.ts`
   - `src/app/api/providers/plaid/exchange/route.ts`
3. Capture current agent behavior with eval additions marked as expected failures first, or with a temporary local note:
   - "what can I cut back on?"
   - "where am I overspending?"
   - "what recurring bills do I have?"
   - "is my Spendable Cash Today current?"
4. Capture current UI behavior with the in-app Browser `iab` backend:
   - app load
   - manual refresh
   - stale/repair state if available
   - one spending question
   - one recurring question

### Exit Criteria

- Current dirty tree is understood.
- Baseline test/build/eval state is known.
- At least one current shallow answer is reproduced.
- No implementation files have been edited yet except optional expected-failure test scaffolding if Tyler approves that approach.

### Rollback

No rollback needed. This slice is mostly read-only.

## Slice 1: Freshness And Sync Truth

### Objective

Make `Spendable Cash Today` and the agent share the same freshness truth. This is first because stale data makes every deeper answer untrustworthy.

### Product Behavior

User-visible states:

- Fresh: "I last refreshed this today/recently."
- Syncing: "I am refreshing connected data."
- Stale: "I can use the last snapshot, but it is stale."
- Failed: "The last refresh failed."
- Needs repair: "This bank connection needs repair before I can refresh it."
- Partial: "Some data refreshed, but not everything."

Do not make a stale number look fully current.

### Actions

1. Audit `getCurrentPipCashState` in `src/lib/data/current-snapshot.ts`.
2. Ensure the API state includes enough freshness fields:
   - state
   - last successful sync
   - latest sync run status
   - pending job state
   - stale institution flag
   - repair-needed institution summary if available
3. Confirm app-open sync path:
   - `src/lib/data/app-open-sync.ts`
   - `src/app/api/sync/app-open/route.ts`
   - `src/components/PipHome.tsx`
4. Confirm manual refresh path:
   - `src/lib/data/manual-sync.ts`
   - `src/app/api/sync/manual/route.ts`
5. Confirm status route:
   - `src/lib/data/sync-status.ts`
   - `src/app/api/sync/status/route.ts`
6. Make the agent receive freshness through `RunAiAgentInput.syncStatus` and existing context formatting.
7. Ensure `get_sync_status` is forced for prompts like:
   - "is this current?"
   - "did you refresh?"
   - "why did this not update?"
   - "is my bank connected?"
8. If `PipHome` caches the number locally, ensure refresh invalidates/refetches the same source used by the top number.

### Files

- `src/lib/data/current-snapshot.ts`
- `src/lib/data/freshness.ts`
- `src/lib/data/sync-status.ts`
- `src/lib/data/manual-sync.ts`
- `src/lib/data/app-open-sync.ts`
- `src/app/api/sync/status/route.ts`
- `src/app/api/sync/manual/route.ts`
- `src/app/api/sync/app-open/route.ts`
- `src/components/PipHome.tsx`
- `src/lib/agent/ai-agent.ts`
- `src/lib/agent/answer-composer.ts`

### Tests

Unit/API tests:

- `src/lib/data/freshness.test.ts`
- `src/lib/data/current-snapshot.test.ts`
- `src/lib/data/sync-status.test.ts`
- `src/lib/data/manual-sync.test.ts`
- `src/lib/data/manual-sync-failure.test.ts`
- `src/app/api/sync/status/route.test.ts`
- `src/app/api/sync/manual/route.test.ts`
- `src/app/api/sync/app-open/route.test.ts`

Add assertions for:

- repairable Plaid errors map to `needs_repair`
- pending jobs map to `syncing`
- failed latest sync maps to `failed`
- partial latest sync maps to `partial`
- stale institution maps to `stale`
- no status still degrades conservatively
- app-open does not spam sync when data is fresh
- manual refresh and app-open update the same freshness view

Agent tests:

- "is this number current?" uses `get_sync_status`
- stale state is mentioned without fake currentness
- repair-needed state routes to repair language, not generic reconnect

### Exit Criteria

- UI, API, and agent agree on freshness.
- `Spendable Cash Today` can no longer silently look fresh when sync is stale or failed.
- The dogfood pass can answer "is this current?" from real sync state.

### Rollback

Freshness changes should be independently useful. If later slices fail, keep this slice unless it causes a production regression.

## Slice 2: Financial Read Pack

### Objective

Add the deterministic context object that gives broad finance prompts substance.

### Actions

1. Create `src/lib/pip-cash/financial-read.ts`.
2. Compose existing deterministic outputs:
   - `calculatePipCash`
   - `buildFinancialGuidanceContext`
   - `buildSpendingBreakdown`
   - `buildRecurringActivity`
   - freshness from `PipCashFreshness` when available
3. Add `FinancialReadDataQuality`:
   - warning count
   - data state count
   - missing card warning
   - low confidence
   - stale/failed/repair freshness
   - too few transactions
   - no checking/cash account
   - no credit card account
4. Add reason codes, not just prose.
5. Keep the return object compact enough for agent tool output.
6. Do not fetch from Supabase inside this module.

### Suggested API

```ts
export function buildFinancialRead(input: {
  snapshot: FinancialSnapshot;
  freshness?: PipCashFreshness;
  opportunityWindowDays?: 14 | 30;
}): FinancialRead;
```

### Files

- `src/lib/pip-cash/financial-read.ts`
- `src/lib/pip-cash/guidance-context.ts`
- `src/lib/pip-cash/insights.ts`
- `src/lib/pip-cash/spendable-cash-today.ts`
- `src/lib/data/current-snapshot.ts`
- `src/lib/types.ts`

### Tests

Create `src/lib/pip-cash/financial-read.test.ts` with:

- default fake snapshot returns spendable, guidance, breakdown, recurring, and data quality
- low-confidence scenario includes low-confidence data quality
- missing-card scenario includes missing-card data quality
- no credit card account includes missing-card/card-coverage finding
- no transactions returns insufficient-data finding
- stale freshness is carried into read
- repair-needed freshness is carried into read

### Exit Criteria

- `FinancialRead` is deterministic and tested.
- It does not replace existing engine/guidance/insights modules.
- It gives later agent tools a single compact context.

### Rollback

Remove the new module and tests. No schema or UI changes should be required in this slice.

## Slice 3: Spending Cutback Opportunities

### Objective

Make "what can I cut back on?" a high-quality, grounded answer.

### Product Behavior

For sufficient data, Pip should answer with:

- one strongest target
- category or merchant examples
- amount in a date window
- comparison to the previous window
- estimated savings
- why this is a reasonable target
- one practical next action
- freshness caveat if relevant

Example target:

```text
The clearest trim is dining: $186 in the last 14 days, up $72 from the prior 14. A $60/week cap would free about $66 over two weeks.
```

The final visible sentence may be shorter because the UI caps text. The supporting card or rows should carry the detail.

### Actions

1. Create `src/lib/pip-cash/spending-opportunities.ts`.
2. Compute opportunities from transaction windows:
   - current 14 days
   - previous 14 days
   - optional 30-day fallback when 14-day data is sparse
3. Use `classifyTransaction` and existing credit-card payment annotation to exclude:
   - income
   - transfers
   - refunds
   - credit card payments
   - rent
   - protected savings transfers
4. Rank by:
   - discretionary category
   - recent increase
   - frequency
   - material dollars
   - merchant/category concentration
   - confidence
5. Add opportunities to `FinancialRead`.
6. Add `compose_insight_card` topic `cutback_opportunity` unless a dedicated card is justified.
7. Add deterministic tool path in `tool-runner`, for example:
   - internal runner: `show_spending_opportunity`
   - agent tool: `get_spending_opportunity`
8. Add forced routing in `getForcedAgentTool` for:
   - "what can I cut back on?"
   - "where am I overspending?"
   - "what should I stop buying?"
   - "how can I save money this week?"
   - "find waste"
   - "what spending looks weird?"
9. Update model instructions so broad cutback prompts must call the deterministic tool.
10. Update `answer-composer` to give a direct answer when the spending-opportunity card exists.

### Card Choice

First ship should use `insight_card`:

- title: "Cutback opportunity"
- summary: strongest opportunity
- rows:
  - current window spend
  - change from previous window
  - transaction count or merchants
  - estimated savings
- footer: freshness or confidence caveat

Only add `spending_opportunity` card later if `insight_card` is insufficient.

### Files

- `src/lib/pip-cash/spending-opportunities.ts`
- `src/lib/pip-cash/financial-read.ts`
- `src/lib/pip-cash/classify.ts`
- `src/lib/pip-cash/dedupe-credit-card-payments.ts`
- `src/lib/agent/tool-runner.ts`
- `src/lib/agent/ai-agent.ts`
- `src/lib/agent/answer-composer.ts`
- `src/lib/agent/response-schema.ts`
- `src/lib/agent/card-types.ts`
- `src/components/cards/CardRenderer.test.tsx`
- `tests/helpers/mock-agent-runtime.ts`
- `scripts/eval-agent.mjs`
- `src/lib/fake-data.ts`

### Fixtures

Add fake scenarios or local test snapshots:

- `cutback-dining`: dining increased materially in the last 14 days
- `cutback-coffee`: frequent low-dollar coffee, lower score than dining if total is small
- `cutback-rent-excluded`: rent is biggest spend but must not be recommended
- `cutback-card-payment-excluded`: card payments excluded
- `cutback-transfer-excluded`: transfers excluded
- `cutback-sparse`: insufficient history
- `cutback-stale`: stale freshness caveat

### Tests

Unit tests:

- ranks dining over rent when dining is discretionary and rising
- excludes credit-card payments
- excludes transfers
- includes merchant examples
- computes current and previous windows correctly
- returns insufficient-data when history is too thin
- estimated savings is conservative and not negative

Agent tests:

- "what can I cut back on?" uses the new tool
- "where am I overspending?" uses the new tool
- response includes a supported card
- response includes real category/amount/window
- no fabricated merchant
- no unsupported card type

Eval assertions:

- expected tool: `get_spending_opportunity`
- expected card: `insight_card`
- expected response mode: `show_card` or `guidance`, whichever implementation chooses consistently
- forbidden generic phrases like "start by tracking your spending" when sufficient data exists

### Exit Criteria

- Cutback answers are grounded in fixture data.
- Generic spending advice only appears when there is not enough data or the user asks for general education.
- The answer stays compact, and the card carries the detail.

### Rollback

Remove the tool route and `compose_insight_card` topic. The rest of Pip should keep working because this slice uses existing cards.

## Slice 4: Recurring Activity Hardening

### Objective

Make recurring bills/subscriptions useful without overclaiming.

### Current Gap

`buildRecurringActivity` exists, but it is monthly-only and likely too simple for all user-facing "recurring bills" expectations.

### Product Behavior

Pip should separate:

- confirmed recurring bill
- likely recurring bill
- possible repeat item
- recurring income
- recurring transfer
- credit-card payment/autopay
- one-off repeated merchant activity

Default answer should show confirmed and likely items. Possible items should be caveated or hidden unless the user asks for uncertain repeats.

### Actions

1. Harden `buildRecurringActivity` in `src/lib/pip-cash/insights.ts`.
2. Add fields if needed:
   - `classification`: `bill`, `subscription`, `income`, `transfer`, `card_payment`, `unknown`
   - `confidence`: keep `high`, `medium`, `low`
   - `reasonCodes`
   - `amountRangeCents` for variable bills
   - `cadence`: `weekly`, `biweekly`, `monthly`, `annual` if supported
3. If changing the card schema, update all schema/render/test points together.
4. Keep existing card title "Likely recurring activity" unless product copy needs adjustment.
5. Ensure card payments are not listed as bills by default.
6. Ensure payroll is not mixed into bills by default.
7. Use stale freshness caveat in answer or footer when applicable.

### Files

- `src/lib/pip-cash/insights.ts`
- `src/lib/pip-cash/insights.test.ts`
- `src/lib/agent/card-types.ts`
- `src/lib/agent/response-schema.ts`
- `src/components/cards/CardRenderer.tsx`
- `src/components/cards/CardRenderer.test.tsx`
- `src/lib/agent/tool-runner.ts`
- `src/lib/agent/ai-agent.ts`
- `tests/helpers/mock-agent-runtime.ts`
- `scripts/eval-agent.mjs`

### Fixtures

- monthly subscription with 4 occurrences
- variable utility bill with 4 occurrences
- biweekly payroll
- monthly credit-card autopay
- transfer to savings
- two same-merchant purchases in one week
- annual subscription if enough lookback exists
- stale source data

### Tests

- confirmed monthly subscription classified as bill/subscription
- utility amount variation still likely recurring
- credit card payment excluded from default bills
- payroll classified separately as income
- same merchant twice in a week is not monthly recurring
- confidence is low when only weak evidence exists
- expected date is not shown as certain when source is stale

### Agent/Eval Cases

- "what recurring bills do I have?"
- "show subscriptions"
- "what bills are coming up?"
- "what charges repeat?"
- "do I have subscriptions I forgot about?"

Assertions:

- expected tool: `get_recurring_activity`
- expected card: `recurring_activity`
- answer uses likely/confirmed language
- no card payment shown as default bill
- no fabricated next date

### Exit Criteria

- Recurring answers are more conservative and more useful.
- User can understand confidence.
- Bad guesses are less likely to appear as facts.

### Rollback

Revert recurring scoring changes and schema additions. If schema was expanded, keep backwards compatibility in renderer while rolling back logic.

## Slice 5: Card Safety, Prompt Chips, And Answer Composition

### Objective

Prevent unsupported card behavior and make conversations naturally lead into the deeper tools.

### Card Registry

Create one source of truth for supported card types.

Recommended approach:

- Export `supportedAgentCardTypes` from `src/lib/agent/card-types.ts` or `response-schema.ts`.
- Use it in:
  - response validation tests
  - `scripts/eval-agent.mjs`
  - any card recommendation code

Do not maintain a separate hardcoded list in evals if it can drift.

### Unsupported Card Guard

Add tests proving:

- unknown card type fails schema validation
- agent repair/fallback does not promise a card after validation failure
- final response cannot include a card without renderer coverage

### Prompt Chips

Add chip families:

- `ai-cutback-opportunity`: "What can I cut back on?"
- `ai-spending-changed`: "What changed in my spending?"
- `ai-refresh-data`: already exists, ensure it appears for stale states
- `ai-recurring-items`: already exists, tune label if needed
- `ai-data-quality`: already exists, ensure it appears for missing/stale states

State-aware defaults:

- Fresh/normal: why today, cutback opportunity, next few days
- Overspending/tight: cutback opportunity, recent spending pressure, upcoming bills
- Low confidence/missing data: data quality, pattern assumptions, refresh data
- Stale/failed/needs repair: refresh/repair, what can you still answer, data quality

### Answer Composition

Update `composeCardBackedAnswer` to include direct bridges for:

- cutback `insight_card`
- recurring activity with confidence
- data-quality multi-finding card if added

Keep messages within:

- 45 words
- 260 characters

Do not solve depth by making visible chat long. Cards and structured rows carry detail.

### Files

- `src/lib/agent/card-types.ts`
- `src/lib/agent/response-schema.ts`
- `src/lib/agent/answer-composer.ts`
- `src/lib/agent/prompt-chip-planner.ts`
- `src/lib/agent/suggested-prompts.ts`
- `src/components/cards/CardRenderer.tsx`
- `src/components/cards/CardRenderer.test.tsx`
- `scripts/eval-agent.mjs`
- `src/lib/agent/prompt-chip-planner.test.ts`
- `src/lib/agent/answer-composer.test.ts`

### Tests

- cutback chip appears in fresh and overspending states
- stale state prioritizes refresh/data-quality chip
- chip IDs route to implemented tools
- no retired labels return
- unsupported cards fail validation
- card-backed cutback answer is direct and not generic

### Exit Criteria

- Prompt chips expose the new depth.
- Cards cannot drift out of schema/renderer support.
- The answer stays Pip-like but more substantive.

### Rollback

Remove new chip family IDs and answer-composer cases. Schema guard tests should remain if they do not break existing behavior.

## Slice 6: UI And Browser Dogfood

### Objective

Verify the actual app feels deeper and the UI does not break under real mobile/desktop layouts.

### Actions

1. Start local dev server:
   - `npm run dev`
2. Use the Codex in-app Browser plugin with `iab` to inspect:
   - desktop viewport
   - mobile viewport
   - fresh state
   - stale state
   - repair-needed state
   - cutback answer
   - recurring answer
   - data-quality answer
3. Confirm:
   - top number freshness is visible and accurate
   - cards render without blank states
   - text fits inside cards/chips/buttons
   - chips are tappable on mobile
   - chat does not overlap cards
   - no dashboard-like surface appears
4. Use `npm run proof:in-app-browser` if it still matches current proof needs.
5. Use repo-native e2e only as scripted verification, not as a substitute for `iab` dogfood.

### Files

- `src/components/PipHome.tsx`
- `src/components/cards/CardRenderer.tsx`
- `src/app/globals.css`
- `tests/e2e/ai-agent.spec.ts`
- `scripts/write-in-app-browser-proof.mjs`

### Browser Scenarios

Ask in the real app:

- "What's my Spendable Cash Today?"
- "Is that number current?"
- "What can I cut back on?"
- "Where am I overspending?"
- "What recurring bills do I have?"
- "What changed in my spending?"
- "What data are you missing?"
- "Refresh my connected data"

### Exit Criteria

- Dogfood proof is captured.
- No visible card/chip/text layout issue remains.
- The app feels deeper without adding a dashboard.

### Rollback

UI-only regressions should be reverted without rolling back deterministic read/test logic unless the data contract itself is wrong.

## Slice 7: Production Rollout And Live Proof

### Objective

Ship only after proving production data freshness and Plaid behavior.

### Pre-Deploy Gates

Run:

```bash
npm test
npm run eval:agent
npm run build
npm run check:netlify-bundle
npm run check:deployment
```

If e2e is in scope and safe:

```bash
npm run test:e2e
```

For live Plaid release checks, use the repo's existing live scripts only when Tyler has approved that flow and credentials are ready:

```bash
npm run check:live-smoke
npm run test:e2e:live:final
```

### Deploy Proof

After deploy:

1. Confirm Plaid production environment is correct.
2. Confirm production redirect URI does not fall back to localhost.
3. Confirm `/api/sync/status` reports expected connected/stale/failed state.
4. Confirm app-open refresh updates freshness or queues a sync.
5. Confirm manual refresh updates freshness.
6. Confirm the production agent answers:
   - "is this current?"
   - "what can I cut back on?"
   - "what recurring bills do I have?"
7. Confirm production logs include non-sensitive route/freshness/card events.

### Logging

Add non-sensitive structured events for:

- freshness viewed
- sync status read
- app-open sync started/skipped/completed/failed
- manual sync started/completed/failed
- financial read built
- spending opportunity built
- spending opportunity insufficient data
- recurring candidates built
- agent forced tool selected
- card emitted
- card rejected

Do not log:

- raw transaction descriptions
- merchant names unless already considered safe by existing product-event policy
- account numbers
- access tokens
- Plaid tokens
- full agent prompt/context

### Exit Criteria

- Production behaves like local dogfood.
- Logs can diagnose future "Pip feels stale/shallow" complaints.
- No sensitive financial details are logged.

### Rollback

Rollback order:

1. Disable new agent routing if a feature flag exists.
2. Revert new spending-opportunity tool and chip routes.
3. Revert recurring hardening if it creates false positives.
4. Keep freshness fixes unless they caused the incident.
5. Rebuild/deploy from the last known good commit.

## Test Matrix

### Unit Matrix

| Area | File | Required cases |
| --- | --- | --- |
| Freshness | `src/lib/data/freshness.test.ts` | fresh, stale, syncing, failed, partial, needs repair |
| Current snapshot | `src/lib/data/current-snapshot.test.ts` | cached V2 result, no snapshot, freshness attached |
| Financial read | `src/lib/pip-cash/financial-read.test.ts` | default, low confidence, stale, missing card, sparse data |
| Spending opportunities | `src/lib/pip-cash/spending-opportunities.test.ts` | dining increase, rent excluded, transfers excluded, card payments excluded, sparse data |
| Recurring | `src/lib/pip-cash/insights.test.ts` | monthly, variable utility, payroll, card payment, one-off repeat |
| Agent route | `src/lib/agent/ai-agent.test.ts` | cutback, overspending, currentness, recurring, stale state |
| Answer composer | `src/lib/agent/answer-composer.test.ts` | cutback bridge, recurring confidence, no generic card answer |
| Prompt chips | `src/lib/agent/prompt-chip-planner.test.ts` | fresh, overspending, stale, missing data, repair |
| Cards | `src/components/cards/CardRenderer.test.tsx` | any new or changed card shape, no undefined/NaN |

### Agent Eval Matrix

Add cases to `scripts/eval-agent.mjs`:

| ID | Prompt | Expected |
| --- | --- | --- |
| `cutback-opportunity` | What can I cut back on? | spending opportunity tool, supported card, amount/window |
| `overspending-category` | Where am I overspending? | category/merchant evidence, no generic advice |
| `cutback-sparse` | What can I cut back on? | insufficient-data caveat, no fake merchant |
| `cutback-rent-excluded` | What should I stop paying? | does not pick rent by default |
| `spending-changed` | What changed in my spending? | deterministic spending read |
| `currentness` | Is my Spendable Cash Today current? | sync status tool |
| `stale-currentness` | Is this number current? | stale caveat |
| `repair-required` | Why is my data not updating? | repair/sync path |
| `recurring-bills` | What recurring bills do I have? | recurring card, confidence language |
| `subscriptions-forgot` | Do I have subscriptions I forgot about? | recurring card, caveat possible/likely |
| `data-missing` | What data are you missing? | data quality tool/card |

Eval should assert behavior, not exact phrasing:

- expected tools
- expected cards
- forbidden cards
- forbidden generic language
- amount/date/category existence when required
- freshness caveat when required
- no unsupported card type

### Browser Matrix

Browser proof with `iab`:

| State | View | Prompt | Pass condition |
| --- | --- | --- | --- |
| Fresh | mobile | What can I cut back on? | Card renders, amount/window visible |
| Fresh | desktop | What recurring bills do I have? | Confidence visible, no layout overflow |
| Stale | mobile | Is this current? | Stale state shown in UI and chat |
| Needs repair | mobile | Refresh my connected data | Repair path, no fake refresh |
| Missing card | desktop | What data are you missing? | Missing-card nudge or data-quality card |
| Sparse data | mobile | Where am I overspending? | Honest insufficient-data response |

## Product Decisions With Defaults

These questions can be answered before implementation, but the plan has defaults so work does not block.

1. Default cutback window?
   - Default: 14 days, with 30-day fallback when data is sparse.
2. One recommendation or ranked list?
   - Default: one strongest recommendation in chat/card, with supporting rows.
3. Show uncertain recurring items?
   - Default: hide `possible` items from default bill answers, mention they can inspect uncertain repeats.
4. Freshness window?
   - Default: use existing freshness/stale policy. If none is explicit, treat under 24 hours as fresh for initial product copy.
5. Add a new spending opportunity card?
   - Default: no. Use `insight_card` first.
6. Feature flag?
   - Default: use existing feature-flag pattern if present; do not invent a large flag system.

## Risks And Tripwires

### Risk: Plaid Brokenness Looks Like Agent Shallow Behavior

Tripwire:

- "Spendable Cash Today" does not change after refresh, and `/api/sync/status` shows stale/failed/zero counts.

Mitigation:

- Freshness slice ships first.
- Agent must mention stale/repair state before giving current-data answers.

### Risk: Cutback Recommendations Feel Judgmental Or Wrong

Tripwire:

- Recommendation picks rent, debt payment, transfer, medical, or one-off necessary spend by default.

Mitigation:

- Exclusion tests.
- Confidence tiers.
- Conservative suggested action wording.

### Risk: Recurring Detection Creates False Bills

Tripwire:

- Card payment, payroll, or repeated one-off merchant appears as a bill.

Mitigation:

- Separate classifications.
- Hide possible items by default.
- Explicit confidence and reason codes.

### Risk: Card Schema Drift

Tripwire:

- Eval reports unknown card type or renderer test shows `undefined`, `NaN`, or blank card.

Mitigation:

- Supported-card registry.
- Schema, renderer, tests, and eval list updated together.

### Risk: The Plan Becomes A Dashboard

Tripwire:

- New route, page, tab, or permanent analytics section appears.

Mitigation:

- Keep all surfaces as temporary cards and prompt chips.
- Reject implementation that adds a dashboard-like surface without explicit Tyler approval.

### Risk: Evals Pass But App Still Feels Shallow

Tripwire:

- Evals assert only tool/card presence, not evidence quality.

Mitigation:

- Add assertions for amount, date window, category/merchant, caveat, and unsupported-card absence.
- Dogfood the real app with the target prompts.

## Verification Commands

Core:

```bash
npm test
npm run eval:agent
npm run build
npm run check:netlify-bundle
npm run check:deployment
```

Targeted examples:

```bash
npm test -- src/lib/data/freshness.test.ts
npm test -- src/lib/pip-cash/financial-read.test.ts
npm test -- src/lib/pip-cash/spending-opportunities.test.ts
npm test -- src/lib/pip-cash/insights.test.ts
npm test -- src/lib/agent/ai-agent.test.ts
npm test -- src/lib/agent/prompt-chip-planner.test.ts
npm test -- src/components/cards/CardRenderer.test.tsx
```

Browser:

- Manual browser proof uses the Codex in-app Browser plugin with `iab`.
- Repo e2e can be run as scripted verification when appropriate:

```bash
npm run test:e2e
```

Live:

```bash
npm run check:live-smoke
npm run test:e2e:live:final
```

Only run live checks when production credentials, connected account state, and Tyler's approval fit the situation.

## Implementation Checklist

### Preflight

- [ ] Classify dirty worktree.
- [ ] Capture baseline tests/build/evals.
- [ ] Reproduce at least one shallow answer.
- [ ] Confirm Browser `iab` verification path.

### Freshness

- [ ] UI and API share freshness state.
- [ ] Agent can answer currentness.
- [ ] App-open refresh path verified.
- [ ] Manual refresh path verified.
- [ ] Plaid repair state visible.

### Financial Read

- [ ] `buildFinancialRead` exists.
- [ ] Read composes existing deterministic modules.
- [ ] Data quality findings included.
- [ ] Tests cover sparse/stale/missing-card states.

### Cutbacks

- [ ] Spending opportunities module exists.
- [ ] Exclusions covered.
- [ ] Cutback route forced.
- [ ] Existing `insight_card` used first.
- [ ] Evals assert amount/window/category.

### Recurring

- [ ] Recurring confidence hardened.
- [ ] Payments/transfers/income separated.
- [ ] Variable bills handled.
- [ ] Evals assert confidence/caveat.

### Cards And Chips

- [ ] Supported-card registry prevents drift.
- [ ] Any new card has schema, renderer, test, eval support.
- [ ] Cutback chip added.
- [ ] Stale/repair chips prioritized.
- [ ] Answer composer has non-generic bridges.

### Dogfood

- [ ] Mobile and desktop inspected with `iab`.
- [ ] Fresh/stale/repair/missing/sparse states checked.
- [ ] No UI overflow.
- [ ] No blank or unsupported cards.

### Release

- [ ] Core commands pass.
- [ ] Production Plaid config verified.
- [ ] `/api/sync/status` verified.
- [ ] Production agent prompts verified.
- [ ] Non-sensitive logs verified.
- [ ] Rollback path documented in PR.

## Final Guidance For The Implementer

Do the reliability foundation first. Do not start by making the model sound smarter.

The highest-value implementation path is:

1. Prove freshness.
2. Build one deterministic financial read pack.
3. Make cutback answers great.
4. Harden recurring activity.
5. Lock card contracts.
6. Make prompt chips point at the depth.
7. Dogfood in the actual app.

The plan succeeds when Pip can say, in a compact way, something specific and defensible about the user's money, and the user can trust whether that answer is current.
