# Free Cash PRD

Date: June 5, 2026
Status: Ready for implementation planning; updated June 7, 2026 for OpenAI Agents SDK migration, Google OAuth onboarding, open Google signup, and Plaid-first beta implementation

## Problem Statement

People make everyday spending decisions from the wrong default number. A normal bank app foregrounds the user's total account balance, which can look deceptively large because it includes money already spoken for by rent, bills, credit-card purchases, transfers, savings goals, and the uneven timing of income. When the user sees a big balance, the app silently gives them permission to spend, even when their actual day-to-day cash position is fragile.

Tyler wants a product that replaces that misleading default with one behavior-shaping number: "Free Cash Today." The user should not have to learn a budget system, maintain categories, build a plan, or interpret charts. They should connect accounts and get a simple daily signal. If they want to know why the number changed, whether a purchase is a bad idea, or what their real balances are, they should ask the app.

The product must not become a traditional personal finance dashboard with an AI assistant attached. The assistant is the operating surface. The default product is one number and an input.

## Solution

Free Cash is a mobile-first, agent-first personal finance app that shows the user a single default financial signal: "Free Cash Today." The app calculates that number from normalized account and transaction data using a deterministic Free Cash engine. The engine uses a rolling calendar-month window, counts credit-card purchases as spending, dedupes credit-card payments, protects savings from spendable cash, handles refunds and transfers conservatively, and allows the number to go negative.

The first version will use fake data to prove the product loop before any real bank, database, or AI integration. Users will see a simple home screen with the Free Cash number, up to three prompt chips, an agent input, and temporary response cards. The mock agent will support a small set of high-value interactions: explaining the number, simulating a purchase, showing true balances on request, showing recent transactions, and nudging users about likely missing credit-card spend.

After the prototype proves the loop, the app will add Supabase Auth and Postgres with Row Level Security, then a financial data provider abstraction. The current beta implementation should use Google OAuth through Supabase Auth as the primary sign-in path, because magic-link email limits block repeated onboarding testing and Google is the intended long-term identity provider. Any Google account should be able to sign up; the app should no longer require Tyler to maintain an invited-email allowlist for testing.

The current real-data beta provider should be PlaidProvider behind the financial provider abstraction. Plaid Link should be launched from the chat onboarding flow, Plaid OAuth redirects should return to a Spendable-owned callback page, and long-lived Plaid access tokens should be stored only server-side in the private provider credentials table. TellerProvider remains a possible fallback/reference provider if Plaid coverage, pricing, or launch requirements become a blocker, but Teller is no longer the first real provider for this implementation pass.

OpenAI should not be used in the first fake-data prototype. The current beta agent uses the official OpenAI Agents SDK through Netlify AI Gateway/OpenAI-compatible configuration in Responses API mode, with structured outputs and deterministic app tools. The model may decide whether to answer conversationally, call tools, ask for clarification, or show a card, but it must never calculate money, move money, invent cards, mention dashboards, or see full raw transaction histories unnecessarily. The earlier v1 decision to defer OpenAI Agents SDK is superseded: the hand-rolled single-tool router produced repeated card behavior and did not meet the product need for a real tool-using conversational agent.

## User Stories

1. As a user, I want to open the app and immediately see Free Cash Today, so that I know the daily spending signal without interpreting my bank balance.

2. As a user, I want the default screen to avoid showing my full bank balance, so that I am not tempted by money that is already spoken for.

3. As a user, I want Free Cash Today to be a single prominent number, so that the app feels simple instead of like a budget dashboard.

4. As a user, I want the app to calculate Free Cash from my real income and spending patterns, so that I do not have to maintain a manual budget.

5. As a user, I want Free Cash to use a rolling calendar-month window, so that rent and other monthly obligations are handled more naturally than with a fixed 30-day window.

6. As a user, I want credit-card purchases to reduce Free Cash, so that spending on cards does not make me feel richer than I am.

7. As a user, I want credit-card payments to be deduped, so that paying the card does not count as a second spending event.

8. As a user, I want transfers between my own accounts to avoid counting as purchases, so that moving money does not distort Free Cash.

9. As a user, I want refunds to offset previous spend, so that returned purchases make the number more accurate.

10. As a user, I want protected savings to be excluded from spendable money, so that money I am trying not to spend does not inflate Free Cash.

11. As a user, I want Free Cash to be allowed to go negative, so that the app can clearly show when my current pattern is not sustainable.

12. As a user, I want the app to say "Free Cash" instead of "safe to spend," so that the app gives a useful signal without pretending to guarantee outcomes.

13. As a user, I want the app to avoid generic confidence badges and warnings, so that it feels decisive and not like a noisy finance tool.

14. As a user, I want to ask "Why this number?", so that I can understand what changed without opening a dashboard.

15. As a user, I want to ask "Can I spend $50?", so that I can see the consequence of a purchase before making it.

16. As a user, I want the app to say how a purchase would move Free Cash, so that the tradeoff is concrete.

17. As a user, I want purchase simulations to avoid overconfident advice, so that the product stays useful without making promises.

18. As a user, I want to ask for true balances only when I need them, so that the tempting balance number is not the default.

19. As a user, I want true balances to appear in a temporary card, so that I can inspect them without turning the app into a bank dashboard.

20. As a user, I want recent transactions to be shown only when I ask, so that transaction lists do not dominate the app.

21. As a user, I want the app to explain the biggest drivers of Free Cash, so that I can understand the number quickly.

22. As a user, I want the app to show entered-window and exited-window effects when relevant, so that I understand why the rolling window changed my number.

23. As a user, I want the app to tell me when rent or a major bill is affecting Free Cash, so that the number feels trustworthy.

24. As a user, I want the app to detect likely credit-card payments, so that it can tell when a connected bank account is paying an unconnected card.

25. As a user, I want the app to gently nudge me when a likely unconnected credit card exists, so that I can improve accuracy without feeling scolded.

26. As a user, I want to dismiss or suppress repeated missing-card nudges, so that intentional account omissions do not become annoying.

27. As a user, I want the app to preserve my choice not to connect a card, so that I remain in control of my financial data.

28. As a user, I want the app to tell me that Free Cash may be inaccurate if I spend on unconnected cards, so that I understand the consequence of incomplete data.

29. As a user, I want the onboarding to be short, so that I can connect accounts and get value quickly.

30. As a user, I want to continue with Google instead of waiting for a magic-link email, so that onboarding does not get blocked by email delivery limits.

31. As a user, I want onboarding copy to say that connecting spending accounts makes Free Cash more accurate, so that I understand why card data matters.

32. As a user, I want to set a protected savings amount or choose a default, so that the app does not treat all savings as free cash.

33. As a user, I want the first prototype to behave realistically even with fake data, so that I can judge whether the product loop feels right.

34. As a user, I want the fake prototype to show a believable default Free Cash value around $43, so that it demonstrates the intended daily-decision experience.

35. As a user, I want a negative Free Cash fake-data scenario, so that I can see how the app handles financial stress without panic language.

36. As a user, I want the app to feel mobile-native even as a PWA, so that it feels like something I would actually open daily.

37. As a user, I want the app to avoid menus, tabs, and permanent dashboards, so that the experience stays radically simple.

38. As a user, I want prompt chips to suggest only a few useful questions, so that I am guided without being given a menu.

39. As a user, I want prompt chips to change based on context, so that they feel helpful rather than static.

40. As a user, I want no more than three visible prompt chips, so that the interface stays light.

41. As a user, I want agent responses to appear as short text plus structured cards, so that answers are easy to scan.

42. As a user, I want important response cards to remain available in the chat history after I send another message, so that I do not lose context during setup or explanation.

43. As a user, I want the agent to remember the current conversation enough to answer follow-ups, so that I do not have to restate the same context.

44. As a user, I want the agent to avoid pretending to know things it cannot know, so that trust is not destroyed.

45. As a user, I want the agent to avoid financial-advisor language, so that it remains a decision aid rather than a formal advisor.

46. As a user, I want the app to avoid money movement in the MVP, so that I can trust it as an insight layer before it ever gets action authority.

47. As a user, I want my financial data to stay private and protected, so that using the app does not create unnecessary risk.

48. As a user, I want the app to let me delete my data before any real beta, so that I can leave cleanly.

49. As a user, I want bank connection repair flows to be straightforward, so that a stale connection does not silently degrade Free Cash.

50. As a beta tester, I want any Google account to be able to sign up, so that onboarding testing is not blocked by invite-list maintenance or Supabase email limits.

51. As a user, I want a clear same-screen auth error if Google sign-in fails, so that I know to try again without leaving Spendable.

52. As a beta tester, I want manual refresh before background sync, so that I can test the product without unexpected provider usage or costs.

53. As a beta tester, I want clear messaging when data is stale, so that I know when the Free Cash number was last refreshed.

54. As a beta tester, I want the app to behave well when pending transactions exist, so that Free Cash does not swing unpredictably.

55. As a beta tester, I want the app to handle missing merchant names and messy transaction descriptions, so that real-world bank data does not break the experience.

56. As a beta tester, I want the app to detect refunds and transfers conservatively, so that unusual transactions do not create obviously wrong numbers.

57. As a beta tester, I want to connect checking, savings, and credit-card accounts under one institution when available, so that the app captures the complete spending picture.

58. As a beta tester, I want the app to continue working if one connected institution temporarily fails, so that the whole product does not collapse because of one provider issue.

59. As a developer, I want the Free Cash engine to be a pure deterministic module, so that the money math can be tested independently from UI, bank providers, and AI.

60. As a developer, I want transaction normalization to be separated from provider integration, so that Plaid and any future provider can both feed the same engine.

61. As a developer, I want a FinancialDataProvider abstraction, so that MockProvider, PlaidProvider, and any later TellerProvider can be swapped without rewriting product logic.

62. As a developer, I want MockProvider to exist before real providers, so that the prototype can be built and tested without bank API friction.

63. As a developer, I want PlaidProvider isolated behind the provider abstraction, so that Link sessions, public-token exchange, access tokens, cursors, and Plaid OAuth resume behavior do not leak into the Free Cash engine.

64. As a developer, I want TellerProvider to remain optional behind the same abstraction, so that a switch or dual-provider future is possible without a rewrite.

65. As a developer, I want provider tokens and certificates handled server-side only, so that sensitive credentials never reach the browser.

66. As a developer, I want Supabase RLS on user financial tables, so that row-level access rules protect data even if a client query is imperfect.

67. As a developer, I want Netlify route handlers or functions to own server-side financial operations, so that browser code cannot call provider APIs directly.

68. As a developer, I want manual sync and rate limiting before scheduled sync, so that early provider costs and errors are controlled.

69. As a developer, I want sync logs to capture provider, duration, counts, and failures, so that beta issues are diagnosable.

70. As a developer, I want the mock agent to be deterministic in phase 1, so that the UX can be validated without model variability.

71. As a developer, I want OpenAI tool/function calling only after the deterministic loop works, so that AI adds value rather than masking unclear product logic.

72. As a developer, I want model prompts to use bounded summaries rather than raw transaction dumps, so that cost and privacy risk stay low.

73. As a developer, I want structured agent card outputs, so that the UI can render consistent temporary cards instead of arbitrary chat prose.

74. As a developer, I want prompt chip generation to be deterministic at first, so that the product does not depend on AI for basic navigation.

75. As a developer, I want the app to use OpenAI Agents SDK once the hand-rolled router becomes limiting, so that the agent can decide when to call tools, answer conversationally, suppress repeated cards, and preserve tracing boundaries without moving money math into the model.

