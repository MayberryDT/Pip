# Pip

Mobile-first, agent-first Pip app with fake-data mode, Google OAuth Supabase flows, Plaid connection support, and OpenAI Agents SDK tooling. The user-facing daily metric is Spendable Cash Today.

Pip shows the number your bank won't show you: what is actually spendable today. The product stays intentionally narrow: one number, ask Pip, no dashboard, no menus, and true balances only when the user asks.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Marketing Content

The public marketing site lives at `/`; the authenticated/beta app stays behind `/app`.
Public calls to action collect email waitlist signups. `/app` uses Google OAuth to collect a
verified app-access request, then requires an active operator-managed grant before the app or agent
routes are available.
Marketing articles are version-controlled Markdown files with validated frontmatter and a small
custom block syntax for product-led callouts, Pip says notes, money examples, comparisons, inline
CTAs, pull quotes, and figures.

Published articles must pass the content quality gates in the marketing content tests. Pillar
articles need at least 900 body words; other published articles need at least 700. Published posts
also need FAQ entries, related links, a useful H2 structure, and an inline CTA block. Short ideas and
outlines should stay `draft` until expanded.

Distribb is draft intake only. The webhook stores received payloads in `marketing_content_drafts`
with `status: received`; it must not create public pages or publish article files directly. A human
reviews the draft, rewrites it in Pip voice, adds examples/rich blocks/FAQ/CTA, converts it to an
article file, and runs the content tests before publishing.

Marketing launch rollback rule: if root marketing changes break `/app`, auth callbacks, provider
OAuth returns, waitlist submission, public page rendering, or published article routing, restore the
previous working route/content behavior before continuing polish work. The public site should never
ship at the cost of blocking beta app access.

## Netlify

The project is linked to `spendwithpip` on Netlify.

- Public site URL: https://spendwithpip.com/
- App route: https://spendwithpip.com/app
- Latest verified production deploy: https://6a37265034af39c993db28dc--spendwithpip.netlify.app
- Latest verified draft deploy: https://6a2a780edf4805a6c39e47e5--spendwithpip.netlify.app
- Netlify is configured for real beta mode with Supabase, Netlify AI Gateway/OpenAI, and Plaid production env. Fake-data preview deploys remain available with `PIP_DEPLOY_MODE=fake npm run deploy:netlify`.
- `npm run deploy:netlify` hides local `.env*` files during the local Netlify build, deploys the verified generated Netlify artifacts, and checks generated function bundles for accidental env-file inclusion and required Next static assets.

## AI Agent

`/api/agent` uses the official OpenAI Agents SDK on top of the Responses API. Pip can answer conversationally without a tool, call deterministic app tools when it needs setup state or financial facts, and decide whether to show a card, update context, or ask a clarification. The internal Pip Cash engine still owns all money math.

Agent tools return deterministic financial facts and available typed cards. The model may choose when to call tools and how to explain the result, but it does not emit card selectors or card payloads in final structured output. The server derives final cards only from tool-produced card objects before returning them to the UI. Conversation state is bounded to recent messages, recent shown card types/titles, and recent tool names so the agent can avoid repeating the same card.

Guest onboarding, protected-savings consent, Plaid connect/repair, manual refresh, and delete-data confirmation also go through `/api/agent`. The model writes the visible chat reply, while server tools perform deterministic side effects and may return a typed `clientAction` such as `oauth_redirect`, `open_plaid`, or `reload` for the browser to execute. The React app should not add a parallel regex/canned-response chat path.

Explicit prompt-chip actions such as "Why this number?", "Show the math", "Show recent transactions", true/real balance requests, and specific purchase tests force the matching SDK tool call so the card is reliable, then the model writes the visible reply. Visible financial-agent replies are capped at 260 characters and 45 words, with instructions for fifth-grade reading level. If the SDK rejects the final structured assistant response, the response is too long, or the response violates Pip language rules, `/api/agent` asks the model for one stricter repair attempt. If that repair also fails, the route returns an error rather than substituting canned chat text.

