# Free Cash Architecture Decision Report

Date: June 5, 2026
Author: Codex
Scope: Follow-up architecture investigation for Netlify, Plaid vs Teller, SDK choices, agent implementation, tools, pricing, and first build path.

## Executive Decision

Build the first real product as a Netlify-hosted mobile PWA with a deterministic Free Cash engine, a provider abstraction, and a mock agent. Do not start by integrating Plaid, Teller, OpenAI, or Supabase.

The sequence should be:

1. Fake-data prototype.
2. Supabase auth/database and RLS.
3. Provider abstraction.
4. TellerProvider for Tyler/private beta.
5. PlaidProvider later if coverage, mTLS, production positioning, or acquisition story requires it.
6. OpenAI via Netlify AI Gateway later, using the official OpenAI SDK and Responses API tool/function calling.
7. OpenAI Agents SDK only if the agent becomes a multi-step workflow/orchestration problem.

Short version:

```text
Now:     Next.js + Netlify + fake data + pure TypeScript Free Cash engine
Beta:    Supabase + MockProvider + TellerProvider
Later:   PlaidProvider + OpenAI SDK via Netlify AI Gateway
Avoid:   both bank providers now, Vercel, Vercel AI SDK, OpenAI Agents SDK in v1
```

The main product thesis from the original ChatGPT thread stays intact:

```text
$43

Ask.
```

The architecture should protect that product shape. The bank provider, model provider, database, and deployment platform are all servants of the one-number interface, not reasons to build a dashboard.

## What I Asked ChatGPT

I went into the existing ChatGPT planning thread as Codex and explicitly identified myself as the build agent. I asked for implementation context, then asked follow-up architecture questions based on Tyler's new constraints:

- Netlify, not Vercel.
- Decide Plaid vs Teller Connect.
- Explain what "use an SDK for agents" actually means.
- Resolve architecture, tools, pricing, build order, and cost caps.

ChatGPT's first architecture answer leaned Plaid-first, mainly because Plaid is the standard/acquisition-friendly fintech integration. I then challenged that with current pricing/environment facts from Plaid and Teller. ChatGPT changed its final recommendation to Teller-first for Tyler/private beta, with Plaid later.

I agree with that final direction.

## Primary Recommendation

Use this provider strategy:

```text
Build provider abstraction immediately.
Use MockProvider for the fake-data prototype.
Use TellerProvider first for Tyler/private beta.
Add PlaidProvider later if Teller coverage, mTLS complexity, or production positioning becomes a blocker.
Do not build both providers immediately.
```

Why this is the right answer for this app:

- Tyler's next real milestone is not a public fintech launch. It is a prototype, then Tyler/friends/family.
- Teller's development environment supports real bank data, is free, and has a 100-enrollment limit.
- Plaid's current Trial plan is free with real production data, but only up to 10 Production Items.
- A private beta can burn 10 Plaid Items quickly because one user may connect multiple institutions.
- Teller's production Transactions pricing is public at $0.30/enrollment/month.
- Plaid is more standard and likely more legible to future fintech partners/acquirers.
- Teller requires mTLS/client certificate handling, which is extra work on Netlify, but not a reason to reject it before a proof of concept.

The decision is not "Teller forever." It is "Teller first, behind an interface."

## Strongest Counterargument

Plaid is the safer institutional choice:

- Broad brand recognition.
- Strong docs.
- Plaid Link is familiar to users.
- No mTLS certificate handling in backend requests.
- Transactions explicitly covers depository accounts, credit cards, and student loan accounts.
- Future acquirers, fintech partners, and compliance reviewers are more likely to recognize Plaid.

That counterargument wins if any of these happen:

- Teller does not cover Tyler's or testers' key institutions/cards.
- Teller's credit-card transaction data is not good enough for Free Cash.
- Netlify Functions cannot reliably perform Teller mTLS requests.
- Teller certificate/key handling becomes fragile across local, preview, and production.
- Tyler shifts from private beta to broader public launch earlier than expected.

Until one of those is true, Teller-first is the more practical beta path.

## Netlify Stack

Recommended app stack:

```text
Framework:       Next.js + TypeScript
Deployment:      Netlify via OpenNext adapter
Styling:         Tailwind CSS
Validation:      Zod
Dates:           date-fns or Luxon
Tests:           Vitest
Icons:           lucide-react
Auth/DB:         Supabase Auth + Postgres + RLS, after fake prototype
AI:              OpenAI SDK via Netlify AI Gateway, after fake prototype
Bank data:       MockProvider -> TellerProvider -> PlaidProvider
```

