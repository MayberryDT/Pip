# Spendable

Mobile-first, agent-first Spendable app with fake-data mode, invite-gated Supabase beta flows, Plaid connection support, and OpenAI Responses API tooling. The core daily metric is still Free Cash Today.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Netlify

The project is linked to `free-cash-mayberrydt` on Netlify.

- Site URL: https://free-cash-mayberrydt.netlify.app
- Latest verified production deploy: https://6a23b36aba8dd5f81ab2e822--free-cash-mayberrydt.netlify.app
- Latest verified draft deploy: https://6a23aec6c0e9cfd227824f80--free-cash-mayberrydt.netlify.app
- Netlify is configured for real beta mode with Supabase, Netlify AI Gateway/OpenAI, and Plaid sandbox env. Fake-data preview deploys remain available with `FREE_CASH_DEPLOY_MODE=fake npm run deploy:netlify`.
- `npm run deploy:netlify` hides local `.env*` files during the local Netlify build, skips stale function cache reuse, and checks generated function bundles for accidental env-file inclusion.

## AI Agent

`/api/agent` uses the official OpenAI SDK with the Responses API. The model routes user messages to exactly one deterministic app tool, then writes the final chat reply with a JSON Schema structured output. The Free Cash engine still owns all money math.

Local direct OpenAI calls default to `gpt-5-nano`. In Netlify runtime, the app prefers the injected `NETLIFY_AI_GATEWAY_BASE_URL` and `NETLIFY_AI_GATEWAY_KEY` values over direct provider keys, so deployed AI routes through Netlify AI Gateway. `OPENAI_BASE_URL` is treated as Netlify AI Gateway by default; set `FREE_CASH_AI_TRANSPORT=custom-openai-compatible` only when intentionally pointing at a non-Netlify gateway.

Local behavior:

- With Netlify AI Gateway env, `OPENAI_API_KEY`, or `OPENAI_BASE_URL`, `/api/agent` uses the OpenAI SDK Responses API.
- Without OpenAI configuration, `/api/agent` returns an error instead of faking a response.
- For tests and local smoke checks, `FREE_CASH_AI_MODE=mock-model` or the dev-only `x-free-cash-ai-mode: mock-model` request header uses a local mock model client that still exercises the Responses API adapter/tool-call path.

Optional override:

```bash
FREE_CASH_AI_MODEL=gpt-5-nano
```

## Data Foundation

The app runs without Supabase credentials by using fake scenarios. When Supabase is configured, server routes can load authenticated user financial rows and fall back to fake data only when no user or real data exists.

Use this switch when you want the local prototype to ignore configured Supabase credentials and show the fake one-number flow:

```bash
FREE_CASH_SUPABASE_MODE=off
```

Supabase env:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FREE_CASH_OPERATOR_TOKEN=
```

The first database migration lives at `supabase/migrations/20260605000000_free_cash_foundation.sql`. It creates user-scoped financial tables, RLS policies, a private provider-credentials table, sync/event tables, and the authenticated delete-data function.

Private beta flow:

- Add invited emails to `public.beta_invites`.
- `/api/auth/sign-in` checks the invite table before sending a Supabase magic link.
- `/auth/callback` exchanges the auth code and records invite acceptance.
- Authenticated users must accept the real-data consent gate and can keep or change the default protected-savings amount before seeing Free Cash.
- The shield control exposes manual refresh, protected-savings settings, sign-out, and delete-data.
- `/api/sync/manual` runs server-side provider sync, rate limits manual refreshes, records sync logs, and stores a Free Cash snapshot. Plaid syncs every stored Item and can return a `partial` result when at least one institution refreshed but another needs repair.
- `/api/sync/status` reports last refresh, stale connection state, and latest sync failure details for the shield drawer.
- `/api/providers/connect` creates the authenticated Plaid Link session used by the chat connect/repair action.
- `/api/providers/plaid/exchange` exchanges Plaid Link public tokens server-side and stores encrypted Plaid access tokens.
- `/api/providers/teller/health` reports whether Teller Connect, mTLS, and token encryption are configured.
- `/api/providers/teller/enrollment` stores a Teller Connect enrollment token server-side after the connect nonce matches.
- `/api/usage` summarizes monthly Free Cash views, prompt-chip taps, AI questions, follow-ups, spend tests, balance reveals, missing-card outcomes, negative follow-ups, estimated model calls, provider syncs, partial syncs, and failed syncs for beta cost and product-proof control.
- `/api/events` records authenticated beta product events such as Free Cash views and prompt-chip taps.
- `/api/agent` records server-derived beta events for agent questions, follow-ups, purchase simulations, true-balance reveals, missing-card nudges, and negative Free Cash follow-ups.
- `/api/operator/overview` is a bearer-token-protected server route for beta operations. It summarizes stale connections, partial/failed syncs, and product-proof event counts without adding an in-app dashboard.
- The authenticated home screen reads `/api/free-cash` so the top number follows stored Supabase data after a manual sync.
- Authenticated users without cached or synced financial rows get a connect-data state; fake `$43` prototype data is only used for unauthenticated or Supabase-disabled prototype flows.
- `/api/missing-card-preferences` suppresses repeated missing-card nudges for an issuer the user intentionally omits.
- `/privacy`, `/terms`, and `/support` provide the minimum private-beta legal and support affordances.

Plaid env:

```bash
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US
PLAID_CLIENT_NAME=Spendable
PLAID_DAYS_REQUESTED=90
PLAID_REDIRECT_URI=https://free-cash-mayberrydt.netlify.app/plaid/oauth
FREE_CASH_PROVIDER_TOKEN_KEY_BASE64=
```

Plaid OAuth redirect setup:

- Production Netlify: `PLAID_REDIRECT_URI=https://free-cash-mayberrydt.netlify.app/plaid/oauth`
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
FREE_CASH_PROVIDER_TOKEN_KEY_BASE64=
```

Fake scenario URLs:

```text
http://localhost:3000
http://localhost:3000?scenario=negative
```

## Verification

```bash
npm run test
npm run test:e2e
npm run build
npm run check:deployment
npm run check:netlify-bundle
npm audit --omit=dev
```

The E2E test starts a local Next.js server on port 3000 and drives the core AI agent loop through the browser.

`npm run check:deployment` validates the required non-public and public environment variable names for a real beta deploy without printing secret values. Use `npm run check:deployment -- --mode=fake` only for fake-data preview deploys.

`supabase/rls_smoke_test.sql` is a rollback-only live database smoke test for private-beta RLS. Run it after migrations are applied to verify that an authenticated user can see one own row per financial table, cannot see another user's rows, and cannot update or delete another user's financial data.
