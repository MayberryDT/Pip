# Pip Plaid Production + App-Open Refresh Now Plan

Date: 2026-06-16

Status: optimized plan only. Do not implement from this file until Tyler explicitly switches from planning to implementation.

## Definition Of Done

This work is complete only when all of these are true:

1. Production Pip never creates Plaid sandbox Link sessions.
2. `Manage accounts` -> `Add account` creates a production Plaid connect session on `https://spendwithpip.com`.
3. The existing Wise `provider-token-decrypt-failed` state is either recovered with the original provider-token key or intentionally replaced by a fresh production Plaid connection.
4. Opening the authenticated app triggers a server-owned app-open freshness check and, when due, refreshes provider data through the shared sync core.
5. Spendable Cash Today reloads from the refreshed snapshot after app-open sync succeeds.
6. Local gates pass, production evidence is captured, and `npm run check:prd-complete` has the proof it needs or clearly names only the final user-owned Plaid iframe step.

## Current Diagnosis

There are three distinct issues. Keep them separate while debugging.

### 1. Production Plaid Is Probably Reading Sandbox Env

Evidence and code shape:

- Prior live dogfood showed production Pip opening a `link-sandbox-...` Plaid Link token.
- `src/lib/providers/plaid/config.ts` treats only literal `PLAID_ENV=production` as production. Missing, empty, misspelled, or sandbox values silently become sandbox.
- `.env.example`, `README.md`, and `scripts/check-deployment-env.mjs` expect `PLAID_ENV=production` for beta mode, so a sandbox Link token in production points to Netlify runtime env drift, stale deploy output, or an unguarded runtime fallback.

Conclusion: restore and prove production Plaid env first, then add a runtime guard so this cannot silently regress.

### 2. The Wise Decrypt Failure Is A Separate Credential-Key Problem

Evidence and code shape:

- Prior live `/api/sync/status` showed Wise (US) failed with `provider-token-decrypt-failed`.
- `src/lib/providers/plaid/credential-store.ts` emits that code when stored Plaid token ciphertext cannot decrypt with the current `PIP_PROVIDER_TOKEN_KEY_BASE64`.
- Changing `PLAID_ENV` will not make an old undecryptable access token usable.
- `src/app/api/agent/route.ts` already has logic around `provider-token-decrypt-failed` requiring a fresh Plaid connection, so implementation should audit and complete that path rather than duplicate it.

Conclusion: either recover the original provider-token key or deliberately retire the old Wise item and connect fresh.

### 3. App-Open Refresh Exists But Is Not Strong Enough

Evidence and code shape:

- `src/components/PipHome.tsx` calls `/api/sync/manual` with `reason: "app_open"` after loading `/api/sync/status`.
- `src/app/api/sync/manual/route.ts` accepts `reason: "app_open"` and calls `runProviderSync`.
- `src/lib/data/manual-sync.ts` maps `app_open` to `app_open_refresh` reaction/event semantics.
- The durable freshness policy still lives mostly in the client: `hasAttemptedDailyRefresh` and `shouldRefreshConnectedDataForToday`.
- Current behavior is daily/stale-oriented, not a server-owned "every app open, subject to cooldown/idempotency" policy.

Conclusion: reuse the existing sync core, but move the app-open decision to the server and make the client a trigger, not the source of truth.

## Non-Goals And Boundaries

- Do not add money movement, payments, transfers, or balance-manipulation features.
- Do not build a dashboard or settings surface to solve this; account management stays chat/Pip-owned.
- Do not use standalone Playwright, shell-launched browsers, or external browser tools for live browser verification unless Tyler explicitly approves. Use the Codex in-app Browser first.
- Do not rewrite already-applied Supabase migrations. Use forward migrations or narrow admin scripts if schema/data changes are needed.
- Do not delete the old Wise data ad hoc. Any cleanup must be auditable and reversible enough for a beta incident.
- Do not mix unrelated dirty worktree changes into the implementation branch.

## Implementation Strategy

Use a narrow sequence:

1. Prove and fix external production env.
2. Add code guardrails so production cannot silently fall back to sandbox.
3. Resolve the existing Wise credential state.
4. Harden app-open refresh with a server-owned decision route.
5. Only then consider scheduled/background sync.

Preferred app-open architecture:

- Add a dedicated `POST /api/sync/app-open` route.
- The route reads authenticated sync status, pending jobs, and recent sync runs.
- It returns one of: `ran`, `skipped_fresh`, `skipped_pending`, `needs_repair`, `no_provider`, or `failed`.
- When due, it calls `runProviderSync(... reason: "app_open")` directly for immediate user-visible freshness.
- Keep `pip_sync_jobs` for scheduled/webhook/background work. Do not make active app opens wait on the queue unless a pending/running job already exists.
- Add one narrow production kill switch only if needed: `PIP_APP_OPEN_REFRESH_ENABLED`. Default it off during deploy proof, then enable once production connect is proven.