76. As a developer, I want Netlify AI Gateway added only when AI is needed, so that the first prototype has no model-cost surface area.

77. As a developer, I want cost counters for AI and provider sync, so that beta usage cannot quietly become expensive.

78. As an operator, I want to know which users have stale connections, so that beta support can focus on real data quality issues.

79. As an operator, I want to know how often users view Free Cash and ask follow-up questions, so that we can measure whether the daily decision layer is working.

80. As an operator, I want to track purchase simulation usage, so that we can see whether users rely on the app before spending.

81. As an operator, I want to track negative Free Cash follow-up behavior, so that we can learn whether the product changes spending decisions.

82. As an operator, I want to track missing-card nudge outcomes, so that we know whether the nudge improves accuracy or annoys users.

83. As an operator, I want to keep acquisition optional, so that the product can grow independently while preserving a clean future partner story.

84. As a future partner or acquirer, I want the app to have clear provider boundaries and deterministic financial logic, so that the product is understandable and auditable.

85. As a future partner or acquirer, I want the app to support Plaid cleanly, so that standard fintech integration is understandable if the product moves beyond private beta.

86. As a security reviewer, I want a clear rule that the app never stores bank credentials, so that the risk profile is limited to provider tokens and normalized financial data.

87. As a security reviewer, I want Plaid provider tokens and any future Teller mTLS certs to be isolated from frontend code, so that user data access cannot be compromised through the browser.

88. As a security reviewer, I want the agent to be blocked from money movement, so that model behavior cannot create financial harm.

89. As a compliance reviewer, I want the app to avoid "safe to spend" language, so that the product does not imply certainty or formal financial advice.

90. As a compliance reviewer, I want user consent and data deletion flows before real bank beta, so that the app has a minimum viable privacy posture.

## Implementation Decisions

- The product will be built first as a mobile-first web/PWA experience, not a native app.

- The deployment target is Netlify, not Vercel.

- The recommended framework is Next.js with TypeScript, deployed on Netlify through Netlify's current Next.js/OpenNext support.

- The first product milestone used fake data to prove the loop before real provider work. The current beta milestone includes Supabase Auth, Supabase Postgres/RLS, Plaid sandbox connection, OpenAI Responses API behavior, and Netlify deployment.

- The prototype's visible surface is one number, up to three prompt chips, an agent input, and temporary response cards.

- "Free Cash Today" is the only default financial number.

- True balances are available only through an explicit user request or a required legal/security flow.

- The app uses "Free Cash" language and avoids "safe to spend" language.

- The app uses consequence phrasing for purchase simulations. Example: "That would move Free Cash from $43 to -$7."

- The Free Cash engine is a deep module. It encapsulates rolling-window date logic, transaction classification, credit-card payment dedupe, savings protection, refund handling, transfer handling, negative values, and explanation primitives behind a small deterministic interface.

- The Free Cash engine must not call bank providers, database clients, or AI models.

- The rolling period is a calendar-month-relative window, not a fixed 30-day lookback.

- The default MVP interpretation of Free Cash is a daily cash-flow signal derived from normalized transaction and balance data, protected savings, and the current rolling window.

- Credit-card purchases count as spend when they appear as card transactions.

- Credit-card payments are deduped so the payment from checking to the card does not count as an additional purchase.

- Transfers between user accounts are excluded from spend when they can be confidently detected.

- Refunds offset prior spending.

- Pending transactions require an explicit MVP convention. The default should be conservative: include pending card purchases in the user-facing explanation when they materially affect the number, but label the data state so tests can enforce consistent behavior.

- Free Cash can be negative. Negative values are not an error state.

- The date-window module is a deep module. It should make calendar-month behavior explicit and testable without involving the rest of the app.

- The transaction classifier is a deep module. It receives normalized transactions and returns internal transaction kinds such as income, purchase, credit-card payment, transfer, refund, fee, and unknown.

- The credit-card payment dedupe module is a deep module. It should match likely bank-account payments to credit-card payment events without requiring an LLM.

- The explanation module is a deep module. It turns engine results into bounded explanation primitives that can be rendered directly or passed to a model later.

- The prompt chip generator is a deep module. It deterministically produces no more than three contextual prompt chips.

- The temporary card renderer is a reusable UI module. It renders typed response cards for explanation, purchase simulation, true balances, recent transactions, missing-card nudges, math breakdowns, and account connection prompts.

- The agent command router started as a deterministic mock router. That remains the local/test fallback, but the current beta `/api/agent` path now uses an OpenAI Agents SDK Spendable agent.

- Explicit prompt-chip commands should remain reliable action entrypoints inside the Agents SDK architecture without bypassing the AI response. If a user taps or types "Why this number?", "Show the math", "Show recent transactions", asks for true/real balances, or asks to test a specific purchase amount, the backend should force the corresponding SDK tool call and return the typed card, while the model still writes the visible chat message.

- The phase 1 agent should support at least: why this number, can I spend a specific amount, show true balances, show recent transactions, show math, and connect another account.

- Agent output must be structured. Free-form prose may accompany a card, but the UI should not depend on arbitrary text parsing. The current structured output includes `message`, optional `cards`, `promptChips`, `usedTools`, and `responseMode`.

- The model never calculates Free Cash. It can only call approved tools, explain deterministic results, ask clarifying questions, or answer chat-only when tools are unnecessary.

- AI integration uses the official OpenAI Agents SDK through Netlify AI Gateway/OpenAI-compatible configuration after the fake-data product loop is proven.

- AI integration uses Responses API mode, tool/function calling, structured outputs, and tracing with sensitive input/output capture disabled where supported.

- OpenAI Agents SDK is now part of the beta agent implementation. The superseded "avoid Agents SDK in v1" rule is kept only as historical context because the app now needs a real tool-using agent to avoid canned/repeated responses.

- Vercel AI SDK is not part of the plan because the app is Netlify-based and does not need Vercel-specific chat UI patterns.

- Supabase Auth and Postgres are the beta auth and persistence layer.

- Google OAuth through Supabase Auth is the primary sign-in method for the beta onboarding flow.

- Magic-link email sign-in may remain as a fallback or diagnostic route, but it is not the default onboarding path because Supabase email sender limits block repeated testing.

- The OAuth start flow should be owned by a small auth module or route that creates a Google OAuth authorization request with a same-origin callback URL.

- The OAuth callback is responsible for exchanging the Supabase auth code and redirecting the signed-in user back to the Spendable screen.

- Signup is open to any Google account. Legacy invite tables/functions may remain in old migrations for now, but runtime auth should not call them or sign out users based on an allowlist.

- Guest onboarding should not ask the user to type an email address by default. It should present Google sign-in as the primary action while still allowing "How it works" style questions in the chat.

- Supabase Row Level Security is required for any user-scoped financial tables.

- Netlify Identity is not the default auth choice because this product needs database-level user isolation around financial data.

- Netlify Database is not the default database choice for MVP because Supabase Auth plus Postgres plus RLS is the clearer financial-data posture.

- The financial data provider layer is a deep module. It defines app-level operations for creating a connect session, handling connect callbacks, syncing accounts, syncing transactions, and syncing balances.

- MockProvider remains the fake-data provider for prototype and local fallback scenarios.

- PlaidProvider is the first real provider for the current beta implementation.

- PlaidProvider uses Plaid Link on the frontend, Plaid backend APIs through server-side code, and a Spendable-owned Plaid OAuth resume route for institutions that redirect during Link.

- TellerProvider remains a fallback/reference path behind the same provider abstraction, but it is not the primary beta provider.

- Both real providers should not be expanded simultaneously. The beta should harden Plaid before investing in Teller.

- Teller integration, if revived, requires server-side mTLS handling. Teller certificates and private keys must never reach browser code.

- TellerProvider must isolate Teller-specific concepts such as enrollments, access tokens, and mTLS client behavior from the Free Cash engine if it is used later.

- Plaid access tokens and transaction cursors must be stored only server-side in the private service-role credentials table.

- Plaid OAuth redirect URIs must be configured in Plaid Dashboard and Netlify environment variables so production Link callbacks do not fall back to localhost.

- Provider tokens must be stored server-side and protected. The browser should never directly handle long-lived provider secrets.

- Manual sync comes before background or scheduled sync.

- The first real-data beta should be OAuth-gated, but not invite-only.

- Sync should be rate-limited per user and per provider.

- Sync logs should capture enough information to diagnose data freshness and provider failures.

- Plaid sync calls should be controlled through manual refresh, rate limits, and sync logs before any background sync is introduced.

- Free Cash snapshots should be cached or stored so the app does not recompute or resync unnecessarily.

- Netlify Scheduled Functions are acceptable for later regular jobs, but their execution limit means longer syncs should use background functions or another queue pattern.

- The MVP does not initiate payments, move money, automate transfers, or pay credit cards.

- The app must provide a delete-data flow before any real bank beta.

- Legal, privacy, and support affordances must exist, but they should not become a visible dashboard or standard settings-heavy product.

- Analytics should focus on product proof: Free Cash views, prompt-chip usage, agent questions, purchase simulations, true-balance reveals, missing-card nudge outcomes, sync failures, and negative Free Cash follow-up behavior.

- Monetization is not part of the first prototype. The product should be built cleanly enough to support future consumer, paid tier, B2B2C, white-label, or acquisition paths.

## Testing Decisions

- Tests should verify external behavior and user-visible outcomes, not implementation details.

- The Free Cash engine requires focused unit tests because it is the highest-risk deep module and owns the money math.

- Date-window tests should cover 28-day, 29-day, 30-day, and 31-day month behavior.

- Date-window tests should cover month-boundary cases where rent or major bills enter or leave the rolling calendar-month window.

- Engine tests should verify that Free Cash can be positive, zero, and negative.

- Engine tests should verify that credit-card purchases reduce Free Cash.

- Engine tests should verify that credit-card payments are not double-counted.

- Engine tests should verify that transfers between user accounts are not treated as spend.

- Engine tests should verify that refunds offset spend.

- Engine tests should verify that protected savings reduce spendable cash.

- Engine tests should verify that income and spending signs are interpreted consistently from normalized transaction data.

- Classifier tests should use representative messy transaction examples from fake data and later beta data, while avoiding provider-specific logic in the engine.

- Dedupe tests should cover likely credit-card payment pairs, partial payments, multiple card payments close together, and false positives.

- Explanation tests should verify that the engine returns bounded drivers and warnings that explain the number without requiring raw transaction dumps.

- Prompt chip tests should verify that no more than three chips are visible and that chips correspond to current state.

- Mock agent tests should verify supported intents return the correct card types and preserve the one-number product model.

- Card rendering tests should verify that each card type can render required data without layout-breaking missing fields.

- Provider abstraction contract tests should verify that MockProvider, PlaidProvider, and any later TellerProvider normalize accounts and transactions into the same internal shape.

- PlaidProvider tests should mock Link/token exchange, OAuth redirect resume behavior, account balance responses, transaction sync responses, cursor storage, and provider error mapping without hitting live Plaid in normal CI.

- TellerProvider tests, if Teller is revived, should mock mTLS/provider responses and verify normalization, token handling boundaries, and error mapping without hitting live Teller in normal CI.

- API route tests should verify authentication boundaries, request validation, structured responses, and failure states.

- Google OAuth tests should verify the OAuth start flow, callback code exchange, open signup behavior, safe `next` redirects, and the same-screen auth error shown after callback failures.