The agent also generates the next prompt chips in its structured output. The server trims, dedupes, and validates those chips before returning them, and only permits protected setup chip ids such as `get-signed-up`, `connect-data`, `use-default-savings`, and `set-250-savings` when the current onboarding state makes that action valid. Initial and invalid-chip states may still fall back to contextual defaults, but normal post-response chips should be model-authored.

Local direct OpenAI calls default to `gpt-5-nano`. In Netlify runtime, the app prefers the injected `NETLIFY_AI_GATEWAY_BASE_URL` and `NETLIFY_AI_GATEWAY_KEY` values over direct provider keys, so deployed AI routes through Netlify AI Gateway. `OPENAI_BASE_URL` is treated as Netlify AI Gateway by default; set `PIP_AI_TRANSPORT=custom-openai-compatible` only when intentionally pointing at a non-Netlify gateway.

Local behavior:

- With Netlify AI Gateway env, `OPENAI_API_KEY`, or `OPENAI_BASE_URL`, `/api/agent` uses the OpenAI Agents SDK in Responses API mode.
- Without OpenAI configuration, `/api/agent` returns an error instead of faking a response.
- Tests can inject local stubs or mock runtimes directly, but `/api/agent` itself has no request header or environment mode that swaps the real agent for canned responses.

Optional override:

```bash
PIP_AI_MODEL=gpt-5-nano
```

## Data Foundation

Normal `/app` and authenticated APIs require Supabase credentials. They fail closed when Supabase env is missing, so local testing does not silently use fake financial data. When Supabase is configured for beta or local staging mode, authenticated routes require a signed-in user and do not fall back to fake financial data. Authenticated users without cached or synced rows get the connect-data state instead.

Use this explicit switch when you intentionally want the local prototype to ignore configured Supabase credentials and show the fake one-number flow:

```bash
PIP_SUPABASE_MODE=off
```

Use local staging mode when localhost should behave like the private beta app with Supabase-backed data and the normal answer-service path:

```bash
PIP_LOCAL_STAGING=1
npm run check:local-staging
npm run build:local-staging
npm run start:local-staging
```

When using Netlify production env locally, run from the linked checkout and point the command at this worktree:

```bash
netlify dev:exec --context production -- npm --prefix /path/to/Pip run build:local-staging
netlify dev:exec --context production -- npm --prefix /path/to/Pip run start:local-staging
```

Use `npm run dev:local-staging` when actively editing and hot reloading. Use the build/start pair for dogfood because it runs like the deployed app and avoids local file-watcher limits.

In local staging mode, development onboarding shortcuts such as `/app?onboarding=demo` are ignored; use `/app` with a signed-in staging user. Put localhost-only overrides in ignored `.env.local`; the local-staging check, build, dev, and start scripts let those values replace Netlify hidden-secret placeholders. The local env must include a real Supabase service-role JWT or modern `sb_secret_...` key because `/app` uses the admin client for access-grant checks and financial data refresh paths.

For production-like local review of the built `/app` route without Supabase or real financial data, enable the local fake app shell and use an explicit fake scenario:

```bash
PIP_SUPABASE_MODE=off PIP_LOCAL_FAKE_APP_MODE=1 PIP_LOCAL_AGENT_EVAL_MODE=1 PIP_RATE_LIMIT_SALT=local-only npm run start -- --hostname 127.0.0.1 --port 3001
# then open http://127.0.0.1:3001/app?scenario=production-scale
```

`PIP_LOCAL_FAKE_APP_MODE=1` is local-only; beta deployment checks reject it. `PIP_LOCAL_AGENT_EVAL_MODE=1` only raises the local in-memory agent gate when fake app mode is also enabled, so production-like local evals can run a full suite without guest throttling.

