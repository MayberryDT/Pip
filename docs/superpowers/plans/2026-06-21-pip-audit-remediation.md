# Pip Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent task groups, or `superpowers:executing-plans` for sequential execution. Track progress by checking off each `- [ ]` item as it is completed.

**Goal:** Close the audit findings that can block a broad Pip production release, then harden the remaining security, privacy, release, accessibility, and debt findings with verifiable evidence.

**Non-goals:** Do not redesign Pip, do not refactor the AI agent broadly before the safety fixes land, and do not change financial calculation semantics except where tests prove the audit finding requires it.

**Definition of done:**
- Auth callback and OAuth `next` handling reject encoded cross-origin bypasses.
- All AI model entry points hit an app-level limiter before model execution.
- Browser-authenticated clients cannot write provider-derived financial tables.
- Sensitive API responses are `private, no-store`; app routes have CSP and HSTS.
- Homepage spending copy is estimate-based, not guarantee-based.
- `/app` does not immediately duplicate its server-side financial read.
- Agent chat logs have bounded/minimized storage and purge mechanics.
- Account deletion is idempotent and retryable if Supabase Auth deletion fails.
- CI exists, framework dependencies are pinned, and release checks pass.
- Mobile chat controls meet target-size and live-region expectations.

**Architecture:** Fix release blockers first, then hardening, then debt. Keep each task small enough to review independently. Use service-role/admin code only on trusted server routes and preserve user ownership checks at route boundaries.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase/Postgres migrations, Supabase RLS, Netlify headers, Node 24, Codex in-app Browser `iab` for browser verification.

---

## Optimizer Result

Rubric used:

| Criterion | Weight | Final | Rationale |
| --- | ---: | ---: | --- |
| Release-risk coverage | 25 | 24 | All high/medium-high findings have explicit gates and rollback notes. |
| Executability | 20 | 19 | Steps name files, tests, and acceptance criteria without overfitting brittle code snippets. |
| Sequencing/dependencies | 15 | 15 | P0 blockers precede hardening; DB migrations wait for route conversions. |
| Verification quality | 15 | 14 | Local, preview, browser, and Supabase checks are separated. |
| Data/security safety | 15 | 14 | RLS, limiter failure modes, chat retention, and deletion saga are explicit. |
| Minimality/maintainability | 10 | 8 | Debt cleanup is deferred; core fixes stay surgical. |

Final score: **94/100**.

Score trajectory: `78 -> 88 -> 93 -> 94 -> 94`.

Substantive improvements over the first plan:
- Replaced brittle pasted implementations with contracts, inventories, and acceptance tests.
- Added migration ordering, recovery, and deployed-policy verification.
- Made hidden product decisions explicit, especially OAuth next-path allowlisting and account-deletion semantics.

---

## Execution Rules

- Start from a real branch before implementation. This worktree is currently likely detached, so create a branch such as `codex/pip-audit-remediation` before code changes.
- Treat Tasks 1-3 as **P0 release blockers**. Do not mark the release ready until all three pass locally and are verified against the target Supabase project or a staging project.
- Treat Tasks 4-10 as **P1 production hardening**. They can be separate PRs if needed, but should land before broad public release.
- Treat Task 11 as **P2 debt cleanup**. Do not let it delay the P0/P1 fixes.
- Use TDD for each task: add a failing test or explicit verification first, then implement, then rerun the focused checks.
- Keep commits task-sized. Do not mix RLS migration work with UI copy or accessibility changes.
- For browser verification, use the Codex in-app Browser `iab` backend first. Do not use standalone Playwright/browser-control as a fallback unless Tyler explicitly approves it.
- For every Supabase migration, include:
  - local/static test coverage,
  - deployed SQL verification query,
  - recovery notes describing how to restore access if the migration blocks production behavior.

---

## Preflight

- [ ] **Step 1: Create an implementation branch**

Run:

```bash
git status --short --branch
git switch -c codex/pip-audit-remediation
```