- Security tests should verify that service keys, Plaid tokens, provider credentials, any future Teller certs, and private keys are not exposed to client bundles or logs.

- RLS tests should verify that users cannot read or mutate other users' financial rows.

- Private credential access tests should verify that the service role can access the private provider credential table through the configured Supabase API path while authenticated and anonymous roles cannot.

- Sync tests should verify stale-data handling, manual refresh behavior, rate limiting, provider failure handling, and idempotency.

- AI tests, when AI is added, should verify tool schemas, structured output validation, refusal/fallback behavior, and that raw transaction histories are not passed to the model by default.

- End-to-end prototype tests should cover the core loop: open app, see Free Cash Today, ask why, simulate a purchase, show true balances, and return to the one-number home state.

- Mobile viewport tests should verify that the number, prompt chips, input, and cards do not overlap or overflow.

- Good tests for this product assert outcomes like "a card payment does not reduce Free Cash twice," not implementation details like "a helper function was called."

- There is no existing app test prior art in this workspace. The prior art is the planning documents: the investigation report and architecture decision report. The app should establish its own testing conventions around pure modules first, UI behavior second, provider contracts third, and real integrations last.

## Out of Scope

- Native iOS app.

- Native Android app.

- Push notifications.

- Public launch.

- Monetization.

- Paid subscriptions.

- B2B sales.

- White-label product.

- Affiliate revenue.

- PlaidProvider in the first fake-data prototype.

- TellerProvider in the first fake-data prototype.

- Building or hardening TellerProvider in the current Plaid-first beta pass.

- Building both TellerProvider and PlaidProvider as first-class production providers immediately.

- OpenAI integration in the first fake-data prototype.

- Superseded historical constraint: avoiding OpenAI Agents SDK in v1. The current beta now uses the Agents SDK because the router-only approach was not smart enough.

- Vercel AI SDK.

- Netlify AI Gateway integration before the deterministic prototype works.

- Real bank connection before the fake prototype proves the interaction loop.

- Email magic links as the primary long-term onboarding path.

- Money movement.

- Payment initiation.

- Automatic credit-card payment.

- ACH transfers.

- Zelle payments.

- Investment advice.

- Formal financial planning.

- Tax advice.

- Credit underwriting.

- Full transaction dashboard.

- Budget category management.

- Charts as a primary UI.

- Permanent account detail screens.

- Full settings dashboard.

- User-customizable formulas in the MVP.

- Multi-user households.

- Business accounts.

- International bank coverage.

- Complex recurring bill prediction.

- Expected future income in the default Free Cash formula, unless validated later.

- Full legal/compliance program beyond minimum privacy, consent, and delete-data requirements for private beta.

## Implementation Progress Notes

Use this section as the running build ledger while implementing the PRD. Mark items complete only after the current code and verification evidence support it. Every implementation pass should add or update a note here with what changed, what verified it, and what remains unproven, so product context survives across goal runs and agent handoffs.

Tracking rule added June 7, 2026: while implementing this PRD, the PRD itself must stay current. Do not rely only on chat history, terminal output, or memory. When a cluster is implemented, update this ledger and, when useful, the requirement matrix with the new status, implementation note, verification command or live evidence, and any remaining caveat. If a requirement is only locally proven, say so. If a requirement still needs live production proof, leave it unmarked as fully complete until that proof exists.

- Done/current: MVP pre-test production deploy, production-safe agent eval, and chat-review access check. Deployed the latest verified tree to Netlify production at `https://free-cash-mayberrydt.netlify.app` with unique deploy `https://6a25e955a8c3e5481d38f722--free-cash-mayberrydt.netlify.app`, then updated README's latest verified production deploy pointer so the final proof freshness guard targets this release. Ran the full anonymous production agent eval and confirmed the connected-data failures were expected for an unauthenticated/no-data session, while one real no-data bug surfaced: the card-promise guard rejected an honest "can't show card payments until data is connected" answer. Fixed that by normalizing smart apostrophes and exempting no-data refusals from fake-card-promise failures, added `SPENDABLE_AGENT_EVAL_CASE_IDS` so production-safe eval subsets can run without authenticated Plaid data, and redeployed. Verification: focused agent/eval tests passed with 35 tests; `npx tsc --noEmit --pretty false` passed; `npm test -- --run` passed with 359 tests across 74 files; `npm run build` passed; production public/guest-safe eval passed 6/6 with report `/tmp/spendable-agent-eval-production-public-report.json`; targeted production POST for `Show card payments in the last window` returned 200, `chat_only`, no cards, and a helpful connect-data response instead of 502. Chat-review proof: production `/api/operator/agent-chats` rejects unauthenticated requests with 401, Netlify production has `FREE_CASH_OPERATOR_TOKEN` configured, and local route tests passed token-required/tokened-access behavior with 4 tests. Remaining proof: tokened production chat-review read requires the existing operator token or explicit approval to rotate it; authenticated connected-user production agent eval still requires a signed-in user with connected Plaid data, which is covered by the manual onboarding smoke/final live proof path.

- Done/current: Spendable agent polish and rigorous local response evaluation. Made the top `Spendable Cash` label feel more like a subtle product mark by using the display font, stronger ink/taupe color, slightly larger type, and more legible chat-mode fade. Added `scripts/eval-agent.mjs` plus `npm run eval:agent`, which posts a repeatable 20-case suite to `/api/agent`, records message/response mode/used tools/card types/prompt chips/failures, and writes `/tmp/spendable-agent-eval-report.json`. The rubric catches banned language, fake show/list/view/forecast/breakdown promises, missing expected financial tools/cards, unknown card types, stale static chips, overlong replies, and unsupported app-card wording. While running the suite locally, tightened the agent guard/sanitizer for no-amount spend questions, unsupported forecast/breakdown/card promises, credit-card broad discussion, prompt-chip downgrades, and forecast daily-view language without adding a canned chat fallback. Verification: `npx tsc --noEmit --pretty false` passed; focused agent/route/eval tests passed with 42 tests; `npm test -- --run` passed with 358 tests across 74 files; `npm run build` passed; escalated local `npm run eval:agent` reached `http://127.0.0.1:3000/api/agent` and passed 20/20 cases with report status `passed` and `failureCount: 0` at `/tmp/spendable-agent-eval-report.json`. Remaining proof: run the same eval against production after deploy with `SPENDABLE_AGENT_EVAL_BASE_URL=https://free-cash-mayberrydt.netlify.app npm run eval:agent`; production authenticated Plaid behavior remains covered by the separate final live-smoke proof path.

- Done/current: forecast/chat error fix after local conversation review. Reviewed `/tmp/spendable-agent-chat-turns.jsonl` for the latest local failures and reproduced 502s on `Show my Spendable Cash forecast` and `Can you tell me about what kind of spendable cash I should expect tomorrow or the next day?`. Fixed a guard contradiction where the agent was instructed to say `not guaranteed` for forecasts while the disallowed-language guard rejected `guaranteed`; the guard now permits only short negative guarantee caveats and still blocks positive guarantee language. Added routing for tomorrow/next-day/next-week forecast wording and affirmative follow-ups like `Yes do that` after trend discussion, made unsupported display promises repairable, blocked hard purchase advice like `you can't spend`, and rejected money shorthand like `-$0.21k`. Verification: exact local `/api/agent` repros now return `spendable_cash_forecast` or `purchase_simulation` cards instead of errors; `npx tsc --noEmit --pretty false` passed; focused agent tests passed with 32 tests; `npm test -- --run` passed with 351 tests across 73 files; `npm run build` passed. Remaining proof: deploy and retry the same prompts in production with a connected authenticated user.

- Done/current: Spendable forecasting and honest agent capability pass. Added deterministic `spending_breakdown`, `recurring_activity`, and `spendable_cash_forecast` card types plus SDK tools for Spendable Cash definition, grouped breakdowns, likely recurring activity, and 1-14 day forecasts. Forecasting uses recent connected transactions, likely monthly repeats, and a daily spend trend, with the card-level note `Forecast only; not guaranteed.` Tightened forced routing so "7 day trend", "subscriptions coming up", and "complete breakdown" reach tools instead of card-less prose, and added final-message/prompt-chip capability guards so the model cannot promise a view, list, forecast, or breakdown unless the response includes a matching deterministic card. Verification: `npx tsc --noEmit --pretty false` passed; `npm test -- --run` passed with 349 tests across 73 files; `npm run build` passed; local Chrome headless screenshot of `http://localhost:3000/` rendered the Spendable Cash screen, horizontal prompt rail, cards, and composer. Remaining proof: deploy and retry authenticated connected-user conversations in production, especially broad finance discussion plus forecast/recurring/breakdown prompts with real Plaid data.

- Done/current: Spendable Cash naming and final mobile polish pass. Changed the home hero from separate "Spendable" and "Free Cash Today" labels to a single "Spendable Cash" label above the number, while keeping the internal Free Cash engine/API names stable. Updated visible home, card, legal/support, data-status, and agent-facing copy so user-visible responses use Spendable Cash; added an agent guard so model replies that use the old "Free Cash" label are repaired instead of shown. Changed prompt chips from a three-column grid to a single horizontal scroll rail so longer AI-generated suggestions stay in a thin line. Changed the composer to hide its scrollbar until the draft exceeds the max composer height. Verification: local Chrome smoke on `http://localhost:3000/` showed hero text `Spendable Cash$43`, no old top label, no wordmark element, textarea idle overflow `hidden`, chip rail `display:flex` with `overflow-x:auto`; long composer smoke showed overflow changes to `auto` only after max height is reached; `npx tsc --noEmit --pretty false` passed; `npm test -- --run` passed with 341 tests across 73 files; `npm run build` passed. Remaining proof: deploy before production users see this polish.

- Done/current: agent chat review, AI-generated prompt chips, and modern composer pass. Added `agent_chat_turns` persistence with RLS, local development JSONL fallback, and the bearer-token-protected `/api/operator/agent-chats` review route so beta conversations and AI errors can be inspected without copy-pasting from the browser. `/api/agent` now records successful and failed turns with a browser-provided conversation id, bounded request metadata, used tool names, card types, prompt chips, client actions, model, and transport. Changed the Agents SDK final output from static `promptChipIds` to model-authored `promptChips`; the server trims, dedupes, filters disallowed language, and only preserves privileged setup chip ids when the current onboarding state allows the action. Replaced the single-line chat input with an auto-sizing textarea that wraps text, supports Shift+Enter line breaks, and preserves focus after send. Verification: `npx tsc --noEmit --pretty false` passed; focused agent/route/component tests passed with 39 tests; `npm test -- --run` passed with 341 tests across 73 files; `npm run build` passed and lists `/api/operator/agent-chats`; local Chrome smoke on `http://localhost:3000/` verified the composer renders as `TEXTAREA`, wraps a 203-character draft with no horizontal overflow, keeps the start visible, and grows to 174px; direct local `/api/agent` smoke with conversation id `web-codex-smoke` returned `usedModel: true`, model-authored `promptChips`, and wrote the turn to `/tmp/spendable-agent-chat-turns.jsonl`; Supabase MCP applied production migration `20260607194336_agent_chat_turns` to project `qevvmulexfoebjmlxbts` and verified RLS, the authenticated own-row select policy, the service-role manage policy, and the user/conversation indexes. Remaining proof: deploy the updated app before production traffic writes to the new review table; local JSONL review only captures new local turns after this change.

