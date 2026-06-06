# Free Cash App Investigation Report

Date: 2026-06-05

## Follow-Up Supersession Note

Tyler later clarified that the app should use Netlify, not Vercel. The hosting/deployment recommendations in the original report are superseded by `FREE_CASH_ARCHITECTURE_DECISION_REPORT.md`, which recommends Next.js on Netlify, Netlify AI Gateway later, MockProvider first, TellerProvider for Tyler/private beta, and PlaidProvider later.

## Investigation Method

I inspected the ChatGPT thread titled "Banking App Concept" in the in-app browser, scrolled through the virtualized conversation to recover the visible historical context, and identified six distinct Tyler user turns plus the later assistant handoff material. I then spoke to ChatGPT as Codex, explicitly saying I was the coding agent who would build the app and not Tyler. I asked for a full implementation handoff and then a second adversarial pass focused on prototype traps, defaults, deferred decisions, and real questions for Tyler later.

I also checked the current official/public pages for external facts that can drift: Vercel pricing, Supabase pricing and RLS, Plaid pricing/Link/launch consent, Teller Connect/environments, OpenAI tool/function calling, and CFPB personal financial data rights resources. Treat provider pricing and legal/compliance notes as live facts to recheck before real bank integration.

## Executive North Star

The prototype should preserve this experience:

```text
$43
Ask.
```

That is the whole product thesis in miniature. The app should not feel like a finance dashboard, a bank account, a budgeting app, or a chatbot bolted onto financial screens. It should feel like a radically simple daily decision layer: one default number, three useful prompts, and an agent that can explain or reveal more only when asked.

## Product Thesis

Free Cash is an AI-native personal finance app that replaces the misleading default bank balance with one behavior-shaping number: "Free Cash Today." Tyler's observation is that many people open their bank app, see a large account balance, and treat that number as permission to spend, even when rent, bills, card spending, or savings goals make that balance deceptive. Free Cash intentionally hides the tempting big numbers by default and instead shows a rolling calendar-month cash-flow signal that answers the daily question: "How much money is actually free today?" Everything else lives behind an agent-first interface.

This is not "a finance app with an AI assistant." It is an agentic-first finance app where the assistant is the operating system and the only default financial output is Free Cash.

## Conversation Evolution

1. Tyler began with the idea that bank apps cause bad spending behavior by foregrounding the total bank balance. He proposed replacing that with a last-month net income/outcome concept that moves daily and makes users feel the effect of spending without showing a huge number.

2. Tyler rejected heavier forward-looking planning because it asks too much from users. The product should be "brain-dead simple": connect accounts and be done. The complexity should be absorbed by calculation logic and the agent.

3. The concept moved from "safe to spend" toward "Free Cash." Tyler preferred Free Cash because "safe to spend" implies too much certainty and sounds like a liability-bearing promise. Free Cash is a better behavioral signal.

4. Tyler explicitly chose a rolling calendar-month window, not a fixed 30-day window, because fixed 30-day windows can miss rent in 28-day or 31-day month cases. Rent should usually be captured by looking back one calendar month from today.

5. Tyler pushed for the radical version: no menus, no dashboards, no standard account screens. The app should be the Free Cash number plus the agent.

6. Tyler identified credit-card evasion as a core behavioral issue. Users may connect only checking and then spend on credit cards to make the number look better. The app should detect card payments, nudge naturally, and avoid supervisory warning banners or confidence labels.

7. Tyler accepted a monetization/acquisition posture where the consumer app can remain free early, acquisition should stay optional, and the actual asset is repeated daily engagement plus behavior-change evidence.

8. Tyler asked for the fastest path to a friends/family MVP using Codex Desktop. The recommendation converged on a mobile-first web app/PWA, fake data first, then real auth/database, then bank provider integration.

## Tyler's Non-Negotiable Product Rules

