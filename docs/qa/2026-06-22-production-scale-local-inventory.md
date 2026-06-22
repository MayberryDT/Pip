# Production-Scale Local Inventory - 2026-06-22

Goal: verify Pip locally with sanitized, production-scale data under production-like settings, then keep the inventory reusable for regression runs.

## Run Rules

- Local data only: use `PIP_SUPABASE_MODE=off`, `PIP_LOCAL_FAKE_APP_MODE=1`, and `scenario=production-scale` for financial data.
- Production-like runtime: verify with `npm run build` and `npm run start`, not only `next dev`.
- Browser evidence: use Codex in-app Browser with backend `iab`.
- Safety: no production writes, no real provider tokens, no real user data, no destructive account/data deletion action without explicit approval.
- Rerun policy: after any fix, rerun the affected focused check, then rerun the complete inventory gates.

## Data Fixture Acceptance

Synthetic scenario: `production-scale`

Acceptance:
- `isFakeDataScenario("production-scale")` returns true.
- `/api/pip-cash?scenario=production-scale` works when Supabase is disabled.
- Contains at least 8 accounts across checking, savings, credit card, and loan.
- Contains at least 500 transactions across 18 months.
- Includes income, rent, purchases, transfers, card payments, refunds, fees, pending transactions, matched card payments, and an unmatched card-payment warning path.
- Contains no emails, OAuth/provider names, production project names, full account numbers, or Tyler-specific identifiers.
- Produces a valid `calculatePipCash()` result without throwing.

Finite edge cases:
- Current-month partial data, same-day posted purchase, and same-day pending duplicate purchase.
- Pending current-month income and pending travel purchase.
- Matched and unmatched credit-card settlement rows.
- Refund and bank-fee months.
- Multiple institutions and multiple account kinds.
- Protected savings plus separate reserve savings.
- Loan account present but excluded from Pip Cash.
- Active savings goal included in Spendable Cash Today.

## Roles And States

| Role/state | Routes | Acceptance criteria | Finite edge cases |
| --- | --- | --- | --- |
| Public visitor | `/`, `/how-it-works`, `/how-the-number-works`, `/pricing`, `/security`, `/blog`, `/blog/[slug]`, `/privacy`, `/terms`, `/support`, `/delete-account`, `/android-access` | Marketing nav renders, CTA routes to product access, waitlist form has email validation, legal/support pages render without app chat. | Mobile nav open/closed, pricing hidden when configured, invalid waitlist email, waitlist API failure, long blog slug, missing article slug. |
| Signed-out app visitor | `/app` | Shows app access gate and Google sign-in link; does not render Pip chat or fake money. | Auth error notice, Supabase unavailable, back/forward to `/app`. |
| Waitlisted signed-in user | `/app` | Saves verified email to waitlist, blocks app, shows sign-out action, no financial surface. | Missing email, waitlist insert already exists, email send disabled/fails safely. |
| Consent-needed user | `/app` | Shows consent copy, monthly savings picker, privacy/terms/support links, and no chat until consent is saved. | Quick amount buttons, custom amount, over-limit validation, failed save. |
| Ready user without connected data | `/app` | Shows connect-data state, not fake money; account controls available only when signed in. | Provider unavailable, connect session failure, app-open sync status pending. |
| Ready user with data | `/app?scenario=production-scale` in local fake mode, authenticated production analog in beta | Shows one Spendable Cash Today number, opening bubble, prompt chips, chat composer, and grounded cards. | Desktop/mobile, long prompt, Enter vs Shift+Enter, prompt-chip fallback, agent failure, low-confidence/missing-card states. |
| Play reviewer | `/reviewer-login`, Android shell copy | Reviewer login form works only with reviewer credentials; Android visible copy stays review-safe. | Wrong password, disabled reviewer account, mobile viewport. |
| Email recipient | `/unsubscribe` | Token-based unsubscribe button posts once, disables after success, reports failure. | Missing token, bad token, network/API failure. |
| Operator | `/api/operator/*` | Bearer-token routes remain protected and return review/admin data only to authorized calls. | Missing token, wrong token, empty data, high row counts. |

## Page Route Inventory