- Done/current: unified Spendable agent surface. Moved guest onboarding, protected-savings consent, ready-without-data connection, refresh, delete-data confirmation, financial Q&A, prompt-chip selection, and client actions behind the `/api/agent` OpenAI Agents SDK path. The React surface now has one submit path and executes only typed server-returned actions such as Google OAuth redirect, Plaid Link launch, and reload; it no longer routes chat through local regex/canned onboarding handlers. `/api/agent` now treats guest and no-data states as valid agent contexts instead of stopping with 401/409, while deterministic tools still own Supabase writes, Plaid session creation, manual refresh, deletion, sync status, cards, and Free Cash math. Moved the mock agent runtime into test helpers and removed visible messages from the deterministic card builder so production app chat does not have a mock/canned response path. Verification: `npm test -- --run src/lib/agent/ai-agent.test.ts src/lib/agent/tool-runner.test.ts src/app/api/agent/route.test.ts src/components/FreeCashHome.test.tsx` passed with 39 tests; `npx tsc --noEmit` passed; `npm test -- --run` passed with 337 tests across 72 files; `npm run build` passed; direct Playwright smoke against `http://localhost:3000/?onboarding=guest` showed `$--`, onboarding chips, and the Google onboarding placeholder. Caveat: the currently running local dev server has no OpenAI or Netlify AI Gateway env loaded, so a live local `/api/agent` POST returned `missing-openai-config`; restart local dev with model env before judging real response quality. Remaining proof: deploy the unified route and rerun authenticated Google/Plaid production smoke with a configured AI runtime.

- Done/current: short AI-authored financial replies and final-output repair. Tightened the Agents SDK final output contract so visible `/api/agent` financial replies are capped at 220 characters, with agent instructions requiring fifth-grade reading level and 35 words or fewer. Removed model-emitted card selectors from final structured output entirely; tools create available cards and the server derives final UI cards from tool results, which prevents live errors like `cards` or `cards.1` schema validation failures from model card guesses. Added a one-time model repair loop for invalid structured output, disallowed Spendable language, and too-long replies, so the app asks the model to fix its own answer instead of substituting canned prose. Added server-side suppression so recent-transaction cards only render when the user clearly asks for transactions, charges, purchases, or recent activity. Verification: focused agent/route/sdk tests passed with 32 tests; `npx tsc --noEmit --pretty false` passed; `npm run test` passed with 337 tests across 72 files; `npm run build` passed; `npm run test:e2e -- tests/e2e/ai-agent.spec.ts` passed with 8 browser tests after escalation for local server binding. Remaining proof: production deploy is currently blocked by Netlify CLI returning `JSONHTTPError: Forbidden` while creating a deploy for linked site `free-cash-mayberrydt`; after Netlify deploy permission is fixed, deploy and retry the typical authenticated prompt set in production.

- Done/current: no canned app-agent response path. Removed the `/api/agent` mock-model request switch and the `FREE_CASH_AI_MODE` runtime branch, so the app route can no longer swap in the local mock agent. Explicit chip-style prompts now force the matching SDK tool through `toolChoice` so cards stay reliable, but the model still writes the visible chat message. Removed the deterministic final-output fallback and changed disallowed Spendable language handling to fail loudly instead of substituting static prose. Updated agent instructions so broad questions like "since it is negative, can I spend any money?" are treated as conversational Free Cash signal questions rather than purchase simulations that ask for an amount. Verification: focused agent/route/sdk/deployment tests passed with 40 tests; `npx tsc --noEmit --pretty false` passed; `npm run test:e2e -- tests/e2e/ai-agent.spec.ts` passed with 8 browser tests after escalation for local server binding; `npm run test` passed with 336 tests across 72 files; `npm run build` passed; `npm run deploy:netlify -- --prod` deployed production deploy `6a250f2ac6e215ee6e9bc89a` live at `https://free-cash-mayberrydt.netlify.app` and unique URL `https://6a250f2ac6e215ee6e9bc89a--free-cash-mayberrydt.netlify.app`; live HTTP smoke returned 200 for `/` on production and the unique deploy URL, 307 from `/api/auth/oauth/google` to Supabase with production callback, and 401 for anonymous `/api/agent`. Remaining proof: authenticated connected-user chat should be retried on production to judge response quality with the real model and real conversation state.

- Done/superseded: Agents SDK prompt-chip reliability and final-output fallback. Fixed the tester-reported failures where "Why this number?" could surface a final `message` schema validation error and "Show recent transactions" could answer in prose without showing the recent-transactions card. This pass temporarily routed explicit chip-style prompts through deterministic app tools before the model turn and returned deterministic tool-produced fallback messages on final-output failure. Verification: `npm run test -- src/lib/agent/ai-agent.test.ts` passed with 20 tests; focused agent/route/sdk tests passed with 30 tests; `npx tsc --noEmit --pretty false` passed; `npm run test` passed with 335 tests across 72 files; `npm run build` passed; `npm run deploy:netlify -- --prod` deployed production deploy `6a25098c4478c368a3ca67ca` live at `https://free-cash-mayberrydt.netlify.app` and unique URL `https://6a25098c4478c368a3ca67ca--free-cash-mayberrydt.netlify.app`; live HTTP smoke returned 200 for `/` on production and the unique deploy URL, 307 from `/api/auth/oauth/google` to Supabase with production callback, and 401 for anonymous `/api/agent`. Superseded by the following no-canned app-agent response path, which keeps reliable cards without deterministic visible replies.

- Done/current: Agents SDK minimal final-output schema hardening. Fixed the live schema validation error at `usedTools` by removing model-emitted `usedTools` and `promptChips` from the Agents SDK final output schema. The model now only emits `message`, card type selectors, and `responseMode`; the server derives `usedTools` from actual SDK tool calls and returns deterministic prompt chips from the Free Cash engine. Also tightened instructions so "why this number" and "Free Cash drivers" requests call `get_free_cash_drivers` directly instead of asking the user to choose drivers/math/summary first. Verification: focused agent/route tests passed with 28 tests; `npx tsc --noEmit --pretty false` passed; `npm run test` passed with 333 tests across 72 files; `npm run build` passed; `npm run deploy:netlify -- --prod` deployed production deploy `6a250633d3d1ce009fcdd4c3` live at `https://free-cash-mayberrydt.netlify.app` and unique URL `https://6a250633d3d1ce009fcdd4c3--free-cash-mayberrydt.netlify.app`; live HTTP smoke returned 200 for `/`, 307 from `/api/auth/oauth/google` to Supabase with production callback, and 401 for anonymous `/api/agent`. Remaining proof: authenticated live chat should be retried with a connected user because anonymous smoke cannot exercise the final model output path.

- Done/current: Agents SDK store=false tool-continuation fix. Fixed the live OpenAI 404 error `Item with id 'rs_...' not found. Items are not persisted when store is set to false` by setting the Agents SDK runner `reasoningItemIdPolicy` to `omit`. This strips non-persisted reasoning item ids from post-tool continuation turns while keeping `store: false` for model calls. Added a regression boundary test so the agent keeps `reasoningItemIdPolicy: "omit"` alongside `store: false`. Verification: focused agent/route tests passed with 28 tests; `npx tsc --noEmit --pretty false` passed; `npm run build` passed; `npm run deploy:netlify -- --prod` deployed production deploy `6a2503ef62bf6447db737455` live at `https://free-cash-mayberrydt.netlify.app` and unique URL `https://6a2503ef62bf6447db737455--free-cash-mayberrydt.netlify.app`; live HTTP smoke returned 200 for `/`, 307 from `/api/auth/oauth/google` to Supabase with production callback, and 401 for anonymous `/api/agent`. Remaining proof: authenticated live chat should be retried with a connected user because anonymous smoke cannot exercise the tool-call continuation path.

- Done/current: Agents SDK structured-output schema fix. Fixed the live OpenAI 400 error `Invalid schema for response_format 'output'... 'oneOf' is not permitted` by splitting model-facing agent output from public API card output. The model now emits a flat card selector with a `type` enum and optional title, while `/api/agent` still returns full deterministic `AgentCard` objects built by app tools. This keeps model output schema compatible with OpenAI structured outputs and further prevents the model from inventing financial card payloads. Verification: focused agent/schema tests passed with 35 tests; `npm run test` passed with 332 tests across 72 files; `npm run build` passed; `npx tsc --noEmit --pretty false` passed when run after build generation; `npm run deploy:netlify -- --prod` deployed production deploy `6a25027384c6146569e62f97` live at `https://free-cash-mayberrydt.netlify.app` and unique URL `https://6a25027384c6146569e62f97--free-cash-mayberrydt.netlify.app`; live HTTP smoke returned 200 for `/`, 307 from `/api/auth/oauth/google` to Supabase with production callback, and 401 for anonymous `/api/agent`.

- Done/current: OpenAI Agents SDK migration pass. Replaced the hand-rolled required-tool Responses router with a Spendable agent built on `@openai/agents`, `Agent`, `Runner`, and `tool`. The agent now uses auto tool choice, deterministic Free Cash tools for all money facts, structured final output with `responseMode` and `usedTools`, bounded client-provided conversation state, duplicate `free_cash_explanation` card suppression, and server-side card sanitization so model output cannot invent card values. The old v1 "avoid Agents SDK" decision is superseded in the PRD and README. Verification: focused agent tests passed with 41 tests; `npm run test` passed with 332 tests across 72 files; `npx tsc --noEmit --pretty false` passed; `npm run build` passed; `npm run test:e2e -- tests/e2e/ai-agent.spec.ts` passed with 8 browser tests after escalation for local server binding; `npm audit --omit=dev` found 0 production vulnerabilities; `npm run check:deployment` passed with the expected Plaid sandbox warning; `npm run check:netlify-bundle` found no env files in Netlify function artifacts; `npm run deploy:netlify -- --prod` deployed production deploy `6a25006f0950aa644ef1f1a0` live at `https://free-cash-mayberrydt.netlify.app` and unique URL `https://6a25006f0950aa644ef1f1a0--free-cash-mayberrydt.netlify.app`; live HTTP smoke returned 200 for `/`, `/manifest.webmanifest`, and `/plaid/oauth`, 307 from `/api/auth/oauth/google` to Supabase with `redirect_to=https://free-cash-mayberrydt.netlify.app/auth/callback`, and 401 for anonymous `/api/free-cash`, `/api/agent`, `/api/sync/manual`, and `/api/providers/plaid/exchange`. Remaining proof: the final authenticated Google/Plaid production smoke still needs a real saved Google session.

- Done: Google OAuth primary onboarding cluster. Added `/api/auth/oauth/google`, routes guest onboarding through Google from the same Spendable screen, enforces invite acceptance in `/auth/callback`, signs out rejected users, shows same-screen auth notices, and keeps magic-link email as a tested fallback route rather than the default. Verification: `npm run test -- src/app/api/auth/oauth/google/route.test.ts src/app/auth/callback/route.test.ts src/components/FreeCashHome.test.tsx src/components/auth/onboarding-copy.test.tsx` passed with 20 tests; `npm run test -- src/app/api/auth/sign-in/route.test.ts` passed with 5 tests; `npm run build` passed and includes `/api/auth/oauth/google` as a dynamic route.

- Done: Plaid onboarding completion cluster. Plaid OAuth resume now reopens Link with the received redirect URI, exchanges public tokens, runs manual sync, clears the persisted Link token, returns to `/?plaid=connected`, and shows a same-screen Plaid-connected Spendable message. Verification: `npm run test -- src/components/PlaidOAuthResume.test.tsx src/components/FreeCashHome.test.tsx src/lib/providers/plaid/config.test.ts src/app/api/providers/connect/route.test.ts src/app/api/providers/plaid/exchange/route.test.ts src/app/api/sync/manual/route.test.ts` passed with 38 tests; `npm run build` passed and includes `/plaid/oauth`, `/api/providers/connect`, `/api/providers/plaid/exchange`, and `/api/sync/manual`.