This avoids a new sync engine while making refresh policy testable and server-enforced.

## Phase 0 - Preflight And Evidence Freeze

Purpose: establish whether the live failure is external env, deployed code, stored credentials, or all three.

Actions:

1. Record worktree state.
   - Run `git status --short`.
   - Identify unrelated dirty files and keep them out of the implementation branch.
   - Prefer a clean worktree/branch for implementation, or explicitly stage only files touched by this plan.

2. Check Netlify production env without printing secret values.
   - Required: `PLAID_ENV=production`.
   - Required: production `PLAID_SECRET`, not Plaid sandbox secret.
   - Required: `PLAID_REDIRECT_URI=https://spendwithpip.com/plaid/oauth`.
   - Required: `NEXT_PUBLIC_SITE_URL=https://spendwithpip.com`.
   - Required and stable: `PIP_PROVIDER_TOKEN_KEY_BASE64`.
   - Note current values for `PIP_SYNC_JOBS_ENABLED` and `PIP_SCHEDULED_SYNC_ENABLED`.

3. Check Plaid Dashboard from the in-app Browser.
   - Confirm the production Plaid app is selected.
   - Confirm redirect URIs include `https://spendwithpip.com/plaid/oauth`.
   - Confirm webhook URL if webhook sync is enabled.

4. Check live app evidence.
   - Use the in-app Browser on production.
   - Trigger `Manage accounts` -> `Add account`.
   - Capture the server connect response or product event showing `environment`.
   - If interaction reaches Plaid's cross-origin iframe, stop at iframe existence and hand the final credential step to Tyler.

5. Check Supabase evidence.
   - Latest `connect_session_created` / `connect_session_failed` events.
   - Latest `plaid_exchange_succeeded` / `plaid_exchange_failed` events.
   - Latest `sync_runs`.
   - Authenticated `/api/sync/status`.
   - Whether Wise still reports `provider-token-decrypt-failed`.

Exit criteria:

- We know whether production currently has sandbox Plaid env.
- We know whether the latest deployed code is the code being inspected.
- We know whether the old Wise credential can possibly be decrypted with current env.

## Phase 1 - Restore Production Plaid Connect

Actions:

1. Fix Netlify env if Phase 0 shows drift.
   - Set production `PLAID_ENV=production`.
   - Set production `PLAID_SECRET`.
   - Keep `PLAID_REDIRECT_URI=https://spendwithpip.com/plaid/oauth`.
   - Redeploy only after local verification passes.

2. Add runtime guardrails in `src/lib/providers/plaid/config.ts`.
   - Keep sandbox defaults for local/test.
   - For production public origins, reject missing, invalid, or sandbox `PLAID_ENV`.
   - Use a safe `ProviderUnavailableError` path so the UI shows an actionable failure instead of opening sandbox Plaid.
   - Treat `https://spendwithpip.com` and Netlify production context as production surfaces.

3. Strengthen tests.
   - `getPlaidConfig`/connect-session test: production origin + missing env fails safe.
   - production origin + `PLAID_ENV=sandbox` fails safe.
   - local development + sandbox still works.
   - Link session response never exposes Plaid secret/access token.

4. Strengthen deployment check if needed.
   - Keep `npm run check:deployment` as the required beta env gate.
   - Ensure beta mode fails for `PLAID_ENV=sandbox`, localhost redirect URIs, and missing production site origin.

Verification:

- `npm run test -- src/lib/providers/plaid/config.test.ts`
- `npm run check:deployment`
- Production connect response reports Plaid `environment: "production"`.
- No new production `link-sandbox` evidence appears after deploy.

Rollback:

- If the runtime guard blocks real production connect because env detection is too broad, revert that deploy while leaving Netlify env corrected.
- Do not roll back to `PLAID_ENV=sandbox`; that is the incident state.

## Phase 2 - Resolve Wise `provider-token-decrypt-failed`

Actions:

1. Determine key recoverability.
   - Check whether the original `PIP_PROVIDER_TOKEN_KEY_BASE64` used when Wise was connected is available.
   - If recoverable, restore it and verify Wise sync.
   - If not recoverable, classify the old Wise credential as unrecoverable.