| Route | Feature | Acceptance criteria | Edge cases |
| --- | --- | --- | --- |
| `/` | Home marketing page | Brand, offer, product scene, CTA, waitlist form, proof/trust sections render. | Mobile nav, CTA tracking failure, waitlist failure. |
| `/how-it-works` | Product explanation | Steps stay read-only and monthly-only; CTA works. | Narrow viewport, pricing access state. |
| `/how-the-number-works` | Calculation explanation | Explains Spendable Cash Today without promising money movement. | Long section anchors, mobile scan. |
| `/pricing` | Pricing | Pricing copy matches product-access config and no hidden app chat. | Pricing disabled state. |
| `/security` | Security/trust | Read-only/provider-token language renders with support CTA. | Long legal copy on mobile. |
| `/blog` | Blog index | Article cards render with image/fallback and links. | Empty article list, image loading. |
| `/blog/[slug]` | Blog detail | Valid slug renders article, table of contents, CTA; invalid slug 404s. | Long headings, image alt/fallback. |
| `/privacy` | Privacy | Legal shell renders support links and no app controls. | Mobile legal layout. |
| `/terms` | Terms | Legal shell renders accuracy/read-only boundaries. | Mobile legal layout. |
| `/support` | Support | Support path and email copy render. | Long support email/copy. |
| `/delete-account` | Account deletion instructions | Deletion instructions are clear and non-destructive in page view. | User wants deletion: ask before destructive action. |
| `/android-access` | Android access instructions | Android-specific copy is visible and review-safe. | Android user agent. |
| `/reviewer-login` | Reviewer auth | Email/password form posts, status is visible, redirects to `/app` after success. | Bad password, submit disabled, mobile viewport. |
| `/unsubscribe` | Email unsubscribe | Token button posts to API, success/error states visible. | Missing/bad token. |
| `/plaid/oauth` | Provider OAuth resume | OAuth resume handles return-to-app state and errors. | Missing OAuth params, provider callback failure. |
| `/app` | Main product | Access gates, consent, no-data, and connected-data states render without leaking fake data in authenticated shells. | Supabase unavailable, signed out, waitlisted, consent, ready/no data, ready/data. |

## API Route Inventory