Why Next.js instead of a plain Vite SPA:

- The prior app plan already maps cleanly to `src/app/page.tsx` and route handlers.
- Netlify now supports modern Next.js through OpenNext, including App Router and route handlers.
- Route handlers give a clean home for `/api/free-cash`, `/api/agent`, `/api/sync`, and provider callbacks.
- We can keep the UI static/client-heavy while still having server-side endpoints in one framework.

Why not Vercel:

- Tyler explicitly wants Netlify.
- Netlify supports the required pieces: static/PWA hosting, Next.js route handlers, serverless functions, background functions, scheduled functions, and AI Gateway.

Why not Netlify Identity as the default auth layer:

- This app stores user-scoped financial data.
- Supabase Auth plus Postgres Row Level Security gives a clearer defense-in-depth path.
- Supabase RLS can enforce that user rows stay user-scoped even if a client-side query or backend endpoint is imperfect.

Why not Netlify Database as the default database:

- Netlify Database is attractive and should be watched.
- For this product, Supabase's combined Auth + Postgres + RLS is the lower-risk starting point.
- Netlify Database would require more custom auth and authorization design before I would trust it with financial data.

## Core Architecture

```text
Mobile browser / PWA
  |
  v
Next.js on Netlify
  |
  +-- app/page.tsx
  |     One-number home screen
  |     Prompt chips
  |     Agent thread
  |     Temporary cards
  |
  +-- app/api/free-cash/route.ts
  |     Calls deterministic Free Cash engine
  |
  +-- app/api/agent/route.ts
  |     Phase 1: MockAgentRouter
  |     Phase 3: OpenAI Responses tool calling via Netlify AI Gateway
  |
  +-- app/api/connect/teller/session/route.ts
  |     Returns Teller Connect configuration or nonce
  |
  +-- app/api/connect/teller/callback/route.ts
  |     Verifies Teller enrollment object
  |     Stores provider token server-side
  |
  +-- app/api/sync/route.ts
        Manual sync first
        Background/scheduled sync later
        Calls FinancialDataProvider

Supabase
  |
  +-- auth.users
  +-- profiles
  +-- connected_institutions
  +-- accounts
  +-- transactions
  +-- free_cash_snapshots
  +-- agent_messages
  +-- events

FinancialDataProvider
  |
  +-- MockProvider
  +-- TellerProvider
  +-- PlaidProvider later

Free Cash Engine
  |
  +-- Pure TypeScript
  +-- Tested independently
  +-- No LLM math
  +-- No provider-specific concepts
```

The LLM never owns the financial truth. It can ask tools for already-computed results and then explain them.

## The SDK Confusion

Tyler's confusion is valid. People say "use an SDK for agents," but they often mean different things.

There are at least five SDK categories in this project:

1. Provider API SDK

Example: `openai`, `plaid`, Supabase client.

Use these when calling a vendor API. This is normal and recommended.

2. Agent framework SDK

Example: OpenAI Agents SDK.

Use this when you need a framework-managed agent loop, tool execution, handoffs, guardrails, sessions, tracing, or multi-agent orchestration.

3. UI/streaming SDK

Example: Vercel AI SDK.

Do not use this here. It ties the mental model toward Vercel and chat UI patterns we do not need.

4. Bank linking SDK/component

Example: Plaid Link, Teller Connect.

Use these when users connect bank accounts. These are not "agent SDKs."

5. Platform SDK

Example: Netlify SDK, Netlify CLI, Supabase JS client.

Use only when it reduces integration work.

The important distinction:

```text
Agent-first UX does not require an agent framework SDK.
```

Free Cash is agent-first because the interface is "ask the money layer" instead of "navigate budgeting screens." That does not mean v1 needs OpenAI Agents SDK. In v1, the right "agent" is a deterministic mock router that returns known card types.

## SDKs By Phase

### Phase 1: Fake Prototype

Use:

- `next`
- `react`
- `typescript`
- `tailwindcss`
- `zod`
- `vitest`
- `date-fns` or `luxon`
- `lucide-react`

Do not use:

- OpenAI SDK
- OpenAI Agents SDK
- Vercel AI SDK
- Plaid SDK
- Teller SDK/API client
- Supabase

Reason:

The first milestone is proving the product loop:

```text
Open app
See Free Cash
Ask "Why this number?"
Ask "Can I spend $50?"
Ask "Show true balances"
```

No real bank or LLM is needed to prove that loop.