- One number by default: "Free Cash Today."
- The true balance must be available, but only by asking the agent.
- No default account balance, no total net worth, no account cards, no transaction feed.
- No dashboard.
- No tabs.
- No hamburger menu in the main experience.
- No budget categories, category management, envelope views, or manual budget setup.
- No charts or financial overview widgets.
- No permanent settings/account/transactions screens in the user-facing product.
- Prompt chips are allowed, but must be capped at three.
- The agent is the primary interface, not an add-on.
- Temporary cards can appear inside the agent thread, but should not become persistent pages.
- User setup should feel like "connect accounts and done."
- Do not moralize, shame, interrogate, or warn like a compliance dashboard.
- Use consequence language: "That would move Free Cash from $43 to -$7."
- Avoid legal/precision overclaiming: do not say "safe," "guaranteed," or "you can definitely afford this."

## MVP Scope

The MVP should include:

- Mobile-first PWA/web app.
- One primary screen.
- Free Cash Today number.
- Three prompt chips.
- Agent conversation area and input.
- Temporary structured card renderer.
- Fake-data prototype first.
- Deterministic Free Cash engine.
- Mock provider abstraction.
- Mock/deterministic agent router first if real model integration slows the loop.
- Unit tests around the Free Cash engine.
- Later: auth, Supabase schema, invite code gate, RLS, events table.
- Later: one real provider, Teller or Plaid, behind a provider interface.

The MVP should exclude:

- Native app.
- App Store or Play Store release.
- Push notifications.
- Weekly reports.
- Charts.
- Budget categories.
- Envelope budgeting.
- Net worth.
- Investments.
- Debt payoff plans.
- Bill negotiation.
- Money movement.
- Payment initiation.
- Credit products, affiliate offers, ads, or loan recommendations.
- Formal financial advice.
- A permanent account screen, balance screen, transaction screen, or settings screen.
- Real bank APIs before the fake one-number + agent loop works.

## Core UI

The first prototype should literally be shaped like this:

```text
Free Cash Today
$43

[ Why this number? ] [ Can I spend $50? ] [ What changed? ]

Ask anything about your money...
```

The number should dominate. Prompt chips should be useful but visually secondary. The agent input should be obvious. Nothing else should compete with the main number.

If a feature wants to become a route, page, modal stack, sidebar, or settings screen, the default answer is: render it as a temporary card inside the agent thread instead.

## Agent-First Behavior

The agent should feel like the app's operating system. It should:

- Explain Free Cash.
- Simulate purchases.
- Show true balances only when asked.
- Show recent transactions only when asked.
- Explain whether rent is counted.
- Explain credit-card effects.
- Detect missing cards.
- Let users change protected savings through confirmation.
- Let users stop card nudges through confirmation.
- Eventually handle account connect/disconnect, data deletion, and privacy commands.

The agent must not calculate money from raw prompt context. It should call deterministic tools and explain the results. In the first prototype, a deterministic mock agent is acceptable and probably preferable.

Suggested mock routing:

```text
why / low / changed -> explain_free_cash
can I spend / spend $X / buy -> simulate_purchase
balance / true balance -> show_true_balances
recent / transactions / charges -> show_recent_transactions
amex / credit card / connect card -> missing_credit_card_nudge
protect savings -> confirmation_card
```

## Free Cash Calculation Model

### Visible Metric

The only default visible metric is:

```text
Free Cash Today
```

Example:

```text
Free Cash Today
$43
```

### Rolling Calendar-Month Window

Tyler explicitly rejected a fixed 30-day lookback. The engine should use a rolling calendar-month window.

Recommended MVP convention:

```ts
windowStartInclusive = subtractOneCalendarMonth(asOfDate)
windowEndInclusive = asOfDate
```

For filtering:

```ts
tx.date >= windowStartInclusive && tx.date <= windowEndInclusive
```

Use user-local date if available. For the fake prototype, use a fixed date:

```text
2026-06-20
```

That gives a clean demo window:

```text
2026-05-20 through 2026-06-20
```

Month-end clamping must be tested. Example: March 31 minus one calendar month should clamp to February 28 or February 29.

### Formula

Use a deterministic engine. Normalize provider data before calculation.

Recommended internal formula:

```text
rollingNet =
  incomeTotal
  - spendingTotal
  - protectedSavingsMonthly

freeCashToday =
  rollingNet / windowDayCount
```

Display:

```text
round(freeCashToday) to nearest whole dollar
```

Do not show cents in the main number.

### Transaction Rules

Income:

- Paychecks count as income.
- Freelance deposits count as income.
- Refunds should not inflate income.
- Transfers from owned accounts should not count as income.
- Credit-card payment credits should not count as income.

Spending:

- Rent counts as spending if in the rolling calendar-month window.
- Normal card purchases count as spending when they happen.
- Normal debit/checking purchases count as spending.
- Category labels can exist internally for explanation, but not as user-managed budgets.

Protected savings:

- Subtract a configured monthly savings amount from rollingNet.
- Do not rely on raw savings transfer detection for the core rule.
- Default fake-data setting: `protectedSavingsMonthly = 200`.
- Changes require confirmation.

Credit cards:

- Count credit-card purchases as spending.
- Do not double-count checking payments to the card if the card purchases are already counted.
- Treat card payments as settlement/transfers when the linked card data is present.
- If checking shows payment to a known card issuer and that card is not connected, trigger a specific missing-card nudge.

Refunds:

- Refunds tied to purchases reduce spending.
- Example: purchase -$100, refund +$40, net spending impact -$60.
- Do not classify refunds as income.

Transfers:

- Transfers between user-owned accounts should not count as spending or income.
- Savings protection is a configured product rule, not automatic transfer counting.

Negative values:

- Free Cash can be negative.
- Do not hide negative values.
- Use practical language, not alarm language.

Example:

```text
Free Cash Today
-$17
```

### Required Engine Tests

- Rolling calendar-month window, not 30 days.
- Month-end clamp.
- Rent included.
- Income included.
- Paycheck exits the rolling window.
- Protected savings subtracted.
- Credit-card purchases counted.
- Credit-card payments deduped.
- Refunds reduce spending.
- Transfers ignored.
- Negative Free Cash allowed.

## Prompt Chips

Prompt chips are essential because users often do not know what to ask. But they must not become a menu.

Rules:

- Exactly three visible chips max.
- Deterministic generation from app state, not open-ended LLM creativity.
- Chips should be short.
- Chips should change based on state.
- Chips should be helpful but not visually dominate.

Default chips:

```text
Why this number?
Can I spend $50?
What changed?
```

Negative state:

```text
Why am I negative?
What should I avoid?
When will this improve?
```

Sharp drop:

```text
Why did this drop?
Show biggest changes
Can I recover?
```

Missing card detected:

```text
Connect Amex
Why does Amex matter?
Stop asking
```

Suggested generator shape:

```ts
if (missingCardDetected) {
  return ["Connect Amex", "Why does Amex matter?", "Stop asking"]
}

if (freeCashToday < 0) {
  return ["Why am I negative?", "What should I avoid?", "When will this improve?"]
}

if (freeCashDroppedSharply) {
  return ["Why did this drop?", "Show biggest changes", "Can I recover?"]
}

return ["Why this number?", "Can I spend $50?", "What changed?"]
```

## Temporary Cards

Temporary cards are the hidden UI system. They replace menus and pages.

Implement these card types in the first prototype:

```text
free_cash_explanation
purchase_simulation
true_balances
recent_transactions
missing_credit_card_nudge
confirmation
```

Cards should be typed templates. The agent can choose which card to render, but should not invent card layouts.

Example explanation card:

```text
Why Free Cash Changed
Rent posted: -$1,450
Groceries increased: -$82
Dining increased: -$41
Paycheck exited window: -$1,900
```

Example purchase simulation:

```text
$80 Purchase
Current Free Cash: $43
After purchase: -$37
Not recommended.
```

Example true balances card:

```text
Actual balances
Checking: $2,184
Savings: $5,700
Credit cards: -$812

Actual balance is not the same as Free Cash.
```

Example missing card nudge:

```text
I noticed payments to Amex, but Amex is not connected.
If you spend on that card, connecting it will make Free Cash more accurate.

[Connect Amex] [Not now] [Stop asking]
```

## Onboarding

The product goal is "connect accounts and done." Do not ask the user to enter rent, bills, categories, budgets, subscriptions, paydays, or goals.

Minimum flow:

```text
To calculate Free Cash, connect the accounts where you earn and spend money.

[Connect account]
```

Then, gently:

```text
Do you spend on credit cards? If you do, connecting them will make Free Cash more accurate.
```