Supabase env:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PIP_LOCAL_FAKE_APP_MODE=
PIP_LOCAL_AGENT_EVAL_MODE=
PIP_OPERATOR_TOKEN=
PIP_RATE_LIMIT_SALT=
PIP_LOCAL_STAGING=
```

`PIP_RATE_LIMIT_SALT` is required in production and fake Netlify preview checks. Set a long random value in Netlify environment variables; do not commit the real salt. Public fake previews without Supabase fail closed for AI requests instead of using process-local rate-limit counters.

### Email delivery

Pip sends transactional waitlist and invite emails through Resend first. Supabase remains the source of truth for contacts, consent, unsubscribe state, sent timestamps, and provider-neutral `email_events`.

Required beta email env:

- `PIP_EMAIL_MODE` (`off` disables delivery requirements)
- `RESEND_API_KEY`
- `PIP_EMAIL_FROM`
- `PIP_EMAIL_REPLY_TO` optional
- `PIP_EMAIL_POSTAL_ADDRESS`
- `PIP_EMAIL_UNSUBSCRIBE_SECRET`
- `RESEND_WEBHOOK_SECRET`

Public waitlist signups send one confirmation email. Verified `/app` waitlist signups send one app-access-list confirmation email. Operator grants send one invite email with the `/app` URL and return `inviteEmailStatus` so manual fallback is obvious if delivery fails.

Configure a Resend webhook at:

```text
https://spendwithpip.com/api/email/resend-webhook
```

Enable delivery, bounce, and complaint events. Bounces and complaints hard-suppress future email sends in Supabase without deleting the waitlist row.

AWS SES migration path: add an `SesEmailProvider` implementing `EmailProvider`, verify the sending domain in SES, wire SNS bounce/complaint/delivery notifications into the same `email_events` and hard-suppression helpers, and switch `createConfiguredEmailProvider()` from Resend to SES. No contact export or product behavior should depend on Resend state.

If account deletion finalization logs show a post-auth saga write failure, run `npm run privacy:reconcile-account-deletions` to dry-run rows where the Auth user is already gone, then `npm run privacy:reconcile-account-deletions -- --dry-run=false` to mark those rows completed.

The first database migration lives at `supabase/migrations/20260605000000_free_cash_foundation.sql`. It creates user-scoped financial tables, RLS policies, a private provider-credentials table, sync/event tables, and the authenticated delete-data function. Its snapshot table uses a historical name that is renamed to `pip_cash_snapshots` by a later rebrand migration.

Google signup flow:

- `/api/auth/oauth/google` starts the primary Google OAuth flow through Supabase Auth.
- `/api/auth/sign-in` remains a magic-link fallback route, but it is not the default onboarding path.
- `/auth/callback` exchanges the auth code or OTP and returns signed-in users to `/app`.
- Signed-in users without an active `app_access_grants` row are written to the waitlist with `/app`
  intent metadata and blocked from the app.
- Active grants are keyed by normalized verified email. Grant access with:

```bash
curl -X POST "$NEXT_PUBLIC_SITE_URL/api/operator/access-grants" \
  -H "Authorization: Bearer $PIP_OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"person@example.com","action":"grant","note":"manual invite"}'
