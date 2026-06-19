# Pip Savings Implementation Guide

Last updated: June 19, 2026

This guide replaces the current user-facing "cushion" framing with Monthly Savings and adds a staged Savings Goals MVP. It is optimized for local implementation in this repo with low migration risk, clear product truth, and verifiable behavior.

## Optimizer Result

Final score: `96/100`

Score trajectory: `83 -> 92 -> 96 -> 96 -> 96`

The largest improvements from the first draft were:

- Added feature flags, rollout, and rollback rules for Savings Goals.
- Split the work into smaller dependency-safe phases so the calculation does not change until receipt, tests, and UI are ready.
- Added concrete schema, RLS, deletion, stale-cache, event, and acceptance-test requirements.

Rubric used:

| Criterion | Weight | High-quality bar | Final |
| --- | ---: | --- | ---: |
| Product truth and language | 15 | Users understand savings without Pip implying money movement or guarantees. | 15 |
| Technical completeness | 20 | Public pages, onboarding, app UI, data model, API, agent, cards, tests, and docs are covered. | 19 |
| Sequencing and dependencies | 15 | Each phase can ship independently with explicit entry and exit conditions. | 15 |
| Calculation and trust correctness | 15 | Spendable Cash Today changes only when explicitly intended and the trust receipt explains it. | 14 |
| Privacy, legal, and security | 10 | RLS, deletion, data-safety docs, and financial-advice boundaries are handled. | 10 |
| Verification and observability | 15 | Unit tests, e2e, agent evals, browser QA, events, and regression checks are explicit. | 14 |
| Operability and rollback | 10 | Flags, stale-cache handling, fallback behavior, and rollback paths are defined. | 9 |

## Objective

Pip should stop making the user feel like money is being withheld for Pip's calculation. The product promise should become:

> Choose what you want to save each month. Pip keeps that money out of your daily spending number.

There are two product surfaces:

1. Monthly Savings: the recurring amount the user wants Pip to protect from day-to-day spending.
2. Savings Goals: named targets such as "Trip to Italy, $5,000" that Pip can track and optionally protect inside Spendable Cash Today.

## Non-Goals

- Do not add real money movement.
- Do not claim Pip transfers, holds, guarantees, or automatically saves money.
- Do not make Savings Goals the primary home-screen metric.
- Do not rename database columns in the first pass.
- Do not add a full budgeting dashboard.

## Vocabulary

Preferred user-facing language:

- Monthly savings
- Savings goal
- Save without thinking
- Kept out of today's number
- Protected from spending
- Tracked only

Avoid in visible product copy:

- Cushion
- Buffer
- Hidden cushion
- Pip needs this
- Auto-save
- Guaranteed savings

Compatibility language is allowed only in agent intent detection and tests that deliberately verify old user wording still works.

## Current Repo Reality

The existing implementation already has a useful internal concept:

- `protected_savings_monthly_cents` in Supabase.
- `protectedSavingsMonthlyCents` in TypeScript.
- `save_protected_savings` in the agent tool layer.
- Account-level `is_protected_savings` for savings accounts.
- A separate `hiddenCushionCents` safety reserve in the Spendable Cash Today engine.

Do not conflate these:

- Monthly Savings is the user-selected amount.
- `hiddenCushionCents` is a calculation safety reserve. If surfaced at all, call it a safety reserve.
- Account-level protected savings means an account role, not necessarily a named goal.

## Architecture Decision

Use a two-pass implementation.

Pass 1 changes language and labels only:

- Keep `protectedSavingsMonthlyCents` and `protected_savings_monthly_cents`.
- Keep Spendable Cash Today numerically unchanged for the same inputs.
- Remove visible "cushion" language from UI, public pages, legal/support docs, cards, and agent answers.

Pass 2 adds Savings Goals:

- Add a new `savings_goals` table.
- Add deterministic goal planning logic.
- Add API, agent tools, cards, and a compact app module.
- Integrate goal contributions into Spendable Cash Today only when the user explicitly enables protection for a goal.

This prevents a copy/product rename from being tied to a riskier calculation and data-model launch.

## Feature Flags

Pass 1 does not need a flag because it is copy and label correction.

Pass 2 should be gated until fully verified:

- Server flag: `PIP_SAVINGS_GOALS_ENABLED=true`
- Client flag: `NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true`

Recommended helper:

- `src/lib/savings-goals/feature-flags.ts`

Behavior:

- API routes should return `404` or a disabled-state JSON response when the server flag is off.
- Client UI should hide the goals module when the client flag is off.
- Agent tools should not be registered or should return a disabled response when the server flag is off.
- The database table can exist while the feature is disabled.

## Production Dogfood Flags

Keep the checked-in defaults hidden:

```env
PIP_SAVINGS_GOALS_ENABLED=false
NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=false
```

Production dogfood override:

```env
PIP_SAVINGS_GOALS_ENABLED=true
NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true
PIP_MONTHLY_SAVINGS_LABEL=Monthly Savings
```

Production Savings Goals are enabled only when both flags are explicitly `true`:

- `PIP_SAVINGS_GOALS_ENABLED=true` enables server routes, agent actions, and runtime checks.
- `NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true` enables the client bundle and visible app surfaces.

Set the production values in Netlify with both build and runtime scope where needed:

```bash
netlify env:set PIP_SAVINGS_GOALS_ENABLED true --context production --scope builds functions runtime
netlify env:set NEXT_PUBLIC_SAVINGS_GOALS_ENABLED true --context production --scope builds
netlify env:set PIP_MONTHLY_SAVINGS_LABEL "Monthly Savings" --context production --scope builds functions runtime
```

Verify with `netlify env:list --json`, not `netlify env:get` alone. `env:get` can print text such as `No value set`; that output is not proof that a production value exists.

```bash
netlify env:list --json > /tmp/spendwithpip-netlify-env.json
node scripts/check-deployment-env.mjs --mode=beta --require-savings-goals --netlify-env-json=/tmp/spendwithpip-netlify-env.json
```

The check must report both feature flags as missing unless each value is exactly `true`.

Full-enabled behavior:

- API routes accept savings-goal CRUD requests.
- Ask Pip can create, list, update, and protect savings goals.
- The app can show goal cards and any compact goals module.
- Protected goals may affect Spendable Cash Today only after the trust receipt and calculation integration are enabled.

Full-hidden behavior:

- Savings-goal UI is hidden.
- Savings-goal API routes return the disabled response or `404`.
- Ask Pip does not expose savings-goal tools and should clarify or answer conversationally instead of promising goal cards.
- Existing `savings_goals` rows remain stored for a later re-enable.

Rollback guidance:

- Set both flags to `false`.
- Redeploy and verify `/app`, `npm run eval:agent`, and the phone dogfood E2E path no longer expose goal creation.
- If protected goal contributions affected cached Spendable Cash Today results, mark current Pip Cash snapshots stale before or during rollback.
- Do not drop `savings_goals` unless a separate data-retention decision is made.

## Phase 0: Baseline And Guardrails

Goal: make the blast radius visible before editing.

Run:

```bash
git status --short --branch
rg -n "cushion|Cushion|Savings cushion|protected cushion|protected savings|Protected savings|hiddenCushionCents|protectedSavingsMonthlyCents" src docs public scripts tests
npm test
npm run eval:agent
```

Record the baseline:

- Existing visible `cushion` hits.
- Existing tests that assert cushion wording.
- Existing agent prompts that route "cushion" questions.
- Existing calculation tests that should not change in Pass 1.

Exit condition:

- A known list of files to edit.
- A clear assertion that Pass 1 must not change Spendable Cash Today outputs.

## Phase 1: Rename Cushion To Monthly Savings

Goal: change the product experience without changing persisted schema or calculation math.

### Public And Marketing Surfaces

Update:

- `src/app/page.tsx`
- `src/app/how-it-works/page.tsx`
- `src/app/how-the-number-works/page.tsx`
- `src/app/privacy/page.tsx`
- `src/app/terms/page.tsx`
- `src/app/security/page.tsx`
- `src/app/support/page.tsx`
- `src/app/delete-account/page.tsx`
- `src/lib/marketing/pricing.ts`
- `src/lib/marketing/site.ts`
- `src/lib/marketing/assets.ts`
- `src/components/marketing/PricingCards.tsx`
- `src/components/marketing/PricingPageContent.tsx`
- `public/llms.txt`
- `docs/play-store/financial-features.md`
- `docs/play-store/production-access-notes.md`
- `docs/play-store/app-access.md`
- `docs/play-store/data-safety.md`

Copy replacements:

- `Choose your cushion` -> `Choose monthly savings`
- `Savings cushion` -> `Monthly savings`
- `Use $200 cushion` -> `Save $200/month`
- `Cushion protected` -> `Savings protected`
- `Pip keeps your chosen monthly savings out of Spendable Cash Today. Pip does not move money.`