| Route | User-facing workflow | Acceptance criteria | Edge cases |
| --- | --- | --- | --- |
| `/api/account/delete` | Account deletion | Requires authenticated exact confirmation; destructive path not exercised without approval. | Wrong confirmation, auth delete failure, data delete failure. |
| `/api/delete-data` | Data deletion request | Validates request and does not expose private data. | Invalid payload, unauthenticated. |
| `/api/auth/oauth/google` | Google auth start | Redirects only to safe app paths. | OAuth unconfigured, unsafe next path. |
| `/api/auth/callback` | OAuth callback | Exchanges code and redirects safely. | Missing code, exchange failure, unsafe next path. |
| `/api/auth/sign-in` | Email/password sign-in | Authenticates and sets session. | Invalid credentials, malformed email. |
| `/api/auth/sign-out` | Sign-out | Clears session and redirects safely. | Missing session. |
| `/api/auth/consent` | Consent save | Saves consent and monthly protected savings. | Too large amount, invalid amount, auth missing. |
| `/api/auth/reviewer-login` | Reviewer login | Allows only reviewer accounts. | Non-reviewer email, wrong password. |
| `/api/pip-cash` | Spendable Cash Today | Returns local scenario data when Supabase off; requires auth when Supabase configured. | Invalid scenario, no financial data, auth required. |
| `/api/free-cash` | Rebrand compatibility | Returns compatible Pip Cash data. | Same as `/api/pip-cash`. |
| `/api/agent` | Ask Pip | Enforces model/rate gates, uses deterministic tools, returns cards/actions. | Empty message, production salt missing, unsafe money movement, no-data state. |
| `/api/ai-reports` | Report assistant response | Stores user report safely. | Long detail text, missing message id, auth missing. |
| `/api/feedback` | Feedback | Stores feedback from signed-in app flow. | Empty feedback, auth missing. |
| `/api/events` | Product event | Records safe product events without secrets. | Oversized properties, unauthenticated. |
| `/api/usage` | Usage counters | Returns/records usage safely. | Missing auth, rate limit. |
| `/api/settings` | User settings | Reads/updates settings and manual refresh state. | Missing row, manual-refresh default. |
| `/api/sync/status` | Sync status | Reports provider connection/sync state. | No providers, stale provider, failed sync. |
| `/api/sync/app-open` | App-open sync | Queues or skips refresh based on cooldown/settings. | Manual-refresh-only, pending job, provider unavailable. |
| `/api/sync/manual` | Manual refresh | Starts refresh only when allowed. | Cooldown, provider failure, no connection. |
| `/api/providers/connect` | Start provider connect | Creates provider session/action. | Unknown provider, provider unavailable. |
| `/api/providers/plaid/exchange` | Plaid exchange | Exchanges public token and stores credentials server-side. | Bad token, Plaid env mismatch, duplicate institution. |
| `/api/providers/teller/enrollment` | Teller enrollment | Handles enrollment token flow. | Missing cert/key, provider error. |
| `/api/providers/teller/health` | Teller health | Reports provider readiness without secrets. | Missing env. |
| `/api/webhooks/plaid` | Plaid webhook | Verifies webhook and queues sync. | Bad signature, unknown item. |
| `/api/missing-card-preferences` | Missing-card suppression | Saves suppressed issuer preference. | Empty issuer, auth missing. |
| `/api/pip/reactions/seen` | Pip reaction state | Marks seen reaction. | Unknown reaction, auth missing. |
| `/api/savings-goals` | Savings goals list/create | Preview/create flow stays confirmation-first. | Missing fields, over-tight goal, feature flag off. |
| `/api/savings-goals/[goalId]` | Savings goal update/delete | Updates selected goal only. | Unknown goal, invalid amount/date. |
| `/api/marketing/waitlist` | Public waitlist | Validates email and records attribution. | Invalid email, duplicate email, email provider disabled. |
| `/api/marketing/events` | Marketing event | Records only safe attribution/event fields. | Oversized payload, bad event name. |
| `/api/marketing/distribb-webhook` | Marketing webhook | Validates webhook before ingest. | Bad secret, duplicate event. |
| `/api/email/unsubscribe` | Email unsubscribe | Validates token and suppresses email. | Missing/expired token. |
| `/api/email/resend-webhook` | Email provider webhook | Validates provider signature. | Bad signature, unknown event. |
| `/api/operator/overview` | Operator overview | Requires operator bearer token. | Missing/wrong token, empty rows. |
| `/api/operator/access-grants` | Operator access grants | Requires operator bearer token and validates grant changes. | Invalid email/status. |
| `/api/operator/email-list` | Operator email list | Requires operator bearer token. | Missing/wrong token. |
| `/api/operator/agent-chats` | Operator agent review | Requires operator bearer token and redacts safely. | Large local JSONL, malformed row. |

## Controls, Inputs, Modals, And States

No blocking modal/dialog is currently part of the app shell; `PipHome` explicitly avoids `role="dialog"`. The report UI is an inline expandable panel.

| Surface | Controls and states | Acceptance criteria | Edge cases |
| --- | --- | --- | --- |
| Marketing header/footer | Logo link, primary nav links, mobile `<details>` menu, product CTA | Links are keyboard-focusable, mobile menu opens without overlap, CTA uses product-access href. | Pricing hidden mode, small viewport. |
| Waitlist form | Email input, submit button, idle/submitting/succeeded/failed status | Required email validation, button disables while submitting, live message updates. | Invalid email, network failure, duplicate email. |
| App access gate | Google link, sign-out button, privacy/terms/support links | Signed-out/waitlisted/unavailable states do not show chat or fake cash. | Auth notice, unavailable config. |
| Consent/onboarding | Savings quick buttons, custom numeric input, save button, error text | Amount sanitizes to digits, max is enforced, save calls consent API. | Empty input, over max, API error. |
| Ready/no-data setup | Connect data button, status copy | Shows setup without fake number; provider action is explicit. | Provider unavailable, repeated clicks. |
| Main metric | Spendable Cash Today number, savings-note state, opening bubble | One number only, no dashboard/table chrome, missing-card warning visible when relevant. | `negative`, `missing-card`, `low-confidence`, `production-scale`. |
| Prompt chips | Up to three visible chips, settings pinned for live ready state | Chips submit prompt and remain conversational. | Empty model chips, compact chat state. |
| Chat composer | Textarea, Enter send, Shift+Enter newline, send button, busy/disabled | Trims empty prompts, resizes, handles mobile keyboard, clears after submit. | Long prompt, rapid submit, network failure. |
| Assistant cards | Card action buttons, missing-card suppress button | Card actions submit prompts; suppression calls preferences only for signed-in users. | Unknown card, long merchant names, suppressed issuer. |
| Report response | Report toggle, five reason buttons, details textarea, send/cancel, status | Sends bounded excerpt/details; cancel closes without sending. | Long details, API failure, repeated submit. |
| Reviewer login | Email input, password input, submit, status | Failed login shows error; success redirects to `/app`. | Empty password, wrong reviewer, mobile. |
| Unsubscribe | Unsubscribe button, success/error status | Button disables after success and reports bad token. | Missing token, API failure. |

