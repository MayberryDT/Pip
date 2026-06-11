# PIP Rebrand, Reliability, Optimization, and Dogfooding Plan

Created: 2026-06-10

## Plan Optimizer Result

This plan was produced with the `plan-optimizer` loop: rubric first, draft, score,
critique, rewrite, and stop after the score plateaued.

### Final Score

94 / 100

| Criterion | Weight | Score | Rationale |
|---|---:|---:|---|
| Brand completeness and migration safety | 20 | 19 | Covers source, tests, docs, env vars, deploy naming, Supabase schema, telemetry, and compatibility boundaries. |
| Reliability and error reduction | 20 | 19 | Builds from observed error surfaces, centralizes error handling, hardens agent responses, and adds automated regression gates. |
| Dogfooding coverage | 15 | 15 | Requires local and, where credentials exist, live in-app walkthroughs across auth states, scenarios, chat actions, providers, legal pages, and responsive views. |
| Sequencing and dependencies | 15 | 14 | Orders risky schema and route changes behind inventory, compatibility, tests, and rollback points. |
| Specificity and actionability | 10 | 9 | Names concrete files, routes, scripts, command gates, search patterns, and acceptance criteria. |
| Feasibility and rollback | 10 | 9 | Preserves applied Supabase migration history by default and adds compatibility aliases before removing legacy names. |
| Performance and polish metrics | 10 | 9 | Adds measurable build, E2E, console, latency, bundle, and visual QA gates, though exact budgets must be calibrated from baseline. |

Score trajectory: `73 -> 84 -> 91 -> 94 -> 94`

Main improvements from the first draft:

- Split the PIP rebrand into safe layers: user-facing brand, source identifiers,
  routes, env vars, telemetry, Supabase schema, deploy surfaces, and historical
  archives.
- Added a Supabase-specific migration strategy instead of blindly renaming old
  migration files that may already be applied.
- Made dogfooding a required release gate with concrete in-app paths, console and
  network checks, viewport coverage, and proof artifacts.

## Assumptions

- Final brand is `PIP` in brand lockup contexts, `Pip` in normal copy, React
  component names, and persona references, and `pip` in file paths, package names,
  env variable prefixes, database names, and slugs.
- Legacy terms to eliminate from active surfaces: `FreeCash`, `Free Cash`,
  `free-cash`, `free_cash`, `FreeCache`, `Free Cache`, `Spendable` when used as a
  project or app brand, and possible misspellings such as `Spinable`.
- `Spendable Cash Today` is currently a product metric, not necessarily a brand.
  Default plan: keep it only where it describes the metric shown to the user.
  Rename it too only if the product decision is that every visible metric should
  become PIP-branded.
- Applied Supabase migration files are history. Do not rename previously applied
  migration filenames unless we first confirm that production can be reset or the
  migration ledger can be repaired safely.
- Backward-compatible aliases are acceptable during the migration, but the final
  app should have an explicit allowlist for any remaining legacy strings.

## Definition Of Done

The work is not finished until all of these are true:

- Active user-facing UI, docs, metadata, PWA assets, package metadata, tests, and
  deploy references use PIP naming.
- Active code modules, components, types, route names, env vars, telemetry names,
  and local storage keys have PIP names or are on a documented compatibility
  allowlist.
- Supabase live schema has PIP names through forward migrations, generated
  database types are current, RLS tests pass, and rollback is documented.
- The app no longer shows raw or avoidable error responses in normal user flows.
- Local unit tests, E2E tests, build, deployment checks, bundle checks, PRD gates,
  and agent evals pass.
- The app has been dogfooded thoroughly in the browser, including every primary
  screen, every prompt chip/action, all onboarding states, error states, provider
  paths, legal pages, offline behavior, and mobile/desktop responsive layouts.
- Any remaining issue is recorded with severity, reproduction steps, and either a
  fix or an explicit acceptance decision.

## Phase 0: Safety, Baseline, And Inventory

Goal: know the current blast radius before changing names or behavior.

1. Create a clean working checkpoint.
   - Run `git status --short`.
   - Note any user changes and avoid reverting them.
   - Create a working branch if this is not already isolated.