Optional savings protection:

```text
Want to protect savings before Free Cash is calculated?
[Skip] [$100/month] [$200/month] [Custom]
```

Then:

```text
Free Cash is ready.
```

For the first fake-data prototype, the "connect" flow can be a stub that immediately simulates connected accounts.

## Credit-Card Nudge Model

Tyler explicitly rejected persistent confidence labels and generic warnings. Do not show:

```text
Confidence: Partial
Only checking connected
Free Cash may be inaccurate
```

Instead, the agent should occasionally nudge in plain language. The strongest case is specific issuer detection:

```text
I noticed payments to Amex, but Amex is not connected.
If you spend on that card, connecting it will make Free Cash more accurate.
```

Recommended prototype behavior:

- No warning banners.
- No confidence labels.
- Generic nudge only occasionally.
- Specific nudge when checking contains payment-like transactions to issuers such as AMEX, American Express, Chase Card, Capital One, Discover, Citi, Synchrony, or Apple Card.
- "Stop asking" suppresses generic nudges.
- Product decision for later: if the user says stop asking, should a new detected issuer override that once, or should stop asking be absolute? Default prototype answer: generic nudges stop, but a materially new issuer can appear once.

## Fake Data Defaults

Use one fake user with:

```text
Checking account
Savings account
Amex credit card
Apple Card or Capital One card
```

Use a fixed fake current date:

```text
2026-06-20
```

Target default visible result:

```text
Free Cash Today = $43
```

Also create an internal negative scenario for tests:

```text
Free Cash Today = -$17
```

Seed transactions should prove the thesis:

```text
Paycheck: +$1,900
Paycheck: +$1,900
Freelance deposit: +$600
Rent: -$1,450
Groceries: -$324 total
Dining: -$180 total
Gas/transport: -$90 total
Subscriptions: -$64 total
Amex restaurant purchase: -$62
Amex grocery purchase: -$88
Checking payment to Amex: -$500
Amex payment credit: +$500
Target purchase: -$100
Target refund: +$40
Checking to Savings: -$200
Savings incoming transfer: +$200
```

Add a second fake scenario where only checking is connected but checking has:

```text
AMEX EPAYMENT -$500
```

That scenario exists to prove the missing-card nudge.

## Data Model

Minimal schema:

```text
users
- id
- email
- created_at

connected_institutions
- id
- user_id
- provider
- provider_item_id / enrollment_id
- institution_name
- status
- created_at
- last_synced_at

accounts
- id
- user_id
- institution_id
- provider_account_id
- name
- type
- subtype
- mask
- current_balance
- available_balance
- currency
- last_synced_at

transactions
- id
- user_id
- account_id
- provider_transaction_id
- date
- authorized_date
- merchant_name
- description
- amount
- direction
- type
- category
- is_transfer
- is_credit_card_payment
- is_income
- is_refund
- created_at

free_cash_snapshots
- id
- user_id
- date
- rolling_window_start
- rolling_window_end
- rolling_net
- free_cash_today
- explanation_json
- created_at

agent_messages
- id
- user_id
- role
- content
- tool_name
- tool_result_json
- created_at

user_settings
- user_id
- protected_savings_monthly
- stopped_credit_card_nudges
- created_at
- updated_at

events
- id
- user_id
- event_name
- event_properties_json
- created_at
```

Transaction normalization is important because providers differ on signs. The report recommendation is to use either:

```ts
direction: "inflow" | "outflow"
amountAbs: number
```

or a signed `amount`, but document the convention strictly and test provider normalization.

## Agent Tools

The agent should only answer finance questions by calling approved tools.

Minimum tool list:

```text
get_free_cash(userId)
explain_free_cash(userId)
simulate_purchase(userId, amount)
show_true_balances(userId)
show_recent_transactions(userId, filters)
show_connected_accounts(userId)
connect_account(userId)
set_protected_savings(userId, amount)
detect_missing_credit_cards(userId)
set_credit_card_nudge_preference(userId, preference)
delete_user_data(userId)
```

Response shape:

```ts
type AgentResponse = {
  message: string
  card?: {
    type:
      | "free_cash_explanation"
      | "true_balances"
      | "purchase_simulation"
      | "recent_transactions"
      | "connected_accounts"
      | "missing_credit_card_nudge"
      | "confirmation"
    data: unknown
  }
  suggestedPrompts: SuggestedPrompt[]
}

type SuggestedPrompt = {
  id: string
  label: string
  message: string
  reason:
    | "default"
    | "free_cash_drop"
    | "negative_free_cash"
    | "missing_card"
    | "user_history"
    | "recent_change"
}
```

First prototype can use a deterministic mock agent. Later OpenAI integration should use tool/function calling and structured outputs so the model routes intents and explains deterministic tool results rather than inventing financial math.

## Security, Privacy, and Compliance Constraints

Even a friends/family beta handles sensitive financial data.

Minimum rules:

- Never store bank credentials.
- Never expose provider access tokens to the frontend.
- Encrypt provider tokens at rest.
- Use HTTPS only.
- Use Supabase row-level security.
- Users can only access their own rows.
- Add account/data deletion.
- Add basic privacy policy.
- Add basic terms.
- Add "not financial advice" language.
- Log agent tool calls.
- Keep calculations explainable.
- Do not sell raw transaction data.
- Do not use transaction data for ads.
- Minimize data sent to the LLM.
- Do not dump full transaction histories into prompts by default.

Agent must never:

```text
Invent balances.
Invent transactions.
Invent account status.
Calculate Free Cash from raw prompt context.
Move money.
Initiate payments.
Recommend loans or credit products.
Give formal financial advice.
Guarantee that spending is safe.
Hide the ability to view real balances.
Delete data without confirmation.
Change savings protection without confirmation.
Disconnect accounts without confirmation.
Shame the user.
Moralize about spending.
```

## Stack and Deployment Path

Fastest friends/family beta stack:

```text
Frontend: Next.js + TypeScript
Styling: Tailwind CSS
Backend: Next.js API routes/server actions
Database/Auth: Supabase
Hosting: Vercel
Bank data: MockProvider first, then Teller or Plaid
AI: Mock agent first, then OpenAI tool/function calling
Repo: GitHub
Workflow: Codex Desktop
```

Deployment path:

```text
GitHub repo -> Vercel deployment -> Supabase project -> invite-only beta URL -> friends/family testers
```

No native app for MVP. PWA first.

## Current External-Fact Checks

These are current-source checks made on 2026-06-05. Recheck before spending money or committing to a provider.