Do not use "auto-save" in marketing unless money movement exists.

### Onboarding And App UI

Update:

- `src/components/onboarding/ProtectedSavingsPicker.tsx`
- `src/components/onboarding/ProtectedSavingsPicker.test.tsx`
- `src/components/auth/ConsentGate.tsx`
- `src/components/auth/onboarding-copy.test.tsx`
- `src/components/PipHome.tsx`
- `src/components/PipHome.test.tsx`

Recommended copy:

- Title: `Choose monthly savings.`
- Body: `Pick how much you want Pip to keep out of your daily spending number each month.`
- Buttons: `Save $100/month`, `Save $200/month`, `Save $250/month`
- Custom input label: `Monthly savings`
- Saving state: `Saving amount...`
- Error: `I couldn't save that amount yet. Please try again.`
- Limit: `Keep monthly savings at $100,000 or less.`
- Fine print: `You can change this anytime. Pip does not move money.`

Component rename:

- Prefer not to rename `ProtectedSavingsPicker.tsx` in Pass 1 if the goal is the smallest safe diff.
- If a rename is chosen, rename it to `MonthlySavingsPicker.tsx` in the same commit and update imports and tests.
- Do not rename API payload fields in the same pass.

### Calculation Labels And Trust Receipt

Update user-facing labels in:

- `src/lib/pip-cash/spendable-cash-today.ts`
- `src/lib/pip-cash/engine.ts`
- `src/lib/pip-cash/explanation.ts`
- `src/lib/pip-cash/guidance-context.ts`
- `src/lib/pip-cash/trust-receipt.ts`
- `src/lib/trust/pip-trust-policy.ts`
- `src/lib/agent/tool-runner.ts`
- `src/lib/agent/answer-composer.ts`
- `src/components/cards/CardRenderer.tsx`
- `src/components/cards/CardRenderer.test.tsx`

Required labels:

- Formula row: `Monthly savings`
- Driver detail: `Your chosen monthly savings are kept out of today's number.`
- Trust receipt row: `Monthly savings`
- Public calculation copy: `Your chosen monthly savings are held back before the daily number is shown.`

For `hiddenCushionCents`:

- Keep the internal name in Pass 1.
- Replace any user-facing `Small cushion` label with `Safety reserve`.
- If a concise explanation becomes awkward, hide the safety reserve from broad marketing copy and keep it in the detailed calculation receipt only.

### Ask Pip Language

Update:

- `src/lib/agent/ai-agent.ts`
- `src/lib/agent/ai-agent.test.ts`
- `src/lib/agent/suggested-prompts.ts`
- `src/lib/agent/suggested-prompts.test.ts`
- `src/lib/agent/conversation-state.ts`
- `tests/helpers/mock-agent-runtime.ts`
- `scripts/eval-agent.mjs`

Keep for compatibility:

- Tool name: `save_protected_savings`
- Payload: `protectedSavingsMonthlyCents`
- Intent aliases: `cushion`, `savings cushion`, `protected savings`

Change:

- Tool description should say it saves the user's monthly savings amount.
- Agent instructions should say monthly savings are kept out of Spendable Cash Today.
- Agent must not imply money moved.
- Suggested prompt should become:
  - ID: `why-monthly-savings`
  - Label: `Why monthly savings?`
  - Prompt: `Why does Pip ask for monthly savings?`

Compatibility response:

If the user asks "Why does Pip need a savings cushion?", Pip should answer using the new language:

`I think of that as monthly savings now. It is the amount you want me to keep out of Spendable Cash Today so you can save without thinking. Pip does not move the money.`

### Pass 1 Tests

Update existing assertions in:

- `src/app/marketing-pages.test.tsx`
- `src/app/legal-pages.test.tsx`
- `src/components/PipHome.test.tsx`
- `src/components/onboarding/ProtectedSavingsPicker.test.tsx`
- `src/components/auth/onboarding-copy.test.tsx`
- `src/components/cards/CardRenderer.test.tsx`
- `src/lib/agent/ai-agent.test.ts`
- `src/lib/agent/suggested-prompts.test.ts`
- `tests/e2e/ai-agent.spec.ts`
- `tests/e2e/live-authenticated-onboarding.spec.ts`

Add coverage:

- Public marketing HTML does not contain visible `cushion`.
- Onboarding does not contain `Use $200 cushion`.
- Trust receipt labels the row `Monthly savings`.
- Old user wording still routes correctly.
- Spendable calculation output is unchanged for a fixed snapshot.

Pass 1 verification:

```bash
npm test
npm run build
npm run eval:agent
npm run check:db-schema-names
rg -n "cushion|Cushion|Savings cushion|protected cushion" src docs public scripts tests
```

Expected remaining `cushion` hits:

- `hiddenCushionCents`
- Compatibility tests or regexes intentionally accepting old user language.
- Historical static planning files under `public/marketing/`, if they are not served as current product copy.

Pass 1 exit condition:

- No visible current-product UI or public docs use `cushion`.
- Same input snapshot produces the same Spendable Cash Today result as before.
- Full unit tests, build, and agent eval pass.

## Phase 2: Savings Goals Data Foundation

Goal: add persistence behind a feature flag without changing Spendable Cash Today yet.

Add a forward migration. Do not edit already-applied migrations.

Suggested file:

`supabase/migrations/YYYYMMDDHHMMSS_savings_goals.sql`

Suggested schema:

```sql
create type public.savings_goal_status as enum ('active', 'paused', 'completed', 'archived');

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  target_amount_cents integer not null check (target_amount_cents > 0),
  target_date date,
  starting_amount_cents integer not null default 0 check (starting_amount_cents >= 0),
  current_amount_cents integer not null default 0 check (current_amount_cents >= 0),
  monthly_contribution_cents integer not null default 0 check (monthly_contribution_cents >= 0),
  include_in_spendable_cash boolean not null default false,
  status public.savings_goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index savings_goals_user_id_status_idx
on public.savings_goals(user_id, status);

grant select, insert, update, delete on public.savings_goals to authenticated;
grant select, insert, update, delete on public.savings_goals to service_role;

alter table public.savings_goals enable row level security;

create policy "Users can view their savings goals."
on public.savings_goals for select
using (auth.uid() = user_id);

create policy "Users can create their savings goals."
on public.savings_goals for insert
with check (auth.uid() = user_id);

create policy "Users can update their savings goals."
on public.savings_goals for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their savings goals."
on public.savings_goals for delete
using (auth.uid() = user_id);
```

Migration follow-up:

- Update the latest `delete_current_user_financial_data` function body in a new forward migration so it deletes `savings_goals`.
- Add `savings_goals` to `src/lib/data/supabase-schema.test.ts`.
- Update `src/lib/supabase/database.types.ts`.
- Update `supabase/rls_smoke_test.sql` if the smoke test asserts table coverage.
- Update Play Store data safety docs to include savings goal metadata.

Data-model notes:

- `current_amount_cents` is tracked progress, not confirmed bank savings.
- Do not enforce `current_amount_cents <= target_amount_cents`; over-target can mark the goal complete.
- `include_in_spendable_cash` controls calculation impact.
- If linked savings accounts are added later, add `linked_account_id` in a separate migration.

Phase 2 verification:

```bash
npm test -- src/lib/data/supabase-schema.test.ts
npm run check:db-schema-names
```

Phase 2 exit condition:

- Migration is forward-only.
- RLS and grants are explicit.
- Deletion RPC includes goals.
- No UI or calculation depends on the table yet.

## Phase 3: Savings Goals Domain And Repository

Goal: add deterministic planning and typed persistence.

Add:

- `src/lib/savings-goals/types.ts`
- `src/lib/savings-goals/plan.ts`
- `src/lib/savings-goals/plan.test.ts`
- `src/lib/data/savings-goals-repository.ts`
- `src/lib/data/savings-goals-repository.test.ts`

Types:

```ts
export type SavingsGoalStatus = "active" | "paused" | "completed" | "archived";

export type SavingsGoal = {
  id: string;
  userId: string;
  name: string;
  targetAmountCents: number;
  targetDate?: string;
  startingAmountCents: number;
  currentAmountCents: number;
  monthlyContributionCents: number;
  includeInSpendableCash: boolean;
  status: SavingsGoalStatus;
  createdAt: string;
  updatedAt: string;
};

export type SavingsGoalPlan = {
  goal: SavingsGoal;
  remainingCents: number;
  progressRatio: number;
  monthsRemaining?: number;
  recommendedMonthlyContributionCents?: number;
  recommendedDailyContributionCents?: number;
  onTrack?: boolean;
};
```

Planning rules:

- Inject or pass `asOfDate`; do not use wall-clock time directly in tests.
- Remaining amount is `max(0, target - current)`.
- Progress ratio is clamped from `0` to `1`.
- If there is a future target date, calculate months remaining and recommended monthly contribution.
- If there is no date, return plan context without inventing urgency.
- If current amount reaches target, mark or recommend `completed`.
- If the monthly contribution is zero and protection is enabled, warn rather than silently affecting nothing.

Repository behavior:

- `listSavingsGoalsForUser`
- `createSavingsGoalForUser`
- `updateSavingsGoalForUser`
- `archiveSavingsGoalForUser`
- `getActiveProtectedSavingsGoalMonthlyCents`

Repository tests should verify:

- User scoping in every query.
- Row-to-domain mapping.
- Archive uses status update, not hard delete, unless hard delete is explicitly chosen.
- Protected monthly contribution sum ignores paused, completed, archived, and unprotected goals.

Phase 3 exit condition:

- Domain tests pass.
- Repository tests pass with mocked Supabase calls.
- No app surface exposes goals yet.

## Phase 4: Savings Goals API

Goal: expose CRUD behind the server flag.

Add:

- `src/app/api/savings-goals/route.ts`
- `src/app/api/savings-goals/route.test.ts`
- `src/app/api/savings-goals/[goalId]/route.ts`
- `src/app/api/savings-goals/[goalId]/route.test.ts`

Routes:

- `GET /api/savings-goals`: list active and paused goals with plans.
- `POST /api/savings-goals`: create a goal and return its plan.
- `PATCH /api/savings-goals/[goalId]`: update goal fields.
- `DELETE /api/savings-goals/[goalId]`: archive the goal.

Validation:

- Name: trim, 1 to 80 characters.
- Target amount: integer cents, greater than 0, cap at a reasonable maximum such as 100,000,000 cents.
- Current amount: integer cents, minimum 0.
- Monthly contribution: integer cents, minimum 0.
- Target date: valid future date if provided.
- `includeInSpendableCash`: boolean.
- Reject protection if monthly contribution is zero unless the user is only tracking progress.

Stale-cache rules:

- Creating a tracked-only goal does not need to stale Pip Cash snapshots.
- Updating name, target, date, or current amount does not need to stale snapshots unless card summaries are cached in the future.
- Changing `monthlyContributionCents` on a protected goal must stale snapshots.
- Changing `includeInSpendableCash` must stale snapshots.
- Archiving a protected active goal must stale snapshots.

Events:

- `savings_goal_created`
- `savings_goal_updated`
- `savings_goal_archived`
- `savings_goal_spendable_protection_enabled`
- `savings_goal_spendable_protection_disabled`

API tests should cover:

- Unauthenticated requests return `401`.
- Disabled flag returns the disabled response.
- Invalid amounts and past dates return `400`.
- Protected contribution updates call `markPipCashSnapshotsStaleForUser`.
- Tracked-only metadata edits do not stale snapshots.

Phase 4 exit condition:

- API tests pass.
- Feature remains hidden from UI and agent unless flags are enabled.

## Phase 5: Spendable Cash Integration

Goal: let protected goal contributions affect Spendable Cash Today only after the trust receipt can show why.

Update types:

- `src/lib/types.ts`
- `src/lib/pip-cash/spendable-cash-today.ts`
- `src/lib/pip-cash/engine.ts`
- `src/lib/pip-cash/trust-receipt.ts`
- `src/lib/pip-cash/guidance-context.ts`
- `src/lib/pip-cash/explanation.ts`
- `src/lib/data/financial-repository.ts`
- `src/lib/data/manual-sync.ts`
- `src/lib/data/financial-repository.test.ts`

Extend the snapshot:

```ts
export type FinancialSnapshot = {
  accounts: Account[];
  transactions: Transaction[];
  settings: UserSettings;
  savingsGoals?: SavingsGoal[];
};
```

Add helper:

```ts
export function getProtectedSavingsGoalMonthlyCents(goals: SavingsGoal[] = []) {
  return goals
    .filter((goal) => goal.status === "active" && goal.includeInSpendableCash)
    .reduce((sum, goal) => sum + goal.monthlyContributionCents, 0);
}
```

Calculation:

```ts
const monthlySavingsCents = snapshot.settings.protectedSavingsMonthlyCents;
const savingsGoalMonthlyCents = getProtectedSavingsGoalMonthlyCents(snapshot.savingsGoals);
const totalSavingsProtectedMonthlyCents = monthlySavingsCents + savingsGoalMonthlyCents;
```