2. Capture baseline commands and failures.
   - `npm run test`
   - `npm run build`
   - `npm run test:e2e`
   - `npm run eval:agent`
   - `npm run check:deployment`
   - `npm run check:netlify-bundle`
   - `npm audit --omit=dev`
   - If live credentials and auth state exist: `npm run check:live-smoke` and
     `npm run test:e2e:live:final`

3. Create a brand inventory.
   - Search active code and docs:
     `rg -n -i "free[-_ ]?cash|freecache|free cache|spinable|spendable" .`
   - Exclude generated/build folders, `node_modules`, `.next`, `.netlify`, and
     `package-lock.json` unless a package metadata update requires it.
   - Classify each hit as one of:
     `rename now`, `compatibility alias`, `metric language`, `historical archive`,
     `third-party dashboard`, or `remove`.

4. Create an error inventory.
   - Search for API error responses, client `throw new Error`, `catch` blocks,
     `errorText`, `toAgentErrorPayload`, model repair paths, and provider sync
     failures.
   - Run the app locally and capture browser console errors, failed network
     requests, slow requests, and visible error messages.
   - Export the current agent error patterns from `agent_chat_turns` or local
     `/tmp/spendable-agent-chat-turns.jsonl` when available.

Exit criteria:

- A committed or saved baseline log exists.
- Every legacy brand occurrence has a disposition.
- Every currently reproducible visible error has a reproduction path.

## Phase 1: Canonical PIP Naming Map

Goal: prevent inconsistent renames.

Use this mapping unless a specific file proves a better local convention:

| Legacy | New |
|---|---|
| `FreeCashHome` | `PipHome` |
| `src/components/FreeCashHome.tsx` | `src/components/PipHome.tsx` |
| `src/lib/free-cash/` | `src/lib/pip-cash/` |
| `calculateFreeCash` | `calculatePipCash` or `calculatePipMoneyState` |
| `FreeCashResult` | `PipCashResult` |
| `freeCashTodayCents` | `pipCashTodayCents` only if it is still an active field; otherwise prefer `spendableCashTodayCents` for the metric |
| `/api/free-cash` | `/api/pip-cash` |
| `free_cash_snapshots` | `pip_cash_snapshots` |
| `free_cash_today_cents` | `pip_cash_today_cents` or retire in favor of `spendable_cash_today_cents` |
| `free_cash_viewed` | `pip_cash_viewed` or `spendable_cash_today_viewed` |
| `negative_free_cash_follow_up` | `negative_pip_cash_follow_up` or `negative_spendable_cash_follow_up` |
| `FREE_CASH_*` env vars | `PIP_*` env vars with temporary alias reads |
| `spendable-agent-chat-turns.jsonl` | `pip-agent-chat-turns.jsonl` |
| package name `spendable` | `pip` |
| Netlify site slug `free-cash-mayberrydt` | new PIP slug/domain, with redirect or docs update |

Rules:

- User-visible brand is PIP/Pip.
- File paths and env vars use lowercase `pip`.
- TypeScript exported names use PascalCase `Pip`.
- Do not change the meaning of `Spendable Cash Today` during the rebrand unless
  it is explicitly being replaced as a product concept.
- Keep temporary aliases small, tested, and scheduled for removal.

Exit criteria:

- The naming map is final enough to drive mechanical renames.
- Any product-language exception is documented.

## Phase 2: PIP Rebrand Implementation

Goal: replace legacy project and brand names without breaking runtime behavior.

### 2.1 Source Structure And Imports

1. Rename source files and folders.
   - `src/components/FreeCashHome.tsx` -> `src/components/PipHome.tsx`
   - `src/components/FreeCashHome.test.tsx` -> `src/components/PipHome.test.tsx`
   - `src/lib/free-cash/` -> `src/lib/pip-cash/`
   - Related tests move with the modules.

2. Update imports through TypeScript-aware search.
   - Replace `@/lib/free-cash/...` with `@/lib/pip-cash/...`.
   - Replace `@/components/FreeCashHome` with `@/components/PipHome`.
   - Run `npm run test` after the import-only pass.

3. Rename exported types and functions.
   - Rename `FreeCashResult`, `FreeCashDriver`, `FreeCashWarning`, and
     `calculateFreeCash` according to the map.
   - Add short-lived compatibility aliases only where a large rename would make
     one diff unsafe.
   - Remove aliases before final acceptance unless they are part of an external
     API compatibility plan.