### Phase 2: Real Auth and Private Beta Data

Use:

- Supabase Auth
- Supabase Postgres
- Supabase RLS policies
- Teller Connect on the frontend
- A custom Teller REST/mTLS backend client
- `FinancialDataProvider` abstraction

Do not add Plaid yet unless Teller fails the proof.

Teller has official SDKs/libraries, including Node.js, but the critical implementation detail is mTLS. A custom client may be clearer than hiding certificate handling too early.

### Phase 3: AI Agent Layer

Use:

- Official `openai` SDK.
- Netlify AI Gateway.
- Responses API.
- Function/tool calling.
- Structured outputs where the model returns UI card instructions.

Do not let the model query raw transaction tables directly.

Good pattern:

```text
User asks: "Why did Free Cash drop?"
API calls Free Cash engine.
Engine returns small JSON explanation.
Model rewrites that explanation in a friendly voice.
UI renders a typed card.
```

Bad pattern:

```text
Send 500 raw transactions to the model and ask it to figure out the answer.
```

### Phase 4: OpenAI Agents SDK, If Needed

Add OpenAI Agents SDK only if the app grows into one or more of these:

- Multi-step workflows that need an agent loop.
- Multiple specialized agents.
- Agent handoffs.
- Human approval gates.
- Built-in tracing of complex agent runs.
- Tool guardrails that are easier to manage through the SDK.
- Persistent sessions/memory at the agent framework layer.

Right now, the app needs deterministic finance tools plus a conversational shell. Responses API function calling is enough.

## OpenAI And Netlify AI Gateway

Netlify AI Gateway changes the model/API-key setup:

- Netlify can set provider API keys and base URLs automatically in Netlify compute contexts.
- Official provider SDKs can pick up those environment variables.
- AI usage bills through Netlify credits.
- AI Gateway does not require a separate OpenAI account/key in normal Netlify production usage.
- A production deploy is required before AI Gateway activates for a new project.

Recommended model path:

```text
Phase 1: No model
Phase 3 default: gpt-5.4-mini
Cheap classifier fallback: gpt-5.4-nano, only if quality is enough
High-stakes/recovery fallback: gpt-5.4 or gpt-5.5, only for rare internal/debug tasks
```

As of current OpenAI pricing, Standard short-context rates are:

```text
gpt-5.4-mini: $0.75 / 1M input tokens, $4.50 / 1M output tokens
gpt-5.4-nano: $0.20 / 1M input tokens, $1.25 / 1M output tokens
gpt-5.5:      $5.00 / 1M input tokens, $30.00 / 1M output tokens
```

Netlify AI Gateway converts model usage into Netlify credits at 180 credits per $1 of model usage.

Example rough cost:

```text
One gpt-5.4-mini turn:
  1,500 input tokens  = $0.001125
  350 output tokens   = $0.001575
  Total               = $0.002700
  Netlify credits     = about 0.49 credits
```

If Netlify's Free plan includes 300 monthly credits, and if those credits were used only for AI, that is roughly 600 similar turns. In reality, credits are shared with other Netlify usage, so this should be treated as a rough ceiling, not a promise.

Cost controls:

- No AI in Phase 1.
- Invite-only beta.
- Daily agent-message caps.
- Never send full transaction histories to the model.
- Precompute Free Cash snapshots.
- Cache explanation JSON.
- Log model, token, and credit usage per request.
- Use deterministic tools before model calls.

## Bank Provider Comparison

### Teller

Pros:

- Real bank data in development.
- Development is free up to 100 enrollments.
- An enrollment is one bank login and may include multiple accounts.
- Public production pricing is understandable:
  - Transactions: $0.30/enrollment/month.
  - Balance: $0.10/API call.
  - Verify: $1.50/account.
  - Identity: $1.75/API call.
- Good fit for a private concept test.

Cons:

- Production requires KYB.
- Development and production require mTLS for end-user data.
- Certificates/private keys must be managed carefully in Netlify Functions.
- Less standard than Plaid for a future fintech/acquisition story.
- Coverage must be tested against Tyler's actual institutions and cards.

Implementation consequence:

```text
Teller calls must happen server-side only.
Store cert/key/CA in Netlify environment variables or secrets.
Use a Node runtime route/function.
Use Node https Agent or undici dispatcher for mTLS.
Never expose Teller certs or long-lived access tokens to browser code.
```

### Plaid

Pros:

- Industry-standard fintech data provider.
- Plaid Link is mature and familiar.
- Strong docs and SDK.
- Broad institutional coverage.
- Transactions covers checking, savings, credit cards, and student loan accounts.
- Cleaner future acquirer/partner story.
- No mTLS certificate handling for ordinary API calls.

Cons:

- Trial is free with real production data but limited to 10 Production Items.
- Removing Items does not free Trial slots.
- Transactions becomes subscription-priced on paid Production plans.
- Exact paid pricing usually requires dashboard access/sales context.
- Ten Items is tight for friends/family if users connect multiple institutions.

Implementation consequence:

```text
PlaidProvider should be built later against the same FinancialDataProvider interface.
Use Plaid Link on frontend.
Use plaid npm package on backend.
Store Plaid access tokens encrypted/server-side.
Normalize Plaid transactions into internal Transaction model.
```

### Decision

```text
Fake prototype: MockProvider
Private beta: TellerProvider
Scale/acquisition path: PlaidProvider
```

Do not build both real providers now. Building both doubles integration work before we know whether the product loop is worth scaling.

## FinancialDataProvider Interface

Codex should create the provider layer before any real provider:

```ts
export interface FinancialDataProvider {
  createConnectSession(userId: string): Promise<ConnectSession>;
  handleConnectCallback(input: unknown): Promise<ConnectedInstitution>;
  syncAccounts(userId: string): Promise<Account[]>;
  syncTransactions(userId: string): Promise<Transaction[]>;
  syncBalances(userId: string): Promise<AccountBalance[]>;
}
```

Internal data models must not contain Plaid/Teller assumptions in the Free Cash engine.

Provider-specific fields belong in provider tables or metadata:

```text
connected_institutions.provider = "mock" | "teller" | "plaid"
connected_institutions.provider_item_id
connected_institutions.provider_enrollment_id
connected_institutions.provider_access_token_encrypted
connected_institutions.institution_name
connected_institutions.status
```

The Free Cash engine receives normalized data only:

```ts
type Account = {
  id: string;
  userId: string;
  kind: "checking" | "savings" | "credit_card" | "loan" | "other";
  name: string;
  institutionName: string;
  currentBalanceCents: number;
  availableBalanceCents?: number;
  connectedInstitutionId: string;
};

type Transaction = {
  id: string;
  userId: string;
  accountId: string;
  postedAt: string;
  pending: boolean;
  amountCents: number;
  merchantName?: string;
  description: string;
  category?: string;
  kind:
    | "income"
    | "purchase"
    | "credit_card_payment"
    | "transfer"
    | "refund"
    | "fee"
    | "unknown";
};
```

## Free Cash Engine Rules

The current architecture must preserve the original product decisions:

- One daily number.
- Rolling calendar-month window, not fixed 30 days.
- Credit-card purchases count as spending.
- Credit-card payments are deduped.
- Transfers do not become spend by accident.
- Refunds offset spend.
- Protected savings are not treated as spendable.
- The app may show true balances only when asked.
- The model never calculates the money.

Core module structure:

```text
src/lib/free-cash/date-window.ts
src/lib/free-cash/classify.ts
src/lib/free-cash/dedupe-credit-card-payments.ts
src/lib/free-cash/engine.ts
src/lib/free-cash/explanation.ts
src/lib/free-cash/engine.test.ts
```

The engine should return both the number and explanation primitives:

```ts
type FreeCashResult = {
  freeCashTodayCents: number;
  window: {
    startDate: string;
    endDate: string;
    daysElapsed: number;
    daysRemaining: number;
  };
  drivers: FreeCashDriver[];
  warnings: FreeCashWarning[];
  trueBalances?: AccountBalanceSummary[];
};
```

## API Shape

Minimal endpoints:

```text
GET  /api/free-cash
POST /api/agent
POST /api/sync
POST /api/connect/teller/session
POST /api/connect/teller/callback
POST /api/connect/plaid/link-token        later
POST /api/connect/plaid/exchange-token    later
```

`/api/agent` should not be a generic chatbot endpoint. It is a typed command endpoint.

Example agent response:

```ts
type AgentResponse = {
  message: string;
  cards: AgentCard[];
  promptChips: PromptChip[];
  audit: {
    toolNames: string[];
    usedModel: boolean;
  };
};
```

Card types:

```text
free_cash_explanation
purchase_simulation
true_balances
recent_transactions
missing_card_nudge
math_breakdown
connect_account
```

## Sync Strategy

Do not start with background sync.

Phase 1:

- Fake data only.
- No sync.

Phase 2:

- Manual "refresh" action for Tyler/private beta.
- Rate limit sync per user.
- Log sync count, duration, provider, and failure reason.

Phase 3:

- Add scheduled/background sync only after manual sync is stable.
- Netlify Scheduled Functions have a 30-second execution limit.
- Netlify Background Functions can run up to 15 minutes.
- Use background jobs for longer provider syncs if needed.

Cost/risk caps:

- No repeated balance polling.
- Do not call Teller Balance repeatedly in production.
- Cache latest balances.
- Prefer transaction sync over real-time balance pulls unless a card explicitly needs balance.
- Do not sync every time the user opens the app.

## Security And Privacy

Minimum standard:

- No bank credentials stored by Free Cash.
- Provider tokens encrypted or stored in a secrets-safe pattern.
- Supabase RLS enabled on all user financial tables.
- Service role key only in server-side Netlify code.
- Teller cert/key only in Netlify server-side environment.
- Never expose Teller private key in frontend, mobile app, logs, or build output.
- Never send full transaction history to an LLM.
- Redact transaction data in logs.
- Keep audit logs for provider sync and AI calls.
- Provide delete-data flow before real beta.

Agent restrictions:

- Cannot move money.
- Cannot initiate payments.
- Cannot change bank connections without explicit user action.
- Cannot call itself a financial advisor.
- Cannot promise a purchase is "safe."
- Must use "Free Cash" language, not "safe to spend."
- Must show true balances only when asked or legally/security necessary.

## Pricing Snapshot

As of June 5, 2026 based on current primary docs checked during this investigation:

### Netlify

```text
Free:     $0, 300 credit limit/month
Personal: $9/month, 1,000 credits/month
Pro:      $20/month for unlimited members
```

Netlify AI Gateway uses the same credit pool as other credit-based usage. AI model usage is converted to credits at 180 Netlify credits per $1 of model usage.

### Supabase

```text
Prototype: likely Free plan
Beta/serious use: likely Pro, commonly listed at $25/month
```

Supabase is chosen less for price and more for Auth + Postgres + RLS.

### Teller

```text
Developer/private testing: free up to 100 live connections/enrollments
Production Transactions: $0.30/enrollment/month
Production Balance:      $0.10/API call
Production Verify:       $1.50/account
Production Identity:     $1.75/API call
```

Big cost hazard:

```text
Balance spam.
```

Do not repeatedly call live balance endpoints just because the user opened the app.

### Plaid

```text
Trial: free real production data for new US/Canada teams, 10 Production Items
Transactions: subscription-fee product after paid upgrade
Sandbox: free
Paid pricing: plan/product dependent, not fully public in docs
```

Big cost/cap hazard:

```text
10 Items is not 10 users if users connect multiple institutions.
```

### OpenAI Via Netlify AI Gateway

```text
Phase 1: $0 because no model
Phase 3: use gpt-5.4-mini by default
```

Rough model prices from OpenAI Standard pricing:

```text
gpt-5.4-mini: $0.75 input / $4.50 output per 1M tokens
gpt-5.4-nano: $0.20 input / $1.25 output per 1M tokens
```

AI should not be a meaningful early cost if we keep prompts tiny and do not send raw transaction lists.

## What Codex Should Build First

First repo milestone:

```text
Open app
See Free Cash Today
Tap "Why this number?"
Receive explanation card
Tap "Can I spend $50?"
Receive purchase simulation card
Type "Show true balances"
Receive true balances card
```

First implementation files:

```text
package.json
next.config.ts
netlify.toml
tailwind.config.ts
src/app/page.tsx
src/app/layout.tsx
src/app/globals.css

src/lib/types.ts
src/lib/fake-data.ts

src/lib/free-cash/date-window.ts
src/lib/free-cash/classify.ts
src/lib/free-cash/engine.ts
src/lib/free-cash/explanation.ts
src/lib/free-cash/engine.test.ts

src/lib/providers/FinancialDataProvider.ts
src/lib/providers/MockProvider.ts

src/lib/agent/mock-agent.ts
src/lib/agent/suggested-prompts.ts
src/lib/agent/card-types.ts

src/components/FreeCashHome.tsx
src/components/PromptChips.tsx
src/components/AgentThread.tsx
src/components/AgentInput.tsx
src/components/cards/CardRenderer.tsx
```

Do not build yet:

- PlaidProvider.
- TellerProvider.
- Supabase.
- OpenAI calls.
- OpenAI Agents SDK.
- Netlify AI Gateway integration.
- Native app.
- Push notifications.
- Budget charts.
- Category dashboards.
- Full settings page.