- Done: provider/security/deployment boundary hardening pass. Tightened the beta deployment check so `NEXT_PUBLIC_SITE_URL` is required and localhost `NEXT_PUBLIC_SITE_URL` or `PLAID_REDIRECT_URI` fails before beta deploy; exported the Netlify bundle checker so tests do not need a nested Node subprocess; confirmed Plaid credentials are stored encrypted in the private schema and delete-data route coverage still passes. Verification: `npm run test -- scripts/check-deployment-env.test.ts scripts/netlify-deploy-boundary.test.ts src/lib/providers/plaid/credential-store.test.ts src/app/api/delete-data/route.test.ts` passed with 13 tests; `npm run test -- scripts/check-deployment-env.test.ts scripts/netlify-deploy-boundary.test.ts` passed with 8 tests after deduping output; `node scripts/check-deployment-env.mjs --mode=beta` correctly failed locally because `NEXT_PUBLIC_SITE_URL` is missing and warned that `PLAID_ENV=sandbox` uses sandbox data; `npm run build` passed.

- Done: Free Cash language boundary pass. Removed remaining user-facing "safe to spend" wording from same-screen onboarding and protected-savings responses, replacing it with Free Cash Today language. Added a visible-source boundary test so app/components code cannot reintroduce `safe to spend`, `what is safe`, or `safely spend` wording. Verification: `npm run test -- src/app/free-cash-language-boundary.test.ts src/components/FreeCashHome.test.tsx src/components/auth/onboarding-copy.test.tsx` passed with 9 tests; `rg -n "safe to spend|what is safe|safely spend" src/app src/components` now only finds the boundary test itself.

- Done/current: full PRD requirement matrix. The snapshot below groups all 90 stories into auditable bands and records whether current code/test evidence proves the band, partially proves it, or leaves it unproven. It should stay current as implementation changes; the only known final proof boundary at this point is the live Google/Plaid production smoke called out in the matrix and ledger notes.

## Requirement Matrix Snapshot

| PRD items | Requirement band | Current evidence | Status |
| --- | --- | --- | --- |
| Stories 1-3, 12-13, 36-40, 89; UI decisions | One-number, mobile-first, non-dashboard surface with Free Cash language, no menus/tabs/charts, <=3 prompt chips | `FreeCashHome.test.tsx`, `PromptChips.test.tsx`, `mvp-scope-boundary.test.ts`, `free-cash-language-boundary.test.ts`, `security-headers.test.ts`, `manifest.test.ts`, `tests/e2e/ai-agent.spec.ts`, chat-owned data action ledger notes | Proven locally; browser e2e covers mobile layout, same-screen onboarding persistence, and Plaid connect returning to the one-number surface |
| Stories 4-11, 21-24, 54-56, 59; engine decisions | Deterministic Free Cash engine with rolling calendar-month window, card purchase handling, payment dedupe, transfers, refunds, protected savings, negative values, explanations, and pending card-purchase labeling | `engine.test.ts`, `date-window.test.ts`, `classify.test.ts`, `dedupe-credit-card-payments.test.ts`, `explanation.test.ts`, `module-boundary.test.ts`, `CardRenderer.test.tsx` | Proven locally; rolling-window tests now enforce 28/29/30/31-day month behavior |
| Stories 33-35; fake prototype decisions | Believable fake-data prototype, default `$43` Free Cash scenario, and negative Free Cash stress scenario | `fake-data.ts`, `engine.test.ts`, `free-cash/route.test.ts`, `FreeCashHome.tsx` scenario parsing, `README.md` fake scenario URLs | Proven locally; fake mode is explicitly separated from configured Supabase beta mode so prototype scenarios do not leak into authenticated beta data |
| Stories 14-20, 41-45, 70-75, 88; agent decisions | Agents SDK runtime calls deterministic tools, can answer chat-only, returns optional structured cards, preserves bounded conversation state, suppresses repeated cards, avoids invented dashboards/advice, keeps cards in chat history | `ai-agent.test.ts`, `sdk-boundary.test.ts`, `tool-runner.test.ts`, `CardRenderer.test.tsx`, `FreeCashHome.test.tsx`, `agent/route.test.ts`, `tests/e2e/ai-agent.spec.ts`, strengthened live smoke harness | Proven locally for the SDK boundary and mock-agent behavior; production still needs deployed live-agent proof after the next verified deploy |
| Stories 25-28, 82 | Missing-card nudges and suppression | `engine.test.ts`, `tool-runner.test.ts`, `missing-card-preferences/route.test.ts`, `financial-repository.test.ts`, `CardRenderer.test.tsx`, `FreeCashHome.tsx` suppression path, auth-first mutation smoke | Proven locally; persistence, authenticated route behavior, and card-level suppression callback are covered |
| Stories 29-32, 50-51; auth decisions | Same-screen onboarding, Google OAuth primary sign-in, open Google signup, protected savings step | OAuth/callback route tests, `FreeCashHome.test.tsx`, onboarding-copy tests, `tests/e2e/ai-agent.spec.ts`, live OAuth handoff logs, `tests/e2e/live-authenticated-onboarding.spec.ts` | Mostly proven; local and live handoff evidence exists, but completing Google sign-in and consent through the deployed app still requires a real Google session |
| Stories 49, 52-58, 60-69, 84-87; provider decisions | Plaid-first provider abstraction, Link/OAuth resume/exchange/repair, private token storage, manual sync/rate limits/logs, stale provider status, provider isolation | Plaid provider/config/credential tests, connect/exchange/manual-sync/status route tests, `manual-sync-failure.test.ts`, `sync-status.test.ts`, `data-controls-helpers.test.ts`, `PlaidOAuthResume.test.tsx`, `tests/e2e/ai-agent.spec.ts`, deployment boundary tests, PRD ledger Plaid/boundary clusters, Netlify env/deploy checks, strengthened live smoke harness | Proven locally; strengthened live smoke now requires deployed Plaid exchange, manual sync, connected sync status, succeeded sync run, and nonzero account/transaction counts, but it still needs a real invited production session to execute |
| Stories 47-48, 66, 90; privacy/delete-data/RLS | Supabase RLS, delete-data flow, minimum privacy/legal posture | Supabase migrations, `supabase-schema.test.ts`, `delete-data/route.test.ts`, legal page tests, private credential tests, auth-first mutation tests, live anonymous API smoke, live SQL smoke | Mostly proven; security advisor still recommends enabling leaked-password protection before broader password auth/password use |
| Stories 46, 76, 83; MVP/product boundary decisions | No money movement, staged AI Gateway use after deterministic loop, and optional acquisition posture through clean boundaries | `no-money-movement-boundary.test.ts`, `deployment-target.test.ts`, `sdk-boundary.test.ts`, `check-deployment-env.test.ts`, `ai-agent.test.ts`, README Netlify AI Gateway notes, provider/engine/module boundary tests | Proven locally; production still depends on the live smoke for final deployed AI/provider proof, but the codebase boundary tests enforce no payment/transfer surfaces and the intended SDK/deployment choices |
| Stories 77-81, analytics decisions | Cost/usage counters and operator visibility | `usage-counters.test.ts`, `product-events.test.ts`, `operator/overview.test.ts`, usage/operator API route tests, `agent/route.test.ts` authenticated event-write coverage, auth-first event route tests, live API logs showing product event writes | Mostly proven; strengthened live onboarding smoke should confirm the final deployed beta event shape after a real connected-data session |
| Testing decisions | Focused unit, route, security, provider, AI, e2e, mobile viewport tests | Broad test suite exists across engine, providers, auth, AI, sync, UI, local e2e, skipped-safe live e2e, deployment checks, bundle scans, and live HTTP smoke; latest full gates passed | Mostly proven; live Supabase/Plaid smoke is scripted and strengthened, but still needs real invited-session execution |

- Done: pending transaction behavior and labeling pass. Confirmed the engine includes material pending credit-card purchases in Free Cash, emits a `pending-card-spend` driver, and emits a `pending-transactions` data state. Updated the explanation card so pending data states render the label and amount, not only detail text. Verification: `npm run test -- src/components/cards/CardRenderer.test.tsx src/lib/free-cash/engine.test.ts src/lib/agent/tool-runner.test.ts src/lib/agent/ai-agent.test.ts` passed with 54 tests; `npm run test -- src/app/free-cash-language-boundary.test.ts` passed; `npm run build` passed.

- Done: missing-card nudge suppression pass. Confirmed suppressed issuers flow from `missing_card_preferences` into engine settings, engine warnings disappear for suppressed issuers, the suppression API is authenticated/idempotent and marks cached snapshots stale, and the card-level Hide nudge button calls the suppression callback with the issuer name. Verification: `npm run test -- src/components/cards/CardRenderer.test.tsx src/app/api/missing-card-preferences/route.test.ts src/lib/free-cash/engine.test.ts src/lib/data/financial-repository.test.ts src/lib/agent/tool-runner.test.ts` passed with 39 tests; `npm run build` passed.

- Done: runtime product-event coverage pass. Confirmed browser-reported events are limited to safe client events, agent-derived events include follow-ups, purchase simulations, true-balance reveals, missing-card nudges, and negative Free Cash follow-ups, and the authenticated `/api/agent` route writes derived events with card/message/history metadata. Usage and operator summaries cover the tracked event families. Verification: `npm run test -- src/app/api/agent/route.test.ts src/lib/data/product-events.test.ts src/app/api/events/route.test.ts src/lib/data/usage-counters.test.ts src/lib/operator/overview.test.ts src/app/api/usage/route.test.ts src/app/api/operator/overview/route.test.ts` passed with 24 tests; `npm run build` passed.

- Done: same-screen live-data persistence pass. Scoped the `FreeCashHome` result-change effect so authenticated live-data loads update the Free Cash number and prompt chips without wiping existing onboarding/chat cards; fake prototype scenario changes still reset the thread. Verification: `npm run test:e2e -- tests/e2e/ai-agent.spec.ts` passed with 7 tests, including `live data loading does not wipe same-screen onboarding chat cards`; `npm run test -- src/components/FreeCashHome.test.tsx` passed with 6 tests.

- Done: chat-owned data action language pass. Removed remaining user-facing "data control" language from the agent connect-account card and legal/support pages so connection, repair, refresh, and delete-data actions are described as chat-owned Spendable actions instead of a separate control surface. Expanded the language boundary test to include agent source and reject the old phrase; reworded the AI instruction while preserving the runtime guard against guaranteed-spending language. Verification: `npm run test -- src/app/free-cash-language-boundary.test.ts src/app/legal-pages.test.tsx src/lib/agent/tool-runner.test.ts src/components/cards/CardRenderer.test.tsx src/lib/agent/ai-agent.test.ts` passed with 42 tests.

- Done: removed obsolete data-control surface. Deleted the unused `DataControls` component so the codebase no longer carries the old separate settings/connect/delete panel that conflicted with the chat-first Spendable experience. Repointed the Supabase browser-boundary test at `FreeCashHome`, the actual client surface that now owns Plaid connect, repair, refresh, protected-savings, and delete-data prompts. Verification: `npm run test -- src/lib/supabase/client-boundary.test.ts src/app/free-cash-language-boundary.test.ts src/components/data-controls-helpers.test.ts src/components/FreeCashHome.test.tsx` passed with 22 tests.