2. Audit existing fresh-connect routing.
   - Confirm `src/app/api/agent/route.ts` excludes `provider-token-decrypt-failed` from repair/update mode.
   - Confirm explicit repair/account-selection requests for that institution fall back to fresh `mode: "connect"`.
   - Confirm `src/components/data-controls-helpers.ts` does not present decrypt failure as ordinary repair if the server expects fresh connect.

3. Add or complete tests.
   - Agent route: undecryptable Plaid institution returns `open_plaid` fresh connect, not update mode.
   - Provider credential store: decrypt failure preserves institution id/name and returns safe `ProviderSyncError`.
   - Sync status/account card: UI copy tells the user to reconnect without leaking token details.

4. Add a narrow cleanup path only if key recovery fails.
   - Mark the old institution failed/replaced or archived with an audit event.
   - Preserve enough history for support/debugging.
   - Do not manually delete rows unless downstream references are mapped.

Verification:

- `/api/sync/status` no longer sends the user through update/repair for the undecryptable Wise token.
- Fresh production Plaid connect can exchange a public token.
- New credential sync succeeds with current `PIP_PROVIDER_TOKEN_KEY_BASE64`.
- Latest `sync_runs` has nonzero account/transaction/balance counts or a clearly isolated provider-side failure.

Rollback:

- If cleanup is wrong, restore from Supabase backup or revert only the cleanup action.
- If fresh-connect routing regresses account management, revert the code deploy without changing recovered token env.

## Phase 3 - Harden App-Open Refresh

Actions:

1. Add server-owned app-open decision.
   - Preferred route: `POST /api/sync/app-open`.
   - Auth required.
   - Load sync status, pending jobs, and latest sync run.
   - Return structured status even when no provider exists or no refresh is due.

2. Define due rules on the server.
   - Run if a refreshable connected provider exists and no provider sync is pending/running.
   - Run if there is no last successful sync.
   - Run if any refreshable institution is stale.
   - Run if latest successful sync is older than the cooldown.
   - Start with 10 minutes for beta unless Phase 0 live evidence shows Plaid rate/latency pressure.
   - Do not run if the only provider needs repair/reconnect; return `needs_repair`.

3. Keep provider sync shared.
   - Call `runProviderSync(supabase, { userId, provider, reason: "app_open" })`.
   - Do not duplicate snapshot, reaction, event, transaction, or account persistence logic.
   - Keep manual refresh route for explicit user requests.

4. Update the client trigger.
   - Replace durable reliance on `hasAttemptedDailyRefresh`.
   - On authenticated app mount, call `/api/sync/app-open` once after initial state load.
   - On `visibilitychange` back to visible, call it again only after local cooldown has elapsed.
   - On `ran`, reload `/api/pip-cash` and `/api/sync/status`.
   - On `skipped_*`, avoid UI churn.
   - On `needs_repair` or `failed`, keep cached Spendable Cash Today with stale/repair copy.

5. Prevent duplicate work.
   - Server enforces cooldown from latest successful or started sync run.
   - Server skips when `pip_sync_jobs` has pending/running jobs.
   - Server skips or rate-limits concurrent app-open calls from multiple tabs.

Verification:

- Route tests:
  - no provider -> `no_provider`.
  - no last successful sync -> runs `app_open`.
  - stale institution -> runs `app_open`.
  - fresh inside cooldown -> `skipped_fresh`.
  - pending/running job -> `skipped_pending`.
  - repair-only/decrypt-failed item -> `needs_repair`, no provider sync.
  - provider failure -> safe structured failure and sync status remains inspectable.

- Component tests:
  - app mount triggers app-open route for ready user.
  - successful `ran` reloads `/api/pip-cash` and `/api/sync/status`.
  - skipped responses do not loop.
  - visibility return after cooldown asks again.
  - onboarding/guest/consent states do not call app-open refresh.

Rollback:

- If app-open refresh causes production load or bad UX, disable the route with `PIP_APP_OPEN_REFRESH_ENABLED=false` if added, or revert the client trigger deploy.
- Manual refresh and Plaid connect must continue to work during rollback.

## Phase 4 - Enable Background Refresh Deliberately

This is after app-open refresh, not before.

Existing infrastructure:

- `netlify/functions/pip-scheduled-sync.ts`
- `src/lib/data/sync-jobs.ts`
- `PIP_SYNC_JOBS_ENABLED`
- `PIP_SCHEDULED_SYNC_ENABLED`

Actions:

1. Prove the scheduled function in disabled mode.
   - It should return `scheduled-sync-disabled` when flags are false.

2. Decide consent/settings semantics.
   - Current `manual_refresh_only` defaults toward manual-only behavior.
   - If Pip should refresh without user action, update product copy/settings semantics before enabling broad scheduled sync.