4. Update tests, test IDs, and boundary tests.
   - Replace `data-testid="free-cash-number"` with a PIP name such as
     `data-testid="pip-cash-number"` or `spendable-cash-number`.
   - Update `src/app/free-cash-language-boundary.test.ts` into a PIP language
     boundary test that fails on unallowlisted legacy strings.

### 2.2 Routes And Client Fetches

1. Add `/api/pip-cash` as the canonical route.
2. Move current `/api/free-cash` logic or create a shared route handler used by
   both routes during the transition.
3. Update client fetches in the home screen and tests to use `/api/pip-cash`.
4. Decide the compatibility behavior for `/api/free-cash`.
   - Private beta only: keep it for one release and log usage.
   - No external consumers: remove it after all tests and live smoke pass.
5. Update route tests and E2E expectations.

Exit criteria:

- The app itself calls only PIP routes.
- Legacy route behavior is explicitly tested or removed.

### 2.3 Config, Env Vars, Scripts, And Package Metadata

1. Rename package metadata.
   - `package.json` name: `pip`
   - Update lockfile through `npm install` if needed.

2. Add PIP env var aliases.
   - `FREE_CASH_SUPABASE_MODE` -> `PIP_SUPABASE_MODE`
   - `FREE_CASH_OPERATOR_TOKEN` -> `PIP_OPERATOR_TOKEN`
   - `FREE_CASH_PROVIDER_TOKEN_KEY_BASE64` -> `PIP_PROVIDER_TOKEN_KEY_BASE64`
   - `FREE_CASH_DEPLOY_MODE` -> `PIP_DEPLOY_MODE`
   - `FREE_CASH_AI_MODEL` -> `PIP_AI_MODEL`
   - `FREE_CASH_AI_TRANSPORT` -> `PIP_AI_TRANSPORT`

3. Implement alias reads safely.
   - Prefer new `PIP_*`.
   - Fall back to old `FREE_CASH_*` temporarily.
   - Warn in tests or docs when an old env var is used.

4. Rename scripts and temporary paths.
   - `/tmp/spendable-agent-chat-turns.jsonl` -> `/tmp/pip-agent-chat-turns.jsonl`
   - `SPENDABLE_LIVE_STORAGE_STATE` -> `PIP_LIVE_STORAGE_STATE`
   - `SPENDABLE_LIVE_PROOF_REPORT` -> `PIP_LIVE_PROOF_REPORT`
   - Plaid test variables that use `SPENDABLE_` prefixes get `PIP_` aliases.

5. Update `playwright.config.ts`, `playwright.live.config.ts`, `.env.example`,
   `README.md`, deployment checks, and script tests.

Exit criteria:

- New env names work alone.
- Old env names either fail with a clear migration message or are covered by
  temporary compatibility tests.

### 2.4 Supabase Schema And Data Names

1. Do not edit already applied migration files unless a database reset is approved.
2. Add a new forward migration that renames active tables, columns, policies,
   functions, indexes, and event names.
3. Candidate schema changes:
   - `free_cash_snapshots` -> `pip_cash_snapshots`
   - `free_cash_today_cents` -> `pip_cash_today_cents`, or remove from active
     app reads if `spendable_cash_today_cents` fully replaces it.
   - RLS policy names referencing Free Cash -> PIP names.
   - Product event names with `free_cash` -> PIP names.
4. Add compatibility views only if needed for safe deployment:
   - Example: `public.free_cash_snapshots` view over `public.pip_cash_snapshots`
     during one deploy window.
5. Regenerate `src/lib/supabase/database.types.ts`.
6. Update repository code, manual sync, current snapshot loading, usage counters,
   operator overview, RLS smoke test, and Supabase schema tests.
7. Test rollback.
   - If using table renames, rollback migration should rename back.
   - If using views, rollback can drop views and restore old app code.

Exit criteria:

- New schema names are active.
- RLS smoke test passes.
- Generated types match the live schema.
- Any remaining old migration filename or historical SQL text is in the brand
  allowlist with a reason.

### 2.5 Deployment, Provider, And External Dashboard Surfaces

1. Netlify:
   - Rename site slug or create a new PIP site if slug rename is not practical.
   - Update README, deployment scripts, production URLs, preview URLs, and
     verified deploy references.
   - Add redirects from old URLs if they remain public.