- Done: rolling calendar-month window correction. Changed `buildRollingCalendarWindow` to use the day after the same date in the prior month as the inclusive start, so the active window matches 28/29/30/31-day month behavior instead of occasionally producing 32 inclusive days. Updated movement-driver tests so entering/leaving transactions sit on the correct current end date and previous boundary date. Adjusted the fake snapshot protected-savings value to preserve the PRD's `$43` prototype number under the corrected 31-day June window. Verification: `npm run test -- src/lib/free-cash/date-window.test.ts src/lib/free-cash/engine.test.ts src/lib/free-cash/explanation.test.ts src/lib/agent/tool-runner.test.ts src/components/cards/CardRenderer.test.tsx src/lib/agent/ai-agent.test.ts src/components/FreeCashHome.test.tsx` passed with 70 tests.

- Done: full local verification gate. Ran the complete Vitest suite, refreshed Playwright e2e, and rebuilt production after the OAuth/Plaid/chat-first and rolling-window changes. Verification: `npm run test` passed with 312 tests across 67 files; `npm run test:e2e` passed with 7 tests covering the core AI loop, mobile layout, responsive thinking state, Google OAuth onboarding handoff, consent onboarding, Plaid loading recovery, and live-data chat persistence; `npm run build` passed and includes the expected OAuth, Plaid, sync, agent, legal, manifest, and same-screen app routes. Note: e2e required an escalated command because the sandbox blocks binding the local Next dev server to port 3000.

- Done: live beta readiness pass. Confirmed local `.env.local` and Netlify production env include `NEXT_PUBLIC_SITE_URL=https://free-cash-mayberrydt.netlify.app`, Netlify production `PLAID_REDIRECT_URI=https://free-cash-mayberrydt.netlify.app/plaid/oauth`, beta-required Supabase/Plaid/OpenAI/server-side keys, and `PLAID_CLIENT_NAME=Spendable`. Deployed the current app to Netlify production via `npm run deploy:netlify -- --prod`; deploy `6a24bff4814003bcc99c70d6` went live at `https://free-cash-mayberrydt.netlify.app`, with generated artifact scan passing: no env files found in Netlify function artifacts. Live HTTP smoke checks passed for `/`, `/manifest.webmanifest`, `/plaid/oauth`, and `/api/auth/oauth/google`; the Google OAuth start route redirects through Supabase to Google with `redirect_to=https://free-cash-mayberrydt.netlify.app/auth/callback`, proving the live OAuth handoff no longer points to localhost. Supabase project `qevvmulexfoebjmlxbts` is active/healthy with all expected migrations applied; live SQL smoke confirmed RLS enabled on public financial tables and private `provider_credentials`, with private provider credentials granted only to `service_role`. Supabase auth/API logs also confirm the latest production OAuth start returned a 302 from `/auth/v1/authorize` to the external Google provider with the production callback; the visible email 429s are older `/auth/v1/otp` magic-link attempts from before Google OAuth became primary. Supabase security advisor only reports leaked-password protection disabled, which is lower impact for Google OAuth but should be enabled before broader auth/password use; performance advisors only report unused-index INFOs expected on a young beta database.

- Done: current production deploy refresh. Re-ran beta deployment checks after the chat-first, data-control removal, and rolling-window changes: `node scripts/check-deployment-env.mjs --mode=beta` passed with only the expected Plaid sandbox warning, and `node scripts/check-netlify-bundle.mjs` found no env files in Netlify function artifacts. Deployed current `main` worktree to Netlify production with `npm run deploy:netlify -- --prod`; deploy `6a24c4d736389dcf6530a795` is live at `https://free-cash-mayberrydt.netlify.app` and unique URL `https://6a24c4d736389dcf6530a795--free-cash-mayberrydt.netlify.app`. Live smoke checks passed for `/`, `/manifest.webmanifest`, `/plaid/oauth`, and `/api/auth/oauth/google`; the OAuth start route still returns a 307 through Supabase with `redirect_to=https://free-cash-mayberrydt.netlify.app/auth/callback`. Netlify artifact scan after deploy again reported no env files in function artifacts.

- Done: live anonymous API auth-boundary fix. Production smoke found `/api/free-cash` still returned fake prototype financial data anonymously when Supabase was configured. Fixed the shared current-snapshot boundary so fake data is returned only when Supabase is explicitly disabled; configured beta requests without a user now throw `AuthenticationRequiredError`. `/api/free-cash` and `/api/agent` map that to 401 instead of answering from fake rows. Verification: `npm run test -- src/lib/data/current-snapshot.test.ts src/app/api/free-cash/route.test.ts src/app/api/agent/route.test.ts src/components/FreeCashHome.test.tsx` passed with 24 tests; `npm run test:e2e` passed with 7 tests; `node scripts/check-deployment-env.mjs --mode=beta` and `node scripts/check-netlify-bundle.mjs` passed. Deployed fix to Netlify production as deploy `6a24c619a6725d799bfa69af`; live anonymous smoke now returns 401 for `/api/free-cash`, `/api/agent`, `/api/providers/connect`, and `/api/sync/manual`, while `/` remains 200 and `/api/auth/oauth/google` still redirects through Supabase with `redirect_to=https://free-cash-mayberrydt.netlify.app/auth/callback`.

- Done: provider-token auth-order hardening. Production anonymous smoke found `/api/providers/teller/enrollment` could return request-shape validation before auth for malformed Teller payloads. Updated Plaid public-token exchange and Teller enrollment routes so configured beta requests authenticate before parsing provider-token payloads, avoiding schema feedback for anonymous callers. Verification: `npm run test -- src/app/api/providers/plaid/exchange/route.test.ts src/app/api/providers/teller/enrollment/route.test.ts src/app/api/providers/connect/route.test.ts src/app/api/sync/manual/route.test.ts src/lib/security/error-messages.test.ts` passed with 33 tests; `node scripts/check-deployment-env.mjs --mode=beta` passed with the expected Plaid sandbox warning; `node scripts/check-netlify-bundle.mjs` reported no env files in Netlify function artifacts. Deployed to Netlify production as deploy `6a24c7ae55a73bd4eb242f04`; live anonymous smoke now returns 401 for malformed and valid-shaped Plaid exchange payloads and malformed and valid-shaped Teller enrollment payloads.

- Done: auth-first mutation boundary pass. Extended the provider-token auth-order rule across configured beta mutation routes that already require a signed-in user: consent, protected-savings settings, browser product events, missing-card suppression, provider connect, manual sync, Plaid exchange, and Teller enrollment now authenticate before parsing request-shaped details. This prevents anonymous callers from receiving endpoint-specific schema feedback on sensitive financial/account actions while preserving authenticated 400 validation and Supabase-disabled local behavior. Verification: `npm run test -- src/app/api/auth/consent/route.test.ts src/app/api/settings/route.test.ts src/app/api/events/route.test.ts src/app/api/missing-card-preferences/route.test.ts src/app/api/providers/connect/route.test.ts src/app/api/sync/manual/route.test.ts src/app/api/providers/plaid/exchange/route.test.ts src/app/api/providers/teller/enrollment/route.test.ts` passed with 59 tests; `node scripts/check-deployment-env.mjs --mode=beta` passed with the expected Plaid sandbox warning; `node scripts/check-netlify-bundle.mjs` reported no env files in Netlify function artifacts. Deployed to Netlify production as deploy `6a24c906cde74f4a76c72e00`; live malformed anonymous smoke returned 401 for `PUT /api/settings`, `POST /api/auth/consent`, `POST /api/events`, `POST /api/missing-card-preferences`, `POST /api/providers/connect`, `POST /api/sync/manual`, `POST /api/providers/plaid/exchange`, and `POST /api/providers/teller/enrollment`.

- Done: local Plaid happy-path onboarding proof. Added browser e2e coverage for the same-screen "Connect data" flow completing Plaid Link from chat, sending a Plaid public token to `/api/providers/plaid/exchange`, running `/api/sync/manual` with provider `plaid`, and reloading back to the Spendable screen with the live Free Cash number instead of losing the chat-first surface. This complements the existing e2e coverage for Google OAuth handoff, protected-savings consent, Plaid loading failure recovery, and live-data loads that do not wipe onboarding cards. Verification: `npm run test:e2e -- tests/e2e/ai-agent.spec.ts` passed with 8 browser tests, including `connect data completes Plaid exchange and syncs back to the same Spendable screen`; `npm run test -- src/components/PlaidOAuthResume.test.tsx src/components/FreeCashHome.test.tsx src/app/api/providers/connect/route.test.ts src/app/api/providers/plaid/exchange/route.test.ts src/app/api/sync/manual/route.test.ts` passed with 35 tests. Remaining proof: this is still simulated Plaid Link/local route interception; a real invited Google session and Plaid sandbox institution still need to prove the deployed provider handshake end to end.

- Done: repeatable live authenticated onboarding smoke harness. Added `playwright.live.config.ts`, `tests/e2e/live-authenticated-onboarding.spec.ts`, and `npm run test:e2e:live` so the final live proof can run against the deployed Netlify site with a saved Playwright storage state for an invited Google user. The smoke verifies the user is not rejected by the invite gate, completes consent if needed, requires a real Free Cash number instead of `$--`, and asks "Why this number?" through the deployed `/api/agent` path. If the user is still at the connect-data step, the smoke now fails with an actionable message by default, or attempts Plaid Sandbox Link when `SPENDABLE_LIVE_COMPLETE_PLAID=1` is set. README documents both modes, including the `npx playwright codegen --save-storage=/tmp/spendable-live-auth.json` handoff and optional Plaid Sandbox credentials/institution overrides. Verification: `npm run test:e2e:live` without a storage state exits successfully with 1 skipped test, proving the harness is safe for normal local/CI runs; `npm run build` passed; `npx tsc --noEmit --pretty false` passed. Remaining proof: the smoke still needs to be run with a real invited Google session and Plaid sandbox connection against production.

- Done: documentation drift and full verification refresh. Updated README beta-flow docs so they no longer claim configured Supabase falls back to fake data for missing users/data, no longer reference a shield drawer, and instead describe the current auth-required beta mode plus chat-owned refresh/repair actions. Re-ran the broad local gates after the Google OAuth, Plaid-first, auth-first mutation, live-smoke harness, and documentation changes. Verification: `npm run test` passed with 323 tests across 67 files; `npm run test:e2e` passed with 8 browser tests and 1 skipped live-authenticated smoke; `npm run build` passed and included the expected OAuth, Plaid, sync, agent, legal, manifest, and same-screen app routes; `node scripts/check-deployment-env.mjs --mode=beta` passed with the expected Plaid sandbox warning; `node scripts/check-netlify-bundle.mjs` reported no env files in Netlify function artifacts. Remaining proof: the deployed live authenticated onboarding smoke still needs a real invited Google/Plaid session.

- Done: requirement matrix and live-auth artifact hygiene pass. Updated the requirement matrix snapshot so it reflects the newer local Plaid happy-path browser proof, auth-first mutation smoke, live-smoke harness, and full verification gates instead of older "mostly proven" wording where local coverage is now stronger. Added `.gitignore` entries for generated Playwright auth storage artifacts (`spendable-live-auth*.json` and `*.storage-state.json`) so the final live onboarding proof can save a real invited-user session without risking accidental commit of cookies or tokens. Verification: `rg -n "shield drawer|fall back to fake data|falls back to fake data" README.md prd.md` now only finds ledger entries documenting the drift that was removed; `git status --short .gitignore prd.md` shows only the intended documentation/hygiene edits.