This may feel counterintuitive, but it is the fastest way to protect the product's actual bet.

## Teller Proof Of Concept

After the fake prototype works, do a small Teller feasibility spike before committing the whole beta to Teller:

```text
1. Create Netlify server-side mTLS test function.
2. Store Teller cert/key as Netlify env vars/secrets.
3. Call a simple Teller API endpoint from Netlify Function.
4. Verify local dev and production deploy behavior.
5. Test Tyler's actual institutions/cards in Teller development.
6. Confirm credit-card transactions are available and normalized enough.
7. Only then build full TellerProvider.
```

If this spike fails, switch the first real provider to Plaid.

## OpenAI Implementation Shape

When AI is added, `/api/agent` should look like this conceptually:

```text
1. Authenticate user.
2. Parse user intent.
3. If known deterministic command, call app tool directly.
4. If model needed, call OpenAI Responses API through Netlify AI Gateway.
5. Expose only approved tools:
   - explain_free_cash
   - simulate_purchase
   - show_true_balances
   - show_recent_transactions
   - detect_missing_credit_cards
6. Validate model output with Zod.
7. Render typed UI cards.
```

No tool should return unlimited raw transactions. Tools should return bounded summaries.

## Decision Register

```text
Hosting:       Netlify
Framework:     Next.js, not Vercel-specific
Database:      Supabase after prototype
Auth:          Supabase Auth after prototype
Bank v1:       MockProvider
Bank beta:     TellerProvider
Bank later:    PlaidProvider
AI v1:         MockAgentRouter
AI later:      OpenAI SDK + Responses API + Netlify AI Gateway
Agent SDK:     Not now
UI SDK:        No Vercel AI SDK
Native app:    Not now
Sync:          Manual first
Money movement: Never in MVP
```

## Highest-Risk Decisions To Validate

1. Teller coverage for Tyler's actual bank and cards.
2. Teller credit-card transaction quality.
3. Teller mTLS from Netlify Functions.
4. Exact rolling calendar-month convention.
5. Pending transaction treatment.
6. Credit-card payment dedupe rules.
7. Whether purchase simulations include expected future income.
8. How legal/delete-data links stay accessible without turning into a settings dashboard.
9. Whether `gpt-5.4-mini` is enough for tone/explanation once AI is added.
10. Whether Supabase Free is enough for first private beta or Pro is needed early.

## Source Links

Netlify:

- Netlify pricing: https://www.netlify.com/pricing/
- Netlify AI Gateway overview: https://docs.netlify.com/build/ai-gateway/overview/
- Netlify pricing for AI features: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/pricing-for-ai-features/
- Netlify Functions overview: https://docs.netlify.com/build/functions/overview/
- Netlify Scheduled Functions: https://docs.netlify.com/build/functions/scheduled-functions/
- Netlify Background Functions: https://docs.netlify.com/functions/background-functions/
- Next.js on Netlify: https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/

OpenAI:

- OpenAI function calling: https://developers.openai.com/api/docs/guides/function-calling
- OpenAI structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI Agents SDK TypeScript: https://openai.github.io/openai-agents-js/
- OpenAI Agents SDK tools: https://openai.github.io/openai-agents-js/guides/tools/
- OpenAI pricing: https://developers.openai.com/api/docs/pricing

Plaid:

- Plaid Link overview: https://plaid.com/docs/link/
- Plaid Transactions: https://plaid.com/docs/transactions/
- Plaid pricing and billing: https://plaid.com/docs/account/billing/
- Plaid Trial plan: https://support.plaid.com/hc/en-us/articles/39994173227159-What-is-the-Plaid-Trial-plan
- Plaid institution coverage: https://plaid.com/docs/institutions/

Teller:

- Teller home/pricing: https://teller.io/
- Teller Connect: https://teller.io/docs/guides/connect
- Teller environments: https://teller.io/docs/guides/environments
- Teller authentication/mTLS: https://teller.io/docs/api/authentication
- Teller official SDKs: https://teller.io/docs/guides/sdks

Supabase:

- Supabase pricing: https://supabase.com/pricing
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security

## Final Build Guidance

Start by building the product proof, not the fintech integration.

The correct first build is a tight, beautiful fake-data app that proves a user can live with:

```text
$43

Ask.
```

Once that loop feels right, add real data carefully through a provider abstraction. Teller is the best first real provider for Tyler/private beta. Plaid is the best later provider if the app moves toward public launch, broader coverage, or acquisition-readiness.