## Major Capability Workflow Matrix

Source: `tests/fixtures/agent-major-capabilities.mjs`

Acceptance:
- 20 primary capabilities pass the API suite.
- 91 expanded/paraphrase/state cases pass.
- 13 multi-turn journeys pass.
- Production-safe subset runs redacted and non-destructive.
- Browser proof covers desktop and mobile for UI-backed capabilities.

Capabilities:
1. Guest start and chat tone.
2. Spendable Cash explanation.
3. Calculation transparency.
4. Recent transaction read.
5. Spending breakdown.
6. Recurring bills and subscriptions.
7. Spendable Cash forecast.
8. Purchase simulation.
9. Financial guidance read.
10. Actionable cutback guidance.
11. Actual balances.
12. Connected account management.
13. New account connection.
14. Manual data refresh.
15. Data quality and missing-data detection.
16. Trust receipt.
17. Read-only money movement boundary.
18. Savings goal setup.
19. Savings goal review.
20. Privacy and destructive action safety.

Finite workflow edge cases:
- State cases: `default`, `negative`, `overspending`, `low-confidence`, `missing-card`, `cutback-dining`, `cash-guardrail`, `production-scale`.
- Multi-turn: no repeated why-this-number answer, forecast affirmative follow-up, purchase follow-up, read-only follow-up, institution removal confirmation, repair-vs-new-connection, refresh-status-vs-refresh, delete confirmation, savings preview/create/cancel/review.
- Safety: money movement always refused; destructive delete requires exact confirmation and is not exercised in this run.

## Bug Log