- Vercel pricing: Vercel lists Hobby as free and Pro as $20/month plus additional usage. Source: [Vercel Pricing](https://vercel.com/pricing).
- Supabase pricing: Supabase lists a Free plan and Pro from $25/month. Source: [Supabase Pricing](https://supabase.com/pricing).
- Supabase RLS: Supabase docs say RLS should be enabled on exposed tables and can be combined with Supabase Auth. Source: [Supabase Row Level Security](https://supabase.com/docs/guides/auth/auth-deep-dive/auth-row-level-security).
- Plaid Trial/pricing: Plaid support/docs currently describe a free Trial plan for new US/Canada teams created on or after April 15, 2026, capped at 10 Production Items; paid pricing varies by product/model. Sources: [Plaid pricing plans](https://support.plaid.com/hc/en-us/articles/16110502116887-What-are-Plaid-s-prices-and-pricing-plans-and-how-do-they-differ), [Plaid billing docs](https://plaid.com/docs/account/billing/), [Plaid pricing](https://plaid.com/pricing/).
- Plaid Link: Plaid docs state Link is the client-side component users interact with to link accounts, and Link is mandatory for most Plaid integrations. Source: [Plaid Link overview](https://plaid.com/docs/link/).
- Plaid launch/consent: Plaid's launch checklist includes notice and consent for Plaid to process end-user information. Source: [Plaid Launch checklist](https://plaid.com/docs/launch-checklist/).
- Teller Connect: Teller docs say Teller Connect handles credential validation, MFA, account selection, and error handling. Source: [Teller Connect](https://teller.io/docs/guides/connect).
- Teller environments: Teller docs list sandbox as simulated/free/unlimited, development as real bank data/free/100 enrollments, and production as paid/unlimited with KYB requirements. Source: [Teller Environments](https://teller.io/docs/guides/environments).
- OpenAI tool/function calling: OpenAI docs describe function/tool calling as the way to connect models to application tools and external systems. Source: [OpenAI Function calling](https://platform.openai.com/docs/guides/function-calling?api-mode=responses).
- CFPB/open banking: CFPB resources show the Personal Financial Data Rights rule context and later compliance resources/reconsideration activity; this is legal/compliance territory and should be checked with counsel before real financial-data launch. Sources: [CFPB Personal financial data rights](https://www.consumerfinance.gov/compliance/compliance-resources/other-applicable-requirements/personal-financial-data-rights/), [CFPB Required Rulemaking](https://www.consumerfinance.gov/personal-financial-data-rights/).

Note: ChatGPT previously mentioned specific Teller production pricing such as "$0.30/enrollment/month." I did not confirm that on an official Teller pricing page during this investigation. Treat Teller production pricing as unverified until Teller confirms it directly.

## Beta Metrics

Do not judge success by whether people say the app is cool. Judge whether it becomes a daily spending-decision habit.

Engagement:

```text
daily opens
daily active users
D1 retention
D7 retention
D30 retention
Free Cash views
agent questions per user
prompt chip tap rate
```

Behavior:

```text
"Can I spend $X?" requests
purchase simulations per user
negative Free Cash follow-up behavior
spending reduction after negative Free Cash
users who connect credit cards
missing-card nudge conversion
savings protection adoption
```

Trust:

```text
show true balances requests
show math requests
explanation requests
account disconnects
user deletion requests
agent correction/frustration signals
```

Economics:

```text
AI cost per active user
provider cost per connected user
average connected accounts per user
sync cost per user
```

## Monetization and Acquisition Posture

Keep monetization optional early. The product should remain compatible with several futures:

- Free consumer app first.
- Tiny paid tier later.
- B2B2C through credit unions, community banks, employers, payroll platforms, or financial wellness programs.
- White-label or SDK later.
- Acquisition by banks, neobanks, card companies, or financial wellness platforms.

Avoid ads and be very cautious with affiliate revenue because those incentives can damage trust. Do not build subscriptions, paywalls, weekly reports, premium tiers, affiliate recommendations, or monetization mechanics into the MVP unless cost control forces it.

The acquisition/funding story to preserve:

```text
Free Cash is a daily financial decision layer.
It creates repeated daily engagement around spending decisions.
It replaces the misleading bank balance with one agentic behavior-shaping number.
```

## Highest-Risk Prototype Traps

1. Accidentally building a dashboard.
   - Do not add account cards, charts, widgets, trend summaries, or overview panels.

2. Making true balances too easy to see.
   - True balances should be request-only through the agent.

3. Turning prompt chips into a menu.
   - Three chips max.

4. Adding generic warnings or confidence labels.
   - Use agentic nudges instead.

5. Building "Safe to Spend" instead of "Free Cash."
   - Use "Free Cash Today."

6. Using a fixed 30-day lookback.
   - Use rolling calendar-month date math.

7. Letting the LLM do the math.
   - TypeScript engine does math. Agent explains results.

8. Double-counting credit-card payments.
   - Count card purchases, dedupe settlements.

9. Starting with Plaid/Teller too early.
   - Prove fake loop first.

10. Adding budgets/categories.
   - Internal categories for explanation are fine; user-managed budgets are not.

11. Making onboarding feel like setup.
   - Connect, optional savings protection, done.

12. Building permanent settings/account screens.
   - Agent commands and temporary cards first; minimal legal/footer links only if required.

## Decisions That Can Wait

- Teller vs Plaid.
- Exact provider transaction normalization details.
- Pending transactions.
- Bank connection UX details.
- Real sync jobs/webhooks.
- Production token encryption implementation details.
- Native app.
- Push notifications.
- Actual monetization.
- Formal analytics provider.
- Real OpenAI routing if mock agent proves the loop first.

## Questions for Tyler Later

These should not block the fake-data prototype:

1. Final brand tone and exact copy style.
2. Whether legal/privacy/account deletion links can live in tiny footer text or must only be agent commands plus footer.
3. Whether "Stop asking" about cards is absolute or can be overridden once by a newly detected issuer.
4. Whether Free Cash should ever include expected future income. Default is no.
5. Exact wording for purchase recommendations: "OK", "Caution", "Not recommended."
6. Whether users can ever customize the main number. Default is no.
7. Whether savings protection belongs in onboarding or after first use.
8. What level of polish is required before friends/family beta.

## Smallest Worthwhile Prototype

Goal:

```text
Open app
-> see one Free Cash number
-> tap a prompt
-> agent explains or simulates spending
-> user understands without dashboard
```

Required files/components:

```text
src/app/page.tsx
src/components/FreeCashHome.tsx
src/components/PromptChips.tsx
src/components/AgentThread.tsx
src/components/AgentInput.tsx
src/components/cards/CardRenderer.tsx
src/lib/fake-data.ts
src/lib/free-cash/date-window.ts
src/lib/free-cash/engine.ts
src/lib/free-cash/classify.ts
src/lib/free-cash/explanation.ts
src/lib/agent/mock-agent.ts
src/lib/agent/suggested-prompts.ts
src/types.ts
src/lib/free-cash/engine.test.ts
```

Minimal UI:

```text
Free Cash Today
$43
[ Why this number? ] [ Can I spend $50? ] [ What changed? ]
Ask anything about your money...
```

Minimal interactions:

- Tapping "Why this number?" shows an explanation and explanation card.
- Tapping "Can I spend $50?" shows a purchase simulation and card.
- Tapping "What changed?" shows rolling-window explanation and card.
- Typing "Show my true balances" shows a true balances card.
- Typing "Connect Amex" shows a missing-card nudge/connect stub.

Minimal acceptance criteria:

- No menus exist.
- No actual balances appear by default.
- Free Cash is the only default financial number.
- Prompt chips are visible and limited to three.
- Agent can answer why this number, can I spend $X, show true balances, and connect missing credit card.
- Temporary cards render inside the chat.
- Free Cash comes from a deterministic engine.
- Credit-card payment dedupe works in tests.
- The app still makes sense on a phone-sized screen.

## Recommended Build Sequence

1. Create the spec docs:

```text
SPEC.md
PRODUCT_RULES.md
FREE_CASH_ENGINE.md
AGENT_INTERFACE.md
DATA_MODEL.md
PROVIDER_ABSTRACTION.md
SECURITY_PRIVACY.md
BETA_METRICS.md
BUILD_PLAN.md
```

2. Build the fake-data UI:

```text
Next.js + TypeScript + Tailwind
Mobile-first home screen
Fake Free Cash number
Fake prompt chips
Agent chat UI
Temporary card renderer
Mock agent responses
```

Acceptance:

```text
User opens app. Sees only Free Cash Today, prompt chips, and agent input.
Tapping prompt chips creates agent response.
Temporary cards render.
No menus/tabs/dashboard exist.
```

3. Build the Free Cash engine:

```text
src/lib/free-cash/date-window.ts
src/lib/free-cash/normalize.ts
src/lib/free-cash/classify.ts
src/lib/free-cash/engine.ts
src/lib/free-cash/explanation.ts
src/lib/free-cash/engine.test.ts
```

Acceptance:

```text
Engine produces deterministic Free Cash and explanation JSON from fake transactions.
Tests cover rolling month, rent, income, transfers, card purchases, card-payment dedupe, refunds, protected savings, and negative values.
```

4. Build deterministic prompt chips.

5. Build provider abstraction and MockProvider.

6. Add Supabase auth/database and invite gate.

7. Add real agent API with tool calling only after mock flow is strong.

8. Add one provider, Teller or Plaid, only after fake prototype works.

9. Prepare friends/family beta with privacy/terms, account deletion, event logging, and cost monitoring.

## Final Recommendation

Build the intentionally incomplete prototype first. The danger is not that the first version is too small. The danger is that it becomes a normal finance app.

The correct first version is:

```text
No menus.
No dashboard.
No real bank API.
No native app.
No monetization.
One number.
Three prompts.
Agent cards.
Deterministic Free Cash engine.
```

Once that loop feels right, then connect auth, database, provider abstraction, and real bank data.