3. Enable for beta only after app-open is stable.
   - Set `PIP_SYNC_JOBS_ENABLED=true`.
   - Set `PIP_SCHEDULED_SYNC_ENABLED=true`.
   - Start with existing `PIP_SCHEDULED_SYNC_MIN_INTERVAL_MINUTES=240`.

4. Monitor dedupe and failures.
   - Confirm scheduled jobs dedupe by institution/provider.
   - Confirm failed repair-required jobs do not retry forever.
   - Confirm product events distinguish `scheduled`, `app_open`, and `manual`.

Exit criteria:

- Scheduled sync improves freshness without hiding app-open failures.
- Operator overview can identify stale/failed users.
- Disabling scheduled flags returns the system to app-open/manual refresh only.

## Phase 5 - Verification Matrix

Local gates:

- `npm run test`
- `npm run build`
- `npm run eval:agent`
- `npm run check:deployment`
- `npm run check:netlify-bundle`

Focused tests to add or verify:

- `src/lib/providers/plaid/config.test.ts`
- `src/app/api/providers/connect/route.test.ts`
- `src/app/api/providers/plaid/exchange/route.test.ts`
- `src/app/api/sync/manual/route.test.ts`
- New `src/app/api/sync/app-open/route.test.ts` if a new route is added.
- `src/components/PipHome.test.tsx`
- `src/lib/data/sync-jobs.test.ts`
- `src/lib/data/manual-sync-failure.test.ts`
- `src/app/api/agent/route.test.ts`

Production proof:

1. Deploy from the intended branch using `npm run deploy:netlify`.
2. Use the in-app Browser for live app/Plaid Dashboard verification.
3. Verify production Add Account creates Plaid production session.
4. If Plaid iframe interaction is needed, Tyler completes that one step.
5. After connect, verify:
   - `/api/sync/status` shows connected Plaid institution.
   - latest `sync_runs` includes a successful `app_open` or manual sync.
   - account/transaction/balance counts are nonzero when provider data is available.
   - `/api/pip-cash` freshness reflects the latest successful sync.
   - Spendable Cash Today is visible and not fake prototype data.
6. Write proof with `npm run proof:in-app-browser` if the proof route supports the captured evidence.
7. Finish with `npm run check:prd-complete`.

## Incident Rollback Plan

Rollback priority:

1. Preserve production Plaid env correctness.
2. Preserve user authentication and existing cached Spendable Cash Today display.
3. Disable app-open refresh before disabling manual refresh.
4. Revert code deploy before touching Supabase data.
5. Treat provider-token key changes as high-risk; do not rotate or overwrite without proof.

Rollback actions:

- Plaid env fix causes connect failures: verify env names/secrets first, then revert only the runtime guard if needed.
- App-open refresh loops or hits rate pressure: disable `PIP_APP_OPEN_REFRESH_ENABLED` if present, or revert client trigger.
- Scheduled sync causes load/failures: set `PIP_SCHEDULED_SYNC_ENABLED=false`; keep app-open/manual.
- Wise cleanup mistake: restore from backup or reverse the narrow cleanup action; do not mass-delete provider rows.

## Open Decisions

Decide before implementation:

1. Can the old `PIP_PROVIDER_TOKEN_KEY_BASE64` be recovered?
2. Is the app-open cooldown 10 minutes, or should beta start at 15 minutes?
3. Should `PIP_APP_OPEN_REFRESH_ENABLED` be added as a temporary kill switch?
4. Should scheduled sync require explicit consent copy, or is current consent sufficient?
5. Should the production Plaid guard apply to all public HTTPS origins or only `spendwithpip.com` plus Netlify production context?

Recommended defaults:

- If the old token key is not quickly recoverable, reconnect Wise fresh.
- Use a 10-minute app-open cooldown for beta.
- Add the app-open kill switch if deploying before extended dogfood.
- Keep scheduled sync disabled until app-open refresh is proven.
- Guard all known production public origins; allow sandbox only for local/test/fake flows.

## Optimizer Record

Rubric used:

- Goal clarity and completion criteria: 15
- Correct diagnosis and separation of failure modes: 15
- Sequencing and dependency control: 15
- Repo-specific implementation specificity: 15
- Risk, rollback, and data safety: 15
- Verification and live proof quality: 15
- Simplicity and scope discipline: 10

Score trajectory:

- Initial plan: 82 / 100
- Round 1: 90 / 100, added explicit exit criteria, rollback, and branch/env hygiene.
- Round 2: 94 / 100, chose a preferred app-open route architecture and aligned tests to repo seams.
- Round 3: 94 / 100, plateau; further changes were mostly formatting rather than substantive risk reduction.