| ID | Status | Surface | Evidence | Root cause | Fix | Regression |
| --- | --- | --- | --- | --- | --- | --- |
| DATA-001 | Fixed | Synthetic local data | `npx vitest run src/lib/fake-data.test.ts` first failed because `production-scale` was not a recognized scenario. | No production-scale local scenario existed. | Added deterministic `production-scale` snapshot in `src/lib/fake-data.ts`. | `src/lib/fake-data.test.ts` validates size, account/transaction coverage, sanitization, and `calculatePipCash()`. |
| DATA-002 | Fixed | Synthetic local data | In-app Browser showed `$0` for `/app?scenario=production-scale`; local API showed v2 state `shortfall`. | The current-month fixture had a zero-amount payroll and a same-day pending travel hold, turning a normal-scale fixture into a shortfall edge case. | Made current-month payroll nonzero, scaled current-month discretionary rows, and moved the pending travel hold off the as-of date. | `src/lib/fake-data.test.ts` now requires nonzero transactions, positive v2 Spendable Cash Today, and non-shortfall state. |
| LOCAL-001 | Fixed | Production-like local `/app` | In-app Browser hit `http://127.0.0.1:3001/app?scenario=production-scale` on a built server and saw "Pip access is temporarily unavailable" instead of the fake app. | `NODE_ENV=production` disables dev onboarding/demo routes, and Supabase-off was treated only as unavailable. | Added explicit `PIP_LOCAL_FAKE_APP_MODE=1` local app shell and rejected that flag in beta deployment checks. | `src/app/app/page.test.tsx` covers the local fake app route; `scripts/check-deployment-env.test.ts` blocks beta mode with the flag. |
| LOCAL-002 | Fixed | Production-like local `/api/agent` | `npm run eval:agent:major` against the built local server returned HTTP 503 for every case with `agent-model-gate-unavailable`. | Production mode disables the in-memory model gate, and Supabase-off mode has no RPC-backed gate. | Allowed the in-memory gate only when `PIP_LOCAL_FAKE_APP_MODE=1`; beta deployment checks already reject that flag. | `src/lib/agent/agent-model-gate.test.ts` covers production + Supabase-off + local fake mode. |
| AGENT-001 | Fixed | Major agent dogfood | OpenAI-backed expanded evals exposed response-contract failures: card replies ended with questions, no-card replies promised cards/views, and read-only/card-provider wording caused false positives. | Model output was stochastic and the visible-response guard/scorer did not cover several production-language variants. | Strengthened `visible-response-guard.ts`, deterministic response-mode normalization, and eval scorer exceptions for valid read-only/data-quality language. | `src/lib/agent/ai-agent.test.ts`, `src/lib/agent/visible-response-guard.test.ts`, and `scripts/eval-agent.test.ts`; primary, expanded, and multi-turn OpenAI suites passed. |
| GATE-001 | Fixed | Pip money companion gate | `npm run test:pip-money-companion-gate` initially blocked on "No default verification is wired for DOGFOOD-001". | The default gate adapter had deterministic category commands but no sanitized local DOGFOOD path. | Added a fail-closed local sanitized DOGFOOD adapter that verifies `/app` plus `/api/pip-cash?scenario=production-scale`; real provider data remains out of scope without explicit approval. | `scripts/pip-money-companion-gate.test.ts`; `/tmp/pip-money-companion-gate-rerun/manifest.json` passed the full gate. |
| DATA-003 | Fixed | Production-scale fixture | DOGFOOD-002 failed because `production-scale` had no same-day discretionary spend on the as-of date; DOGFOOD-005 would not cover savings goal impact. | Fixture breadth was large but missed two user-facing workflow edges. | Added same-day posted+pending duplicate purchase and an active savings goal included in Spendable Cash Today. | `src/lib/fake-data.test.ts`; full money-companion gate passed. |
| API-001 | Fixed | Hydrated `/app?scenario=production-scale` chat | In-app Browser submitted "Can I spend $50?" and the UI showed "I couldn’t answer that cleanly." | `/api/agent` request schema omitted `production-scale`, so the hydrated client sent a scenario that the route rejected. | Added `production-scale` to the agent route schema. | `src/app/api/agent/route.test.ts`; in-app Browser rerun returned a purchase simulation card. |

## Verification Log