```

- Revoke access with the same endpoint and `{"email":"person@example.com","action":"revoke"}`.
- Granted authenticated users must accept the real-data consent step and can keep or change the default protected-savings amount before seeing Spendable Cash Today.
- Chat owns setup and account actions. Manual refresh, protected-savings settings, provider repair, sign-out, and delete-data should be reached through Pip rather than a separate settings/dashboard surface.
- `/api/sync/manual` runs server-side provider sync, rate limits manual refreshes, records sync logs, and stores a Spendable Cash Today snapshot. Plaid syncs every stored Item and can return a `partial` result when at least one institution refreshed but another needs repair.
- `/api/sync/status` reports last refresh, stale connection state, and latest sync failure details for chat-owned refresh and repair prompts.
- `/api/agent` creates the Plaid Link session for chat connect/repair through an agent tool; `/api/providers/connect` remains the lower-level provider connect route.
- `/api/providers/plaid/exchange` exchanges Plaid Link public tokens server-side and stores encrypted Plaid access tokens.
- `/api/providers/teller/health` reports whether Teller Connect, mTLS, and token encryption are configured.
- `/api/providers/teller/enrollment` stores a Teller Connect enrollment token server-side after the connect nonce matches.
- `/api/usage` summarizes monthly Spendable Cash Today views, prompt-chip taps, AI questions, follow-ups, spend tests, balance reveals, missing-card outcomes, negative follow-ups, estimated model calls, provider syncs, partial syncs, and failed syncs for beta cost and product-proof control.
- `/api/events` records authenticated beta product events such as Spendable Cash Today views and prompt-chip taps.
- `/api/agent` records server-derived beta events for agent questions, follow-ups, purchase simulations, true-balance reveals, missing-card nudges, and negative Spendable Cash Today follow-ups.
- `/api/operator/overview` is a bearer-token-protected server route for beta operations. It summarizes stale connections, partial/failed syncs, and product-proof event counts without adding an in-app dashboard.
- `/api/operator/agent-chats` is a bearer-token-protected review route for recent agent turns. Supabase-backed beta and local staging runs read `agent_chat_turns`; explicit fake-data mode can read `/tmp/pip-agent-chat-turns.jsonl`.
- The authenticated home screen reads `/api/pip-cash` so the top number follows stored Supabase data after a manual sync.
- Authenticated users without cached or synced financial rows get a connect-data state; fake prototype data is only used when `PIP_SUPABASE_MODE=off` is explicit.
- `/api/missing-card-preferences` suppresses repeated missing-card nudges for an issuer the user intentionally omits.
- `/privacy`, `/terms`, and `/support` provide the minimum private-beta legal and support affordances.

Plaid env:

```bash
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=production
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US
PLAID_CLIENT_NAME=Pip
PLAID_DAYS_REQUESTED=90
PLAID_REDIRECT_URI=https://spendwithpip.com/plaid/oauth
PIP_PROVIDER_TOKEN_KEY_BASE64=
```

Plaid OAuth redirect setup:

- Production Netlify: `PLAID_REDIRECT_URI=https://spendwithpip.com/plaid/oauth`
- Local development: `PLAID_REDIRECT_URI=http://localhost:3000/plaid/oauth`
- The same URI must be added to the Plaid Dashboard redirect URI allowlist for the active Plaid environment.

Plaid access tokens and transaction cursors are stored only in the private service-role credentials table. Browser code receives Link tokens and public tokens only; long-lived provider secrets stay server-side.
Manual sync stores normalized account and transaction rows, while raw provider payload columns remain empty by default to reduce private-beta data exposure.

Teller env remains in the codebase as a fallback/reference path, but Plaid is the current provider direction:

```bash
TELLER_APPLICATION_ID=
TELLER_ENVIRONMENT=sandbox
TELLER_PRODUCTS=transactions,balance
TELLER_CERTIFICATE_PEM=
TELLER_PRIVATE_KEY_PEM=
PIP_PROVIDER_TOKEN_KEY_BASE64=
```

Fake scenario URLs:

```text
http://localhost:3000
http://localhost:3000?scenario=negative
http://localhost:3000/app?scenario=production-scale
```

## Verification

```bash
npm run test
npm run test:e2e
npm run build
npm run check:deployment
npm run check:netlify-bundle
npm audit --omit=dev
# Requires PIP_LIVE_STORAGE_STATE from a Google session.
npm run test:e2e:live:final
npm run check:prd-complete
# Opens capture first, then runs the final live smoke and completion gate.
npm run prove:prd
```

The E2E test starts a local Next.js server on port 3000 and drives the core AI agent loop through the browser.