Use `totalSavingsProtectedMonthlyCents` in the monthly everyday pool:

```ts
const monthlyEverydayPoolCents =
  averageMonthlyIncomeCents -
  averageMonthlyRecurringObligationsCents -
  totalSavingsProtectedMonthlyCents -
  hiddenCushionCents;
```

Expose in result types:

- `monthlySavingsCents`
- `savingsGoalMonthlyCents`
- `totalSavingsProtectedMonthlyCents`
- Keep `protectedSavingsMonthlyCents` populated as an alias for compatibility during rollout.

Trust receipt:

- Show base monthly savings separately from goal contributions.
- If goal contributions are zero, do not add a noisy row.
- If a goal is tracked-only, do not imply it changed today's number.

Warnings:

- If protected savings plus protected goals make the monthly everyday pool negative, show:
  `Your savings plan is larger than your usual leftover room.`
- Ask Pip can suggest lowering monthly savings, lowering protected goal contribution, extending the goal date, or tracking the goal without protecting it.

Tests:

- Fixed snapshot with no savings goals returns the same number as before.
- Tracked-only goal does not change Spendable Cash Today.
- Protected goal contribution lowers Spendable Cash Today by the expected daily amount before caps.
- Trust receipt shows a separate `Savings goals` row.
- Stale cached result validation accepts the new fields while preserving old snapshots.

Phase 5 exit condition:

- Calculation tests pass.
- Trust receipt and explanation make the goal impact auditable.
- No protected goal contribution can affect the number without a visible receipt row.

## Phase 6: Ask Pip Tools And Cards

Goal: make Savings Goals usable conversationally without letting AI invent calculations.

Update:

- `src/lib/agent/ai-agent.ts`
- `src/lib/agent/card-types.ts`
- `src/lib/agent/response-schema.ts`
- `src/lib/agent/tool-runner.ts`
- `src/lib/agent/answer-composer.ts`
- `src/lib/agent/conversation-state.ts`
- `src/components/cards/CardRenderer.tsx`
- `src/components/cards/CardRenderer.test.tsx`
- `tests/helpers/mock-agent-runtime.ts`
- `scripts/eval-agent.mjs`
- `src/app/api/agent/route.ts`

Add tools:

- `create_savings_goal`
- `list_savings_goals`
- `update_savings_goal`
- `set_savings_goal_protection`

Tool descriptions must say:

- Pip tracks the goal.
- Pip can keep the monthly contribution out of Spendable Cash Today if the user chooses.
- Pip does not move money.

Recommended create schema:

```ts
const createSavingsGoalParameters = z.object({
  name: z.string().min(1).max(80),
  target_amount_cents: z.number().int().positive(),
  target_date: z.string().optional(),
  current_amount_cents: z.number().int().min(0).optional(),
  monthly_contribution_cents: z.number().int().min(0).optional(),
  include_in_spendable_cash: z.boolean().optional(),
});
```

Card types:

- `savings_goal_plan`
- `savings_goals_summary`

`savings_goal_plan` fields:

- `goalId`
- `name`
- `targetAmountCents`
- `currentAmountCents`
- `remainingCents`
- `targetDate`
- `recommendedMonthlyContributionCents`
- `monthlyContributionCents`
- `includeInSpendableCash`
- `onTrack`
- `summary`

Prompt rules:

- If the user gives a target amount and goal name, create or draft a goal plan.
- If the user gives no deadline, ask for one or offer monthly contribution options.
- If the user asks "How can I save for this?", calculate the required monthly amount deterministically.
- If the user wants Pip to "make sure I save it," ask whether to keep the monthly contribution out of Spendable Cash Today.
- Never say money was transferred, deposited, locked, or automatically saved.

Fast-path examples:

- `I want to save $5,000 for a trip`
- `Help me save for a car`
- `Can I save $1,200 by December?`
- `Track a vacation fund`
- `Keep $300 a month for my trip out of my spendable number`

Eval additions:

- Creating a goal uses `create_savings_goal`.
- Goal with amount and deadline returns a monthly contribution.
- Protection language says `kept out of Spendable Cash Today`.
- Agent never claims money movement.
- Existing `Can I spend $50?` behavior remains unchanged.
- Existing trust receipt questions still call `get_trust_receipt`.

Phase 6 exit condition:

- Agent eval passes.
- Card renderer handles mobile widths without value wrapping breaking layout.
- Mock runtime supports the new tool/card paths.

## Phase 7: Compact App UI

Goal: expose goals without turning Pip into a dashboard.

Placement:

- Keep Spendable Cash Today first.
- Add a compact Savings module below the main number and receipt summary.
- Ask Pip remains the primary creation surface.

Recommended module states:

- No goals: `Saving for something? Ask Pip to make a plan.`
- Tracked goal: `$1,250 of $5,000 tracked`
- Protected goal: `$417/month kept out of today's number`
- Tracked-only goal: `Tracked only. Not held out of today's number.`
- Toggle: `Keep this goal out of Spendable Cash Today`

Update:

- `src/components/PipHome.tsx`
- `src/components/PipHome.test.tsx`
- `src/app/globals.css` only if layout needs it

UI constraints:

- Do not add a large goals dashboard.
- Do not put the goals module above Spendable Cash Today.
- Do not make tracked-only goals appear to affect the daily number.
- Keep text short enough for mobile.

Browser QA:

- `/app` at mobile width still shows the main number first.
- Goal cards do not horizontally overflow.
- Protected/tracked-only states are visually distinct.
- Trust receipt remains readable after a protected goal is enabled.

Phase 7 exit condition:

- UI tests pass.
- In-app Browser QA passes on mobile and desktop.

## Settings Compatibility

The settings API currently accepts:

```ts
protectedSavingsMonthlyCents
```

Pass 1 should keep this request shape.

After the UI copy is stable, optionally support both names:

```ts
monthlySavingsCents
protectedSavingsMonthlyCents
```

Resolution rule:

- Prefer `monthlySavingsCents` if present.
- Accept `protectedSavingsMonthlyCents` for older clients.
- Return both for one release if mobile clients may lag.

Only after all app clients, tests, and cached snapshots use `monthlySavingsCents`, consider an internal schema rename. That cleanup is not required for launch.

## Optional Internal Cleanup

Do only after Pass 1 and Pass 2 are stable.

Possible rename map:

- `protected_savings_monthly_cents` -> `monthly_savings_cents`
- `protectedSavingsMonthlyCents` -> `monthlySavingsCents`
- `hiddenCushionCents` -> `safetyReserveCents`
- Keep `is_protected_savings` if it still describes account treatment.

If done:

- Use a forward defensive migration like the prior Pip Cash rebrand migrations.
- Update `src/lib/supabase/database.types.ts`.
- Update repository mappers.
- Update cached snapshot validation.
- Update fake data.
- Update API clients.
- Update agent schemas.
- Update tests and evals.

This is cleanup, not a prerequisite.

## Product Copy Reference

### Onboarding

Title:

`Choose monthly savings.`

Body:

`Pick how much you want Pip to keep out of your daily spending number each month.`

Primary button:

`Save $200/month`

Secondary text:

`You can change this anytime. Pip does not move money.`

### How The Number Works

`Pip starts with connected balances and transactions, accounts for likely bills and committed spending, keeps your chosen monthly savings out of the number, adjusts for recent spending pace, and caps the result against available cash.`

### Trust Receipt

`Monthly savings: $200 kept out of today's number.`

If protected goals exist:

`Savings goals: $417/month kept out for Trip.`

### Ask Pip

`I kept your monthly savings out before showing today's spending room. Pip does not move money; this is the amount you asked me to protect from spending.`

### Savings Goal

`To save $5,000 for your trip by June 2027, you would need about $417/month. I can keep that out of Spendable Cash Today, or track it without changing the daily number.`

## Implementation Order

Recommended commit sequence:

1. Pass 0 inventory and test updates that prove the current calculation baseline.
2. Pass 1 Monthly Savings copy, labels, tests, and eval updates.
3. Savings Goals migration, types, schema tests, and feature flag helper.
4. Savings Goals domain planner and repository.
5. Savings Goals API routes and events.
6. Agent tools, card schemas, renderer, mock runtime, and evals.
7. Spendable Cash integration and trust receipt rows for protected goal contributions.
8. Compact app UI and browser QA.
9. Public policy, Play Store, and data-safety doc updates for goals.

Do not merge the calculation integration before the trust receipt and tests can explain it.

## Verification Gate

Run after Pass 1:

```bash
npm test
npm run build
npm run eval:agent
npm run check:db-schema-names
rg -n "cushion|Cushion|Savings cushion|protected cushion" src docs public scripts tests
```