- Done: live-auth storage regression guard and dependency audit. Added a boundary test that fails if `.gitignore` stops ignoring generated Playwright live-auth storage files, protecting the final invited-user smoke from accidental cookie/session commits. Verification: `npm run test -- scripts/netlify-deploy-boundary.test.ts src/lib/security/error-messages.test.ts src/lib/supabase/client-boundary.test.ts` passed with 8 tests; `npm audit --omit=dev` passed with 0 vulnerabilities after network access was granted for the registry advisory request.

- In progress: live authenticated onboarding evidence audit. Inspected Supabase project `qevvmulexfoebjmlxbts` logs on June 7, 2026. Project status is `ACTIVE_HEALTHY`; auth/API logs show the production Google OAuth authorize route redirecting to the external Google provider with `redirect_to=https://free-cash-mayberrydt.netlify.app/auth/callback`, and they also show authenticated production app traffic for an invited tester, including `/auth/v1/user` reads, `user_settings`, `connected_institutions`, `sync_runs`, `accounts`, `transactions`, `free_cash_snapshots`, and `product_events` writes. Caveat: this log evidence does not fully replace the live e2e because it does not prove a clean end-to-end Google OAuth callback for the current code path, nor a successful current Plaid sandbox public-token exchange/credential write/manual sync. One older production provider credential write returned `406`, so deployed Plaid connection remains explicitly unproven until the live smoke passes with a real invited Google session and Plaid sandbox institution.

- Done: provider credential upsert hardening. Made Plaid and Teller private credential writes explicitly conflict on the `institution_id` primary key and clear stale provider-specific fields when rotating an institution between providers, so a Plaid write cannot retain Teller enrollment/certificate metadata and a Teller write cannot retain Plaid item metadata. This makes the credential-write portion of the final Plaid smoke easier to reason about and reduces provider-switch edge cases. Verification: `npm run test -- src/lib/providers/plaid/credential-store.test.ts src/lib/providers/teller/credential-store.test.ts src/app/api/providers/plaid/exchange/route.test.ts src/app/api/providers/teller/enrollment/route.test.ts src/app/api/sync/manual/route.test.ts` passed with 27 tests. Remaining proof: this does not by itself prove the deployed Plaid sandbox Link/public-token exchange path; that still needs the live authenticated onboarding smoke.

- Done: live authenticated smoke proof-strengthening. Tightened `tests/e2e/live-authenticated-onboarding.spec.ts` so the final production smoke does not merely accept a visible Free Cash number. When Plaid automation is enabled it now requires successful `POST /api/providers/plaid/exchange` and `POST /api/sync/manual` responses, then checks `/api/sync/status` for a connected Plaid institution, a succeeded Plaid sync run, and nonzero account and transaction counts before asking the AI "Why this number?". If a saved session already has data connected, the smoke still verifies `/api/sync/status` before treating the session as usable. Verification: `npx tsc --noEmit --pretty false` passed; `npm run test:e2e:live` without `SPENDABLE_LIVE_STORAGE_STATE` still exits safely with 1 skipped test. Remaining proof: the strengthened smoke still needs to run against production with a real invited Google session and Plaid sandbox connection.

- Done: latest full verification and production deploy refresh. Synced README with the strengthened live authenticated smoke expectations, re-ran broad local verification, and deployed the current verified tree to Netlify production. Verification: `npm run test` passed with 324 tests across 67 files; `npm run build` passed and listed the expected Spendable, OAuth, Plaid, sync, agent, legal, manifest, and support routes; `node scripts/check-deployment-env.mjs --mode=beta` passed with the expected Plaid sandbox warning; `node scripts/check-netlify-bundle.mjs` found no env files in Netlify function artifacts; `npm run test:e2e` passed with 8 browser tests and 1 skipped live-authenticated smoke after escalation to allow the local Next server to bind; `npm run deploy:netlify -- --prod` deployed production deploy `6a24cf33acc6acf32ca5e345` live at `https://free-cash-mayberrydt.netlify.app` and unique URL `https://6a24cf33acc6acf32ca5e345--free-cash-mayberrydt.netlify.app`, with the deploy wrapper again reporting no env files in function artifacts. Live HTTP smoke checks returned 200 for `/`, `/manifest.webmanifest`, and `/plaid/oauth`; `/api/auth/oauth/google` returned 307 to Supabase with `redirect_to=https://free-cash-mayberrydt.netlify.app/auth/callback`. Remaining proof: the deployed live authenticated onboarding smoke still needs a real invited Google/Plaid sandbox session.

- Done: completion-audit wording and live-smoke preflight cleanup. Updated the requirement matrix so agent, auth, provider, analytics, and testing rows name the strengthened live smoke as the final proof boundary instead of older generic "mostly proven" language. Tightened `tests/e2e/live-authenticated-onboarding.spec.ts` so `SPENDABLE_LIVE_STORAGE_STATE` must point to an existing Playwright storage-state file; missing or bad paths skip safely with a clear instruction instead of failing later with a confusing Playwright file error. Verification: `npx tsc --noEmit --pretty false` passed; `SPENDABLE_LIVE_STORAGE_STATE=/tmp/does-not-exist-spendable.json npm run test:e2e:live` exited successfully with 1 skipped test. Remaining proof: unchanged; the live authenticated onboarding smoke still needs a real invited Google/Plaid sandbox session to mark the PRD complete.

- Done: live-smoke operator preflight helper. Added `scripts/check-live-smoke-env.mjs` and npm script `check:live-smoke` so the final production proof can fail early if the saved Playwright storage-state file is missing, `SPENDABLE_LIVE_BASE_URL` is invalid, or the live smoke accidentally points at localhost without explicit override. README now runs this preflight before both the manual-connected live smoke and the Plaid-automation live smoke. Verification: `npm run test -- scripts/check-live-smoke-env.test.ts scripts/netlify-deploy-boundary.test.ts` passed with 7 tests; `npx tsc --noEmit --pretty false` passed; `npm run check:live-smoke` fails clearly when no storage state is configured; a temporary storage-state command with `SPENDABLE_LIVE_COMPLETE_PLAID=1` passed and printed the production base URL plus Plaid automation enabled. Remaining proof: unchanged; this improves the handoff and reduces bad live-smoke runs, but the PRD still requires a real invited Google/Plaid sandbox production smoke.

- Done: one-command final live proof runner. Added `scripts/run-live-smoke.mjs` and npm script `test:e2e:live:final`, which runs the live-smoke preflight and then `npm run test:e2e:live` with Plaid automation required/enabled. This gives the final PRD proof a single command after a real invited Google storage-state file exists, reducing the risk of accidentally running the weaker pre-connected-session smoke. README now points the Plaid Sandbox automation path at `SPENDABLE_LIVE_STORAGE_STATE=/tmp/spendable-live-auth.json npm run test:e2e:live:final` and lists it in verification with the storage-state caveat. The runner test now guards that the final package script keeps both `--require-plaid` and `--complete-plaid`. Verification: `npm run test -- scripts/run-live-smoke.test.ts scripts/check-live-smoke-env.test.ts scripts/netlify-deploy-boundary.test.ts` passed with 10 tests; `npx tsc --noEmit --pretty false` passed; `npm run test:e2e:live:final` fails early and clearly when `SPENDABLE_LIVE_STORAGE_STATE` is absent. Remaining proof: unchanged; the command still needs a real invited Google/Plaid sandbox session to execute the production smoke.

- Done: live-smoke storage-state validation hardening. Tightened `scripts/check-live-smoke-env.mjs` so the final production proof no longer accepts any existing file path as a saved browser session. The preflight now requires valid JSON with Playwright `cookies` and `origins` arrays and rejects empty storage state with an instruction to save it after signing in with an invited Google user. This prevents the final proof runner from reaching Playwright with a blank or wrong auth artifact and producing a noisier failure. Verification: `npm run test -- scripts/check-live-smoke-env.test.ts scripts/run-live-smoke.test.ts scripts/netlify-deploy-boundary.test.ts` passed with 12 tests; `npx tsc --noEmit --pretty false` passed; `npm run test:e2e:live:final` still fails early and clearly when `SPENDABLE_LIVE_STORAGE_STATE` is absent. Remaining proof: unchanged; this improves the final proof boundary, but the PRD still requires a real invited Google/Plaid sandbox production smoke.

- Done: live-smoke authenticated-session assertion. Strengthened `tests/e2e/live-authenticated-onboarding.spec.ts` so a saved storage-state file is not enough by itself; the smoke now calls the deployed `/api/sync/status` route before onboarding assertions and fails clearly if the saved browser state is not authenticated. This gives the final production proof explicit evidence that the session belongs to a signed-in invited Google user before consent, Plaid connection, sync status, Free Cash, and agent checks run. Verification: `npx tsc --noEmit --pretty false` passed; `npm run test:e2e:live` without `SPENDABLE_LIVE_STORAGE_STATE` still exits safely with 1 skipped test. Remaining proof: unchanged; the strengthened smoke still needs to run against production with a real invited Google/Plaid sandbox session.

- Done: requirement matrix coverage guard. Audited the matrix against all 90 numbered PRD stories and found missing explicit coverage for stories 33, 34, 35, 46, 49, 76, and 83. Updated the matrix to add fake-prototype scenario coverage, connection repair coverage, and MVP/product-boundary coverage for no money movement, staged Netlify AI Gateway use, and acquisition optionality. Added `scripts/prd-matrix-coverage.test.ts` so future edits fail if a numbered story is not represented in the matrix. Verification: `npm run test -- scripts/prd-matrix-coverage.test.ts src/lib/free-cash/engine.test.ts src/app/api/free-cash/route.test.ts src/app/no-money-movement-boundary.test.ts src/app/deployment-target.test.ts src/lib/agent/sdk-boundary.test.ts scripts/check-deployment-env.test.ts src/app/api/sync/manual/route.test.ts src/lib/data/sync-status.test.ts src/lib/data/manual-sync-failure.test.ts` passed with 52 tests; `npx tsc --noEmit --pretty false` passed. Remaining proof: unchanged; all PRD stories are now represented in the matrix, but final completion still requires the real invited Google/Plaid sandbox production smoke.

- Done: latest verified production deploy refresh. Re-ran the broad verification gates after the live-smoke hardening and requirement-matrix coverage changes, then deployed the current verified tree to Netlify production. Verification: `npm run test` passed with 334 tests across 70 files; `npx tsc --noEmit --pretty false` passed; `npm run build` passed and listed the expected Spendable, OAuth, Plaid, sync, agent, legal, manifest, and support routes; `node scripts/check-deployment-env.mjs --mode=beta` passed with the expected Plaid sandbox warning; `node scripts/check-netlify-bundle.mjs` found no env files in Netlify function artifacts; `npm run test:e2e` passed with 8 browser tests and 1 skipped live-authenticated smoke after escalation to allow the local Next server to bind. `npm run deploy:netlify -- --prod` deployed production deploy `6a24d470d27d8a76de470590` live at `https://free-cash-mayberrydt.netlify.app` and unique URL `https://6a24d470d27d8a76de470590--free-cash-mayberrydt.netlify.app`, with the deploy wrapper again reporting no env files in function artifacts. Live HTTP smoke checks returned 200 for `/`, `/manifest.webmanifest`, and `/plaid/oauth`; `/api/auth/oauth/google` returned 307 to Supabase with `redirect_to=https://free-cash-mayberrydt.netlify.app/auth/callback`; anonymous `/api/free-cash`, `/api/agent`, `/api/sync/manual`, and `/api/providers/plaid/exchange` returned 401 before sensitive work. Remaining proof: unchanged; the deployed live authenticated onboarding smoke still needs a real invited Google/Plaid sandbox session.