Live authenticated onboarding smoke uses the deployed Netlify site and a saved Playwright browser state for a Google user. Do not commit the generated state file.

```bash
npm run capture:live-auth
PIP_LIVE_STORAGE_STATE=/tmp/pip-live-auth.json npm run check:live-smoke
PIP_LIVE_STORAGE_STATE=/tmp/pip-live-auth.json npm run test:e2e:live
```

`npm run capture:live-auth` opens Playwright against production and saves to `/tmp/pip-live-auth.json` by default. Override the target or file path with `-- --base-url=https://... --storage-state=/tmp/other-state.json` when needed. To keep a reusable Chrome profile for repeated auth attempts, add `-- --user-data-dir=/tmp/pip-live-auth-profile` or set `PIP_LIVE_AUTH_USER_DATA_DIR`.

That smoke expects the Google user to complete OAuth, consent, Plaid production connection, manual sync, and return to the same Pip screen with a real Spendable Cash Today number. It fails if the saved session is still at the guest, consent, or connect-data stage. When Plaid automation is enabled, it also requires successful `/api/providers/plaid/exchange` and `/api/sync/manual` responses, then verifies `/api/sync/status` shows a connected Plaid institution, a succeeded Plaid sync run, and nonzero synced account and transaction counts before asking the AI why the number changed.

To let the smoke attempt the Plaid Sandbox Link step itself after Google OAuth, save storage state after signing in with a Google user and run:

```bash
PIP_LIVE_STORAGE_STATE=/tmp/pip-live-auth.json \
npm run test:e2e:live:final
```

When the final command passes, it writes a proof summary to `/tmp/pip-live-proof.json` by default. Override with `PIP_LIVE_PROOF_REPORT=/tmp/other-proof.json` if needed. The report records the production URL, latest verified deploy URL/id from this README, storage-state path, Plaid automation requirement, and pass timestamp without storing cookies or provider tokens.

If Google refuses the external Playwright auth browser, use the Codex in-app Browser for the authenticated proof. Capture structured evidence to `/tmp/pip-in-app-browser-evidence.json`, then run:

```bash
npm run proof:in-app-browser
npm run check:prd-complete
```

`npm run check:prd-complete` is intentionally the last gate. It fails until the proof report exists and confirms either the production `npm run test:e2e:live:final` run passed against the latest verified deploy with Plaid automation required and enabled, or a Codex in-app Browser proof shows authenticated production `/api/sync/status`, `/api/pip-cash`, `/api/free-cash`, visible rebrand checks, driver-tool usage, and evidence-backed guidance.

The Plaid automation defaults to the official Sandbox credentials `user_good` / `pass_good` and institution `First Platypus Bank`. Override with `PIP_LIVE_PLAID_INSTITUTION`, `PIP_LIVE_PLAID_USERNAME`, or `PIP_LIVE_PLAID_PASSWORD` if Plaid changes the sandbox UI or the configured products need another institution.

For the shortest final proof path, run `npm run prove:prd`. It opens the auth capture browser, then runs live-smoke preflight, `npm run test:e2e:live:final`, and `npm run check:prd-complete` in order. If `/tmp/pip-live-auth.json` already exists, use `npm run prove:prd -- --skip-capture`.

`npm run check:deployment` validates the required non-public and public environment variable names for a real beta deploy without printing secret values. `npm run check:local-staging` validates the localhost private-beta shape: Supabase-backed data, a real local Supabase service-role or secret key, model config, local origins, and no `PIP_SUPABASE_MODE=off`. Use `npm run check:deployment -- --mode=fake` only for fake-data preview deploys, and still set `PIP_RATE_LIMIT_SALT` for those previews.

`supabase/rls_smoke_test.sql` is a rollback-only live database smoke test for private-beta RLS. Run it after migrations are applied to verify that an authenticated user can see one own row per financial table, cannot see another user's rows, and cannot update or delete another user's financial data.