Expected: branch created from the current worktree state. If a branch already exists, use it instead of creating a duplicate.

- [ ] **Step 2: Capture baseline checks**

Run:

```bash
npm test
npm run build
npm run check:deployment
npm run check:db-schema-names
```

Expected: record current pass/fail state before remediation. If unrelated failures already exist, note them in the PR and keep focused task tests green.

- [ ] **Step 3: Confirm target Supabase workflow**

Identify whether migrations will be verified against local Supabase, a staging project, or production. Do not apply P0 RLS migrations to production until the route conversions in Task 3 pass tests.

---

## Phase 1: P0 Release Blockers

### Task 1: Fix Post-Auth Redirect Validation

**Files:**
- Create `src/lib/url/safe-next-path.ts`
- Create `src/lib/url/safe-next-path.test.ts`
- Modify `src/app/api/auth/oauth/google/route.ts`
- Modify `src/app/auth/callback/route.ts`
- Modify `src/app/api/auth/oauth/google/route.test.ts`
- Modify `src/app/auth/callback/route.test.ts`

**Decision:** OAuth and auth callbacks should only redirect to explicit first-party app destinations. Current tests use `/welcome` as a generic same-origin path; update those tests to encode the real product rule instead of preserving a broad same-origin redirect.

Recommended allowlist:
- `/app`
- `/app/...`
- `/app?...`

- [ ] **Step 1: Add utility tests**

Cover these cases:
- rejects `https://evil.example`
- rejects `//evil.example`
- rejects `/\evil.example`
- rejects `/%5Cevil.example`
- rejects `/%2F%2Fevil.example`
- rejects `/%2f%5cevil.example`
- rejects control characters and newline header-smuggling strings
- rejects same-origin but non-allowlisted paths such as `/welcome`
- accepts `/app`, `/app?auth=ok`, and safe `/app/...` subpaths

Run:

```bash
npm test -- src/lib/url/safe-next-path.test.ts
```

Expected before implementation: FAIL because the helper does not exist.

- [ ] **Step 2: Implement one shared validator**

Implement `getSafeAuthNextPath(next, origin)` in `src/lib/url/safe-next-path.ts`.

Implementation contract:
- Default to `/app`.
- Reject raw backslashes before URL construction.
- Reject percent-decoded backslashes, protocol-relative forms, and encoded leading slashes.
- Reject control characters.
- Resolve with `new URL(next, origin)` and require the resolved origin to match `origin`.
- Require the resolved pathname to be `/app` or start with `/app/`.
- Return only `pathname + search`, never an absolute URL.

- [ ] **Step 3: Wire both routes**

Use the helper in:
- `src/app/api/auth/oauth/google/route.ts`
- `src/app/auth/callback/route.ts`

Remove the duplicate local `getSafeNextPath` functions.

- [ ] **Step 4: Update route tests**

Update existing `/welcome` expectations to `/app` or `/app?...` as appropriate.