| Check | Status | Evidence |
| --- | --- | --- |
| Baseline unit suite before changes | Passed | `npm test`: 184 files passed, 4,584 tests passed, 1 skipped. |
| Production-scale data TDD red | Passed | `npx vitest run src/lib/fake-data.test.ts` failed on unrecognized scenario. |
| Production-scale data TDD green | Passed | `npx vitest run src/lib/fake-data.test.ts`: 1 file passed, 1 test passed. |
| Local fake app TDD red | Passed | `npx vitest run src/app/app/page.test.tsx scripts/check-deployment-env.test.ts` failed on unavailable `/app` and missing beta guard. |
| Production-scale data shape green | Passed | `npx vitest run src/lib/fake-data.test.ts`: 1 file passed, 1 test passed after nonzero/positive-state criteria. |
| Local fake model gate TDD green | Passed | `npx vitest run src/lib/agent/agent-model-gate.test.ts`: 1 file passed, 12 tests passed. |
| Major capability missing-AI TDD red | Passed | `npx vitest run scripts/eval-agent.test.ts --testNamePattern "blocked report"` first failed with `expected 20 to be 1`, proving the runner attempted all cases after the first global 503. |
| Major capability missing-AI TDD green | Passed | `npx vitest run scripts/eval-agent.test.ts --testNamePattern "blocked report"`: 1 test passed. |
| Eval harness regression | Passed | `npx vitest run scripts/eval-agent.test.ts`: 46 tests passed. |
| Major capability API dogfood | Passed | `PIP_AGENT_EVAL_BASE_URL=http://127.0.0.1:3007 PIP_AGENT_EVAL_REPORT=/tmp/pip-major-capabilities-openai.json npm run eval:agent:major`: 20/20 passed. |
| Major capability expanded API dogfood | Passed | `PIP_AGENT_EVAL_BASE_URL=http://127.0.0.1:3007 PIP_AGENT_EVAL_REPORT=/tmp/pip-major-expanded-openai.json npm run eval:agent -- --suite major-capabilities-expanded`: 91/91 passed. |
| Major capability multi-turn API dogfood | Passed | `PIP_AGENT_EVAL_BASE_URL=http://127.0.0.1:3007 PIP_AGENT_EVAL_REPORT=/tmp/pip-major-multiturn-openai.json npm run eval:agent -- --suite major-capabilities-multiturn`: 13/13 passed. |
| Final major capability API dogfood rerun | Passed | `PIP_AGENT_EVAL_BASE_URL=http://127.0.0.1:3008 PIP_AGENT_EVAL_REPORT=/tmp/pip-major-capabilities-openai-rerun.json npm run eval:agent:major`: 20/20 passed. |
| Final expanded API dogfood rerun | Passed | `PIP_AGENT_EVAL_BASE_URL=http://127.0.0.1:3008 PIP_AGENT_EVAL_REPORT=/tmp/pip-major-expanded-openai-rerun.json npm run eval:agent -- --suite major-capabilities-expanded`: 91/91 passed. |
| Final multi-turn API dogfood rerun | Passed | `PIP_AGENT_EVAL_BASE_URL=http://127.0.0.1:3008 PIP_AGENT_EVAL_REPORT=/tmp/pip-major-multiturn-openai-rerun.json npm run eval:agent -- --suite major-capabilities-multiturn`: 13/13 passed. |
| Router dogfood | Passed | `npm run dogfood:router`: 3,356 tests passed. |
| Pip money companion gate | Passed | `npm run test:pip-money-companion-gate -- --from 1 --base-url http://127.0.0.1:3007 --run-dir /tmp/pip-money-companion-gate-full`: all 137 cases passed. |
| Final Pip money companion gate rerun | Passed | `npm run test:pip-money-companion-gate -- --from 1 --base-url http://127.0.0.1:3008 --run-dir /tmp/pip-money-companion-gate-rerun`: passed. |
| Pip money companion gate regression | Passed | `npx vitest run scripts/pip-money-companion-gate.test.ts`: 10 tests passed. |
| Full regression suite | Passed | Final `npm test`: 184 files passed, 4,626 tests passed, 1 skipped. |
| Production build | Passed | `npm run build`: compile, TypeScript, static generation, and route trace collection completed. |
| Diff whitespace check | Passed | `git diff --check`: no whitespace errors. |
| Fake deployment check | Passed | `PIP_SUPABASE_MODE=off PIP_RATE_LIMIT_SALT=local-production-scale-check npm run check:deployment -- --mode=fake`: passed. |
| DB schema names | Passed | `npm run check:db-schema-names`: passed. |
| Android visible copy | Passed | `npm run play:android-copy:verify`: passed. |
| Production-scale API smoke | Passed | `curl http://127.0.0.1:3008/api/pip-cash?scenario=production-scale`: HTTP 200; sanitized scenario rendered `$12` in the app. |
| Final in-app Browser app smoke | Passed | Codex in-app Browser `iab`: desktop 1280x720 and mobile 390x844 rendered `/app?scenario=production-scale` with `$12`, savings-goal note, opening bubble, prompt chips, and composer; submitting "Can I spend $50?" returned a purchase simulation with no captured app console errors. |

## Clean Pass

Final state is a clean local pass for sanitized production-scale data under production-like settings. No production writes, real provider data, real user financial data, or destructive actions were used.

The local production-like server used the approved OpenAI key loaded from the canonical local env without printing or copying the key. Real connected-account DOGFOOD remains intentionally outside this sanitized local pass unless explicitly approved at action time.