Run after Pass 2 foundation:

```bash
npm test -- src/lib/data/supabase-schema.test.ts src/lib/savings-goals/plan.test.ts src/lib/data/savings-goals-repository.test.ts
npm run check:db-schema-names
```

Run after full Savings Goals integration:

```bash
npm test
npm run build
npm run eval:agent
npm run check:db-schema-names
npm run test:e2e -- tests/e2e/ai-agent.spec.ts
```

Browser QA with the in-app Browser:

- `/` has no visible cushion language.
- `/how-it-works` and `/how-the-number-works` explain monthly savings clearly.
- Onboarding shows `Choose monthly savings` and `Save $200/month`.
- `/app` still shows Spendable Cash Today first.
- Ask Pip can answer `Why monthly savings?`
- Ask Pip can handle old language: `Why does Pip need a savings cushion?`
- Ask Pip can create or draft a trip goal.
- Protected goal contribution changes the trust receipt and Spendable Cash Today explanation.
- Tracked-only goal does not change Spendable Cash Today.
- Mobile layout has no horizontal overflow.

## Observability

Track:

- Monthly savings selected or updated.
- Savings goal created.
- Savings goal protection enabled or disabled.
- Savings goal archived.
- Agent savings-goal tool use.
- Validation failures for goal creation.
- Stale snapshot rebuild after protected contribution changes.

Suggested product questions:

- Do users choose a higher amount when framed as Monthly Savings than as cushion?
- Do users understand that Pip does not move money?
- Do protected goals increase repeat checking of Spendable Cash Today?
- Do users disable protection after seeing a lower daily number?

## Rollback

Pass 1 rollback:

- Revert the copy commit if the new language creates confusion.
- No data rollback is needed because schema and calculation outputs do not change.

Pass 2 rollback:

- Set `PIP_SAVINGS_GOALS_ENABLED=false`.
- Set `NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=false`.
- Keep the table and user data in place.
- Hide UI and disable agent tools.
- If protected goal contributions affected cached results, mark current Pip Cash snapshots stale before or during rollback.
- Do not drop `savings_goals` unless there is a separate data-retention decision.

Emergency fallback:

- Leave goal tracking visible but force `include_in_spendable_cash=false` server-side if calculation impact is wrong.
- Tell users the goal is tracked only until protection is re-enabled.

## Risk Register

| Risk | Trigger | Mitigation |
| --- | --- | --- |
| Users think Pip moved money | Copy says saved, deposited, locked, or auto-saved | Use "kept out of today's number" and "Pip does not move money." |
| Old clients break | API stops accepting `protectedSavingsMonthlyCents` | Keep old payload name through first release; optionally add `monthlySavingsCents` alias later. |
| Goal contribution is double counted | Monthly Savings and goal protection are merged unclearly | Store and display base monthly savings and goal contribution separately. |
| Trust receipt becomes misleading | Goal affects number without separate receipt row | Do not merge Phase 5 until receipt tests pass. |
| RLS leak | Goals table misses user-scoped policies | Add schema tests and RLS smoke coverage. |
| Delete request misses goals | Deletion RPC is not updated | Add `savings_goals` to deletion migration and docs. |
| Spendable Cash Today feels too low | Protected goals exceed normal leftover room | Add warning and suggest tracked-only mode or deadline adjustment. |
| Agent overpromises | AI says Pip saved/transferred money | Add evals forbidding money-movement claims. |

## Definition Of Done

Pass 1 is done when:

- Users see Monthly Savings instead of cushion.
- No current public or app surface uses cushion language.
- Spendable Cash Today is numerically unchanged for fixed inputs.
- Trust receipt explains monthly savings as kept out of the number.
- Ask Pip handles old cushion language with new savings framing.
- `npm test`, `npm run build`, and `npm run eval:agent` pass.

Pass 2 is done when:

- Users can create, view, update, and archive savings goals.
- Pip calculates required savings pace deterministically.
- Users can choose tracked-only or protected-in-Spendable-Cash behavior.
- Protected goal contributions are shown separately in the trust receipt.
- Tracked-only goals do not affect Spendable Cash Today.
- Ask Pip does not claim money moved.
- Privacy, deletion, Play Store, and data-safety docs include savings goals.
- Feature flags can disable UI, API, and agent behavior without data loss.
- Full unit tests, build, agent eval, e2e, and in-app Browser QA pass.