Add regression tests for:
- encoded backslash callback redirect
- mixed encoded slash/backslash callback redirect
- OAuth start URL construction with unsafe `next`
- canonical-origin redirect behavior on Netlify preview headers

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/lib/url/safe-next-path.test.ts src/app/auth/callback/route.test.ts src/app/api/auth/oauth/google/route.test.ts
```

Expected: PASS.

Recovery note: this change is fully reversible in app code. If a legitimate post-auth destination is discovered, add that path to the allowlist with a regression test instead of reopening broad same-origin redirects.

Commit:

```bash
git add src/lib/url/safe-next-path.ts src/lib/url/safe-next-path.test.ts src/app/auth/callback/route.ts src/app/auth/callback/route.test.ts src/app/api/auth/oauth/google/route.ts src/app/api/auth/oauth/google/route.test.ts
git commit -m "fix: harden auth next redirects"
```

### Task 2: Add AI Model Rate Limits, Quotas, and Concurrency Guard

**Files:**
- Create `supabase/migrations/*_agent_model_gate.sql`
- Create `src/lib/agent/agent-model-gate.ts`
- Create `src/lib/agent/agent-model-gate.test.ts`
- Modify `src/app/api/agent/route.ts`
- Modify `src/app/api/agent/route.test.ts`

**Safety contract:** No request path should call `runAIAgent` until the model gate has allowed it. If the limiter is unavailable in production, fail closed with a safe `503` response and do not call the model.

- [ ] **Step 1: Add model-gate tests**

Cover:
- guest `chat`, `prompt_chips`, and `opening_bubble` have stricter quotas than signed-in users
- signed-in scope hashes by `user.id`; guest scope hashes by IP and user agent
- raw user IDs, IPs, and user agents are not stored in limiter keys
- over-limit returns `429` with `Retry-After`
- limiter backend failure returns `503` and does not call the model
- leases are released after success and after model errors

Run:

```bash
npm test -- src/lib/agent/agent-model-gate.test.ts src/app/api/agent/route.test.ts
```

Expected before implementation: FAIL for missing module and missing route behavior.

- [ ] **Step 2: Add Supabase primitives**

Create a migration with service-role-only tables/functions for:
- per-scope request windows
- global active model leases
- atomic claim of minute/day windows plus active lease
- lease release
- cleanup of expired leases

Required behavior:
- `anon` and `authenticated` cannot read or mutate limiter tables.
- only service role can execute claim/release functions.
- global concurrency is counted across active leases.
- per-scope windows are keyed by hash, not raw identifiers.

Do not deploy this migration before route tests pass.

- [ ] **Step 3: Implement `agent-model-gate`**

Module responsibilities:
- classify request kind: `chat`, `prompt_chips`, `opening_bubble`
- choose quota plan from onboarding state and request kind
- compute salted scope hash
- call Supabase RPCs using admin/service-role client
- return typed allow/deny/failure results
- expose a release helper that swallows release errors only after logging a safe message

Production requirement: configure `PIP_RATE_LIMIT_SALT`; tests should verify a deterministic test salt path.

- [ ] **Step 4: Wire `/api/agent`**

In `src/app/api/agent/route.ts`:
- parse request body as today
- build route context as today
- call the gate before `runAIAgent`
- return `429` for denied quota
- return `503` for limiter infrastructure failure
- wrap the model call and post-model telemetry in `try/finally` so leases are released
- apply `Cache-Control: private, no-store` to agent responses, or use the helper from Task 4 once it exists

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/lib/agent/agent-model-gate.test.ts src/app/api/agent/route.test.ts src/lib/agent/model-first-policy.test.ts
```

Expected: PASS.

Recovery note: if the limiter blocks legitimate traffic after deploy, raise quota constants and redeploy app code. Do not grant browser roles access to limiter tables as a recovery path.

Commit:

```bash
git add supabase/migrations src/lib/agent/agent-model-gate.ts src/lib/agent/agent-model-gate.test.ts src/app/api/agent/route.ts src/app/api/agent/route.test.ts
git commit -m "fix: gate agent model usage"
```

### Task 3: Restrict Browser Writes to Provider-Derived Financial Tables

**Files:**
- Create `supabase/migrations/*_restrict_financial_table_writes.sql`
- Modify `src/lib/data/supabase-schema.test.ts`
- Modify provider/sync routes and repositories that write provider-derived rows
- Modify affected route/repository tests

**Risk:** This is the highest-blast-radius change. Convert server write paths before applying RLS restrictions to the target project.

- [ ] **Step 1: Inventory writes**

Run:

```bash
rg -n "\\.from\\(\"(connected_institutions|accounts|transactions|sync_runs|pip_cash_snapshots|free_cash_snapshots)\"\\)" src
```

Classify each result:
- server provider/sync write that must move to an admin client with explicit `user.id`
- user preference write currently stored on a provider-derived table
- read-only query

Write the classification into the PR description or a short local note before making changes.

- [ ] **Step 2: Add failing policy/schema tests**

Update `src/lib/data/supabase-schema.test.ts` to assert the desired final policy state for:
- `connected_institutions`
- `accounts`
- `transactions`
- `sync_runs`
- `pip_cash_snapshots`
- `free_cash_snapshots`

Expected final state:
- `authenticated` can `select` own rows through RLS.
- `authenticated` cannot `insert`, `update`, or `delete` provider-derived rows directly.
- service-role/admin server paths can still write after route authentication.

Run:

```bash
npm test -- src/lib/data/supabase-schema.test.ts
```

Expected before migration: FAIL.

- [ ] **Step 3: Convert trusted write paths**

For each server route that writes provider-derived rows:
- authenticate the user with `createSupabaseServerClient().auth.getUser()`
- create `createSupabaseAdminClient()` only after user authentication succeeds
- pass `user.id` explicitly into repository functions
- ensure every service-role write includes `user_id: user.id` or `.eq("user_id", user.id)`

Do not use admin clients in client components or shared browser-executed modules.

If account/institution preference writes are stored in provider-derived tables, expose a server route that validates ownership and performs the update with the admin client. Do not preserve direct browser writes just because the preference is user-editable.

- [ ] **Step 4: Add RLS migration**

Migration contract:
- drop authenticated write policies on provider-derived tables
- revoke `insert`, `update`, and `delete` grants from `authenticated` where present
- keep authenticated select policies for own rows
- do not revoke service-role access

Add comments in the migration explaining the recovery path: restore the previous authenticated write policies only if a production rollback is required.

- [ ] **Step 5: Verify local app behavior**

Run focused tests:

```bash
npm test -- src/lib/data/supabase-schema.test.ts src/lib/data/financial-repository.test.ts src/lib/data/manual-sync-failure.test.ts src/app/api/providers/plaid/exchange/route.test.ts src/app/api/providers/teller/enrollment/route.test.ts src/app/api/sync/manual/route.test.ts src/app/api/sync/app-open/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify deployed/staging policies**

After applying migrations to staging or the target Supabase project, run:

```sql
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'connected_institutions',
    'accounts',
    'transactions',
    'sync_runs',
    'free_cash_snapshots',
    'pip_cash_snapshots'
  )
order by tablename, policyname;
```

Also verify grants:

```sql
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in (
    'connected_institutions',
    'accounts',
    'transactions',
    'sync_runs',
    'free_cash_snapshots',
    'pip_cash_snapshots'
  )
order by table_name, privilege_type;
```

Expected: authenticated has read-only access on these tables. No authenticated write grants remain.

Recovery note: if manual sync/provider enrollment breaks in staging, fix the server write path. Only restore old policies as an emergency production rollback, and follow with a corrected migration.

Commit:

```bash
git add supabase/migrations src/lib/data src/app/api/providers src/app/api/sync
git commit -m "fix: restrict financial table writes"
```

---

## Phase 2: P1 Production Hardening

### Task 4: Add CSP, HSTS, and No-Store Sensitive Responses

**Files:**
- Create `src/lib/security/http-cache.ts`
- Modify `next.config.ts`
- Modify `netlify.toml`
- Modify `src/app/security-headers.test.ts`
- Modify sensitive API routes under `src/app/api/**/route.ts`

- [ ] **Step 1: Inventory sensitive routes**

Start with:
- `/api/agent`
- `/api/pip-cash`
- `/api/sync/status`
- `/api/sync/manual`
- `/api/sync/app-open`
- `/api/operator/overview`
- `/api/operator/agent-chats`
- `/api/account/delete`
- `/api/delete-data`
- `/api/settings`
- `/api/savings-goals`
- `/api/savings-goals/[goalId]`

Add any route that returns user financial state, auth state, operator data, settings, or deletion status.

- [ ] **Step 2: Add no-store helper and tests**

Create `sensitiveJson()` in `src/lib/security/http-cache.ts` that applies:

```http
Cache-Control: private, no-store
```

Add route tests that assert the header for the sensitive routes above.

- [ ] **Step 3: Add CSP/HSTS with consistency tests**

Add security headers to both `next.config.ts` and `netlify.toml`.

Use the narrowest practical CSP allowlist based on actual browser-side usage. Do not add server-only endpoints such as OpenAI unless the browser actually connects to them.

Minimum policy goals:
- `default-src 'self'`
- `base-uri 'self'`
- `frame-ancestors 'none'`
- `object-src 'none'`
- image sources for self/data/blob/https as needed
- connect/frame sources for Supabase and financial-provider browser flows as needed
- HSTS: `max-age=31536000; includeSubDomains; preload`

Add `src/app/security-headers.test.ts` to prevent `next.config.ts` and `netlify.toml` from drifting.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/app/security-headers.test.ts src/app/api/agent/route.test.ts src/app/api/pip-cash/route.test.ts src/app/api/operator/overview/route.test.ts src/app/api/operator/agent-chats/route.test.ts
npm run build
```