2. Plaid:
   - Update `PLAID_CLIENT_NAME=Pip` if not already set.
   - Update redirect URI from old Netlify domain to the PIP domain.
   - Add the new redirect URI in the Plaid dashboard before deploying.
   - Keep the old redirect URI until OAuth resume has been verified on the new
     domain.

3. Supabase Auth:
   - Update site URL and redirect allowlist to the PIP domain.
   - Verify Google OAuth callback and magic-link fallback.

4. PWA and browser metadata:
   - Update `src/app/manifest.ts`, `public/offline.html`, `public/sw.js`,
     service worker cache names, icons, page title, and theme metadata.

Exit criteria:

- Production and local auth redirects land on PIP URLs.
- Plaid OAuth resume works on the PIP URL.
- Old external URLs are either redirected or intentionally retired.

### 2.6 Documentation And Archived Plans

1. Update active docs:
   - `README.md`
   - `.env.example`
   - PRD and current implementation plans
   - Deployment notes

2. Archive or rename old reports:
   - `FREE_CASH_APP_INVESTIGATION_REPORT.md`
   - `FREE_CASH_ARCHITECTURE_DECISION_REPORT.md`

3. Add a brand allowlist file or test fixture that documents unavoidable legacy
   terms:
   - historical migration filenames
   - compatibility route names during transition
   - old production URLs during redirect window

Exit criteria:

- `rg -n -i "free[-_ ]?cash|freecache|free cache|spinable|spendable"` returns
  only allowed metric language or documented historical/compatibility hits.

## Phase 3: Reliability And Error Response Cleanup

Goal: turn "lots of errors as responses" into predictable, friendly, logged,
and rare failure modes.

### 3.1 Classify Current Errors

Create a table of actual failures from tests, local dogfooding, and agent logs:

| Area | Example source | User impact | Fix type |
|---|---|---|---|
| Agent output validation | `/api/agent`, `runAIAgent`, final structured output repair | visible chat error | prompt/schema/repair hardening |
| Missing AI config | OpenAI or Netlify AI Gateway env missing | chat unavailable | clearer setup state or deploy env fix |
| Supabase auth/data state | unauthenticated, no rows, stale rows | blocked onboarding or empty app | state-specific guidance |
| Plaid connect/repair | exchange, OAuth resume, sync manual | connection failed | provider flow hardening |
| Client fetch failures | home screen, prompt chips, sync status | visible app error | retry, copy, fallback UI |
| Service worker/offline | stale assets, cache mismatch | old app or blank state | cache versioning and update flow |

Exit criteria:

- Each reproducible error has a root cause category and owner file.

### 3.2 Centralize Safe Error Handling

1. Build or extend shared error helpers.
   - Server: standard `jsonError(code, userMessage, status, detail?)` helper.
   - Client: standard `getDisplayErrorMessage(error, context)` helper.
   - Provider: map third-party errors to safe app-level messages.

2. Ensure sensitive values never leak.
   - Keep and expand tests like the Plaid/Teller secret redaction tests.
   - Add route tests for all API catch blocks that may include provider errors.

3. Make errors actionable.
   - Authentication errors should route toward sign-in.
   - Missing data should route toward connect-data.
   - Stale/repair errors should route toward repair.
   - Model errors should ask the user to retry without exposing schema details.

4. Add request IDs.
   - Include a request ID in server logs and safe client error payloads.
   - Store it in `agent_chat_turns` metadata for agent failures.

Exit criteria:

- No normal user flow displays raw exception text.
- Every API route has tested safe error behavior.

### 3.3 Harden `/api/agent`

1. Add a failure matrix for the agent route:
   - invalid request body
   - no AI credentials
   - model final output invalid
   - repair attempt invalid
   - disallowed language
   - unsupported card promise
   - missing financial data
   - provider action failure
   - prompt chip generation failure

2. Improve model reliability before fallback.
   - Revisit final output schema constraints in `src/lib/agent/response-schema.ts`.
   - Tighten system instructions only where failures are observed.
   - Add deterministic preconditions for forced prompt chip tools.
   - Keep financial math in deterministic tools.

3. Make the repair loop measurable.
   - Record repair reason, repair result, model, transport, and final outcome.
   - Add an analyzer report for top failure reasons.

4. Add agent regression cases.
   - Expand `scripts/eval-agent.mjs` with cases from real error logs.
   - Gate on no schema failures, no disallowed phrases, and no unsupported card
     promises.