- Done: guided live-auth capture command. Added `scripts/capture-live-auth-state.mjs` and npm script `capture:live-auth` so the last production proof has a repo-owned way to open Playwright against the production Spendable site and save `/tmp/spendable-live-auth.json` after signing in with an invited Google account. The helper refuses localhost by default, supports explicit `--base-url` and `--storage-state` overrides, and README now uses the named command instead of a raw Playwright invocation. Verification: `npm run test -- scripts/capture-live-auth-state.test.ts scripts/run-live-smoke.test.ts scripts/check-live-smoke-env.test.ts scripts/netlify-deploy-boundary.test.ts` passed with 16 tests; `npx tsc --noEmit --pretty false` passed; `npm run test:e2e:live:final` still fails early and clearly when no saved storage state exists. Remaining proof: unchanged; someone still must complete the real Google sign-in handoff and then run `SPENDABLE_LIVE_STORAGE_STATE=/tmp/spendable-live-auth.json npm run test:e2e:live:final`.

- Done: final live-smoke proof report. Updated `scripts/run-live-smoke.mjs` so a successful final production smoke writes `/tmp/spendable-live-proof.json` by default, or `SPENDABLE_LIVE_PROOF_REPORT` when overridden. The report records pass status, timestamp, production base URL, storage-state path, Plaid automation requirement/enabled flags, and a summary of what the smoke proved, without storing cookies, provider tokens, or secrets. The runner writes this report only after `npm run test:e2e:live` exits successfully. Verification: `npm run test -- scripts/run-live-smoke.test.ts scripts/check-live-smoke-env.test.ts scripts/capture-live-auth-state.test.ts` passed with 14 tests; `npx tsc --noEmit --pretty false` passed; after deleting `/tmp/spendable-live-proof.json`, `npm run test:e2e:live:final` still failed at preflight without `SPENDABLE_LIVE_STORAGE_STATE` and `test ! -e /tmp/spendable-live-proof.json` passed. Remaining proof: unchanged; the report will only exist after the real invited Google/Plaid sandbox production smoke passes.

- Done: enforceable PRD completion gate. Added `scripts/check-prd-complete.mjs` and npm script `check:prd-complete` as the final objective-level gate. The check fails until `/tmp/spendable-live-proof.json` or `SPENDABLE_LIVE_PROOF_REPORT` exists and confirms a production `npm run test:e2e:live:final` pass with Plaid automation required and enabled. README now lists this after the final smoke command, making it explicit that the PRD is not complete until the proof report exists. Verification: `npm run test -- scripts/check-prd-complete.test.ts scripts/run-live-smoke.test.ts scripts/prd-matrix-coverage.test.ts` passed with 9 tests; `npx tsc --noEmit --pretty false` passed; `npm run check:prd-complete` currently fails with the expected missing-proof message and the exact next commands. Remaining proof: unchanged; complete the invited Google handoff, run the final live smoke, then rerun `npm run check:prd-complete`.

- Done: final proof deploy-freshness guard. Tightened the proof report and completion gate so a stale live-smoke report cannot complete the PRD after a newer deploy. `scripts/run-live-smoke.mjs` now records the latest verified unique deploy URL and deploy id from README in `/tmp/spendable-live-proof.json`, and `scripts/check-prd-complete.mjs` requires the proof report to match that latest verified deploy before it passes. README now describes the deploy freshness requirement. Verification: `npm run test -- scripts/run-live-smoke.test.ts scripts/check-prd-complete.test.ts` passed with 8 tests; `npx tsc --noEmit --pretty false` passed; `npm run check:prd-complete` still fails with the expected missing-proof message until the real final production smoke report exists. Remaining proof: unchanged; the next successful final smoke must be run against the latest verified production deploy.

- Done: live-auth capture browser-channel fix. Attempted `npm run capture:live-auth` against production and found Playwright codegen tried to use a missing bundled Chromium at `/home/tyler/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`. Updated `scripts/capture-live-auth-state.mjs` to launch codegen with `--channel chrome`, matching the repo's e2e use of installed system Chrome. Verification: `npm run test -- scripts/capture-live-auth-state.test.ts` passed with 4 tests; `npx tsc --noEmit --pretty false` passed; a follow-up `npm run capture:live-auth` launched and waited for user login instead of failing on the missing browser. No `/tmp/spendable-live-auth.json` was written because the browser handoff was not completed; the dangling capture process was stopped. Remaining proof: unchanged; rerun `npm run capture:live-auth`, complete Google sign-in in the opened browser, close the Playwright window, then run the final smoke.

- Done: current tree verification refresh after final-proof tooling. Re-ran broad local gates after the capture, proof report, completion-gate, and deploy-freshness guard changes. Verification: `npm run test` passed with 343 tests across 72 files; `npx tsc --noEmit --pretty false` passed; `node scripts/check-deployment-env.mjs --mode=beta` passed with the expected Plaid sandbox warning; `node scripts/check-netlify-bundle.mjs` found no env files in Netlify function artifacts; `npm run build` passed and listed the expected Spendable, OAuth, Plaid, sync, agent, legal, manifest, and support routes. `npm run check:prd-complete` still fails only because `/tmp/spendable-live-proof.json` is missing, with the expected instruction to run `npm run capture:live-auth` and then the final live smoke. Remaining proof: unchanged; the real invited Google/Plaid sandbox production smoke still has to be completed.

- Done: one-command final PRD proof orchestrator. Added `scripts/prove-prd-complete.mjs` and npm script `prove:prd` to run the final proof sequence in order: capture invited Google auth state, preflight the saved state, run the Plaid-enabled production smoke, and run `check:prd-complete`. The command defaults to `/tmp/spendable-live-auth.json` and `/tmp/spendable-live-proof.json`, sets Plaid automation for the final smoke, and supports `-- --skip-capture` when the auth state file already exists. README now documents the shortest final proof path. Verification: `npm run test -- scripts/prove-prd-complete.test.ts scripts/check-prd-complete.test.ts scripts/run-live-smoke.test.ts scripts/capture-live-auth-state.test.ts` passed with 16 tests; `npm run test -- scripts/prove-prd-complete.test.ts` passed after setting Plaid automation in the orchestrator; `npx tsc --noEmit --pretty false` passed; `npm run prove:prd -- --skip-capture` fails cleanly at `check:live-smoke` because `/tmp/spendable-live-auth.json` does not exist. Remaining proof: unchanged; run `npm run prove:prd` and complete the Google browser handoff to let it produce and verify the final proof.

- Done: latest production deploy refresh after proof-orchestrator changes. Re-ran full verification and deployed the current tree so the final proof target matches the newest code and README deploy-freshness guard. Verification: `npm run test` passed with 347 tests across 73 files; `npx tsc --noEmit --pretty false` passed; `node scripts/check-deployment-env.mjs --mode=beta` passed with the expected Plaid sandbox warning; `node scripts/check-netlify-bundle.mjs` found no env files in Netlify function artifacts; `npm run build` passed and listed the expected Spendable, OAuth, Plaid, sync, agent, legal, manifest, and support routes. `npm run deploy:netlify -- --prod` deployed production deploy `6a24da4c55a73b034f242d3b` live at `https://free-cash-mayberrydt.netlify.app` and unique URL `https://6a24da4c55a73b034f242d3b--free-cash-mayberrydt.netlify.app`, with the deploy wrapper again reporting no env files in function artifacts. Live HTTP smoke returned 200 for `/`, `/manifest.webmanifest`, and `/plaid/oauth`; `/api/auth/oauth/google` returned 307 to Supabase with `redirect_to=https://free-cash-mayberrydt.netlify.app/auth/callback`; anonymous `/api/free-cash`, `/api/agent`, `/api/sync/manual`, and `/api/providers/plaid/exchange` returned 401. README's latest verified deploy pointer now matches this deploy. Remaining proof: unchanged; run `npm run prove:prd` and complete the Google/Plaid sandbox production proof.

- Done: open Google signup update. Removed runtime invite-list enforcement from `/auth/callback`, removed invite-list checks from the magic-link fallback route, deleted the unused beta invite helper, and updated same-screen onboarding copy, live-smoke scripts, README, and this PRD so testing no longer requires adding email addresses to `public.beta_invites`. Legacy invite migration objects remain private and unused rather than being dropped in this pass. Verification: focused auth/onboarding/schema/live-proof helper tests passed with 43 tests across 8 files; `npx tsc --noEmit --pretty false` passed; `npm run build` passed and included the expected auth routes; `npm run test` passed with 340 tests across 72 files after updating stale deploy-id assertions in proof-report tests; `npm run deploy:netlify -- --prod` deployed production deploy `6a24dd94495d1c9ccda9adea` live at `https://free-cash-mayberrydt.netlify.app` and unique URL `https://6a24dd94495d1c9ccda9adea--free-cash-mayberrydt.netlify.app`; live HTTP smoke returned 200 for `/`, 307 from `/api/auth/oauth/google` to Supabase with `redirect_to=https://free-cash-mayberrydt.netlify.app/auth/callback`, and 401 for anonymous `/api/free-cash`.

- Next implementation cluster to prove: authenticated live onboarding smoke. The remaining unproven live path requires a real Google user session in the deployed app to complete sign-in, protected-savings consent, Plaid Link sandbox connection, token exchange, manual sync, and the same-screen Free Cash result.

- Done before this ledger was added and now represented in the matrix above: deterministic Free Cash engine modules, fake-data prototype surface, prompt chips, structured agent cards, OpenAI Responses API route, Supabase persistence/RLS migrations, Plaid provider scaffolding, manual sync/status APIs, delete-data flow, legal pages, and existing unit/e2e coverage. These are no longer tracked as an unaudited backlog item; any remaining caveats are captured in the requirement matrix and later ledger notes, especially the final live Google/Plaid production smoke.

## Further Notes

The product's center of gravity is behavioral, not analytical. The user should feel that the app answers "what can I do today?" without making them become a budgeting person.

The original north star remains:

```text
$43

Ask.
```

The biggest implementation risk is accidentally building the product that finance apps usually become: balances, tabs, charts, category management, and permanent account screens. Every technical module should defend the one-number interface.

The second biggest implementation risk is letting AI own financial truth. The LLM can explain, route, and format. It cannot calculate Free Cash or decide whether money moved.

The third biggest implementation risk is letting account connection and onboarding mechanics overwhelm the one-screen experience. OAuth and Plaid should feel like steps inside Spendable, not a separate settings or banking dashboard.

The provider decision is deliberately stage-specific. The original plan considered Teller-first for private beta, but the current implementation direction is Plaid-first. Teller remains useful as a fallback/reference option, while Plaid is the provider to harden for the active beta.

The auth decision is also stage-specific. Magic links were useful for early testing, but Supabase email sender limits make them a poor primary onboarding path. Google OAuth should now be the default sign-in path, and signup should remain open to any Google account unless a later abuse-control requirement changes that.

The app should be designed so acquisition remains optional. Provider abstraction, deterministic logic, clean tests, privacy discipline, and simple product metrics all preserve future options without forcing the product into an acquisition-only plan.

Provider pricing, model pricing, financial data rights rules, and Netlify AI Gateway model availability are drift-prone. Recheck them before implementing real bank integration, launching a beta, or committing to production AI costs.