Preview verification:

```bash
curl -I https://<preview-host>/app
curl -I https://<preview-host>/api/pip-cash
```

Expected: app routes include CSP/HSTS; sensitive API routes include `private, no-store`.

Commit:

```bash
git add src/lib/security/http-cache.ts next.config.ts netlify.toml src/app/security-headers.test.ts src/app/api
git commit -m "fix: harden security headers"
```

### Task 5: Calibrate Homepage Spending Copy

**Files:**
- Modify `src/app/page.tsx`
- Modify existing marketing/language tests

- [ ] **Step 1: Add copy boundary test**

Assert the homepage no longer contains:

```text
Yes. You still have $84 for today.
```

Assert the replacement includes estimate language and a pending/missing activity caveat.

- [ ] **Step 2: Replace copy**

Use language like:

```text
After a $50 purchase, today's estimate would be about $84, assuming no missing or pending activity.
```

- [ ] **Step 3: Verify**

Run:

```bash
npm test -- src/app/marketing-pages.test.tsx src/app/pip-language-boundary.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/app/page.tsx src/app/marketing-pages.test.tsx src/app/pip-language-boundary.test.ts
git commit -m "fix: calibrate spending example copy"
```

### Task 6: Remove Duplicate Startup Reads and Separate Telemetry

**Files:**
- Modify `src/lib/data/current-snapshot.ts`
- Modify `src/lib/data/current-snapshot.test.ts`
- Modify `src/app/app/page.tsx`
- Modify `src/components/PipHome.tsx`
- Modify `src/components/PipHome.test.tsx`