5. Improve UI handling when the server truly cannot answer.
   - The chat should show a short PIP-voiced failure state.
   - It should preserve the user's message.
   - It should offer a useful next action when one is known.
   - It should avoid pretending that a model answer succeeded.

Exit criteria:

- Reproduced agent errors are fixed or converted into safe, actionable states.
- `npm run eval:agent` passes with the new cases.

### 3.4 Provider And Data Sync Reliability

1. Audit Plaid connect, OAuth resume, exchange, manual sync, repair, stale data,
   missing-card preferences, and partial-sync states.
2. Add retries only where idempotent and safe.
3. Ensure manual refresh cannot duplicate provider credentials or double-count
   transactions.
4. Verify sync status reflects success, partial success, repair required, stale,
   and no-data states accurately.
5. Add tests for each provider state surfaced in chat.

Exit criteria:

- Local fake-provider tests cover success, partial, failure, repair, and no-data.
- Live Plaid sandbox smoke passes when credentials are available.

## Phase 4: Performance And App Optimization

Goal: make the app feel fast and stable without changing the product shape.

1. Establish baseline metrics.
   - Build time.
   - Bundle size from `npm run build`.
   - Initial page load time in local Playwright.
   - `/api/agent`, `/api/pip-cash`, `/api/sync/status`, and `/api/sync/manual`
     response times.
   - Browser console warnings/errors.

2. Optimize React render paths.
   - Review `PipHome` state fan-out and effect dependencies.
   - Prevent prompt chip refreshes from causing unnecessary thread rerenders.
   - Keep stable dimensions for hero, prompt chips, cards, inputs, and loading
     states.

3. Optimize data loading.
   - Avoid duplicate backend loads on mount.
   - Cache or dedupe sync status and current PIP cash requests where safe.
   - Add timeouts and abort handling for client fetches.

4. Optimize assets and PWA behavior.
   - Verify PIP images are sized correctly.
   - Ensure service worker cache names use PIP and do not keep stale Free Cash
     assets.
   - Test offline fallback and update behavior.

5. Optimize Supabase queries.
   - Review current snapshot, usage, operator overview, sync status, and agent
     chat query plans.
   - Add indexes only after identifying slow queries.
   - Keep RLS policies simple and tested.

Exit criteria:

- No avoidable duplicate critical requests on initial load.
- No layout shift during normal chat, loading, or error states.
- Production build remains within agreed bundle and latency budgets.

## Phase 5: Product Polish

Goal: make the app feel finished.

1. Copy and tone.
   - Normalize PIP/Pip usage.
   - Keep messages short, direct, and useful.
   - Remove internal terms from visible UI.
   - Review every error, empty, loading, success, repair, and offline message.

2. Visual QA.
   - Mobile narrow viewport.
   - Mobile tall viewport.
   - Tablet.
   - Desktop.
   - Verify no overlapping text, clipped buttons, unstable prompt chips, broken
     images, blank cards, or awkward scroll jumps.

3. Accessibility.
   - Keyboard focus works through sign-in, consent, protected savings, prompt
     chips, chat input, Plaid launch, legal links, and delete confirmation.
   - Images have appropriate alt or `aria-label`.
   - Color contrast is acceptable.
   - Loading and error states are announced or clear.

4. Product boundaries.
   - No money movement features.
   - No balances shown by default.
   - No unsafe "you can afford" or formal financial-advisor language.
   - No separate dashboard or menu creep.

Exit criteria:

- Manual UI review has no high-severity polish issues.
- Boundary tests still pass.

## Phase 6: Required Dogfooding Matrix

Goal: thoroughly test every square inch of the app before finishing.

Dogfooding must be done in the actual app UI, not only through tests.

### 6.1 Local Dogfooding Setup

1. Start local dev server.
   - `PIP_SUPABASE_MODE=off npm run dev -- -p 3000`
2. Open the app in the in-app browser.
3. Keep browser console and network panels visible or collect equivalent logs.
4. Test at minimum:
   - `375x812`
   - `390x844`
   - `768x1024`
   - `1440x900`

### 6.2 Fake Scenario Walkthroughs

Walk every fake scenario:

- default
- healthy
- overspending
- shortfall
- low-confidence
- missing-card
- cash-guardrail
- negative