- [ ] **Step 1: Add tests**

Add tests that prove:
- `PipHome` renders the server-provided `initialResult` without a loading-only interstitial.
- `PipHome` does not immediately fetch `/api/pip-cash` on mount when a live `initialResult` is present.
- an explicit reload still fetches `/api/pip-cash`.
- `getCurrentPipCashState({ recordFreshnessViewed: false })` does not write `pip_freshness_viewed`.

- [ ] **Step 2: Add explicit telemetry flag**

Change `getCurrentPipCashState` to accept:

```ts
recordFreshnessViewed?: boolean
```

Default to no telemetry for library calls unless the route/page explicitly opts in. `/app` server load should record the view once. Duplicate client reads should not create a second event.

- [ ] **Step 3: Reuse server payload in `PipHome`**

When `initialResult` is present:
- initialize the financial state from it
- skip the immediate `/api/pip-cash` fetch
- keep the sync-status fetch only if that data is not already present in the server payload
- preserve explicit refresh behavior

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/components/PipHome.test.tsx src/lib/data/current-snapshot.test.ts src/app/api/pip-cash/route.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/lib/data/current-snapshot.ts src/lib/data/current-snapshot.test.ts src/app/app/page.tsx src/components/PipHome.tsx src/components/PipHome.test.tsx
git commit -m "fix: avoid duplicate app startup reads"
```

### Task 7: Add Chat Retention, Minimization, and Operator No-Store

**Files:**
- Create `supabase/migrations/*_agent_chat_retention.sql`
- Create `scripts/privacy/purge-agent-chat-turns.mjs`
- Modify `package.json`
- Modify `src/lib/data/agent-chat-turns.ts`
- Modify `src/lib/data/agent-chat-turns.test.ts`
- Modify `src/app/api/operator/agent-chats/route.ts`
- Modify `src/app/api/operator/overview/route.ts`

- [ ] **Step 1: Define the storage contract**

Final chat-log behavior:
- store bounded sanitized excerpts, not unlimited raw transcripts
- do not store raw `history`, `conversationState`, account numbers, card numbers, or provider payloads in `request_metadata`
- keep operational fields needed for debugging: mode, tools, card types, model, transport, error code, guidance summary
- purge rows older than the configured retention window
- return operator responses with `private, no-store`

- [ ] **Step 2: Add tests**

Cover:
- user and assistant messages are truncated to a fixed maximum length
- sensitive patterns are redacted
- metadata is allowlisted
- raw history/conversation state is dropped
- operator routes include `Cache-Control: private, no-store`

- [ ] **Step 3: Implement minimization**

Update `recordAgentChatTurn` and local dev logging to use the same minimization path.

Add constants for:
- max stored user excerpt length
- max stored assistant excerpt length
- allowed metadata keys
- retention default days

- [ ] **Step 4: Add purge migration and script**

Migration contract:
- security-definer function deletes old `agent_chat_turns`
- function is executable only by service role
- retention days defaults to 30 unless `PIP_AGENT_CHAT_RETENTION_DAYS` overrides it in the script

Add package script:

```json
"privacy:purge-agent-chats": "node scripts/privacy/purge-agent-chat-turns.mjs"
```

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/lib/data/agent-chat-turns.test.ts src/app/api/operator/agent-chats/route.test.ts src/app/api/operator/overview/route.test.ts
```

Expected: PASS.

Commit:

```bash
git add supabase/migrations scripts/privacy/purge-agent-chat-turns.mjs package.json src/lib/data/agent-chat-turns.ts src/lib/data/agent-chat-turns.test.ts src/app/api/operator
git commit -m "fix: minimize and expire agent chat logs"
```

### Task 8: Make Account Deletion Retryable and Non-Orphaning

**Files:**
- Create `supabase/migrations/*_account_deletion_requests.sql`
- Modify `src/app/api/account/delete/route.ts`
- Modify `src/app/api/account/delete/route.test.ts`
- Modify `src/app/delete-account/page.tsx`
- Consider adding an admin-by-user-id deletion helper in `src/lib/data/financial-repository.ts`

**Constraint:** Supabase Auth deletion and public-table deletion are not one database transaction from this route. Implement an idempotent saga with durable status instead of pretending the operation is atomic.

- [ ] **Step 1: Add deletion status migration**

Create `account_deletion_requests` with:
- `user_id`
- `status` values for requested/data_deleted/auth_deleted/completed/failed
- `last_error_code`
- timestamps for each stage
- unique active request constraint or deterministic upsert key per user

Restrict direct access to service role.

- [ ] **Step 2: Add route tests**

Cover:
- no sign-out when auth deletion fails
- retry after data deletion failure resumes safely
- retry after data already deleted still attempts auth deletion
- response is `private, no-store`
- unauthenticated users cannot start deletion

- [ ] **Step 3: Implement idempotent route**

Route contract:
- authenticate the user first
- validate the `DELETE` confirmation
- create or update the deletion request with admin client
- delete app/public data by explicit `user.id` using admin code
- mark data deletion complete
- delete Supabase Auth user
- only then sign out the browser session
- if auth deletion fails, mark failed and return `500` without signing out

Do not rely on the user-scoped client for destructive cleanup after the saga starts.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/app/api/account/delete/route.test.ts src/app/api/delete-data/route.test.ts src/lib/data/financial-repository.test.ts
```

Expected: PASS.

Recovery note: failed deletion requests are intentionally visible in the table for manual retry. Do not delete failed request rows until the account is completed or a manual operator decision is recorded.

Commit:

```bash
git add supabase/migrations src/app/api/account/delete/route.ts src/app/api/account/delete/route.test.ts src/app/delete-account/page.tsx src/lib/data/financial-repository.ts src/lib/data/financial-repository.test.ts
git commit -m "fix: make account deletion retryable"
```

### Task 9: Add CI and Pin Framework Versions

**Files:**
- Create `.github/workflows/ci.yml`
- Modify `package.json`
- Modify `package-lock.json`

- [ ] **Step 1: Pin installed framework versions**

Run:

```bash
npm list next react react-dom
```

Replace `latest` with the exact installed versions reported by `npm list` or `package-lock.json`.

Also add a Node engine matching Netlify:

```json
"engines": {
  "node": "24.x"
}
```

- [ ] **Step 2: Regenerate lockfile**

Run:

```bash
npm install --package-lock-only
```

Expected: lockfile updates only for dependency metadata needed by the pinned declarations.

- [ ] **Step 3: Add CI workflow**

Create `.github/workflows/ci.yml` with Node 24 and npm cache.

Required checks:
- `npm ci`
- `npm test`
- `npm run build`
- `npm run check:deployment`
- `npm run check:db-schema-names`
- `npm run play:android-copy:verify`

Do not put secret-dependent live smoke tests or paid model evals in the default PR workflow.

- [ ] **Step 4: Verify locally**

Run:

```bash
npm test
npm run build
npm run check:deployment
npm run check:db-schema-names
npm run play:android-copy:verify
```

Expected: PASS or documented pre-existing failure with focused changed tests passing.

Commit:

```bash
git add .github/workflows/ci.yml package.json package-lock.json
git commit -m "chore: require CI and pin frameworks"
```

### Task 10: Fix Mobile Accessibility Targets and Chat Live Region

**Files:**
- Modify `src/components/PromptChips.tsx`
- Modify `src/components/PromptChips.test.tsx`
- Modify `src/components/AgentThread.tsx`
- Modify `src/components/AgentThread.test.tsx`
- Modify `src/app/globals.css`

- [ ] **Step 1: Add tests**

Cover:
- prompt chips expose at least a 44px target class/size
- report controls expose at least a 44px target class/size
- chat thread has `role="log"`, `aria-live="polite"`, and `aria-relevant="additions text"`
- reduced-motion preference changes scroll behavior to non-smooth

- [ ] **Step 2: Update target sizes**

Use existing styling patterns, but ensure:
- prompt chips use a minimum 44px height
- compact prompt tray still uses a minimum 44px height
- report trigger and report dialog action buttons use a minimum 44px height
- text still fits within compact/mobile layouts

- [ ] **Step 3: Add live-region semantics and reduced-motion scroll**

Add log semantics to the scroll container.

Use `window.matchMedia("(prefers-reduced-motion: reduce)")` to choose `auto` instead of `smooth` scrolling when reduced motion is preferred.

- [ ] **Step 4: Verify tests**

Run:

```bash
npm test -- src/components/AgentThread.test.tsx src/components/PromptChips.test.tsx src/components/AgentInput.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Verify in browser**

Start:

```bash
npm run dev
```

Use Codex in-app Browser `iab` for mobile and desktop smoke checks at:

```text
http://localhost:3000/app?onboarding=guest
http://localhost:3000/app?onboarding=ready
```

Expected:
- prompt chips are tappable and do not overlap the composer
- report controls open/close without overlap
- new assistant messages append in the log region
- reduced-motion mode does not force smooth scrolling

Commit:

```bash
git add src/components/PromptChips.tsx src/components/PromptChips.test.tsx src/components/AgentThread.tsx src/components/AgentThread.test.tsx src/app/globals.css
git commit -m "fix: improve mobile chat accessibility"
```

---

## Phase 3: P2 Debt Cleanup

### Task 11: Reduce Release Debt Without Blocking Security Fixes

**Files:**
- Modify `src/proxy.ts`
- Modify `mobile/android-twa/DEPRECATED.md`
- Modify `mobile/android-twa/README.md`
- Modify `src/app/sitemap.ts`
- Modify `src/lib/marketing/site.ts` if needed
- Split `src/lib/agent/ai-agent.ts` only after P0/P1 work is stable

- [ ] **Step 1: Narrow proxy matcher**

Before changing `src/proxy.ts`, list routes that genuinely require Supabase session refresh or auth proxy behavior.

Candidate matcher:

```ts
matcher: [
  "/app/:path*",
  "/auth/:path*",
  "/api/:path*",
  "/plaid/oauth",
  "/reviewer-login",
]
```

Verify:

```bash
npm test -- src/lib/url/app-origin.test.ts src/app/auth/callback/route.test.ts
npm run build
```

Use in-app Browser `iab` to smoke `/`, `/pricing`, `/security`, `/app`, and auth callback flows before shipping.

- [ ] **Step 2: Deprecate the TWA shell; do not remove it yet**

Create `mobile/android-twa/DEPRECATED.md`:

```md
# Deprecated

This Trusted Web Activity shell is not the release Android target. Use `mobile/android-webview`.
Do not build or publish this shell unless a separate migration plan reactivates it.
```

Link it from `mobile/android-twa/README.md`.

Verify:

```bash
npm run play:android-copy:verify
```

- [ ] **Step 3: Stop hardcoding sitemap dates**

Move marketing page update dates into the marketing metadata source and have `src/app/sitemap.ts` read from that source.

Verify:

```bash
npm test -- src/app/marketing-pages.test.tsx
```

- [ ] **Step 4: Defer `ai-agent.ts` split**

Do not refactor `src/lib/agent/ai-agent.ts` until Tasks 1-10 are merged or stable on the implementation branch.

When ready, split in this order and rerun agent tests after each move:
- tool schema declarations
- prompt construction
- response assembly
- savings-goal tool execution

Verification after each move:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/model-first-policy.test.ts
npm run eval:agent:major
```

Commit:

```bash
git add src/proxy.ts mobile/android-twa src/app/sitemap.ts src/lib/marketing/site.ts src/lib/agent
git commit -m "chore: reduce release debt"
```

---

## Final Verification Gate

Run local checks:

```bash
npm test
npm run build
npm run check:deployment
npm run check:db-schema-names
npm run eval:agent:major
npm run dogfood:major:production-safe
npm run play:android-copy:verify
```

Run local browser smoke with Codex in-app Browser `iab`:

```bash
npm run dev
```

Smoke paths:
- `/`
- `/app?onboarding=guest`
- `/app?onboarding=consent`
- `/app?onboarding=ready`
- `/security`
- `/delete-account`

Deploy preview and verify headers:

```bash
curl -I https://<preview-host>/
curl -I https://<preview-host>/app
curl -I https://<preview-host>/api/pip-cash
```

Verify deployed Supabase RLS:

```sql
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'connected_institutions',
    'accounts',
    'transactions',
    'sync_runs',
    'free_cash_snapshots',
    'pip_cash_snapshots'
  )
order by tablename, policyname;
```

```sql
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in (
    'connected_institutions',
    'accounts',
    'transactions',
    'sync_runs',
    'free_cash_snapshots',
    'pip_cash_snapshots'
  )
order by table_name, privilege_type;
```

Expected final evidence:
- encoded redirect bypasses fall back to `/app`
- model gate returns 429/503 before model execution when appropriate
- authenticated browser roles cannot write provider-derived financial rows
- sensitive API responses are no-store
- app routes expose CSP and HSTS
- spending copy is calibrated as an estimate
- `/app` avoids the duplicate startup financial read
- chat logs are minimized and purgeable
- failed account deletion can be retried without signing the user out
- CI exists and framework dependencies are pinned
- mobile controls meet target-size and live-region expectations