For each scenario:

- Load the app.
- Verify PIP brand and metric display.
- Ask "Why this number?"
- Ask "Show the math."
- Ask "Can I spend $50?"
- Ask for true balances.
- Ask for recent transactions.
- Ask what changed recently.
- Tap every prompt chip presented.
- Verify cards match the answer and do not promise unavailable cards.
- Verify no console errors or failed unexpected network requests.

### 6.3 Onboarding And Account States

Walk all dev onboarding URLs:

- `/?onboarding=guest`
- `/?onboarding=test`
- `/?onboarding=consent`
- `/?onboarding=ready`

For each state:

- Verify copy, buttons, prompt chips, input state, and error handling.
- Save protected savings.
- Try invalid protected savings amounts.
- Start connect-data flow.
- Refresh data when available.
- Confirm the app does not expose balances by default.

### 6.4 Provider And Live Beta Walkthroughs

When credentials and saved auth state are available:

- `npm run check:deployment`
- `npm run check:live-smoke`
- `npm run test:e2e:live:final`
- Verify Google sign-in.
- Verify Supabase consent persistence.
- Verify Plaid sandbox connect.
- Verify Plaid OAuth resume.
- Verify manual sync.
- Verify repair mode if a repairable sandbox state can be produced.
- Verify delete-data confirmation and outcome in a safe test account.

### 6.5 Legal, Offline, And PWA

Check:

- `/privacy`
- `/terms`
- `/support`
- manifest metadata
- installability where available
- service worker registration
- offline fallback
- cache clearing after the PIP rename

### 6.6 Dogfood Proof Artifact

Create or update a local dogfood report with:

- Date and commit.
- Commands run.
- URLs and states tested.
- Browser console findings.
- Failed requests.
- Screenshots if useful.
- Bugs found and fixed.
- Bugs found and accepted with reason.

Exit criteria:

- No untriaged user-visible errors remain.
- No high-severity visual, flow, auth, provider, or data correctness issues
  remain.

## Phase 7: Final Verification Gates

Run these after all code and docs changes:

```bash
npm run test
npm run build
npm run test:e2e
npm run eval:agent
npm run analyze:agent-conversations
npm run check:deployment
npm run check:netlify-bundle
npm audit --omit=dev
```

If live credentials and auth state are available:

```bash
npm run check:live-smoke
npm run test:e2e:live:final
npm run check:prd-complete
```

Run final brand audit:

```bash
rg -n -i "free[-_ ]?cash|freecache|free cache|spinable|spendable" .
```

Expected result:

- No legacy brand hits outside the allowlist.
- `Spendable Cash Today` hits are allowed only if it remains the metric name.
- Historical Supabase migration hits are allowed only if documented.
- Compatibility route/env hits are allowed only if scheduled for removal.

## Rollback Plan

If the rebrand breaks runtime behavior:

1. Revert source-level renames in the app branch before deployment.
2. If deployed with compatibility aliases, route old and new API paths to the
   same handler while fixing clients.
3. If Supabase schema rename causes issues:
   - apply rollback migration if already deployed, or
   - restore compatibility views for old names until app code is fixed.
4. Keep old Netlify, Supabase Auth, and Plaid redirect URLs active until new PIP
   production auth and provider flows pass live smoke.

## Execution Order Summary

1. Baseline tests, brand inventory, and error inventory.
2. Finalize naming map and allowlist policy.
3. Rename source modules, components, imports, tests, and package metadata.
4. Add PIP API route and migrate client calls.
5. Add env var aliases and update scripts.
6. Add Supabase forward migration, regenerate types, and update data layer.
7. Update deployment/provider/auth/PWA surfaces.
8. Centralize safe error handling and harden agent/provider failures.
9. Optimize render, requests, assets, service worker, and Supabase queries.
10. Polish copy, responsive UI, accessibility, and product boundaries.
11. Dogfood every required flow in-app.
12. Run final verification gates and brand audit.

## Open Decisions

- Should `Spendable Cash Today` remain the metric name, or should the visible
  metric itself be renamed into PIP language?
- Is the current Supabase production database disposable, or must migration
  history remain immutable?
- Should the old Netlify URL redirect permanently, temporarily, or be retired?
- Should `/api/free-cash` be removed immediately after the app migrates, or kept
  as a compatibility alias for one beta release?
